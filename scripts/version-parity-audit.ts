/**
 * version-parity-audit.ts
 *
 * §4.6 cross-channel parity audit. EA runs this daily; surfaces any divergence
 * between local tags / remote tags / npm versions / GitHub Releases that
 * operator-side polling (Gate 5 / `/release` Step 6a-6f) AND the post-publish
 * CI workflow (`.github/workflows/verify-publish.yml`) missed.
 *
 * Channels audited (all four must agree for parity):
 *
 *   1. Local tags           — `git -C <repo> tag -l 'v*'`
 *   2. Remote tags          — `git -C <repo> ls-remote --tags origin 'v*'`
 *   3. npm versions         — `npm view @tapintomymind/tap-agents versions --json`
 *   4. GitHub Releases      — `gh release list --repo tapintomymind/tap-agents --limit 50 --json tagName`
 *
 * Known orphans (documented in CHANGELOG; tolerated with annotation):
 *
 *   - v0.15.0 — local + remote tag present (originally orphan-tag in tap-agents/;
 *               tag pushed retroactively for archaeology), npm + GH Release
 *               permanently absent. Documented in v0.17.0 + v0.18.0 CHANGELOG
 *               entries: "treated as permanent absent contrary signal" per
 *               `commands/release.md` Failure modes (npm immutability — can't
 *               republish v0.15.0 because publish-date sort would place it
 *               AFTER v0.16.0+ which adds confusion).
 *
 *   - v0.8.3 — local + remote tag present, npm + GH Release absent. publish.yml
 *              ran but failed at npm publish step (pre-Trusted-Publishing-OIDC
 *              migration; OIDC fix shipped in v0.9.0). Documented in v0.18.0
 *              proposal Cost/risk section as one of the 5 incident classes.
 *
 *   - v0.13.0, v0.13.1 — never created. Numbering gap, not a divergence. These
 *              versions don't appear in ANY channel; the audit ignores absent-
 *              from-all-channels versions entirely (only flags presence-then-
 *              missing).
 *
 * Output: human-readable summary by default; `--json` flag for machine-readable.
 * EA folds the human-readable form into TEAM HEALTH on briefings.
 *
 * Exit 0 on parity (zero unknown divergences). Exit 1 if any unknown divergence
 * detected. Known-orphan divergences DO NOT cause non-zero exit — they're
 * annotated but expected.
 *
 * Usage:
 *
 *   # Default (audits ../tap-agents/, human-readable output):
 *   npm run audit:version-parity
 *
 *   # Or directly:
 *   tsx scripts/version-parity-audit.ts
 *
 *   # Override repo path:
 *   tsx scripts/version-parity-audit.ts --repo-path /path/to/tap-agents
 *
 *   # JSON output (for EA parsing, agent-dashboard ingestion, etc.):
 *   tsx scripts/version-parity-audit.ts --json
 *
 * Style: mirrors `scripts/test-changelog-format.ts` (tsx + node:assert/strict;
 * no vitest devDep; human-readable output as the default).
 *
 * Provenance: deferred from v0.18.0 Gate 5 amendment (see
 * `workspace/_global/org-designer-proposals/20260512-2330-gate-5-post-publish-verification.md`
 * §"Deferred to v0.19.0" — N3). Shipped as v0.19.0 Step A.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PKG_NAME = "@tapintomymind/tap-agents";
const GH_REPO = "tapintomymind/tap-agents";

/**
 * Versions known to be missing from one-or-more channels with documented
 * reasoning. Audit annotates these as "KNOWN ORPHAN" and does NOT fail.
 *
 * Structure: version → { missing_from: <channel-set>, reason: <one-line> }.
 *
 * The audit annotates a version as a known-orphan only if its actual missing
 * channels are a subset of `missing_from`. If a known-orphan version
 * unexpectedly becomes missing from a NEW channel beyond what's documented
 * here, that NEW channel-loss surfaces as an unknown divergence (which is
 * correct — the surface contract on the orphan changed and operator should
 * investigate).
 *
 * If a future version becomes known-orphan, add an entry here; the alternative
 * is to repeatedly resurface known divergences in every daily briefing, which
 * defeats the purpose of the audit.
 */
const KNOWN_ORPHANS: Record<
  string,
  { missing_from: Array<"local" | "remote" | "npm" | "releases">; reason: string }
> = {
  "0.15.0": {
    // Tag exists local-only in tap-agents/ (never pushed to origin). publish.yml
    // never fired (tag-trigger requires the tag to reach origin). npm + GH
    // Releases consequently never received the version. The CHANGELOG note in
    // v0.18.0 documents this as "treated as permanent absent contrary signal":
    // republishing would publish-date-AFTER v0.16.0+ and add confusion.
    missing_from: ["remote", "npm", "releases"],
    reason:
      "Local-only tag in tap-agents/; never pushed to origin (the orphan-tag class). publish.yml never fired; npm + GH Releases never received. Permanent absence per v0.17.0 + v0.18.0 CHANGELOG — republishing would publish-date-AFTER v0.16.0+ and add confusion.",
  },
  "0.8.3": {
    // Tag on local + remote; publish.yml ran but failed at npm publish step
    // pre-Trusted-Publishing-OIDC migration (OIDC fix shipped v0.9.0). One of
    // the 5 incident classes documented in v0.18.0 Gate 5 proposal Cost/risk.
    missing_from: ["npm", "releases"],
    reason:
      "Tag on local + remote; publish.yml ran but failed at npm publish step (pre-Trusted-Publishing-OIDC migration). OIDC fix shipped in v0.9.0. Documented in v0.18.0 Gate 5 proposal Cost/risk section as one of the 5 incident classes.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────────────────────

interface CliArgs {
  repoPath: string;
  json: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let repoPath: string | null = null;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--repo-path") {
      repoPath = args[++i];
      if (!repoPath) {
        console.error("--repo-path requires a path argument");
        process.exit(2);
      }
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(2);
    }
  }

  // Default repo path: ../tap-agents/ relative to this script's directory.
  if (!repoPath) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Script lives at .claude/scripts/version-parity-audit.ts; default tap-agents
    // is the sibling-of-parent: .claude/scripts/../../tap-agents
    repoPath = resolve(__dirname, "..", "..", "tap-agents");
  } else if (!isAbsolute(repoPath)) {
    repoPath = resolve(process.cwd(), repoPath);
  }

  return { repoPath, json };
}

function printUsage(): void {
  console.log(`Usage: tsx scripts/version-parity-audit.ts [options]

Options:
  --repo-path <dir>   Path to tap-agents/ checkout (default: ../tap-agents)
  --json              Emit machine-readable JSON output (default: human-readable)
  -h, --help          Show this help

Channels audited (all four must agree for parity):
  1. Local tags       (git tag -l 'v*' in <repo-path>)
  2. Remote tags      (git ls-remote --tags origin 'v*' in <repo-path>)
  3. npm versions     (npm view ${PKG_NAME} versions --json)
  4. GitHub Releases  (gh release list --repo ${GH_REPO} --limit 50)

Exit codes:
  0   Parity confirmed (zero unknown divergences; known-orphans annotated)
  1   Unknown divergence detected (audit failure)
  2   Argument or environment error (couldn't run audit at all)
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel readers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip leading 'v' from a version reference. Audits compare on the bare
 * SemVer form (e.g., "0.18.0", not "v0.18.0") since npm uses bare versions and
 * git/GH use v-prefixed tags.
 */
function stripV(ref: string): string {
  return ref.startsWith("v") ? ref.slice(1) : ref;
}

/**
 * Read local v* tags from the given repo. Returns bare SemVer strings sorted.
 */
function readLocalTags(repoPath: string): string[] {
  if (!existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }
  try {
    const stdout = execSync(`git -C "${repoPath}" tag -l 'v*'`, {
      encoding: "utf-8",
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(stripV);
  } catch (err) {
    throw new Error(
      `Failed to read local tags from ${repoPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Read remote v* tags via `git ls-remote --tags origin`. Returns bare SemVer
 * strings; filters out the `^{}` dereferenced peel-pointers (annotated-tag
 * artifact).
 */
function readRemoteTags(repoPath: string): string[] {
  try {
    const stdout = execSync(
      `git -C "${repoPath}" ls-remote --tags origin 'v*'`,
      { encoding: "utf-8" },
    );
    const tags = new Set<string>();
    for (const line of stdout.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const ref = parts[1];
      // refs/tags/v0.18.0  or  refs/tags/v0.18.0^{}
      const match = ref.match(/^refs\/tags\/(v[^\^]+)(\^\{\})?$/);
      if (match) {
        tags.add(stripV(match[1]));
      }
    }
    return Array.from(tags);
  } catch (err) {
    throw new Error(
      `Failed to read remote tags from ${repoPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Read npm published versions. Returns bare SemVer strings.
 */
function readNpmVersions(): string[] {
  try {
    const stdout = execSync(`npm view ${PKG_NAME} versions --json`, {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(stdout);
    // npm view returns either a single string (one version) or an array.
    if (typeof parsed === "string") {
      return [parsed];
    }
    if (Array.isArray(parsed)) {
      return parsed.map((v: unknown) => String(v));
    }
    throw new Error(`Unexpected npm view output shape: ${stdout.slice(0, 100)}`);
  } catch (err) {
    throw new Error(
      `Failed to read npm versions for ${PKG_NAME}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Read GitHub Releases. Returns bare SemVer strings.
 */
function readGhReleases(): string[] {
  try {
    const stdout = execSync(
      `gh release list --repo ${GH_REPO} --limit 50 --json tagName`,
      { encoding: "utf-8" },
    );
    const parsed = JSON.parse(stdout) as Array<{ tagName: string }>;
    return parsed.map((r) => stripV(r.tagName));
  } catch (err) {
    throw new Error(
      `Failed to read GitHub Releases for ${GH_REPO}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SemVer ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two bare-SemVer strings (e.g., "0.18.0", "0.8.3"). Returns -1, 0, 1
 * suitable for Array.prototype.sort. Strict SemVer (no pre-release suffix
 * handling — none of our channels emit pre-release versions yet).
 */
function compareSemVer(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divergence analysis
// ─────────────────────────────────────────────────────────────────────────────

type Channel = "local" | "remote" | "npm" | "releases";
const ALL_CHANNELS: Channel[] = ["local", "remote", "npm", "releases"];

interface ChannelPresence {
  version: string;
  local: boolean;
  remote: boolean;
  npm: boolean;
  releases: boolean;
}

interface Divergence {
  version: string;
  missing_from: Channel[];
  present_in: Channel[];
  is_known_orphan: boolean;
  known_orphan_reason: string | null;
}

/**
 * Build the channel-presence table for the union of all versions across all
 * four channels.
 */
function buildPresenceTable(
  local: string[],
  remote: string[],
  npm: string[],
  releases: string[],
): ChannelPresence[] {
  const allVersions = new Set<string>([...local, ...remote, ...npm, ...releases]);
  const sorted = Array.from(allVersions).sort(compareSemVer);
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  const npmSet = new Set(npm);
  const releasesSet = new Set(releases);
  return sorted.map((version) => ({
    version,
    local: localSet.has(version),
    remote: remoteSet.has(version),
    npm: npmSet.has(version),
    releases: releasesSet.has(version),
  }));
}

/**
 * Identify divergent versions (present in 1+ channels, missing from 1+ others).
 * Annotate each with known-orphan status if matching `KNOWN_ORPHANS`.
 */
function findDivergences(presence: ChannelPresence[]): Divergence[] {
  const divergences: Divergence[] = [];
  for (const entry of presence) {
    const present_in: Channel[] = ALL_CHANNELS.filter((c) => entry[c]);
    const missing_from: Channel[] = ALL_CHANNELS.filter((c) => !entry[c]);
    if (present_in.length === 0 || missing_from.length === 0) {
      // Either absent from all (impossible — would not be in the union) or
      // present in all (parity). Skip.
      continue;
    }
    const orphan = KNOWN_ORPHANS[entry.version];
    const is_known_orphan =
      orphan !== undefined &&
      // The actual missing channels must match (or be a subset of) the
      // documented missing channels for the orphan annotation to apply.
      // If a known-orphan version unexpectedly becomes missing from a NEW
      // channel, that's a real divergence — surface as unknown.
      missing_from.every((c) => orphan.missing_from.includes(c));
    divergences.push({
      version: entry.version,
      missing_from,
      present_in,
      is_known_orphan,
      known_orphan_reason: is_known_orphan ? orphan!.reason : null,
    });
  }
  return divergences;
}

// ─────────────────────────────────────────────────────────────────────────────
// Output rendering
// ─────────────────────────────────────────────────────────────────────────────

function formatChannelSet(channels: Channel[]): string {
  return channels.join(", ");
}

function renderHuman(
  args: CliArgs,
  local: string[],
  remote: string[],
  npm: string[],
  releases: string[],
  divergences: Divergence[],
  unknownCount: number,
  knownCount: number,
): void {
  const timestamp = new Date().toISOString();

  console.log(`TapAgents version-parity audit — ${timestamp}`);
  console.log("=".repeat(60));
  console.log(`Package: ${PKG_NAME}`);
  console.log(`Repo:    ${args.repoPath}`);
  console.log("");

  // Per-channel summary. Sort versions ascending; "count: N" appended.
  const sortedLocal = [...local].sort(compareSemVer);
  const sortedRemote = [...remote].sort(compareSemVer);
  const sortedNpm = [...npm].sort(compareSemVer);
  const sortedReleases = [...releases].sort(compareSemVer);

  const compactList = (versions: string[]): string => {
    if (versions.length === 0) return "(none)";
    if (versions.length <= 4) return versions.join(", ");
    return `${versions[0]}, ${versions[1]}, ..., ${
      versions[versions.length - 1]
    }`;
  };

  console.log(
    `Local tags:    ${compactList(sortedLocal)}  (count: ${sortedLocal.length})`,
  );
  console.log(
    `Remote tags:   ${compactList(sortedRemote)}  (count: ${sortedRemote.length})`,
  );
  console.log(
    `npm versions:  ${compactList(sortedNpm)}  (count: ${sortedNpm.length})`,
  );
  console.log(
    `GH Releases:   ${compactList(
      sortedReleases,
    )}  (count: ${sortedReleases.length})`,
  );
  console.log("");

  // Divergences. Known-orphans rendered with annotation; unknowns rendered as
  // warnings.
  if (divergences.length === 0) {
    console.log("Divergences: (none)");
    console.log("");
    console.log("PASS — all four channels in parity.");
    return;
  }

  console.log("Divergences:");
  for (const div of divergences) {
    const marker = div.is_known_orphan ? "ANNOT" : "WARN";
    const orphanTag = div.is_known_orphan ? " (KNOWN ORPHAN)" : "";
    console.log(
      `  [${marker}] v${div.version} — present in [${formatChannelSet(
        div.present_in,
      )}], missing from [${formatChannelSet(div.missing_from)}]${orphanTag}`,
    );
    if (div.is_known_orphan && div.known_orphan_reason) {
      // Reason can be long; wrap roughly at 75 cols with hanging indent.
      const reason = div.known_orphan_reason;
      console.log(`          ${reason}`);
    } else {
      // Unknown — give actionable remediation hint based on the missing-channel
      // pattern.
      console.log(`          ${remediationHint(div)}`);
    }
  }
  console.log("");

  if (unknownCount === 0) {
    console.log(
      `PASS (${knownCount} known annotation${
        knownCount === 1 ? "" : "s"
      }; 0 unknown divergences)`,
    );
  } else {
    console.log(
      `FAIL (${unknownCount} unknown divergence${
        unknownCount === 1 ? "" : "s"
      }; ${knownCount} known annotation${knownCount === 1 ? "" : "s"})`,
    );
    console.log("");
    console.log("Surface this to user in next briefing under TEAM HEALTH.");
  }
}

/**
 * Actionable remediation hint for an unknown divergence, based on which
 * channels are missing. Mirrors the §4.6 divergence-shape table.
 */
function remediationHint(div: Divergence): string {
  const m = new Set(div.missing_from);
  const p = new Set(div.present_in);
  if (m.has("remote") && p.has("local")) {
    return `Tag exists locally but not on origin (the v0.15.0 class). Remediate: git push origin v${div.version}`;
  }
  if (m.has("npm") && p.has("remote") && p.has("releases")) {
    return `Tag on origin + GH Release present but missing from npm. publish.yml ran but npm publish failed mid-flight. Release-incident; remediation requires republish under a new version per immutability rules.`;
  }
  if (m.has("releases") && p.has("npm")) {
    return `Version on npm but no GitHub Release. softprops/action-gh-release@v2 errored in publish.yml. Remediate: awk CHANGELOG entry → gh release create v${div.version} --notes-file <entry>.`;
  }
  if (m.has("local") && p.has("npm") && p.has("releases")) {
    return `Published from a non-canonical checkout (npm + GH have it, local repo doesn't). Investigate — this should not happen in normal flow.`;
  }
  // Default: enumerate without specific class match.
  return `Investigate: present in [${formatChannelSet(
    div.present_in,
  )}], missing from [${formatChannelSet(div.missing_from)}].`;
}

function renderJson(
  args: CliArgs,
  local: string[],
  remote: string[],
  npm: string[],
  releases: string[],
  divergences: Divergence[],
  unknownCount: number,
  knownCount: number,
): void {
  const output = {
    audit_timestamp: new Date().toISOString(),
    package: PKG_NAME,
    repo_path: args.repoPath,
    channels: {
      local_tags: [...local].sort(compareSemVer),
      remote_tags: [...remote].sort(compareSemVer),
      npm_versions: [...npm].sort(compareSemVer),
      gh_releases: [...releases].sort(compareSemVer),
    },
    counts: {
      local: local.length,
      remote: remote.length,
      npm: npm.length,
      releases: releases.length,
    },
    divergences,
    summary: {
      total: divergences.length,
      known_orphans: knownCount,
      unknown: unknownCount,
      verdict: unknownCount === 0 ? "PASS" : "FAIL",
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs();

  let local: string[];
  let remote: string[];
  let npm: string[];
  let releases: string[];

  try {
    local = readLocalTags(args.repoPath);
    remote = readRemoteTags(args.repoPath);
    npm = readNpmVersions();
    releases = readGhReleases();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            audit_timestamp: new Date().toISOString(),
            error: message,
            verdict: "ERROR",
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`version-parity-audit FAILED to run: ${message}`);
      console.error("");
      console.error(
        "This is an environment error (couldn't read one of the channels), not a parity failure.",
      );
      console.error(
        "Verify: git access to the repo, npm view connectivity, gh CLI authentication.",
      );
    }
    process.exit(2);
  }

  const presence = buildPresenceTable(local, remote, npm, releases);
  const divergences = findDivergences(presence);
  const knownCount = divergences.filter((d) => d.is_known_orphan).length;
  const unknownCount = divergences.filter((d) => !d.is_known_orphan).length;

  if (args.json) {
    renderJson(
      args,
      local,
      remote,
      npm,
      releases,
      divergences,
      unknownCount,
      knownCount,
    );
  } else {
    renderHuman(
      args,
      local,
      remote,
      npm,
      releases,
      divergences,
      unknownCount,
      knownCount,
    );
  }

  process.exit(unknownCount === 0 ? 0 : 1);
}

main();
