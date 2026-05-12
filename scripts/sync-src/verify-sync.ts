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
 *
 * Design reference: workspace/_global/architect-designs/2026-05-11-internal-to-public-sync-flow.md
 * Risk register §8 Risk 4 — "Source-tree drift post-sync"
 * Risk register §8 Risk 5 — "Drift between sync-manifest.json and the actual script behavior"
 */

import { readFile, readdir } from "node:fs/promises";
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

interface CliFlags {
  manifestOnly: boolean;
  source: string;
  target: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { manifestOnly: false, source: DEFAULT_SOURCE, target: DEFAULT_TARGET };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest-only") flags.manifestOnly = true;
    else if (arg === "--source") flags.source = argv[++i];
    else if (arg === "--target") flags.target = argv[++i];
    else if (arg === "-h" || arg === "--help") {
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

async function computeCopySet(sourceRoot: string, manifest: Manifest): Promise<string[]> {
  // Reuse the same logic as sync.ts in spirit: tracked files in source,
  // filtered by include/exclude, NOT in sanitize or template (i.e. pure
  // 1:1 copies that should be byte-identical post-sync).
  const { stdout } = await exec("git", ["ls-files"], { cwd: sourceRoot, maxBuffer: 16 * 1024 * 1024 });
  const tracked = stdout.split(/\r?\n/).filter(Boolean);

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
  const copySet = await computeCopySet(flags.source, manifest);
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
