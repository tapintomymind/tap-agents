/**
 * verify-genericize.ts — the no-re-leak gate (2026-06-02 remediation, design §5.3).
 *
 * Proves that a `--apply` sync would land ZERO private codenames in the public
 * mirror. Mechanism:
 *
 *   1. Seed a throwaway staging directory from the CURRENT target (mirror) HEAD
 *      — a faithful copy of what's published today (so orphan/skip behavior and
 *      the template-readme divergence guard behave exactly as a real run).
 *   2. Run the real sync engine with `--apply --target <staging>` so every
 *      proposed body (genericized) is WRITTEN to the staging tree. This invokes
 *      the identical plan()/genericize/lint path a real apply uses — including
 *      the bare-codename lint FAIL, which aborts here too if a codename slips.
 *   3. Grep the staging tree for EVERY codename on the denylist (built from the
 *      manifest genericize map + the brand-domain denylist), subtracting the
 *      protected `tap-agents` package/repo name. FAIL if ANY line survives.
 *
 * Exit 0 = clean (zero codenames in proposed output). Exit 1 = re-leak found OR
 * the underlying sync aborted (lint FAIL). This is the gate that MUST pass
 * before a human runs `--apply` against the real mirror.
 *
 * Run via:
 *   npm run verify-genericize
 *   tsx scripts/sync-src/verify-genericize.ts --source <HQ> --target <mirror>
 *
 * Design reference:
 *   workspace/_global/architect-designs/2026-06-02-sync-genericizer-remediation.md §5.3
 */

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSON5 from "json5";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = join(HERE, "..", "..");
const DEFAULT_TARGET = join(DEFAULT_SOURCE, "..", "tap-agents");
const SYNC_TS = join(HERE, "sync.ts");

interface CliFlags {
  source: string;
  target: string;
  keep: boolean; // keep the staging dir for inspection
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { source: DEFAULT_SOURCE, target: DEFAULT_TARGET, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source") flags.source = argv[++i] ?? flags.source;
    else if (arg === "--target") flags.target = argv[++i] ?? flags.target;
    else if (arg === "--keep") flags.keep = true;
    else if (arg === "-h" || arg === "--help") {
      console.log("verify-genericize.ts — see file header.");
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

interface GenericizeRule {
  find: string;
  replace: string;
}

interface GenericizeMap {
  rename_clauses?: GenericizeRule[];
  compound?: GenericizeRule[];
  hosts?: GenericizeRule[];
  project_slugs?: string[];
  repo_paths?: GenericizeRule[];
  neon_endpoints?: GenericizeRule[];
  operator?: GenericizeRule[];
  protect?: string[];
}

interface Manifest {
  include?: string[];
  exclude?: string[];
  genericize?: GenericizeMap;
  genericize_exemptions?: string[];
}

// Minimal glob → RegExp (mirrors sync.ts globToRegex). Kept independent so this
// gate stays runnable even if sync.ts is mid-edit.
function globToRegex(glob: string): RegExp {
  const pattern = glob.startsWith("!") ? glob.slice(1) : glob;
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      if (pattern[i + 2] === "/") { re += "(?:.*/)?"; i += 3; }
      else { re += ".*"; i += 2; }
    } else if (c === "*") { re += "[^/]*"; i++; }
    else if (c === "?") { re += "[^/]"; i++; }
    else if (c === ".") { re += "\\."; i++; }
    else if (c && (c === "/" || /[a-zA-Z0-9_\-]/.test(c))) { re += c; i++; }
    else { re += `\\${c}`; i++; }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(p: string, patterns: string[]): boolean {
  let matched = false;
  for (const pat of patterns) {
    const negate = pat.startsWith("!");
    if (globToRegex(pat).test(p)) matched = !negate;
  }
  return matched;
}

function hasGlobChars(s: string): boolean {
  return /[*?[\]]/.test(s);
}

/**
 * inSyncSet — true iff a relative POSIX path would be part of the sync set
 * (matches include[], not excluded — with the explicit-literal-include override
 * sync.ts applies). Paths that fail this are orphans/excluded files the sync
 * does NOT manage; verify-genericize must NOT grade them (they'll be removed
 * via --delete or are intentionally not shipped).
 */
function inSyncSet(rel: string, manifest: Manifest): boolean {
  const include = manifest.include ?? [];
  const exclude = manifest.exclude ?? [];
  const explicitInclude = include.some((p) => !hasGlobChars(p) && p === rel);
  if (!explicitInclude && matchesAny(rel, exclude)) return false;
  if (!matchesAny(rel, include) && !explicitInclude) return false;
  return true;
}

/**
 * Build the codename denylist (grep patterns) from the manifest map + the
 * brand-domain belt-and-suspenders entry. Returns:
 *   - patterns: the regex sources to grep for (a survival = re-leak)
 *   - allow:    substrings to subtract (lines containing ONLY a protected hit)
 */
function buildDenylist(map: GenericizeMap): { patterns: string[]; allow: string[] } {
  const patterns: string[] = [];

  for (const slug of map.project_slugs ?? []) {
    // Word-boundary on each side. claude-team is a prefix of claude-team-app,
    // but we only need to detect "a codename survived", so both firing is fine.
    patterns.push(`\\b${escapeRe(slug)}\\b`);
  }
  for (const r of map.compound ?? []) patterns.push(escapeRe(r.find));
  for (const r of map.hosts ?? []) patterns.push(r.find); // already regex source
  for (const r of map.neon_endpoints ?? []) patterns.push(escapeRe(r.find));
  for (const r of map.repo_paths ?? []) patterns.push(escapeRe(r.find));
  // Operator home-path (literal) — the username form is too noisy to grep
  // globally (it appears legitimately in author fields / package.json), so the
  // denylist greps the home-PATH form, which is the real leak vector.
  patterns.push(escapeRe("/Users/tapandesai/App Development"));

  // Defense-in-depth: the brand domain must never ship (design §1.1 — confirmed
  // absent from synced surfaces, but on the denylist as a guard).
  patterns.push(escapeRe("hq.tapintomymind.com"));

  // Protected substrings to subtract — lines whose ONLY codename-ish hit is the
  // public package/repo name are legitimate.
  const allow = [...(map.protect ?? []), "@tapintomymind/tap-agents", "tapintomymind/tap-agents"];

  return { patterns, allow };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  const manifestPath = join(flags.source, "scripts", "sync-src", "manifest.json5");
  if (!existsSync(manifestPath)) {
    console.error(`verify-genericize: manifest not found at ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON5.parse<Manifest>(await readFile(manifestPath, "utf8"));
  const map = manifest.genericize ?? {};

  console.log("verify-genericize.ts — no-re-leak gate");
  console.log(`  source: ${flags.source}`);
  console.log(`  target: ${flags.target}`);
  console.log("");

  // 1. Seed staging from the current mirror's GIT-TRACKED content (HEAD) only.
  //    A working-tree `cp` would drag in untracked junk (e.g. a nested
  //    `.claude/worktrees/` checkout from another session, or excluded
  //    `memory/agent-changelog.md`) that the SYNC never touches — those would
  //    produce false-positive codename hits in the grep below. `git archive`
  //    gives exactly the tracked set, matching what the sync operates against.
  //    We then `git init` the staging tree so sync.ts's preflight (.git check)
  //    + orphan detection (git ls-files) behave like a real run.
  const staging = await mkdtemp(join(tmpdir(), "tapagents-genericize-"));
  console.log(`[1/3] Seeding staging from mirror HEAD (git-tracked only) at ${staging} …`);
  await exec("sh", ["-c", `git -C "${flags.target}" archive HEAD | tar -x -C "${staging}"`], {
    maxBuffer: 256 * 1024 * 1024,
  });
  // Minimal git tree so preflight + orphan detection work. Commit the archived
  // content so `git ls-files` in the staging tree returns the tracked set.
  await exec("sh", [
    "-c",
    `git -C "${staging}" init -q && ` +
      `git -C "${staging}" config user.email sync@local && ` +
      `git -C "${staging}" config user.name sync && ` +
      `git -C "${staging}" add -A && ` +
      `git -C "${staging}" commit -q -m staging-seed`,
  ], { maxBuffer: 64 * 1024 * 1024 });

  // 2. Run the real sync engine --apply into staging. Inherit stdio so the
  //    bare-codename lint FAIL (if any) is visible and the process exit code
  //    propagates.
  console.log(`[2/3] Running sync --apply --target <staging> …`);
  let syncFailed = false;
  try {
    const { stdout, stderr } = await exec(
      "npx",
      ["tsx", SYNC_TS, "--apply", "--source", flags.source, "--target", staging],
      { cwd: flags.source, maxBuffer: 64 * 1024 * 1024 },
    );
    // Surface the summary lines (plan + any lint output).
    const summary = stdout.split("\n").filter((l) =>
      /sync set:|plan:|LINT|Sync aborted|Wrote|Apply complete/.test(l),
    );
    for (const l of summary) console.log(`    ${l}`);
    if (stderr.trim()) {
      const errLines = stderr.split("\n").filter((l) => /enumeration|exemption|WARN/.test(l));
      for (const l of errLines.slice(0, 5)) console.log(`    ${l}`);
    }
  } catch (err) {
    syncFailed = true;
    const e = err as { stdout?: string; stderr?: string; message?: string };
    console.error("");
    console.error("verify-genericize: the underlying sync ABORTED (this is the gate working if a");
    console.error("codename slipped past the genericizer — the bare-codename lint FAILed).");
    if (e.stdout) {
      const failLines = e.stdout.split("\n").filter((l) => /LINT FAIL|bare-codename|Sync aborted|secret:/.test(l));
      for (const l of failLines) console.error(`    ${l}`);
    }
    if (e.stderr) console.error(e.stderr.split("\n").slice(0, 5).join("\n"));
  }

  // 3. Grep the staging tree for surviving codenames.
  console.log("");
  console.log("[3/3] Grepping proposed output for surviving codenames …");
  const { patterns, allow } = buildDenylist(map);
  const combined = patterns.join("|");

  let grepOut = "";
  try {
    // grep -rEn across the synced extension set. -E for alternation.
    const { stdout } = await exec(
      "grep",
      [
        "-rEn",
        combined,
        "--include=*.md",
        "--include=*.py",
        "--include=*.ts",
        "--include=*.json",
        "--include=*.json5",
        "--include=*.yml",
        "--include=*.yaml",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        staging,
      ],
      { cwd: flags.source, maxBuffer: 64 * 1024 * 1024 },
    );
    grepOut = stdout;
  } catch (err) {
    // grep exits 1 when no matches — that's the SUCCESS case.
    const e = err as { code?: number; stdout?: string };
    if (e.code === 1) {
      grepOut = "";
    } else {
      grepOut = e.stdout ?? "";
    }
  }

  // Filter out lines whose only hit is a protected substring, and the
  // sync-src self-skip files (which carry the codenames/rules by construction).
  const selfSkip = [
    "/scripts/sync-src/manifest.json5",
    "/scripts/sync-src/sync.ts",
    "/scripts/sync-src/sync.test.ts",
    "/scripts/sync-src/verify-sync.ts",
    "/scripts/sync-src/verify-genericize.ts",
    "/scripts/sync-src/secret-patterns.ts",
    "/scripts/sync-src/sync-codex.ts",
    // The private-data hook carries the detection literals by construction
    // (mirror of sync.ts GENERICIZE_SELF_SKIP) — its `/Users/tapandesai/App
    // Development` literal is a DETECTOR target, not a leak.
    "/hooks/framework-private-data-gate.py",
  ];
  const exemptions = (manifest.genericize_exemptions ?? []).map((p) => `/${p}`);

  const survivors: string[] = [];
  for (const line of grepOut.split("\n")) {
    if (!line.trim()) continue;
    // line shape: <path>:<lineno>:<content>
    const firstColon = line.indexOf(":");
    const path = firstColon >= 0 ? line.slice(0, firstColon) : line;
    if (selfSkip.some((s) => path.includes(s))) continue;
    if (exemptions.some((s) => path.includes(s))) continue;
    // Only grade files the SYNC actually manages. Files in the staging tree
    // that are NOT in the sync set (excluded files like workspace/_registry.md
    // / portfolio.json, or target-only orphans) are removed via --delete or
    // intentionally not shipped — the genericizer never touches them, so a
    // codename there is not a sync re-leak. Derive the relative POSIX path by
    // stripping the staging prefix.
    const relPath = path.startsWith(staging) ? path.slice(staging.length).replace(/^[/\\]+/, "") : path;
    if (!inSyncSet(relPath, manifest)) continue;
    // Strip the path:lineno prefix to inspect just content for allow-subtraction.
    const secondColon = line.indexOf(":", firstColon + 1);
    const content = secondColon >= 0 ? line.slice(secondColon + 1) : "";
    // Subtract the protected names: blank them, then re-test the patterns.
    let masked = content;
    for (const a of allow) masked = masked.split(a).join(" ");
    const re = new RegExp(combined);
    if (re.test(masked)) {
      survivors.push(line.replace(staging, "<staging>"));
    }
  }

  // Cleanup unless --keep.
  if (!flags.keep) {
    await rm(staging, { recursive: true, force: true });
  } else {
    console.log(`    (staging kept at ${staging} per --keep)`);
  }

  console.log("");
  if (syncFailed) {
    console.error("verify-genericize: FAIL — the sync aborted before producing clean output.");
    console.error("Fix the genericizer rule the LINT FAIL named, then re-run.");
    process.exit(1);
  }
  if (survivors.length > 0) {
    console.error(`verify-genericize: FAIL — ${survivors.length} codename occurrence(s) survived into the proposed output:`);
    for (const s of survivors.slice(0, 50)) console.error(`  x ${s}`);
    if (survivors.length > 50) console.error(`  … ${survivors.length - 50} more`);
    console.error("");
    console.error("Do NOT --apply. Add/fix the missing genericize rule in manifest.json5 and re-run.");
    process.exit(1);
  }

  console.log("verify-genericize: PASS — ZERO codenames in the proposed output.");
  console.log(`Denylist patterns checked (${patterns.length}): ${patterns.join("  ")}`);
  console.log("Safe to run sync --apply against the real mirror.");
}

main().catch((err: unknown) => {
  console.error("verify-genericize.ts: FATAL");
  console.error(err && (err as Error).stack ? (err as Error).stack : err);
  process.exit(1);
});
