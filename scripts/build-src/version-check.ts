/**
 * version-check.ts — Gate 3 of protocols/versioning-protocol.md.
 *
 * CI counterpart to hooks/version-gate.py. The hook runs at local commit time on the
 * staged diff; this script runs in GitHub Actions on the PR diff. Same algorithm,
 * different context.
 *
 * Invariants checked:
 *   1. package.json version on this branch != version on base branch (must bump)
 *   2. New version is a legal SemVer successor to the base version
 *   3. CHANGELOG.md has a heading matching the new version
 *   4. .claude-plugin/plugin.json version matches package.json version
 *   5. .claude-plugin/marketplace.json plugin versions match package.json version
 *   6. Severity floor: computed over the CONSUMER-VISIBLE ACTIVE SURFACE of the
 *      versioned dirs. Removals/renames on that surface (top-level agents/*.md, or
 *      any file under commands|protocols|templates|hooks|scripts) → MAJOR.
 *      Removals/renames CONFINED to the non-active agent sub-namespaces
 *      agents/_planned/** and agents/_archive/** (stubs + HQ-internal archive; not
 *      registry-loaded and not part of the consumer-visible active-agent contract
 *      surface — with _archive/** additionally excluded from the published tarball)
 *      do NOT floor MAJOR. A rename is
 *      keyed on the OLD path, so retiring a live agent stays MAJOR while promoting a
 *      stub (agents/_planned/x.md → agents/_archive/...) is exempt.
 *      Additions of active-surface files → MINOR floor.
 *      No active-surface additions and no active-surface removals → PATCH allowed.
 *      See protocols/versioning-protocol.md §4.2 invariant 3.
 *
 * Run via:
 *   tsx scripts/build-src/version-check.ts --base origin/main
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  return fallback;
}

const BASE = argValue("--base", "origin/main");

let errorCount = 0;
function fail(msg: string): void {
  console.error(`[version-check] ERROR: ${msg}`);
  errorCount += 1;
}

function git(...args: string[]): string {
  try {
    return execSync(`git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    return "";
  }
}

interface SemverParsed {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

function parseSemver(v: string): SemverParsed | null {
  const m = SEMVER_RE.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function classifySuccessor(prev: SemverParsed, next: SemverParsed): "patch" | "minor" | "major" | "illegal" {
  if (
    next.major < prev.major ||
    (next.major === prev.major && next.minor < prev.minor) ||
    (next.major === prev.major && next.minor === prev.minor && next.patch <= prev.patch)
  ) {
    return "illegal";
  }
  if (next.major === prev.major && next.minor === prev.minor && next.patch === prev.patch + 1) {
    return "patch";
  }
  if (next.major === prev.major && next.minor === prev.minor + 1 && next.patch === 0) {
    return "minor";
  }
  if (next.major === prev.major + 1 && next.minor === 0 && next.patch === 0) {
    return "major";
  }
  return "illegal";
}

const VERSIONED_DIRS = ["agents/", "commands/", "protocols/", "templates/", "hooks/", "scripts/"];

// Non-active agent sub-namespaces. Changes confined to these do NOT floor the
// release. `agents/_planned/**` holds not-yet-dispatchable stubs (the Claude Code
// registry loads only the top-level `agents/*.md` glob); `agents/_archive/**` is
// HQ-internal history excluded from the published tarball per
// `scripts/sync-src/manifest.json5`. Neither is part of the consumer-visible
// active-agent surface the severity floor exists to protect. See
// protocols/versioning-protocol.md §4.2 invariant 3 + the 2026-07-01
// _planned→_archive stub-promotion carve-out.
const AGENT_SUBNAMESPACE_PREFIXES = ["agents/_planned/", "agents/_archive/"];

/**
 * True iff `path` is on the consumer-visible active surface of the versioned
 * directories — the surface the MAJOR severity floor protects. For `agents/`,
 * the active surface is the top-level dispatchable contracts (`agents/*.md`);
 * the `_planned/` and `_archive/` sub-namespaces are NOT active. Every other
 * versioned dir (`commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/`)
 * is active-surface in full.
 */
function isActiveSurface(path: string): boolean {
  if (path.startsWith("agents/")) {
    return !AGENT_SUBNAMESPACE_PREFIXES.some((p) => path.startsWith(p));
  }
  return VERSIONED_DIRS.some((d) => path.startsWith(d));
}

interface DiffEntry {
  status: string; // A|M|D|R<num>|C<num>|T
  oldPath: string; // pre-change path (== newPath for non-renames)
  newPath: string; // post-change path
}

function getDiffEntries(base: string): DiffEntry[] {
  const raw = git("diff", "--name-status", `${base}...HEAD`);
  if (!raw) return [];
  const entries: DiffEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    const status = parts[0] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      // R100\told\tnew — retain BOTH paths: the floor keys removals on the OLD
      // path and additions on the NEW path (a rename OFF the active surface must
      // stay MAJOR; a rename WITHIN the non-active sub-namespaces must not floor).
      const oldPath = parts[1] ?? "";
      const newPath = parts[2] ?? "";
      entries.push({ status, oldPath, newPath });
    } else {
      const path = parts[1] ?? "";
      entries.push({ status, oldPath: path, newPath: path });
    }
  }
  return entries;
}

function classifySeverityFloor(entries: DiffEntry[]): "patch" | "minor" | "major" {
  let hasRemovalOrRename = false;
  let hasAddition = false;
  for (const { status, oldPath, newPath } of entries) {
    // Removal/rename counts only when the OLD (pre-change) path was on the
    // active surface. A rename whose old path is under _planned/_archive is
    // not a consumer-visible removal.
    if ((status.startsWith("D") || status.startsWith("R")) && isActiveSurface(oldPath)) {
      hasRemovalOrRename = true;
    }
    // Addition: a newly-appearing active-surface file (plain add, or the
    // additive side of a rename/copy landing on the active surface).
    if (
      (status.startsWith("A") || status.startsWith("R") || status.startsWith("C")) &&
      isActiveSurface(newPath)
    ) {
      hasAddition = true;
    }
  }
  if (hasRemovalOrRename) return "major";
  if (hasAddition) return "minor";
  return "patch";
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function getBaseVersion(base: string): Promise<string | null> {
  const raw = git("show", `${base}:package.json`);
  if (!raw) return null;
  try {
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

async function changelogHasHeading(version: string): Promise<boolean> {
  const path = join(ROOT, "CHANGELOG.md");
  if (!existsSync(path)) return false;
  const body = await readFile(path, "utf8");
  const re = new RegExp(`^##\\s*\\[${version.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]`, "m");
  return re.test(body);
}

async function main(): Promise<void> {
  // Ensure base is fetched (CI may have shallow clone)
  git("fetch", "origin", "main", "--depth=100");

  const pkg = await readJson<{ version: string }>(join(ROOT, "package.json"));
  if (!pkg) {
    fail("package.json missing or unparseable.");
    process.exit(1);
  }

  const baseVersion = await getBaseVersion(BASE);
  if (!baseVersion) {
    console.log(`[version-check] No package.json on ${BASE} — first-version PR. Skipping sequence check.`);
  }

  const next = parseSemver(pkg.version);
  if (!next) {
    fail(`package.json version '${pkg.version}' is not parseable SemVer.`);
    process.exit(1);
  }

  let bumpKind: "patch" | "minor" | "major" | "initial" = "initial";

  if (baseVersion) {
    const prev = parseSemver(baseVersion);
    if (!prev) {
      fail(`base package.json version '${baseVersion}' is not parseable SemVer.`);
    } else {
      if (prev.major === next.major && prev.minor === next.minor && prev.patch === next.patch) {
        fail(
          `package.json version (${pkg.version}) is unchanged from ${BASE}. PRs that touch the framework surface MUST bump the version per protocols/versioning-protocol.md.`,
        );
      } else {
        const kind = classifySuccessor(prev, next);
        if (kind === "illegal") {
          fail(
            `Version ${pkg.version} is not a legal SemVer successor of ${baseVersion}. Legal successors: patch=${prev.major}.${prev.minor}.${prev.patch + 1}, minor=${prev.major}.${prev.minor + 1}.0, major=${prev.major + 1}.0.0.`,
          );
        } else {
          bumpKind = kind;
        }
      }
    }
  }

  // CHANGELOG check
  if (!(await changelogHasHeading(pkg.version))) {
    fail(
      `CHANGELOG.md has no heading '## [${pkg.version}]'. Per protocols/versioning-protocol.md §4.2, the CHANGELOG entry must accompany the version bump.`,
    );
  }

  // Plugin manifest alignment
  const plugin = await readJson<{ version?: string }>(join(ROOT, ".claude-plugin", "plugin.json"));
  if (plugin && plugin.version && plugin.version !== pkg.version) {
    fail(
      `.claude-plugin/plugin.json version (${plugin.version}) differs from package.json (${pkg.version}). Per protocols/versioning-protocol.md §6, these must be locked.`,
    );
  }

  const market = await readJson<{ plugins?: Array<{ name: string; version?: string }> }>(
    join(ROOT, ".claude-plugin", "marketplace.json"),
  );
  if (market && market.plugins) {
    for (const p of market.plugins) {
      if (p.version && p.version !== pkg.version) {
        fail(
          `.claude-plugin/marketplace.json plugin '${p.name}' version (${p.version}) differs from package.json (${pkg.version}).`,
        );
      }
    }
  }

  // Severity floor
  if (bumpKind !== "initial") {
    const entries = getDiffEntries(BASE);
    const floor = classifySeverityFloor(entries);
    const order = { patch: 0, minor: 1, major: 2 } as const;
    if (order[bumpKind as keyof typeof order] < order[floor]) {
      fail(
        `Severity-floor violation: PR diff requires at least a '${floor}' bump (per protocols/versioning-protocol.md §3) but the proposed bump is '${bumpKind}'. Either reclassify the bump or split the removal/rename into its own release.`,
      );
    }
  }

  if (errorCount > 0) {
    console.error(`[version-check] FAILED with ${errorCount} error(s).`);
    process.exit(1);
  }
  console.log(
    `[version-check] OK — ${baseVersion ?? "(initial)"} → ${pkg.version} (${bumpKind})`,
  );
}

main().catch((err: unknown) => {
  console.error("[version-check] FAILED:", err);
  process.exit(1);
});
