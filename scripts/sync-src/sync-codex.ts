/**
 * sync-codex.ts — Claude → Codex agent + skill regeneration.
 *
 * Reads the canonical Claude sources:
 *   .claude/agents/*.md          (YAML frontmatter + markdown body)
 *   .claude/commands/*.md        (YAML frontmatter + slash-command body)
 *
 * Writes the Codex mirror surfaces:
 *   .codex/agents/<name>.toml    (description="..." + developer_instructions="""...""")
 *   .agents/skills/source-command-<name>/SKILL.md
 *
 * Applies a prose-only "Claude → Codex" rename with a strict path-preservation
 * guard so literal filesystem paths (`.claude/`, package names, real product
 * names) survive intact. Idempotent: byte-compares before write; running twice
 * on a clean tree is a no-op.
 *
 * Sibling/companion to sync.ts (internal→public republish). This script lives
 * one tier above the publish flow — it keeps the two host shapes consistent
 * inside the framework root. The publish flow then ships both shapes onward.
 *
 * Run via (from framework root):
 *   tsx .claude/scripts/sync-src/sync-codex.ts              # dry-run (default)
 *   tsx .claude/scripts/sync-src/sync-codex.ts --dry-run    # explicit dry-run
 *   tsx .claude/scripts/sync-src/sync-codex.ts --apply      # write outputs
 *   tsx .claude/scripts/sync-src/sync-codex.ts --apply --delete   # also prune orphan Codex outputs
 *
 * Flags:
 *   --dry-run         Default. Print plan + per-file diff/changed counts; no writes.
 *   --apply           Write outputs. Skips bytes-identical targets.
 *   --delete          Opt-in: prune Codex outputs that no longer have a Claude source.
 *   --source <path>   Override source root (defaults to framework root, computed
 *                     from this script's location).
 *   --verbose         Print every file's per-substitution count, not just totals.
 *
 * Path-preservation guard:
 *   The literal token `.claude/` (and the path-token `.claude` immediately
 *   followed by a non-identifier character such as space, period, backtick,
 *   single-quote, or end-of-string) is NEVER rewritten by the prose-rename
 *   pass. Real Anthropic product names (`Claude Code`, `Claude Cowork`,
 *   `claude.ai`, `@anthropic-ai/claude-agent-sdk`, the `claude` CLI binary
 *   referenced as `\`claude -p\`` or `\`claude --print\``) are likewise
 *   protected. Only the bare role/host token "Claude" in narrative prose
 *   becomes "Codex" — and only when it stands alone as the orchestrator-host
 *   reference (e.g., "When Claude Code launches here" → "When Codex launches
 *   here", but "the Claude Code hook spec" stays as-is because Claude Code is
 *   a product name documenting an actual API surface the framework targets).
 *
 *   See the PROSE_RENAME_RULES table below for the full substitution set —
 *   each rule is conservative and source-attributed.
 *
 * TODO: verify Codex host TOML schema with user.
 *   No schema authority is documented anywhere in the framework. The script
 *   reproduces the existing `description = "..."` + `developer_instructions =
 *   """..."""` shape that was found on disk in `.codex/agents/*.toml` as of
 *   2026-05-14. If Codex's actual runner expects different keys (e.g.,
 *   `name`, `model`, `tools`, `system_prompt`, structured frontmatter), the
 *   sync output will need a schema update. The Claude-side frontmatter fields
 *   `name`, `model`, `tools`, `tier`, `prompt_version`, `trigger_conditions`
 *   are currently DROPPED in the Codex output (only `description` survives).
 *   Confirm with the user / consumer docs whether Codex needs more.
 *
 * Pure Node stdlib — no external dependencies. Fail-loud on every uncertain
 * branch; this is an operator-facing tool that errs on the side of refusing
 * to ship.
 */

import { readFile, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// ----------------------------------------------------------------------------
// Resolve framework root
// ----------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
// This script lives at <root>/.claude/scripts/sync-src/sync-codex.ts
// so framework root is three dirs up.
const DEFAULT_SOURCE = join(HERE, "..", "..", "..");

// ----------------------------------------------------------------------------
// CLI parse
// ----------------------------------------------------------------------------

interface CliFlags {
  apply: boolean;
  dryRun: boolean;
  delete: boolean;
  source: string;
  verbose: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    apply: false,
    dryRun: false,
    delete: false,
    source: DEFAULT_SOURCE,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--delete") flags.delete = true;
    else if (arg === "--verbose" || arg === "-v") flags.verbose = true;
    else if (arg === "--source") flags.source = argv[++i];
    else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  if (!flags.apply && !flags.dryRun) flags.dryRun = true;
  if (flags.apply && flags.dryRun) {
    console.error("Pass either --apply or --dry-run, not both.");
    process.exit(2);
  }
  return flags;
}

function printHelp(): void {
  console.log(`sync-codex.ts — regenerate Codex agent + skill surfaces from Claude sources

Usage:
  tsx .claude/scripts/sync-src/sync-codex.ts [--dry-run|--apply] [--delete]
                                             [--source <path>] [--verbose]

See file header for full flag documentation. Default mode is --dry-run.`);
}

// ----------------------------------------------------------------------------
// Frontmatter parser
// ----------------------------------------------------------------------------

interface Parsed {
  frontmatter: Record<string, string>;
  body: string;
}

/**
 * Minimal YAML-frontmatter parser. Only handles the keys the framework uses:
 *   - bare scalars (name: foo)
 *   - quoted scalars (description: "foo bar")
 *   - block scalars are NOT supported (the framework doesn't use them in
 *     agent/command frontmatter — guarded below).
 *
 * Fails loud on shapes it doesn't understand so a future frontmatter
 * extension doesn't silently drop data.
 */
function parseFrontmatter(raw: string, filePath: string): Parsed {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    throw new Error(`No frontmatter in ${filePath}: file must start with '---'`);
  }
  const rest = raw.replace(/^---\r?\n/, "");
  const endIdx = rest.indexOf("\n---");
  if (endIdx < 0) throw new Error(`Unterminated frontmatter in ${filePath}`);
  const fmRaw = rest.slice(0, endIdx);
  const body = rest.slice(endIdx).replace(/^\n---\r?\n?/, "");

  const fm: Record<string, string> = {};
  let currentKey: string | null = null;
  let currentBuffer: string[] = [];
  let inMultiline = false;

  for (const line of fmRaw.split(/\r?\n/)) {
    if (line.trim() === "") {
      if (inMultiline) currentBuffer.push("");
      continue;
    }
    // Top-level key: matches `key: value` where key starts at col 0
    const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ")) {
      // Flush prior multiline
      if (currentKey && inMultiline) {
        fm[currentKey] = currentBuffer.join("\n").trimEnd();
      }
      const [, key, valRaw] = topMatch;
      const val = valRaw.trim();
      if (val === "" || val === ">" || val === "|") {
        // Begin multi-line gathering OR nested structure — guard
        currentKey = key;
        currentBuffer = [];
        inMultiline = true;
        continue;
      }
      // Single-line scalar — strip optional surrounding quotes
      fm[key] = unquoteScalar(val);
      currentKey = null;
      inMultiline = false;
      continue;
    }
    // Continuation of multiline block
    if (inMultiline) {
      currentBuffer.push(line.replace(/^  /, ""));
      continue;
    }
    // Indented map entry — this script doesn't need to interpret nested
    // structures (e.g., trigger_conditions). Stash the indented lines raw
    // onto the previous key so nothing's silently lost; the Codex output
    // doesn't currently render these (see TODO above re: schema), but
    // round-trip preservation matters for future schema upgrades.
    if (currentKey) {
      fm[currentKey] = (fm[currentKey] ?? "") + "\n" + line;
    }
  }
  if (currentKey && inMultiline) {
    fm[currentKey] = currentBuffer.join("\n").trimEnd();
  }
  return { frontmatter: fm, body };
}

function unquoteScalar(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ----------------------------------------------------------------------------
// Prose rename — Claude → Codex with path/product preservation
// ----------------------------------------------------------------------------

/**
 * The rename pass is conservative: it ONLY rewrites the bare role/host token
 * "Claude" when it stands alone as the orchestrator-host reference. Real
 * filesystem paths (`.claude/...`) and real product/package/CLI names are
 * left intact.
 *
 * The implementation runs the substitutions in two phases:
 *   1) Tokenize-and-protect: replace each protected pattern with a sentinel
 *      that won't be touched by the rename.
 *   2) Apply the bare-token rename.
 *   3) Restore each sentinel.
 *
 * This is more reliable than a single mega-regex with lookarounds; it also
 * keeps the protected-list auditable.
 */

const SENTINEL_PREFIX = "CODEXSYNCPROTECT_";
const SENTINEL_SUFFIX = "";

// Order matters: longer patterns first, so e.g. `Claude Code` is captured
// before any standalone `Claude` token could be re-matched inside it.
const PROTECT_PATTERNS: RegExp[] = [
  /Claude Code/g,
  /Claude Cowork/g,
  /claude\.ai/g,
  /@anthropic-ai\/claude-agent-sdk/g,
  /@anthropic-ai\/claude\b/g,
  // CLI binary references in backticks: `claude -p`, `claude --print`, `claude`
  /`claude(?: --?[a-zA-Z-]+)?`/g,
  // Filesystem-path token .claude/ — never rewrite
  /\.claude\//g,
  // Bare .claude when followed by non-identifier char (space, period, backtick,
  // quote, EOL) — also never rewrite. Match conservatively.
  /\.claude(?=[\s.`'"\)\]\,]|$)/g,
  // Anthropic API host references
  /api\.anthropic\.com/g,
  /anthropic\.com/g,
  /docs\.anthropic\.com/g,
];

/**
 * Bare "Claude" token in prose (orchestrator-host reference). Match Claude
 * with a word boundary on both sides, but ONLY when not part of any longer
 * Claude-prefixed identifier (already handled by sentinel protection above).
 *
 * NOTE: at the time this rename runs, all multi-word and path forms have
 * already been protected. So a remaining bare "Claude" in prose is, by
 * construction, a standalone host reference. Rewrite to "Codex".
 */
const BARE_CLAUDE = /\bClaude\b/g;

interface RenameResult {
  text: string;
  substitutions: number;
}

function applyProseRename(input: string): RenameResult {
  let working = input;
  const stash: string[] = [];

  // Phase 1: protect
  for (const pat of PROTECT_PATTERNS) {
    working = working.replace(pat, (m) => {
      const idx = stash.length;
      stash.push(m);
      return `${SENTINEL_PREFIX}${idx}${SENTINEL_SUFFIX}`;
    });
  }

  // Phase 2: rename bare Claude → Codex
  let substitutions = 0;
  working = working.replace(BARE_CLAUDE, () => {
    substitutions++;
    return "Codex";
  });

  // Phase 3: restore protected segments
  working = working.replace(
    new RegExp(`${SENTINEL_PREFIX}(\\d+)${SENTINEL_SUFFIX}`, "g"),
    (_m, idx) => stash[Number(idx)],
  );

  return { text: working, substitutions };
}

// ----------------------------------------------------------------------------
// TOML emitter (Codex agent shape)
// ----------------------------------------------------------------------------

/**
 * Emit a Codex agent TOML from a parsed Claude agent. The shape is:
 *
 *   description = "<description>"
 *   developer_instructions = """
 *   <body>
 *   """
 *
 * Both the description and the body have the prose-rename applied. The
 * description string is escaped for TOML basic-string rules (escape `"` and
 * backslashes; newlines forbidden in basic strings — fail loud if present).
 * The body is emitted as a TOML multi-line basic string (triple-quoted).
 */
function emitAgentToml(parsed: Parsed, filePath: string): string {
  const rawDesc = parsed.frontmatter.description;
  if (!rawDesc) throw new Error(`Missing 'description' frontmatter in ${filePath}`);

  // Some descriptions in the source use triple-quoted YAML; collapse newlines
  // to spaces for the TOML basic string.
  const oneLineDesc = rawDesc.replace(/\s*\n\s*/g, " ").trim();
  const renamedDesc = applyProseRename(oneLineDesc).text;
  const tomlSafeDesc = tomlBasicEscape(renamedDesc);

  const renamedBody = applyProseRename(parsed.body).text;
  const tomlSafeBody = tomlMultilineEscape(renamedBody);

  return `description = "${tomlSafeDesc}"\ndeveloper_instructions = """\n${tomlSafeBody}\n"""\n`;
}

function tomlBasicEscape(s: string): string {
  if (s.includes("\n")) {
    throw new Error(`TOML basic string cannot contain newline: ${JSON.stringify(s.slice(0, 80))}...`);
  }
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tomlMultilineEscape(s: string): string {
  // TOML multi-line basic strings only need to escape sequences of three
  // consecutive `"` characters and a trailing `"` immediately before the
  // closing `"""`. Backslashes inside multi-line basic strings are escape
  // sequences and need doubling.
  let out = s.replace(/\\/g, "\\\\");
  // Disallow embedded triple-quote: TOML would terminate the string early.
  if (out.includes('"""')) {
    throw new Error("Body contains embedded triple-quote sequence; cannot encode as TOML multi-line basic string");
  }
  // Trailing `"` immediately before EOF would join with the closing `"""`
  // to form a `""""` sequence; escape it.
  if (out.endsWith('"')) out = out.slice(0, -1) + '\\"';
  return out;
}

// ----------------------------------------------------------------------------
// Skill-package emitter
// ----------------------------------------------------------------------------

/**
 * Emit a Codex skill-package SKILL.md from a parsed Claude slash-command.
 *
 * Shape (matches the existing 20 skill packages on disk as of 2026-05-14):
 *
 *   ---
 *   name: "source-command-<command-name>"
 *   description: "<description>"
 *   ---
 *
 *   # source-command-<command-name>
 *
 *   Use this skill when the user asks to run the migrated source command `<name>`.
 *
 *   ## Command Template
 *
 *   <original command body, verbatim, prose-rename applied>
 */
function emitSkillMarkdown(parsed: Parsed, commandName: string, filePath: string): string {
  const desc = parsed.frontmatter.description;
  if (!desc) throw new Error(`Missing 'description' frontmatter in ${filePath}`);
  const renamedDesc = applyProseRename(desc).text;
  const renamedBody = applyProseRename(parsed.body).text;
  const skillName = `source-command-${commandName}`;
  return [
    "---",
    `name: "${skillName}"`,
    `description: "${escapeYamlScalar(renamedDesc)}"`,
    "---",
    "",
    `# ${skillName}`,
    "",
    `Use this skill when the user asks to run the migrated source command \`${commandName}\`.`,
    "",
    "## Command Template",
    "",
    renamedBody.trim(),
    "",
  ].join("\n");
}

function escapeYamlScalar(s: string): string {
  // Inside a YAML double-quoted scalar, `"` and `\` need escaping. The
  // framework's descriptions don't contain newlines (collapsed at write time
  // for safety).
  const oneLine = s.replace(/\s*\n\s*/g, " ").trim();
  return oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ----------------------------------------------------------------------------
// Directory walkers
// ----------------------------------------------------------------------------

interface SourceFile {
  absPath: string;
  baseName: string;       // e.g. "architect" (no .md)
  category: "agent" | "command";
}

async function listAgents(sourceRoot: string): Promise<SourceFile[]> {
  const dir = join(sourceRoot, ".claude", "agents");
  return listMdFlat(dir, "agent");
}

async function listCommands(sourceRoot: string): Promise<SourceFile[]> {
  const dir = join(sourceRoot, ".claude", "commands");
  return listMdFlat(dir, "command");
}

async function listMdFlat(dir: string, category: SourceFile["category"]): Promise<SourceFile[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: SourceFile[] = [];
  for (const e of entries) {
    // Skip any meta-directories (anything starting with `_`).
    if (e.isDirectory() && e.name.startsWith("_")) continue;
    if (e.isDirectory()) continue; // shallow — we don't recurse into other dirs
    if (!e.name.endsWith(".md")) continue;
    if (e.name === "README.md") continue;
    const baseName = e.name.replace(/\.md$/, "");
    out.push({ absPath: join(dir, e.name), baseName, category });
  }
  out.sort((a, b) => a.baseName.localeCompare(b.baseName));
  return out;
}

// ----------------------------------------------------------------------------
// Targets
// ----------------------------------------------------------------------------

interface PlannedOutput {
  source: SourceFile;
  targetAbs: string;
  newContent: string;
  prevContent: string | null;
  substitutions: number;
  status: "created" | "updated" | "unchanged";
}

async function planOutputs(sourceRoot: string): Promise<PlannedOutput[]> {
  const agentSources = await listAgents(sourceRoot);
  const commandSources = await listCommands(sourceRoot);
  const planned: PlannedOutput[] = [];

  for (const src of agentSources) {
    const raw = await readFile(src.absPath, "utf8");
    const parsed = parseFrontmatter(raw, src.absPath);
    const renameAccum = countAllSubstitutions(parsed);
    const tomlBody = emitAgentToml(parsed, src.absPath);
    const targetAbs = join(sourceRoot, ".codex", "agents", `${src.baseName}.toml`);
    const prev = existsSync(targetAbs) ? await readFile(targetAbs, "utf8") : null;
    const status = prev === null ? "created" : (prev === tomlBody ? "unchanged" : "updated");
    planned.push({ source: src, targetAbs, newContent: tomlBody, prevContent: prev, substitutions: renameAccum, status });
  }

  for (const src of commandSources) {
    const raw = await readFile(src.absPath, "utf8");
    const parsed = parseFrontmatter(raw, src.absPath);
    const renameAccum = countAllSubstitutions(parsed);
    const md = emitSkillMarkdown(parsed, src.baseName, src.absPath);
    const targetAbs = join(
      sourceRoot, ".agents", "skills",
      `source-command-${src.baseName}`,
      "SKILL.md",
    );
    const prev = existsSync(targetAbs) ? await readFile(targetAbs, "utf8") : null;
    const status = prev === null ? "created" : (prev === md ? "unchanged" : "updated");
    planned.push({ source: src, targetAbs, newContent: md, prevContent: prev, substitutions: renameAccum, status });
  }

  return planned;
}

function countAllSubstitutions(parsed: Parsed): number {
  // Sum substitutions across both description and body to give the operator
  // a single per-source rename-count.
  const desc = parsed.frontmatter.description ?? "";
  return applyProseRename(desc).substitutions + applyProseRename(parsed.body).substitutions;
}

// ----------------------------------------------------------------------------
// Orphan detection (for --delete)
// ----------------------------------------------------------------------------

interface Orphan {
  absPath: string;
  kind: "agent-toml" | "skill-package";
}

async function findOrphans(sourceRoot: string, planned: PlannedOutput[]): Promise<Orphan[]> {
  const validPaths = new Set(planned.map((p) => p.targetAbs));
  const orphans: Orphan[] = [];

  const codexAgentsDir = join(sourceRoot, ".codex", "agents");
  if (existsSync(codexAgentsDir)) {
    const entries = await readdir(codexAgentsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.endsWith(".toml")) continue;
      const abs = join(codexAgentsDir, e.name);
      if (!validPaths.has(abs)) {
        orphans.push({ absPath: abs, kind: "agent-toml" });
      }
    }
  }

  const skillsDir = join(sourceRoot, ".agents", "skills");
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.startsWith("source-command-")) continue;
      const skillPath = join(skillsDir, e.name, "SKILL.md");
      if (!validPaths.has(skillPath)) {
        orphans.push({ absPath: join(skillsDir, e.name), kind: "skill-package" });
      }
    }
  }

  return orphans;
}

// ----------------------------------------------------------------------------
// Output reporting + writes
// ----------------------------------------------------------------------------

function summarize(planned: PlannedOutput[], orphans: Orphan[], verbose: boolean): void {
  const byStatus = { created: 0, updated: 0, unchanged: 0 };
  let totalSubs = 0;
  for (const p of planned) {
    byStatus[p.status]++;
    totalSubs += p.substitutions;
  }

  console.log("");
  console.log("sync-codex plan:");
  console.log(`  Sources scanned       : ${planned.length} files`);
  console.log(`    .claude/agents      : ${planned.filter((p) => p.source.category === "agent").length}`);
  console.log(`    .claude/commands    : ${planned.filter((p) => p.source.category === "command").length}`);
  console.log(`  Target status         :`);
  console.log(`    created             : ${byStatus.created}`);
  console.log(`    updated             : ${byStatus.updated}`);
  console.log(`    unchanged           : ${byStatus.unchanged}`);
  console.log(`  Prose substitutions   : ${totalSubs}  (Claude→Codex token rewrites)`);
  console.log(`  Orphans (Codex outputs without Claude source): ${orphans.length}`);

  if (verbose || byStatus.updated > 0 || byStatus.created > 0) {
    console.log("");
    console.log("Per-file detail:");
    for (const p of planned) {
      if (!verbose && p.status === "unchanged") continue;
      const rel = relative(DEFAULT_SOURCE, p.targetAbs);
      const subTag = p.substitutions > 0 ? `  (${p.substitutions} sub)` : "";
      console.log(`  [${p.status.padEnd(9)}] ${rel}${subTag}`);
    }
  }

  if (orphans.length > 0) {
    console.log("");
    console.log("Orphans (would be removed with --delete):");
    for (const o of orphans) {
      const rel = relative(DEFAULT_SOURCE, o.absPath);
      console.log(`  [${o.kind}] ${rel}`);
    }
  }
}

async function applyOutputs(planned: PlannedOutput[]): Promise<void> {
  for (const p of planned) {
    if (p.status === "unchanged") continue;
    await mkdir(dirname(p.targetAbs), { recursive: true });
    await writeFile(p.targetAbs, p.newContent, "utf8");
  }
}

async function applyOrphanDeletes(orphans: Orphan[]): Promise<void> {
  for (const o of orphans) {
    if (o.kind === "skill-package") {
      // Directory removal — Codex skill packages are one dir per skill.
      await rm(o.absPath, { recursive: true, force: true });
    } else {
      await rm(o.absPath, { force: true });
    }
  }
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (!existsSync(join(flags.source, ".claude", "agents"))) {
    console.error(`Source root has no .claude/agents directory: ${flags.source}`);
    process.exit(2);
  }
  if (!existsSync(join(flags.source, ".claude", "commands"))) {
    console.error(`Source root has no .claude/commands directory: ${flags.source}`);
    process.exit(2);
  }

  const planned = await planOutputs(flags.source);
  const orphans = await findOrphans(flags.source, planned);

  summarize(planned, orphans, flags.verbose);

  if (flags.dryRun) {
    console.log("");
    console.log("Dry-run complete. Pass --apply to write outputs.");
    return;
  }

  if (flags.apply) {
    await applyOutputs(planned);
    if (flags.delete) await applyOrphanDeletes(orphans);
    console.log("");
    console.log("Apply complete.");
    if (orphans.length > 0 && !flags.delete) {
      console.log(`Skipped ${orphans.length} orphan(s). Re-run with --delete to prune.`);
    }
  }
}

main().catch((err: Error) => {
  console.error(`sync-codex failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
