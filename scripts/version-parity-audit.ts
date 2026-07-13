/**
 * version-parity-audit.ts
 *
 * §4.6 cross-channel parity audit. EA runs this daily; surfaces any divergence
 * between local tags / remote tags / npm versions / GitHub Releases / main-ancestry
 * that operator-side polling (Gate 5 / `/release` Step 9a-9f) AND the post-publish
 * CI workflow (`.github/workflows/verify-publish.yml`) missed.
 *
 * Channels audited (all five must agree for parity):
 *
 *   1. Local tags           — `git -C <repo> tag -l 'v*'`
 *   2. Remote tags          — `git -C <repo> ls-remote --tags origin 'v*'`
 *   3. npm versions         — `npm view @tapintomymind/tap-agents versions --json`
 *   4. GitHub Releases      — `gh release list --repo tapintomymind/tap-agents --limit 50 --json tagName`
 *   5. Main ancestry        — `git -C <repo> merge-base --is-ancestor v<v> origin/main`
 *                             for every version v in npm. Catches post-publish
 *                             ancestry breaks (force-push class) — Layer A's
 *                             CI gate fires only at publish-time; this is the
 *                             portfolio-wide periodic catch. Added v0.24.0 per
 *                             workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md
 *                             §3.5.
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
 *   - v0.25.0, v0.26.0, v0.27.0 — local + remote tag + GH Release present, npm
 *              absent. Deliberately held from npm (operator distribution
 *              decision, NOT a publish failure); capability carried forward into
 *              the published v0.30.0. Permanent absence by design.
 *
 *   - v0.37.0 — local + remote tag present + on main-ancestry; npm + GH Release
 *              absent. publish.yml ran but failed PRE-publish at the "Upgrade
 *              npm for Trusted Publishing" step: the unpinned `npm install -g
 *              npm@latest` resolved to npm@12, whose engines floor
 *              (Node >=22.22.2) exceeds the workflow's Node-20 runner —
 *              EBADENGINE, exit 1 (npm@latest engine drift, a publish-
 *              infrastructure failure; the release content itself was never
 *              reached). The v0.8.3 incident class, forward-remediated per the
 *              publish-failure doctrine (NOT a deliberate hold): content
 *              carried forward into the published v0.37.1, whose workflow fix
 *              pins Node 22 + npm@11. Documented in the v0.37.1 CHANGELOG
 *              entry.
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
 *   # JSON output (for EA parsing, <project> ingestion, etc.):
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
  {
    missing_from: Array<"local" | "remote" | "npm" | "releases" | "main-ancestry">;
    reason: string;
  }
> = {
  "0.15.0": {
    // Tag exists local-only in tap-agents/ (never pushed to origin). publish.yml
    // never fired (tag-trigger requires the tag to reach origin). npm + GH
    // Releases consequently never received the version. The CHANGELOG note in
    // v0.18.0 documents this as "treated as permanent absent contrary signal":
    // republishing would publish-date-AFTER v0.16.0+ and add confusion.
    // Note: 0.15.0 is also missing from main-ancestry by definition (npm slot
    // is empty), but the fifth channel doesn't check absent-from-npm versions —
    // see §"Main-ancestry channel" below.
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
  "0.25.0": {
    // Deliberately HELD from npm — an operator distribution decision, NOT a
    // mid-flight publish failure. The M-D telemetry-track slice (cloud-mirror:
    // phase-transitions S1 + session lifecycle A). Per the v0.25.0 CHANGELOG
    // entry: "this version was unpublished when slice A landed." The tag WAS
    // created + pushed to origin and a GitHub Release WAS created (verified:
    // present in [local, remote, releases, main-ancestry]; absent only from
    // npm), so the CHANGELOG's "no tag/push" framing describes intent, not the
    // realized channel state — the true and only gap is npm. The capability is
    // carried forward into the next PUBLISHED version v0.30.0 (verified:
    // hooks/stop-phase-transition.py + the session-tracking cloud-mirror
    // emit_event_http() calls are present in the v0.30.0 tree, which IS on
    // npm), so the npm-absence is functionally non-impactful — every consumer
    // installing v0.30.0+ receives this slice's work. Permanent absence by
    // design (npm immutability: republishing would publish-date-AFTER v0.30.0+
    // and add confusion, same posture as v0.15.0).
    missing_from: ["npm"],
    reason:
      "Deliberately held from npm (operator distribution decision, NOT a mid-flight publish failure). M-D telemetry-track cloud-mirror slice. Tag pushed + GitHub Release created; only npm-publish was withheld. Content carried forward into the published v0.30.0 (which IS on npm), so the npm-absence is functionally non-impactful. Permanent absence by design per v0.25.0 CHANGELOG (\"this version was unpublished when slice A landed\") + npm immutability.",
  },
  "0.26.0": {
    // Deliberately HELD from npm — operator distribution decision, NOT a
    // publish failure. M-D telemetry-track slice B (session work-output:
    // product files + committed LOC at seal). Per the v0.26.0 CHANGELOG entry:
    // "held/unpublished alongside v0.25.0." Same realized channel state as
    // v0.25.0 — tag pushed + GitHub Release created (verified: present in
    // [local, remote, releases, main-ancestry]; absent only from npm). The
    // capability is carried forward into the published v0.30.0 (verified:
    // _emit_work_output() + loc_landed_on_main_since() are present in the
    // v0.30.0 tree on npm), so the npm-absence is functionally non-impactful.
    // Permanent absence by design (npm immutability; same posture as v0.15.0).
    missing_from: ["npm"],
    reason:
      "Deliberately held from npm (operator distribution decision, NOT a mid-flight publish failure), alongside v0.25.0. M-D telemetry-track session work-output slice. Tag pushed + GitHub Release created; only npm-publish was withheld. Content carried forward into the published v0.30.0 (which IS on npm), so the npm-absence is functionally non-impactful. Permanent absence by design per v0.26.0 CHANGELOG (\"held/unpublished alongside v0.25.0\") + npm immutability.",
  },
  "0.27.0": {
    // Deliberately HELD from npm — operator distribution decision, NOT a
    // publish failure. M-D telemetry-track Slice A0 (credential-file read in
    // _telemetry.py for frictionless onboarding). Per the v0.27.0 CHANGELOG
    // entry: "Held/unpublished ... operator distribution decision, same posture
    // as the held v0.25.0 + v0.26.0." NOTE: that entry's parenthetical "no
    // tag/push/npm-publish" describes intent at authoring time, but the tag WAS
    // subsequently created + pushed and a GitHub Release WAS created (verified:
    // present in [local, remote, releases, main-ancestry]; absent only from
    // npm) — the realized and only gap is npm. The capability is carried
    // forward into the published v0.30.0 (verified: _resolve_credentials() is
    // present in the v0.30.0 _telemetry.py tree on npm), so the npm-absence is
    // functionally non-impactful. Permanent absence by design (npm immutability;
    // same posture as v0.15.0).
    missing_from: ["npm"],
    reason:
      "Deliberately held from npm (operator distribution decision, NOT a mid-flight publish failure), same posture as v0.25.0 + v0.26.0. M-D telemetry-track onboarding-enablement slice (credential-file read). Tag pushed + GitHub Release created; only npm-publish was withheld. Content carried forward into the published v0.30.0 (which IS on npm), so the npm-absence is functionally non-impactful. Permanent absence by design per v0.27.0 CHANGELOG (\"Held/unpublished ... operator distribution decision\") + npm immutability.",
  },
  "0.37.0": {
    // Publish FAILURE — the v0.8.3 incident class, NOT a deliberate hold. Tag
    // on local + remote + main-ancestry (release-coordinator activation, squash-
    // merged to main); publish.yml fired on the tag push but failed PRE-publish
    // at the "Upgrade npm for Trusted Publishing" step: the unpinned
    // `npm install -g npm@latest` resolved to npm@12, whose engines floor
    // (Node >=22.22.2) exceeds the workflow's then-pinned Node-20 runner —
    // EBADENGINE, exit 1. npm publish never ran and the GitHub Release step was
    // never reached (verified: present in [local, remote, main-ancestry];
    // absent from [npm, releases]). Forward-remediated per the publish-failure
    // doctrine (`commands/release.md` Failure modes; npm immutability — never
    // republish the same version): the full v0.37.0 content ships in the
    // published v0.37.1, which also carries the workflow fix (Node 22 +
    // npm@11 pinned major). Annotation user-approved per entry, 2026-07-13.
    // Provenance: v0.37.1 CHANGELOG entry.
    missing_from: ["npm", "releases"],
    reason:
      "Publish FAILURE (the v0.8.3 incident class, NOT a deliberate hold). Tag on local + remote + main-ancestry; publish.yml ran but failed pre-publish with EBADENGINE — the unpinned npm@latest upgrade resolved to npm@12, incompatible with the workflow's Node-20 runner. npm publish + GitHub Release were never reached. Forward-remediated: content carried forward into the published v0.37.1 (which also pins the workflow to Node 22 + npm@11). Documented in the v0.37.1 CHANGELOG entry.",
  },
  // pre-trunk-discipline-era releases (v0.8.x through v0.23.0) may have
  // historically been tagged off non-main branches and never back-merged.
  // Layer A + the audit's fifth channel start being authoritative as of v0.24.0;
  // earlier versions are annotated when their `main-ancestry` channel shows
  // missing — they're pre-trunk-discipline-era artifacts, not active divergences.
  // The annotation is dynamic (added at runtime if the only missing channel is
  // main-ancestry AND the version is < 0.24.0); see annotation logic below.
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

Channels audited (all five must agree for parity):
  1. Local tags       (git tag -l 'v*' in <repo-path>)
  2. Remote tags      (git ls-remote --tags origin 'v*' in <repo-path>)
  3. npm versions     (npm view ${PKG_NAME} versions --json)
  4. GitHub Releases  (gh release list --repo ${GH_REPO} --limit 50)
  5. Main ancestry    (git merge-base --is-ancestor v<v> origin/main for every npm version)

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

/**
 * Read main-ancestry for every npm-published version. Returns the SET of
 * versions whose tag is an ancestor of `origin/main`. A version present in
 * npm but absent from this set is a trunk-drift divergence (the v0.23.0
 * incident class) — codified as Layer A in publish.yml from v0.24.0
 * onward; this channel is the portfolio-wide periodic catch for cases
 * where ancestry breaks post-publish (force-push class).
 *
 * Implementation: for each npm version v, run
 *   git -C <repo> merge-base --is-ancestor v<v> origin/main
 * and include v in the result if the command exits 0.
 *
 * Performance: per Critic 2026-05-19 F4, ~24 git ops add ~1-1.5s total
 * latency — negligible. No pagination needed.
 *
 * Edge cases:
 * - A version in npm but NOT in local tags (e.g., pre-trunk-discipline-era
 *   archaeology) returns false for the ancestor check (tag ref missing
 *   locally). We skip such versions and surface a warning rather than
 *   misclassify.
 * - A version in local tags but NOT in npm is not checked here (the
 *   fifth channel only audits npm-published versions, per architect §3.5).
 */
function readMainAncestry(repoPath: string, npmVersions: string[]): string[] {
  const ancestral: string[] = [];
  // Ensure origin/main is fresh.
  try {
    execSync(`git -C "${repoPath}" fetch origin main`, {
      encoding: "utf-8",
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (err) {
    // Non-fatal — proceed against whatever origin/main is. The audit prefers
    // not to fail-loud here because some environments cap fetch frequency.
    // Surface as a soft warning in human output rather than aborting.
    console.error(
      `[soft-warn] readMainAncestry: \`git fetch origin main\` failed (${
        err instanceof Error ? err.message : String(err)
      }); proceeding against stale origin/main.`,
    );
  }

  for (const version of npmVersions) {
    const tagRef = `v${version}`;
    // Verify the tag exists locally (else merge-base --is-ancestor would
    // fail for "unknown revision" reasons, not for ancestry reasons).
    try {
      execSync(`git -C "${repoPath}" rev-parse "${tagRef}^{commit}"`, {
        encoding: "utf-8",
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      // Tag not present locally. We can't determine ancestry from this
      // checkout. Skip — the local channel will already flag this as a
      // divergence under its own pattern (present-in-npm-missing-from-local
      // is the "non-canonical-checkout publish" remediation hint).
      continue;
    }

    try {
      execSync(
        `git -C "${repoPath}" merge-base --is-ancestor "${tagRef}" origin/main`,
        {
          encoding: "utf-8",
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      // Exit 0 → ancestor.
      ancestral.push(version);
    } catch {
      // Exit non-zero → not an ancestor. Leave out of ancestral set.
      // Surfaces as `missing from [main-ancestry]` in divergence output.
    }
  }
  return ancestral;
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

type Channel = "local" | "remote" | "npm" | "releases" | "main-ancestry";
const ALL_CHANNELS: Channel[] = [
  "local",
  "remote",
  "npm",
  "releases",
  "main-ancestry",
];

interface ChannelPresence {
  version: string;
  local: boolean;
  remote: boolean;
  npm: boolean;
  releases: boolean;
  "main-ancestry": boolean;
}

interface Divergence {
  version: string;
  missing_from: Channel[];
  present_in: Channel[];
  is_known_orphan: boolean;
  known_orphan_reason: string | null;
}

/**
 * The first version that ships under the Layer A + Layer B trunk-discipline
 * mechanical floor. Pre-this versions (v0.8.x through v0.23.0) shipped without
 * Layer A's ancestry guard; their tags may have been on non-main branches.
 * The audit's fifth channel surfaces such absences but annotates them as
 * pre-trunk-discipline-era artifacts when the only missing channel is
 * `main-ancestry` AND the version is < TRUNK_DISCIPLINE_FROM. Active
 * post-v0.24.0 violations surface as unknown divergences.
 */
const TRUNK_DISCIPLINE_FROM = "0.24.0";

/**
 * Build the channel-presence table for the union of all versions across all
 * five channels.
 *
 * Main-ancestry semantics: only set true for versions present in npm AND
 * confirmed ancestor of origin/main. For non-npm versions, main-ancestry is
 * trivially true (the channel only meaningfully applies to published tags).
 * This keeps the divergence logic from spuriously flagging
 * "absent-from-npm-and-from-main-ancestry" pairings.
 */
function buildPresenceTable(
  local: string[],
  remote: string[],
  npm: string[],
  releases: string[],
  mainAncestry: string[],
): ChannelPresence[] {
  const allVersions = new Set<string>([
    ...local,
    ...remote,
    ...npm,
    ...releases,
    ...mainAncestry,
  ]);
  const sorted = Array.from(allVersions).sort(compareSemVer);
  const localSet = new Set(local);
  const remoteSet = new Set(remote);
  const npmSet = new Set(npm);
  const releasesSet = new Set(releases);
  const ancestrySet = new Set(mainAncestry);
  return sorted.map((version) => ({
    version,
    local: localSet.has(version),
    remote: remoteSet.has(version),
    npm: npmSet.has(version),
    releases: releasesSet.has(version),
    // Main-ancestry only applies to npm-published versions. For non-npm
    // versions (orphan tags, archaeology), treat as trivially "ok" to avoid
    // double-counting them as missing-from-main-ancestry when they're
    // already flagged as missing-from-npm. The channel semantically asks:
    // "for every npm-published version, is its tag on main?" — versions
    // outside npm are out of scope of that question.
    "main-ancestry": ancestrySet.has(version) || !npmSet.has(version),
  }));
}

/**
 * Identify divergent versions (present in 1+ channels, missing from 1+ others).
 * Annotate each with known-orphan status if matching `KNOWN_ORPHANS`, OR with
 * the dynamic pre-trunk-discipline-era annotation if the only missing channel
 * is `main-ancestry` AND the version is < TRUNK_DISCIPLINE_FROM.
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
    let is_known_orphan = false;
    let known_orphan_reason: string | null = null;

    if (orphan !== undefined) {
      // Static annotation. The actual missing channels must match (or be a
      // subset of) the documented missing channels for the orphan annotation
      // to apply. If a known-orphan version unexpectedly becomes missing
      // from a NEW channel, that's a real divergence — surface as unknown.
      is_known_orphan = missing_from.every((c) =>
        orphan.missing_from.includes(c),
      );
      if (is_known_orphan) {
        known_orphan_reason = orphan.reason;
      }
    }

    if (!is_known_orphan) {
      // Dynamic annotation for pre-trunk-discipline-era versions: if the only
      // missing channel is `main-ancestry` AND the version is < TRUNK_DISCIPLINE_FROM,
      // annotate as a pre-trunk-discipline-era artifact rather than failing
      // the audit. These versions shipped before Layer A; their tag/main
      // ancestry is historical state, not an active divergence requiring action.
      const onlyMissingMainAncestry =
        missing_from.length === 1 && missing_from[0] === "main-ancestry";
      const isPreTrunkDiscipline =
        compareSemVer(entry.version, TRUNK_DISCIPLINE_FROM) < 0;
      if (onlyMissingMainAncestry && isPreTrunkDiscipline) {
        is_known_orphan = true;
        known_orphan_reason = `Pre-trunk-discipline-era artifact (v${entry.version} shipped before Layer A ancestry guard landed in v${TRUNK_DISCIPLINE_FROM}). Tag is on origin + npm + releases but not an ancestor of current origin/main — historical state, not an active divergence. Layer A enforces ancestry on all releases from v${TRUNK_DISCIPLINE_FROM} forward.`;
      }
    }

    divergences.push({
      version: entry.version,
      missing_from,
      present_in,
      is_known_orphan,
      known_orphan_reason,
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
  mainAncestry: string[],
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
  const sortedAncestry = [...mainAncestry].sort(compareSemVer);

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
  console.log(
    `Main-ancestry: ${compactList(
      sortedAncestry,
    )}  (count: ${sortedAncestry.length} of ${sortedNpm.length} npm versions)`,
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

  // Main-ancestry-specific hints come first because they're the v0.24.0
  // addition and the v0.23.0 incident-class detector.
  if (
    m.has("main-ancestry") &&
    p.has("npm") &&
    p.has("local") &&
    p.has("remote") &&
    p.has("releases")
  ) {
    return `Tag is on origin + npm + GH Release but NOT an ancestor of origin/main (the v0.23.0 trunk-drift class). Either main was force-pushed after publish and rewrote history, OR the tag was created on a parallel branch and main was never back-merged. Remediate: investigate force-push history with \`git reflog show origin/main\`; if a legitimate merge is missing, back-merge the source branch into main. If the tag was on a duplicate-fork sibling commit, see commands/release.md Layer A error message for the tag-move recovery path.`;
  }
  if (m.has("main-ancestry") && !p.has("npm")) {
    return `Main-ancestry channel reports missing for v${div.version}, but the version is not in npm — the fifth channel only meaningfully applies to npm-published versions and should not have fired here. This is likely an audit-script bug; investigate.`;
  }

  if (m.has("remote") && p.has("local")) {
    return `Tag exists locally but not on origin (the v0.15.0 class). Remediate: git push origin v${div.version}`;
  }
  if (m.has("npm") && p.has("remote") && p.has("releases")) {
    return `Tag on origin + GH Release present but missing from npm. This is EITHER (a) a mid-flight publish failure (publish.yml ran but npm publish errored) OR (b) a DELIBERATE hold — an operator distribution decision to tag + release without publishing to npm. CHECK the version's CHANGELOG entry before treating as an incident: a held version states "held/unpublished" / "operator distribution decision" and its capability is carried forward into a later published version (npm-absence is then permanent-by-design — add a KNOWN_ORPHANS entry with missing_from: ["npm"], do NOT republish). A genuine mid-flight failure is a release-incident; remediate by cutting the next version with the content per npm immutability rules (do NOT republish the same version).`;
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
  mainAncestry: string[],
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
      main_ancestry: [...mainAncestry].sort(compareSemVer),
    },
    counts: {
      local: local.length,
      remote: remote.length,
      npm: npm.length,
      releases: releases.length,
      main_ancestry: mainAncestry.length,
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
  let mainAncestry: string[];

  try {
    local = readLocalTags(args.repoPath);
    remote = readRemoteTags(args.repoPath);
    npm = readNpmVersions();
    releases = readGhReleases();
    // Fifth channel — must read after npm because it iterates npm versions.
    mainAncestry = readMainAncestry(args.repoPath, npm);
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

  const presence = buildPresenceTable(local, remote, npm, releases, mainAncestry);
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
      mainAncestry,
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
      mainAncestry,
      divergences,
      unknownCount,
      knownCount,
    );
  }

  process.exit(unknownCount === 0 ? 0 : 1);
}

main();
