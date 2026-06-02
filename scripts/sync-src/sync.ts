/**
 * sync.ts — internal-to-public propagation for the TapAgents framework.
 *
 * Reads the source tree (`.claude/`, i.e. the framework root) and computes
 * the set of files that should land in the target tree (`tap-agents/`, the
 * public npm-published checkout). Default mode is --dry-run (prints unified
 * diffs + WARN/FAIL lines); --apply commits the file copies into the target
 * working tree (NEVER commits to git — the operator inspects `git status`
 * in the target and commits manually, or `/release` composes the commit).
 *
 * Run via:
 *   npm run sync              (dry-run; alias for `tsx sync.ts --dry-run`)
 *   npm run sync:dry-run      (explicit dry-run)
 *   tsx scripts/sync-src/sync.ts --apply
 *   tsx scripts/sync-src/sync.ts --apply --delete
 *   tsx scripts/sync-src/sync.ts --apply --include-readme
 *
 * Flags:
 *   --dry-run         Default if no --apply. Print diffs and warnings; no writes.
 *   --apply           Write files into target. Stages in target's git.
 *   --delete          Opt-in deletion propagation. Target files that should
 *                     no longer be present are removed (with confirmation).
 *   --include-readme  Override the default-safe README skip behavior.
 *   --target <path>   Override target tree path (defaults to ../tap-agents
 *                     relative to source).
 *   --source <path>   Override source tree path (defaults to the directory
 *                     containing this script, i.e. the framework root).
 *
 * Design reference: workspace/_global/architect-designs/2026-05-11-internal-to-public-sync-flow.md
 *
 * Pure Node stdlib + json5. No git invocations beyond preflight + post-sync
 * staging hints. Fail-loud on every uncertain branch — operator-facing tool
 * that errs on the side of refusing to ship.
 */

import { readFile, writeFile, mkdir, readdir, stat, rm, unlink } from "node:fs/promises";
import { existsSync, createReadStream, realpathSync } from "node:fs";
import { join, relative, dirname, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import JSON5 from "json5";

import { PATTERNS as SECRET_PATTERNS, scanBody, SecretHit } from "./secret-patterns.js";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = join(HERE, "..", "..");
const DEFAULT_TARGET = join(DEFAULT_SOURCE, "..", "tap-agents");

// ----------------------------------------------------------------------------
// CLI parse
// ----------------------------------------------------------------------------

type SourceMode = "auto" | "git" | "filesystem";

interface CliFlags {
  apply: boolean;
  dryRun: boolean;
  delete: boolean;
  includeReadme: boolean;
  source: string;
  target: string;
  sourceMode: SourceMode;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    apply: false,
    dryRun: false,
    delete: false,
    includeReadme: false,
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    sourceMode: "auto",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--delete") flags.delete = true;
    else if (arg === "--include-readme") flags.includeReadme = true;
    else if (arg === "--source") flags.source = argv[++i];
    else if (arg === "--target") flags.target = argv[++i];
    else if (arg === "--source-mode") {
      const v = argv[++i];
      if (v !== "auto" && v !== "git" && v !== "filesystem") {
        console.error(`--source-mode must be one of: auto, git, filesystem (got: ${v})`);
        process.exit(2);
      }
      flags.sourceMode = v;
    } else if (arg === "-h" || arg === "--help") {
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
  console.log(`sync.ts — propagate framework changes from internal to public

Usage:
  tsx scripts/sync-src/sync.ts [--dry-run|--apply] [--delete] [--include-readme]
                               [--source <path>] [--target <path>]
                               [--source-mode <auto|git|filesystem>]

Default mode is --dry-run. Default --source-mode is 'auto' (uses git ls-files
when source has a .git/ tree; otherwise walks the filesystem under manifest
include[]/exclude[] globs). See file header for full flag documentation.`);
}

// ----------------------------------------------------------------------------
// Manifest types
// ----------------------------------------------------------------------------

interface Manifest {
  version: string;
  include: string[];
  exclude: string[];
  sanitize: Record<string, string>;
  template: Record<string, string>;
  warn_on_target_orphans: boolean;
  changelog_project_slugs: string[];
  // Per-rule lint exemption map. Key is the lint rule code (matches
  // LintIssue.code, e.g. "project-slug-ref"); value is an array of exact
  // relative-POSIX paths where that rule is suppressed. Other rules continue
  // to fire normally on the same path — exemption is rule-scoped.
  // See manifest.json5 for the canonical comment block + when-to-add policy.
  // Optional in the parsed manifest; defaults to {} when absent.
  lint_exemptions: Record<string, string[]>;
}

async function readManifest(sourceRoot: string): Promise<Manifest> {
  const path = join(sourceRoot, "scripts", "sync-src", "manifest.json5");
  if (!existsSync(path)) {
    throw new Error(`manifest not found at ${path}`);
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON5.parse<Manifest>(raw);
  // Light validation — fail loud on shape drift.
  for (const k of ["version", "include", "exclude", "sanitize", "template"]) {
    if (!(k in parsed)) throw new Error(`manifest missing required key: ${k}`);
  }
  if (!Array.isArray(parsed.include) || !Array.isArray(parsed.exclude)) {
    throw new Error("manifest include / exclude must be arrays");
  }
  // changelog_project_slugs may be absent in legacy manifests; default to []
  // (the transformer falls back to a regex-only sweep).
  if (parsed.changelog_project_slugs !== undefined && !Array.isArray(parsed.changelog_project_slugs)) {
    throw new Error("manifest changelog_project_slugs must be an array");
  }
  if (parsed.changelog_project_slugs === undefined) {
    (parsed as Manifest).changelog_project_slugs = [];
  }
  // lint_exemptions may be absent in legacy manifests; default to {}.
  // Shape validation: object whose values are string[]. Fail loud on shape
  // drift (caught early at manifest load, not deep in lintPropagatedBody).
  const rawExemptions = (parsed as Record<string, unknown>).lint_exemptions;
  if (rawExemptions === undefined) {
    (parsed as Manifest).lint_exemptions = {};
  } else if (typeof rawExemptions !== "object" || rawExemptions === null || Array.isArray(rawExemptions)) {
    throw new Error("manifest lint_exemptions must be an object keyed by lint rule code");
  } else {
    for (const [k, v] of Object.entries(rawExemptions as Record<string, unknown>)) {
      if (!Array.isArray(v)) {
        throw new Error(`manifest lint_exemptions.${k} must be an array of relative POSIX paths`);
      }
      for (const p of v) {
        if (typeof p !== "string") {
          throw new Error(`manifest lint_exemptions.${k} entries must be strings`);
        }
      }
    }
    (parsed as Manifest).lint_exemptions = rawExemptions as Record<string, string[]>;
  }
  return parsed;
}

// ----------------------------------------------------------------------------
// Glob matcher — pure stdlib, supports ** / * / negation prefix `!`
// ----------------------------------------------------------------------------

/**
 * Convert a glob pattern to a RegExp. Supports:
 *   `**`  → any number of path segments (including zero)
 *   `*`   → any chars except `/`
 *   `?`   → single char except `/`
 *   `[..]`→ char class
 *   `!`   → negation (caller-handled; this function ignores leading `!`)
 *
 * Path inputs use POSIX forward-slash separators.
 */
function globToRegex(glob: string): RegExp {
  let pattern = glob.startsWith("!") ? glob.slice(1) : glob;
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      // ** — any number of segments
      if (pattern[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
    } else if (c === "*") {
      re += "[^/]*";
      i++;
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === ".") {
      re += "\\.";
      i++;
    } else if (c === "/" || /[a-zA-Z0-9_\-]/.test(c)) {
      re += c;
      i++;
    } else {
      // Escape any other regex meta-char.
      re += `\\${c}`;
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(path: string, patterns: string[]): boolean {
  // Apply patterns in order: a literal match sets state, a `!`-prefixed
  // pattern flips it back. Final state = match.
  let matched = false;
  for (const pat of patterns) {
    const negate = pat.startsWith("!");
    const re = globToRegex(pat);
    if (re.test(path)) matched = !negate;
  }
  return matched;
}

// ----------------------------------------------------------------------------
// File-set computation
// ----------------------------------------------------------------------------

interface FileEntry {
  relPath: string;       // POSIX-style path relative to source root
  category: "copy" | "sanitize" | "template";
  sanitizerName?: string;
  transformerName?: string;
}

/**
 * Walk the source tree and derive the candidate sync set.
 *
 * Source enumeration mode:
 *   - `git`: iterate `git ls-files` against source. Discipline: a file must
 *     be `git add`-ed in source before it's eligible for sync — preserves
 *     the gate that unreviewed local work doesn't accidentally ship.
 *   - `filesystem`: walk the filesystem under the manifest include[] globs
 *     directly. Used when source has no `.git/` tree (e.g., HQ-as-unmanaged-
 *     filesystem post-v0.22.0-fix C-1). The discipline shifts from "git-
 *     tracked at source" to "matches manifest include[]" + lint pass +
 *     Critic + tarball-completeness probe before publish.
 *   - `auto`: detect via `.git/` presence at source root.
 *
 * Both modes feed the same downstream filter (matchesAny against include[]
 * + exclude[]) and the same template/sanitize/copy bucketing logic.
 */
async function computeSyncSet(
  sourceRoot: string,
  manifest: Manifest,
  sourceMode: SourceMode = "auto",
): Promise<FileEntry[]> {
  const resolvedMode = resolveSourceMode(sourceRoot, sourceMode);
  console.error(`[sync] source enumeration: ${resolvedMode}${resolvedMode === "filesystem" ? " (no .git/ at source root)" : ""}`);

  const candidates =
    resolvedMode === "git"
      ? await enumerateViaGitLsFiles(sourceRoot)
      : await enumerateViaFilesystem(sourceRoot, manifest);

  const entries: FileEntry[] = [];

  for (const rel of candidates) {
    // Skip the manifest's own working files from the sync-src directory
    // EXCEPT those explicitly in include[] (scripts/sync-src is included
    // so the public tree can run sync too if reverse-publish ever needs).
    const posixPath = rel.split(sep).join("/");

    // exclude wins by default, with one nuance: specific include[] paths
    // (literal, no glob wildcards) override a broader exclude glob.
    const explicitInclude = manifest.include.some((p) => !hasGlobChars(p) && p === posixPath);
    if (!explicitInclude && matchesAny(posixPath, manifest.exclude)) {
      continue;
    }
    if (!matchesAny(posixPath, manifest.include) && !explicitInclude) {
      continue;
    }

    // Bucket: template > sanitize > copy. Exact-path keys only.
    if (manifest.template[posixPath]) {
      entries.push({ relPath: posixPath, category: "template", transformerName: manifest.template[posixPath] });
    } else if (manifest.sanitize[posixPath]) {
      entries.push({ relPath: posixPath, category: "sanitize", sanitizerName: manifest.sanitize[posixPath] });
    } else {
      entries.push({ relPath: posixPath, category: "copy" });
    }
  }

  entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return entries;
}

function resolveSourceMode(sourceRoot: string, requested: SourceMode): "git" | "filesystem" {
  if (requested === "git") return "git";
  if (requested === "filesystem") return "filesystem";
  // auto: detect git presence at source root.
  return existsSync(join(sourceRoot, ".git")) ? "git" : "filesystem";
}

async function enumerateViaGitLsFiles(sourceRoot: string): Promise<string[]> {
  const { stdout } = await exec("git", ["ls-files"], { cwd: sourceRoot, maxBuffer: 16 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

/**
 * enumerateViaFilesystem — walk the source filesystem and return relative
 * POSIX paths for every file matching the manifest include[] globs (minus
 * exclude[] hits). The final include/exclude filter still runs in
 * `computeSyncSet`; this enumeration is the candidate-set generator.
 *
 * Hard-skipped during traversal (defense-in-depth, regardless of manifest):
 *   - `.git/`  — never walk a git directory
 *   - `node_modules/` — never walk dependency trees
 *   - `dist/`  — never walk build output
 *   - `.DS_Store` — macOS metadata; never propagate
 *
 * The hard-skip set keeps recursion bounded on common noise. Manifest
 * exclude[] still applies as the authoritative filter — these are just
 * descent-pruning shortcuts.
 *
 * Symlinks are followed via `stat` (not `lstat`) for parity with git's
 * default behavior; cycles are not expected in `.claude/` trees in practice.
 */
async function enumerateViaFilesystem(sourceRoot: string, _manifest: Manifest): Promise<string[]> {
  const HARD_SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
  const HARD_SKIP_NAMES = new Set([".DS_Store"]);
  const out: string[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      // Source directory unreadable — fail loud rather than silently
      // skipping content. Operator needs to see this.
      throw new Error(`enumerateViaFilesystem: could not read ${absDir}: ${(err as Error).message}`);
    }
    for (const ent of entries) {
      if (HARD_SKIP_NAMES.has(ent.name)) continue;
      const absChild = join(absDir, ent.name);
      const relChild = relDir === "" ? ent.name : `${relDir}/${ent.name}`;
      // Resolve symlinks for type detection.
      let isDir = ent.isDirectory();
      let isFile = ent.isFile();
      if (ent.isSymbolicLink()) {
        try {
          const s = await stat(absChild);
          isDir = s.isDirectory();
          isFile = s.isFile();
        } catch {
          // Dangling symlink — skip silently. (Common with editor temp files.)
          continue;
        }
      }
      if (isDir) {
        if (HARD_SKIP_DIRS.has(ent.name)) continue;
        await walk(absChild, relChild);
      } else if (isFile) {
        out.push(relChild);
      }
      // Other types (sockets, FIFOs, etc.) — skip silently.
    }
  }

  await walk(sourceRoot, "");
  return out;
}

function hasGlobChars(s: string): boolean {
  return /[\*\?\[\]]/.test(s);
}

// ----------------------------------------------------------------------------
// Sanitizers
// ----------------------------------------------------------------------------

type Sanitizer = (body: string, ctx: { relPath: string }) => string;

const SANITIZERS: Record<string, Sanitizer> = {
  "sanitize-passthrough": (body) => body,
  "sanitize-settings": (body, ctx) => {
    // v1: settings.json is byte-identical between trees, so passthrough.
    // Future drift: strip user-machine paths, debug flags, internal-only
    // hook entries here. The verify pass enforces that no /Users/ or
    // $CLAUDE_INTERNAL_ leaks ship.
    return body;
  },
};

function runSanitizer(name: string, body: string, ctx: { relPath: string }): string {
  const fn = SANITIZERS[name];
  if (!fn) throw new Error(`unknown sanitizer: ${name}`);
  return fn(body, ctx);
}

// ----------------------------------------------------------------------------
// Transformers
// ----------------------------------------------------------------------------

interface TransformerCtx {
  targetExists: boolean;
  targetBody: string;
  includeReadme: boolean;
  manifest: Manifest;
}

type Transformer = (sourceBody: string, ctx: TransformerCtx) => { body: string; skip: boolean; reason?: string };

/**
 * genericizeChangelogBody — rewrite project-slug references in CHANGELOG
 * narration so the public copy keeps narrative continuity without leaking
 * Tier-1-private project identity.
 *
 * Two passes:
 *   1. Path-shaped genericization: any `workspace/<slug>/...` where <slug>
 *      matches the lowercase-dash project-slug pattern AND is NOT in the
 *      allowed-workspace-prefix set (workspace/_global/, workspace/_examples/,
 *      etc.) gets rewritten to `workspace/<project>/...`.
 *   2. Bare-label genericization: standalone occurrences of a known slug
 *      from `manifest.changelog_project_slugs` get rewritten to `<project>`.
 *      Word-boundary anchored to avoid matching inside other identifiers.
 *
 * The list-driven bare-label pass is intentionally specific (only the
 * documented slugs) — a regex-only sweep would over-match common words.
 * The path-shaped pass IS regex-only because the `workspace/<slug>/` shape
 * is structural and won't collide with prose.
 */
function genericizeChangelogBody(sourceBody: string, slugs: string[]): string {
  let body = sourceBody;

  // Pass 1: workspace/<slug>/... -> workspace/<project>/...
  // Allowed prefixes (kept as-is) match ALLOWED_WORKSPACE_PREFIXES used by lint.
  body = body.replace(/\bworkspace\/([a-z][a-z0-9-]+)\//g, (match, slug) => {
    const fullPrefix = `workspace/${slug}/`;
    const allowed =
      fullPrefix.startsWith("workspace/_global/") ||
      fullPrefix.startsWith("workspace/_examples/") ||
      fullPrefix.startsWith("workspace/_inbox/") ||
      fullPrefix === "workspace/_registry/" ||
      fullPrefix === "workspace/.gitkeep/";
    return allowed ? match : "workspace/<project>/";
  });

  // Pass 2: user-specific auto-memory path collapse.
  // CHANGELOG narration sometimes cites Claude Code's per-project auto-memory
  // path (e.g., `~/.claude/projects/-Users-<user>-.../memory/foo.md`) as a
  // provenance pointer. The literal path is user-machine-specific. Collapse
  // it to the generic `~/.claude/projects/<project>/memory/` shape so the
  // public CHANGELOG keeps narrative continuity without leaking the encoded
  // user-home segment.
  body = body.replace(
    /(?:\/Users\/[^/\s'"`)]+|\$HOME|~)\/\.claude\/projects\/[^\s'"`)]+\/memory\//g,
    "~/.claude/projects/<project>/memory/",
  );

  // Pass 3: bare-label rewrites for known slugs.
  // Word-boundary on the left; right side allows `/`, `.`, `'`, end-of-word, or
  // common surrounding punctuation. Skipping `workspace/<slug>/` already-handled
  // forms via negative lookbehind `(?<!workspace\/)` so we don't double-rewrite.
  for (const slug of slugs) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<!workspace\\/)\\b${escaped}\\b`, "g");
    body = body.replace(re, "<project>");
  }

  return body;
}

/**
 * mergePackageJson — field-by-field merge for the template-package-json
 * transformer. See the JSDoc on TRANSFORMERS["template-package-json"] below
 * for the per-field direction rules and the v0.11.0 / v0.12.2 history that
 * motivates the structured merge.
 *
 * Returns a new object with internal's key order preserved followed by
 * public-only keys (rare). For the `files` field specifically, the result
 * is the union of source.files and target.files with internal's order
 * preserved (de-duplicated, public-only entries appended). The `private`
 * field is unconditionally stripped (BL-052 npm-publish-guard) — see the
 * transformer JSDoc for the privacy-hazard rationale.
 *
 * Pure function — no I/O, no console output. Errors surface as caller
 * decides; this function assumes both inputs already parsed cleanly.
 */
function mergePackageJson(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  // Pass 1: walk source keys, preserving internal's order.
  for (const key of Object.keys(source)) {
    if (key === "private") {
      // BL-052: internal repo is marked `"private": true` as a defense-in-depth
      // npm-publish-guard against accidental egress of operator-private
      // memory/ content. Public tap-agents/ MUST be publishable — its whole
      // purpose is npm distribution — so the flag is unconditionally stripped
      // on the way out. Symmetric to the field-merge logic for `files[]`:
      // both fields receive explicit per-key direction rather than
      // pass-through. See transformer JSDoc for the threat-model detail.
      continue;
    }
    if (key === "files") {
      const srcFiles = Array.isArray(source.files) ? (source.files as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const tgtFiles = Array.isArray(target.files) ? (target.files as unknown[]).filter((x): x is string => typeof x === "string") : [];
      merged.files = unionStringArray(srcFiles, tgtFiles);
    } else {
      // All other internal-defined keys: internal wins.
      merged[key] = source[key];
    }
  }

  // Pass 2: append public-only top-level keys verbatim. Rare in steady
  // state (the two package.json files match field-for-field except for
  // version + files today) but a safety net against future divergence.
  // The `private` strip applies to source-side only; if public somehow grew
  // a `"private"` field, it is dropped here too (same threat model).
  for (const key of Object.keys(target)) {
    if (key === "private") continue;
    if (!(key in merged)) {
      merged[key] = target[key];
    }
  }

  return merged;
}

/**
 * unionStringArray — return a new array containing every unique value from
 * `primary` followed by every value in `secondary` not already present.
 * Preserves primary's input order. O(n+m) via Set membership.
 */
function unionStringArray(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of primary) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const v of secondary) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

const TRANSFORMERS: Record<string, Transformer> = {
  // Transformer behavior — see design §5 for the full split rules. Practical
  // per-file shape:
  //   CHANGELOG.md      — copy from source then genericize project-slug refs
  //   package.json      — field-by-field merge with strip-private (BL-051 +
  //                       BL-052; see template-package-json JSDoc below for
  //                       per-field direction, v0.11.0/v0.12.2 regression
  //                       history, and npm-publish-guard rationale). NOT a
  //                       pass-through copy.
  //   package-lock.json — DO NOT COPY; npm regenerates from target's package.json
  //   README.md         — DO NOT OVERWRITE unless --include-readme

  "template-changelog": (sourceBody, { manifest }) => {
    const transformed = genericizeChangelogBody(sourceBody, manifest.changelog_project_slugs);
    return { body: transformed, skip: false };
  },
  /**
   * template-package-json — structured field-by-field merge of internal source
   * package.json into the public target package.json.
   *
   * History: prior shape (pre-BL-051) was a pass-through copy
   * (`body: sourceBody`). That shape silently re-introduced the v0.11.0
   * files-array regression every time the operator ran `npm run sync:apply`.
   * Specifically:
   *   - v0.11.0 dropped 4 entries from internal's package.json#files
   *     (`playbooks`, `memory`, `docs`, `settings.json`).
   *   - v0.12.2 fixed PUBLIC's package.json#files (16 entries restored).
   *   - INTERNAL's files array was never expanded back to 16.
   *   - The pass-through transformer meant the next `sync:apply` would
   *     overwrite public's 16-entry array with internal's 12-entry array,
   *     re-shipping the broken tarball and breaking `agent-dashboard`'s
   *     prebuild integrity check.
   *
   * BL-052 (composed in the same release as BL-051) added a second concern:
   * internal's `package.json` is marked `"private": true` as a defense-in-
   * depth npm-publish-guard. The strip-private rule below ensures public
   * never inherits the flag — public IS the publishable surface.
   *
   * The fix is a structured field-merge with explicit per-field direction:
   *
   *   1. version             — internal wins (sync is the propagation event
   *                            for the new release version into public).
   *   2. files               — array union, internal's order preserved with
   *                            public-only entries appended deduplicated.
   *                            Union semantics are deliberately conservative:
   *                            (a) prevents the regression class above, (b)
   *                            never accidentally drops a public entry, (c)
   *                            still propagates internal additions. Removals
   *                            from internal's files DO NOT auto-propagate;
   *                            operator removes from public's package.json
   *                            manually. That asymmetry is by design — the
   *                            cost of a stale extra files entry (tarball
   *                            ships a few KB of unused files) is much
   *                            smaller than the cost of an unflagged removal
   *                            of a required entry (downstream build break).
   *   3. private             — stripped unconditionally (BL-052). Internal
   *                            sets `"private": true` so `npm publish`
   *                            refuses to run on the internal tree before
   *                            file-matching. Public must be publishable,
   *                            so the flag is dropped during merge. Strip
   *                            applies whether private comes from source or
   *                            target (see mergePackageJson Pass 2). This
   *                            inverts the metadata layer guard at the
   *                            sync boundary; the two changes are
   *                            complementary halves of one atomic unit.
   *   4. all other internal-defined keys — internal wins (canonical source;
   *                            description, scripts, exports, dependencies,
   *                            engines, etc. flow from internal as the
   *                            release-driving authority).
   *   5. public-only top-level keys — preserved verbatim. If public ever
   *                            grows a key internal doesn't have (e.g., an
   *                            npm-publish-specific config), the sync keeps
   *                            it. Unlikely in steady state but a safety
   *                            net against future divergence.
   *
   * Formatting: JSON output uses 2-space indent + trailing newline to match
   * both trees' existing convention (verified by inspection of both files).
   * Order: internal's key order preserved; public-only keys appended at the
   * end so the diff stays minimal for the common case (no public-only keys).
   *
   * If parsing fails on either side (malformed JSON), the transformer logs
   * a warning and falls back to pass-through behavior — preserves the
   * fail-loud principle (downstream verification or commit will surface the
   * malformed JSON) without silently dropping the sync run.
   */
  "template-package-json": (sourceBody, { targetExists, targetBody }) => {
    if (!targetExists) {
      // Initial creation — no public to merge with. Source wins entirely.
      return { body: sourceBody, skip: false };
    }
    let source: Record<string, unknown>;
    let target: Record<string, unknown>;
    try {
      source = JSON.parse(sourceBody);
    } catch (err) {
      console.warn(`template-package-json: source package.json malformed JSON (${(err as Error).message}); falling back to pass-through`);
      return { body: sourceBody, skip: false };
    }
    try {
      target = JSON.parse(targetBody);
    } catch (err) {
      console.warn(`template-package-json: target package.json malformed JSON (${(err as Error).message}); falling back to pass-through`);
      return { body: sourceBody, skip: false };
    }
    const merged = mergePackageJson(source, target);
    const out = JSON.stringify(merged, null, 2) + "\n";
    return { body: out, skip: false };
  },
  "template-package-lock": (_sourceBody) => ({
    body: "",
    skip: true,
    reason: "package-lock.json is npm-regenerated, not synced. Run 'npm install' in target.",
  }),
  "template-readme": (sourceBody, { targetExists, targetBody, includeReadme }) => {
    if (!targetExists) return { body: sourceBody, skip: false };
    if (includeReadme) return { body: sourceBody, skip: false };
    if (sourceBody === targetBody) return { body: sourceBody, skip: true, reason: "README identical; nothing to do" };
    return {
      body: targetBody,
      skip: true,
      reason: "README divergent — pass --include-readme to overwrite public's README with internal's",
    };
  },
};

function runTransformer(name: string, sourceBody: string, ctx: TransformerCtx): { body: string; skip: boolean; reason?: string } {
  const fn = TRANSFORMERS[name];
  if (!fn) throw new Error(`unknown transformer: ${name}`);
  return fn(sourceBody, ctx);
}

// ----------------------------------------------------------------------------
// Lint pass — hard FAILs and WARNs (see design §4)
// ----------------------------------------------------------------------------

interface LintIssue {
  level: "FAIL" | "WARN";
  code: string;
  path: string;
  lineNo?: number;
  message: string;
}

const PROJECT_SLUG_RE = /\bworkspace\/[a-z][a-z0-9-]+\//g;
const ALLOWED_WORKSPACE_PREFIXES = new Set([
  "workspace/_global/",
  "workspace/_examples/",
  "workspace/_inbox/",
  "workspace/_registry",
  "workspace/.gitkeep",
]);

// Private-memory reference detection.
//
// The framework's `memory/` directory itself ships publicly — README.md,
// _examples/, and the stack-preferences/audience-knowledge/etc. file SHAPES
// (empty seeds) are part of the public artifact. Relative `memory/<file>.md`
// references inside agent bodies, docs, etc. point to the framework's own
// directory and are legitimate public content. We only flag references to
// USER-SPECIFIC auto-memory paths, which live under Claude Code's per-project
// memory directory at `~/.claude/projects/<encoded>/memory/...` (or absolute
// `/Users/<name>/.claude/projects/...`, `$HOME/.claude/projects/...`).
//
// History: an earlier version of this rule used a substring match against a
// PRIVATE_MEMORY_REFS allow-list, which over-flagged every agent that cited
// `memory/runtime-gotchas.md`, `memory/test-patterns.md`, etc. Those are
// public files. The tightened matcher below only catches the user-machine
// auto-memory paths that genuinely shouldn't leak. The
// `template-changelog` transformer also rewrites these to a generic
// `~/.claude/projects/<project>/memory/` placeholder — the placeholder is
// the LEGITIMATE post-genericization shape, so the linter must NOT flag it.
//
// BL-047 allowlist additions (2026-05-12): the negative-lookahead skip-list
// is widened beyond the literal `<project>` placeholder to also exclude
// two other documentation-grade placeholders:
//   - `...` — the path-ellipsis placeholder used in protocol docs to indicate
//     a generic per-project encoded path (e.g., `~/.claude/projects/.../memory/`
//     to denote any operator's auto-memory tree without picking one).
//   - any `<bracket-template>` segment — e.g., `~/.claude/projects/<encoded>/`
//     or `~/.claude/projects/<operator>/`. Any segment that starts with `<`
//     and ends with `>` is a template marker, not an operator-machine path.
// All three forms are documentation-only and don't leak operator identity.
// Real leaks (literal `/Users/<name>/...`, literal encoded user-home paths)
// continue to fire.
const USER_AUTO_MEMORY_RE = /(?:\/Users\/[^/\s'"`)]+|\$HOME|~)\/\.claude\/projects\/(?!(?:<[^>]+>|\.\.\.)\/)[^\s'"`)]+\/memory\//g;

const INTERNAL_ABS_PATH_RE = /App Development[\/\\]\.claude/g;
const USER_HOME_RE = /\/Users\/[a-z0-9_]+/gi;

async function lintPropagatedBody(
  relPath: string,
  body: string,
  exemptions: Record<string, string[]> = {},
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  const isMarkdown = relPath.endsWith(".md");
  const isCommand = relPath.startsWith("commands/") && isMarkdown;

  // BL-047 allowlist: files under `workspace/_examples/` are fixture content
  // by design. The `_examples/` tree IS the public-facing example library;
  // its job is to demonstrate the full Tier-1 artifact set (intake-brief,
  // prd, scope, tech-strategy, handoff-package) using a fictional project
  // slug (e.g., `example-tools-cli`). Those internal cross-references
  // between fixture files MUST keep their concrete slug so a reader can
  // trace the example end-to-end. Suppress project-slug-ref + private-
  // memory-ref checks for any path under `workspace/_examples/`.
  // The internal-abs-path and secret-pattern checks still apply — those
  // catch real leaks regardless of file location.
  const isExampleFixture = relPath.startsWith("workspace/_examples/");

  // B2 audit follow-up (2026-05-17): per-rule manifest exemption lookup.
  // Exact-path match; other lint rules still fire for this file. See
  // manifest.json5 `lint_exemptions` block for canonical when-to-add policy.
  // Helper used per-rule below so each exemption is auditable.
  const isExemptFromRule = (ruleCode: string): boolean => {
    const list = exemptions[ruleCode];
    if (!list || list.length === 0) return false;
    return list.includes(relPath);
  };

  // §4 FAIL #2 — user-specific auto-memory path references in markdown bodies.
  // Framework `memory/` directory ships publicly. Only Claude Code's
  // per-project auto-memory paths (under ~/.claude/projects/) should be flagged.
  if (
    isMarkdown &&
    relPath !== "memory/README.md" &&
    !relPath.startsWith("memory/_examples/") &&
    !isExampleFixture
  ) {
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      USER_AUTO_MEMORY_RE.lastIndex = 0;
      const matches = lines[i].match(USER_AUTO_MEMORY_RE);
      if (!matches) continue;
      for (const m of matches) {
        issues.push({
          level: "FAIL",
          code: "private-memory-ref",
          path: relPath,
          lineNo: i + 1,
          message: `references user-specific auto-memory path: ${m}`,
        });
      }
    }
  }

  // §4 FAIL #3 — project-slug workspace paths.
  // Skip when: not markdown, under workspace/_examples/, OR the file is on
  // the manifest's per-rule exemption list for `project-slug-ref`. Other
  // lint rules continue to fire for exempted files (exemption is rule-
  // scoped, not file-scoped). Exemption hits log to stderr for audit.
  if (isMarkdown && !isExampleFixture) {
    if (isExemptFromRule("project-slug-ref")) {
      console.error(`[sync] lint exemption: project-slug-ref skipped for ${relPath}`);
    } else {
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        PROJECT_SLUG_RE.lastIndex = 0;
        const matches = lines[i].match(PROJECT_SLUG_RE);
        if (!matches) continue;
        for (const m of matches) {
          const allowed = [...ALLOWED_WORKSPACE_PREFIXES].some((p) => m.startsWith(p));
          if (!allowed) {
            issues.push({
              level: "FAIL",
              code: "project-slug-ref",
              path: relPath,
              lineNo: i + 1,
              message: `references project-specific workspace path: ${m}`,
            });
          }
        }
      }
    }
  }

  // §4 FAIL #10 — internal-tree absolute path leaks in commands/*.md.
  if (isCommand) {
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      INTERNAL_ABS_PATH_RE.lastIndex = 0;
      if (INTERNAL_ABS_PATH_RE.test(lines[i])) {
        issues.push({
          level: "FAIL",
          code: "internal-abs-path",
          path: relPath,
          lineNo: i + 1,
          message: `references internal tree path 'App Development/.claude' — rewrite framework-relative`,
        });
      }
      USER_HOME_RE.lastIndex = 0;
      if (USER_HOME_RE.test(lines[i])) {
        issues.push({
          level: "FAIL",
          code: "user-home-path",
          path: relPath,
          lineNo: i + 1,
          message: `references /Users/<name> path — strip user-machine specifics`,
        });
      }
    }
  }

  // §8 Risk 2 — secret patterns.
  //
  // Self-exclude: `scripts/sync-src/secret-patterns.ts` is the definition file
  // for the patterns themselves. Its regex literals (e.g. the PEM key prefix
  // string) trigger the same patterns they're trying to detect — a tautology,
  // not a leak. The compiled `.js` is built into the public dist via the
  // build script, but the `.ts` source is what `git ls-files` picks up for
  // sync. Skip both.
  //
  // BL-047 (2026-05-12): `scripts/sync-src/sync.test.ts` is also a tautological
  // fixture — it carries synthetic path literals (synthetic username
  // documented in that file's header) that exercise the macOS operator-
  // identity pattern by construction. Same self-exclude rationale as the
  // pattern definition file itself.
  const isSecretPatternsSource =
    relPath === "scripts/sync-src/secret-patterns.ts" ||
    relPath === "scripts/sync-src/secret-patterns.js" ||
    relPath === "scripts/sync-src/sync.test.ts" ||
    relPath === "scripts/sync-src/sync.test.js";
  if (!isSecretPatternsSource) {
    const hits: SecretHit[] = scanBody(body);
    for (const h of hits) {
      issues.push({
        level: "FAIL",
        code: `secret:${h.pattern}`,
        path: relPath,
        lineNo: h.lineNo,
        message: `secret pattern matched (${h.pattern})`,
      });
    }
  }

  return issues;
}

// ----------------------------------------------------------------------------
// Unified-diff renderer (compact, no third-party dep)
// ----------------------------------------------------------------------------

function unifiedDiff(rel: string, a: string, b: string): string {
  if (a === b) return "";
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  // Compact diff — just print up to 80 lines of context. Sufficient for the
  // dry-run summary; operator inspects full diffs via `git diff` post-apply.
  const out: string[] = [];
  out.push(`--- ${rel} (target)`);
  out.push(`+++ ${rel} (source)`);
  const max = Math.max(aLines.length, bLines.length);
  let printed = 0;
  for (let i = 0; i < max && printed < 80; i++) {
    const x = aLines[i];
    const y = bLines[i];
    if (x === y) continue;
    if (x !== undefined) {
      out.push(`-${x}`);
      printed++;
    }
    if (y !== undefined) {
      out.push(`+${y}`);
      printed++;
    }
  }
  if (max > 80) out.push(`... (${max - 80} more diverging lines truncated)`);
  return out.join("\n");
}

// ----------------------------------------------------------------------------
// Preflight — assert target tree state
// ----------------------------------------------------------------------------

async function preflight(targetRoot: string): Promise<void> {
  if (!existsSync(targetRoot)) {
    throw new Error(`target tree not found: ${targetRoot}`);
  }
  // Confirm git tree.
  if (!existsSync(join(targetRoot, ".git"))) {
    throw new Error(`target ${targetRoot} does not appear to be a git checkout (.git missing)`);
  }
  // Best-effort: warn if working tree is dirty (operator may have
  // intentional staging — don't hard-fail).
  try {
    const { stdout } = await exec("git", ["status", "--short"], { cwd: targetRoot });
    if (stdout.trim()) {
      console.warn("PREFLIGHT WARN: target working tree is not clean. Inspect before running --apply:");
      console.warn(stdout);
    }
  } catch (err) {
    console.warn(`PREFLIGHT WARN: could not run git status in target: ${err}`);
  }
}

// ----------------------------------------------------------------------------
// Orphan detection (target has files source no longer carries)
// ----------------------------------------------------------------------------

async function findOrphans(sourceRoot: string, targetRoot: string, manifest: Manifest, syncSet: FileEntry[]): Promise<string[]> {
  const syncSetPaths = new Set(syncSet.map((e) => e.relPath));
  let targetTracked: string[];
  try {
    const { stdout } = await exec("git", ["ls-files"], { cwd: targetRoot, maxBuffer: 16 * 1024 * 1024 });
    targetTracked = stdout.split(/\r?\n/).filter(Boolean);
  } catch (err) {
    console.warn(`WARN: could not list target tracked files: ${err}`);
    return [];
  }
  const orphans: string[] = [];
  for (const rel of targetTracked) {
    const posixPath = rel.split(sep).join("/");
    // Only inspect paths that the manifest would have considered for sync.
    if (matchesAny(posixPath, manifest.exclude)) continue;
    if (!matchesAny(posixPath, manifest.include)) continue;
    // Paths in template[] are special — they have transformers, so even
    // "skipping" them (like template-readme) is intentional, not orphan.
    if (manifest.template[posixPath]) continue;
    if (!syncSetPaths.has(posixPath)) {
      orphans.push(posixPath);
    }
  }
  return orphans.sort();
}

// ----------------------------------------------------------------------------
// Read/write helpers
// ----------------------------------------------------------------------------

async function readUtf8(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function fileExists(path: string): Promise<boolean> {
  return existsSync(path);
}

async function writeAtomic(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ----------------------------------------------------------------------------
// Confirmation prompt for --delete
// ----------------------------------------------------------------------------

async function confirmYesNo(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt + " ", (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

interface PlannedAction {
  relPath: string;
  action: "create" | "update" | "skip-identical" | "skip-template" | "skip-orphan-keep";
  reason?: string;
  body?: string;       // proposed new body (when action is create/update)
  targetBody?: string; // existing target body (when action is update/skip-identical)
}

async function plan(flags: CliFlags, manifest: Manifest, syncSet: FileEntry[]): Promise<PlannedAction[]> {
  const actions: PlannedAction[] = [];
  for (const entry of syncSet) {
    const sourcePath = join(flags.source, ...entry.relPath.split("/"));
    const targetPath = join(flags.target, ...entry.relPath.split("/"));
    const sourceBody = await readUtf8(sourcePath);
    const targetExists = await fileExists(targetPath);
    const targetBody = targetExists ? await readUtf8(targetPath) : "";

    let nextBody: string;
    let skip = false;
    let reason: string | undefined;

    if (entry.category === "template") {
      const result = runTransformer(entry.transformerName!, sourceBody, {
        targetExists,
        targetBody,
        includeReadme: flags.includeReadme,
        manifest,
      });
      nextBody = result.body;
      skip = result.skip;
      reason = result.reason;
    } else if (entry.category === "sanitize") {
      nextBody = runSanitizer(entry.sanitizerName!, sourceBody, { relPath: entry.relPath });
    } else {
      nextBody = sourceBody;
    }

    if (skip) {
      actions.push({ relPath: entry.relPath, action: "skip-template", reason, targetBody });
      continue;
    }
    if (targetExists && nextBody === targetBody) {
      actions.push({ relPath: entry.relPath, action: "skip-identical", body: nextBody, targetBody });
      continue;
    }
    actions.push({
      relPath: entry.relPath,
      action: targetExists ? "update" : "create",
      body: nextBody,
      targetBody,
    });
  }
  return actions;
}

/**
 * BL-037 fix (2026-05-12): scan every file in the sync set whose post-run bytes
 * will sit in the public tree, not just files whose action is `create` /
 * `update`. Pre-fix scope was diff-driven (changed-bytes only), which means a
 * leak that already shipped in a previous release would be invisible to
 * `npm run sync:dry-run` until source content changed (caught by v0.12.1
 * post-release audit; provenance: CHANGELOG v0.12.1 line 34).
 *
 * Body resolution per action:
 *   - create / update: scan the propagated body (the bytes we're about to write)
 *   - skip-identical:   scan body (preferred) or fall back to targetBody — the
 *                       file is staying in public; the bytes there need to be
 *                       clean even if we're not changing them this run
 *   - skip-template:    scan targetBody — the transformer chose to leave the
 *                       existing public file in place; those bytes still need
 *                       to be clean
 *   - default:          scan targetBody (defensive)
 *
 * Empty/undefined bodies are no-ops (covers binary skip-template cases like
 * package-lock.json where there's no readable body).
 *
 * Scope contract: this function scans whatever bytes will sit in the public
 * tree after this run completes, regardless of whether the run changed them.
 */
async function lintActions(actions: PlannedAction[], manifest: Manifest): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const a of actions) {
    let body: string | undefined;
    if (a.action === "create" || a.action === "update") {
      body = a.body;
    } else if (a.action === "skip-identical") {
      body = a.body ?? a.targetBody;
    } else if (a.action === "skip-template") {
      body = a.targetBody;
    } else {
      body = a.targetBody;
    }
    if (body === undefined || body === "") continue;
    issues.push(...(await lintPropagatedBody(a.relPath, body, manifest.lint_exemptions)));
  }
  return issues;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  // B1 fail-loud guard: source and target MUST resolve to different trees.
  // If they collide (e.g., `DEFAULT_SOURCE = join(HERE, "..", "..")` resolves
  // to tap-agents/ when invoked from tap-agents/scripts/sync-src/ — making
  // tap-agents BOTH source and target), the sync becomes a self-sanitizer
  // not a propagator. Hard-fail before any read/write.
  let sourceReal: string;
  let targetReal: string;
  try {
    sourceReal = realpathSync(flags.source);
  } catch (err) {
    console.error(`sync.ts: source path does not exist or is not resolvable: ${flags.source}`);
    console.error(`  ${(err as Error).message}`);
    process.exit(2);
  }
  try {
    targetReal = realpathSync(flags.target);
  } catch (err) {
    console.error(`sync.ts: target path does not exist or is not resolvable: ${flags.target}`);
    console.error(`  ${(err as Error).message}`);
    process.exit(2);
  }
  if (sourceReal === targetReal) {
    console.error(`sync.ts: FATAL — source and target resolve to the same tree (${sourceReal}).`);
    console.error(`  Sync must propagate HQ -> tap-agents/. Running with source == target turns sync`);
    console.error(`  into a self-sanitizer (every file diffs against itself; lint passes operate on`);
    console.error(`  the would-be public tree using the would-be public tree as source).`);
    console.error(`  Pass explicit --source <HQ-path> --target <tap-agents-path> when invoking from`);
    console.error(`  a sync-src directory inside the target tree. See protocols/sync-tapagents-protocol.md.`);
    process.exit(2);
  }

  const manifest = await readManifest(flags.source);

  console.log(`sync.ts — manifest v${manifest.version}`);
  console.log(`  source: ${flags.source}`);
  console.log(`  target: ${flags.target}`);
  console.log(`  mode:   ${flags.apply ? "APPLY" : "DRY-RUN"}${flags.delete ? " +delete" : ""}${flags.includeReadme ? " +include-readme" : ""}`);
  console.log(`  source-mode: ${flags.sourceMode}`);
  console.log("");

  await preflight(flags.target);

  const syncSet = await computeSyncSet(flags.source, manifest, flags.sourceMode);
  console.log(`sync set: ${syncSet.length} files (${syncSet.filter((e) => e.category === "copy").length} copy, ${syncSet.filter((e) => e.category === "sanitize").length} sanitize, ${syncSet.filter((e) => e.category === "template").length} template)`);

  const actions = await plan(flags, manifest, syncSet);

  const created = actions.filter((a) => a.action === "create");
  const updated = actions.filter((a) => a.action === "update");
  const skipped_identical = actions.filter((a) => a.action === "skip-identical");
  const skipped_template = actions.filter((a) => a.action === "skip-template");

  console.log(`  plan: ${created.length} create, ${updated.length} update, ${skipped_identical.length} identical, ${skipped_template.length} template-skip`);
  console.log("");

  if (skipped_template.length) {
    console.log("TEMPLATE-SKIP (transformer-decided):");
    for (const a of skipped_template) console.log(`  ~ ${a.relPath} — ${a.reason}`);
    console.log("");
  }

  // Orphans.
  const orphans = await findOrphans(flags.source, flags.target, manifest, syncSet);
  if (orphans.length) {
    if (flags.delete) {
      console.log("DELETIONS (--delete enabled):");
      for (const p of orphans) console.log(`  - ${p}`);
    } else {
      console.log("WARN: target orphans (present in target, absent in source). Re-run with --delete to remove:");
      for (const p of orphans) console.log(`  ! ${p}`);
    }
    console.log("");
  }

  // Lint.
  const issues = await lintActions(actions, manifest);
  const fails = issues.filter((i) => i.level === "FAIL");
  const warns = issues.filter((i) => i.level === "WARN");
  if (warns.length) {
    console.log("LINT WARN:");
    for (const w of warns) console.log(`  ! ${w.path}:${w.lineNo ?? "?"} [${w.code}] ${w.message}`);
    console.log("");
  }
  if (fails.length) {
    console.log("LINT FAIL:");
    for (const f of fails) console.log(`  x ${f.path}:${f.lineNo ?? "?"} [${f.code}] ${f.message}`);
    console.log("");
    console.log(`Sync aborted: ${fails.length} hard-fail lint issue(s). Fix in source and re-run.`);
    process.exit(1);
  }

  // Big-batch alarm.
  const changing = created.length + updated.length;
  if (changing > 100) {
    console.log(`WARN: sync would touch ${changing} files (>100). Inspect the plan above carefully.`);
    console.log("");
  }

  if (flags.dryRun) {
    // Compact diff summary.
    let printed = 0;
    for (const a of updated) {
      if (printed >= 10) {
        console.log(`... ${updated.length - printed} more update-diffs not printed; run with --apply --include-readme=false on a clean target to inspect via 'git diff'`);
        break;
      }
      const d = unifiedDiff(a.relPath, a.targetBody ?? "", a.body ?? "");
      if (d) {
        console.log(d);
        console.log("");
        printed++;
      }
    }
    if (created.length) {
      console.log("CREATE:");
      for (const a of created) console.log(`  + ${a.relPath} (${(a.body ?? "").length} bytes)`);
      console.log("");
    }
    console.log("Dry-run complete. Pass --apply to write.");
    return;
  }

  // APPLY mode.
  if (flags.delete && orphans.length) {
    const ok = await confirmYesNo(`Proceed with deleting ${orphans.length} target file(s)? (y/N)`);
    if (!ok) {
      console.log("Aborted at deletion confirmation.");
      process.exit(0);
    }
    for (const p of orphans) {
      const targetPath = join(flags.target, ...p.split("/"));
      try {
        await unlink(targetPath);
      } catch (err) {
        console.warn(`WARN: could not unlink ${targetPath}: ${err}`);
      }
    }
    console.log(`Deleted ${orphans.length} orphan file(s).`);
  }

  let wrote = 0;
  for (const a of [...created, ...updated]) {
    if (!a.body && a.body !== "") continue;
    const targetPath = join(flags.target, ...a.relPath.split("/"));
    await writeAtomic(targetPath, a.body);
    wrote++;
  }
  console.log(`Wrote ${wrote} file(s) into target.`);

  console.log("");
  console.log("Apply complete. Next steps (operator):");
  console.log(`  cd ${flags.target}`);
  console.log("  git status                # confirm staged set matches expectations");
  console.log("  git diff                  # eyeball the actual changes");
  console.log("  npm install               # regenerate package-lock.json (template-skip applied)");
  console.log("  npm run build             # confirm dist/ builds clean");
  console.log("  npm run verify-sync       # post-apply hash check");
  console.log("");
  console.log("REMINDER: package-lock.json is npm-regenerated, not synced. README.md was preserved unless --include-readme.");
}

main().catch((err) => {
  console.error("");
  console.error("sync.ts: FATAL");
  console.error(err && (err as Error).stack ? (err as Error).stack : err);
  process.exit(1);
});
