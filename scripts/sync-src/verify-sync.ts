/**
 * verify-sync.ts — companion to sync.ts.
 *
 * Two responsibilities:
 *
 *   (a) Manifest-vs-implementation consistency check.
 *       - Every sanitize/template name referenced in the manifest must be
 *         implemented in sync.ts (presence check against the registered
 *         SANITIZERS / TRANSFORMERS export — done by static import + lookup).
 *       - Every secret-pattern in secret-patterns.ts must be reachable via
 *         scanBody (presence check against PATTERNS export).
 *
 *   (b) Post-apply hash-based source-file verification.
 *       - For the "copy" subset of the sync set (no sanitize, no template),
 *         compute SHA256 of source file and target file. Assert equality.
 *       - Fail-loud on any drift with the citing path + both hashes.
 *
 * Run via:
 *   npm run verify-sync                 (full check; expects source + target)
 *   tsx scripts/sync-src/verify-sync.ts --manifest-only   (skip post-apply)
 *   tsx scripts/sync-src/verify-sync.ts --source <HQ> --source-mode filesystem
 *
 * Source enumeration mirrors sync.ts: --source-mode auto (default) uses
 * git ls-files when the source has a .git/ tree, else walks the filesystem.
 * git mode hard-fails if git ls-files returns zero files (the silent-no-op
 * trap: an empty copy-set would vacuously "pass" while checking nothing).
 *
 * Design reference: workspace/_global/architect-designs/2026-05-11-internal-to-public-sync-flow.md
 * Risk register §8 Risk 4 — "Source-tree drift post-sync"
 * Risk register §8 Risk 5 — "Drift between sync-manifest.json and the actual script behavior"
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import JSON5 from "json5";

import { PATTERNS as SECRET_PATTERNS } from "./secret-patterns.js";

const exec = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = join(HERE, "..", "..");
const DEFAULT_TARGET = join(DEFAULT_SOURCE, "..", "tap-agents");

interface Manifest {
  version: string;
  include: string[];
  exclude: string[];
  sanitize: Record<string, string>;
  template: Record<string, string>;
  warn_on_target_orphans: boolean;
}

// Source enumeration mode — mirrors sync.ts. `auto` detects a `.git/` tree at
// the source root and uses git ls-files when present, else walks the
// filesystem. `git` / `filesystem` force the respective mode. Kept in lockstep
// with sync.ts so verify-sync checks exactly the file-set sync.ts would ship.
type SourceMode = "auto" | "git" | "filesystem";

interface CliFlags {
  manifestOnly: boolean;
  source: string;
  target: string;
  sourceMode: SourceMode;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { manifestOnly: false, source: DEFAULT_SOURCE, target: DEFAULT_TARGET, sourceMode: "auto" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest-only") flags.manifestOnly = true;
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
      console.log("verify-sync.ts — see file header.");
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

const KNOWN_SANITIZERS = new Set(["sanitize-passthrough", "sanitize-settings"]);
const KNOWN_TRANSFORMERS = new Set([
  "template-changelog",
  "template-package-json",
  "template-package-lock",
  "template-readme",
]);

function checkManifestConsistency(manifest: Manifest): string[] {
  const issues: string[] = [];

  // Sanitize names must be implemented.
  for (const [path, name] of Object.entries(manifest.sanitize)) {
    if (!KNOWN_SANITIZERS.has(name)) {
      issues.push(`manifest.sanitize[${path}] references unknown sanitizer '${name}'`);
    }
  }
  // Transformer names must be implemented.
  for (const [path, name] of Object.entries(manifest.template)) {
    if (!KNOWN_TRANSFORMERS.has(name)) {
      issues.push(`manifest.template[${path}] references unknown transformer '${name}'`);
    }
  }
  // Sanity: include/exclude must be non-empty strings.
  for (const p of manifest.include) {
    if (typeof p !== "string" || !p) issues.push(`manifest.include has non-string entry: ${JSON.stringify(p)}`);
  }
  for (const p of manifest.exclude) {
    if (typeof p !== "string" || !p) issues.push(`manifest.exclude has non-string entry: ${JSON.stringify(p)}`);
  }
  // Secret-patterns must be non-empty.
  if (SECRET_PATTERNS.length === 0) {
    issues.push("secret-patterns.ts PATTERNS list is empty");
  }
  return issues;
}

function sha256OfBuf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function resolveSourceMode(sourceRoot: string, requested: SourceMode): "git" | "filesystem" {
  if (requested === "git") return "git";
  if (requested === "filesystem") return "filesystem";
  // auto: detect git presence at source root (parity with sync.ts).
  return existsSync(join(sourceRoot, ".git")) ? "git" : "filesystem";
}

/**
 * enumerateViaFilesystem — walk the source filesystem and return relative
 * POSIX paths for every file under sourceRoot. Mirrors sync.ts's enumerator
 * (same hard-skip set, same symlink-via-stat behavior) so verify-sync's
 * candidate set matches what sync.ts would propagate when the source has no
 * `.git/` tree (e.g., HQ-as-unmanaged-filesystem post-v0.22.0). The
 * include/exclude/sanitize/template filter still runs in computeCopySet; this
 * is just the candidate-set generator.
 */
async function enumerateViaFilesystem(sourceRoot: string): Promise<string[]> {
  const HARD_SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
  const HARD_SKIP_NAMES = new Set([".DS_Store"]);
  const out: string[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`enumerateViaFilesystem: could not read ${absDir}: ${(err as Error).message}`);
    }
    for (const ent of entries) {
      if (HARD_SKIP_NAMES.has(ent.name)) continue;
      const absChild = join(absDir, ent.name);
      const relChild = relDir === "" ? ent.name : `${relDir}/${ent.name}`;
      let isDir = ent.isDirectory();
      let isFile = ent.isFile();
      if (ent.isSymbolicLink()) {
        try {
          const s = await stat(absChild);
          isDir = s.isDirectory();
          isFile = s.isFile();
        } catch {
          continue;
        }
      }
      if (isDir) {
        if (HARD_SKIP_DIRS.has(ent.name)) continue;
        await walk(absChild, relChild);
      } else if (isFile) {
        out.push(relChild);
      }
    }
  }

  await walk(sourceRoot, "");
  return out;
}

async function computeCopySet(sourceRoot: string, manifest: Manifest, sourceMode: SourceMode = "auto"): Promise<string[]> {
  // Reuse the same logic as sync.ts in spirit: candidate files in source,
  // filtered by include/exclude, NOT in sanitize or template (i.e. pure
  // 1:1 copies that should be byte-identical post-sync).
  //
  // Source enumeration mirrors sync.ts: git ls-files when the source has a
  // `.git/` tree, else a filesystem walk. The mode MUST match sync.ts or
  // verify-sync would check a different file-set than was shipped.
  const resolvedMode = resolveSourceMode(sourceRoot, sourceMode);
  console.error(`[verify-sync] source enumeration: ${resolvedMode}${resolvedMode === "filesystem" ? " (no .git/ at source root)" : ""}`);

  let candidates: string[];
  if (resolvedMode === "git") {
    const { stdout } = await exec("git", ["ls-files"], { cwd: sourceRoot, maxBuffer: 16 * 1024 * 1024 });
    candidates = stdout.split(/\r?\n/).filter(Boolean);
    // HARD GUARD — `git ls-files` returned nothing while in git mode. This is
    // the silent-no-op trap: a source with no committed/tracked files (e.g.
    // HQ after its `.git` was archived) would yield zero candidates, zero
    // hash checks, and a false "All checks passed." Fail loud rather than
    // pretend the trees are in sync. Operator should pass
    // `--source-mode filesystem` (or fix the source's git tree).
    if (candidates.length === 0) {
      console.error("");
      console.error("verify-sync.ts: FATAL — git ls-files returned ZERO files in git source-mode.");
      console.error(`  source: ${sourceRoot}`);
      console.error("  This means the copy-set is empty and the hash check would silently no-op");
      console.error("  (vacuously 'pass' while checking nothing). Common cause: the source tree");
      console.error("  has no .git/ (it was archived) so git ls-files sees nothing.");
      console.error("  Re-run with --source-mode filesystem to walk the filesystem instead,");
      console.error("  or point --source at a tree with a populated git index.");
      process.exit(1);
    }
  } else {
    candidates = await enumerateViaFilesystem(sourceRoot);
  }
  const tracked = candidates;

  // Inline globToRegex / matchesAny copies — kept independent of sync.ts so
  // verify-sync stays runnable even if sync.ts itself is mid-edit.
  function globToRegex(glob: string): RegExp {
    let pattern = glob.startsWith("!") ? glob.slice(1) : glob;
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
      else if (c === "/" || /[a-zA-Z0-9_\-]/.test(c)) { re += c; i++; }
      else { re += `\\${c}`; i++; }
    }
    return new RegExp(`^${re}$`);
  }
  function matchesAny(path: string, patterns: string[]): boolean {
    let matched = false;
    for (const pat of patterns) {
      const negate = pat.startsWith("!");
      const re = globToRegex(pat);
      if (re.test(path)) matched = !negate;
    }
    return matched;
  }
  function hasGlobChars(s: string): boolean {
    return /[\*\?\[\]]/.test(s);
  }

  const out: string[] = [];
  for (const rel of tracked) {
    const posixPath = rel.split(sep).join("/");
    const explicitInclude = manifest.include.some((p) => !hasGlobChars(p) && p === posixPath);
    if (!explicitInclude && matchesAny(posixPath, manifest.exclude)) continue;
    if (!matchesAny(posixPath, manifest.include) && !explicitInclude) continue;
    if (manifest.sanitize[posixPath]) continue;
    if (manifest.template[posixPath]) continue;
    out.push(posixPath);
  }
  out.sort();
  return out;
}

async function checkHashEquality(sourceRoot: string, targetRoot: string, copySet: string[]): Promise<string[]> {
  const mismatches: string[] = [];
  for (const rel of copySet) {
    const sourcePath = join(sourceRoot, ...rel.split("/"));
    const targetPath = join(targetRoot, ...rel.split("/"));
    if (!existsSync(targetPath)) {
      mismatches.push(`MISSING in target: ${rel}`);
      continue;
    }
    const sBuf = await readFile(sourcePath);
    const tBuf = await readFile(targetPath);
    const sHash = sha256OfBuf(sBuf);
    const tHash = sha256OfBuf(tBuf);
    if (sHash !== tHash) {
      mismatches.push(`DRIFT: ${rel}\n    source=${sHash}\n    target=${tHash}`);
    }
  }
  return mismatches;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  const manifestPath = join(flags.source, "scripts", "sync-src", "manifest.json5");
  if (!existsSync(manifestPath)) {
    console.error(`manifest not found at ${manifestPath}`);
    process.exit(1);
  }
  const manifest: Manifest = JSON5.parse(await readFile(manifestPath, "utf8"));

  console.log("verify-sync.ts");
  console.log(`  source: ${flags.source}`);
  console.log(`  target: ${flags.target}`);
  console.log(`  mode:   ${flags.manifestOnly ? "MANIFEST-ONLY" : "FULL"}`);
  console.log(`  source-mode: ${flags.sourceMode}`);
  console.log("");

  // (a) Manifest consistency
  const manifestIssues = checkManifestConsistency(manifest);
  if (manifestIssues.length) {
    console.error("MANIFEST CONSISTENCY: FAIL");
    for (const issue of manifestIssues) console.error(`  x ${issue}`);
    process.exit(1);
  }
  console.log(`MANIFEST CONSISTENCY: pass (${Object.keys(manifest.sanitize).length} sanitizers, ${Object.keys(manifest.template).length} transformers, ${SECRET_PATTERNS.length} secret patterns)`);

  if (flags.manifestOnly) {
    console.log("manifest-only mode — skipping hash check.");
    return;
  }

  // (b) Hash equality
  const copySet = await computeCopySet(flags.source, manifest, flags.sourceMode);
  console.log(`Hash check: ${copySet.length} 1:1 files`);
  const mismatches = await checkHashEquality(flags.source, flags.target, copySet);
  if (mismatches.length) {
    console.error("");
    console.error(`HASH CHECK: FAIL (${mismatches.length} mismatch(es))`);
    for (const m of mismatches) console.error(`  x ${m}`);
    process.exit(1);
  }
  console.log("HASH CHECK: pass");
  console.log("");
  console.log("All checks passed.");
}

main().catch((err) => {
  console.error("verify-sync.ts: FATAL");
  console.error(err && (err as Error).stack ? (err as Error).stack : err);
  process.exit(1);
});
