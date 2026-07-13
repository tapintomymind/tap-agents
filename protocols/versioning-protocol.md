# Versioning Protocol

**Owner:** Org Designer (codification + maintenance). Critic enforces at artifact level on every release review.
**Status:** Active 2026-05-11. Amended 2026-05-12: Gate 5 (post-publish artifact verification) + §4.6 cross-channel parity audit codified — response to v0.15.0 orphan-tag incident. Defense-in-depth layer (`verify-publish.yml` CI workflow + `scripts/version-parity-audit.ts` EA daily-sweep) shipped 2026-05-13 as v0.19.0; deferral markers removed from §4.5 and §4.6.
**Authority:** User direction 2026-05-11 — distribution wedge requires strictly-enforced SemVer for npm + Claude Code marketplace dual-channel publish. Replaces ad-hoc `prompt_version: YYYY-MM-DD-N` agent-level versioning at the framework-release scope (prompt-version per agent stays unchanged — see §8).
**Related:**
- `protocols/framework-change-discipline.md` (Tier 1 doctrinal change rules — what *qualifies* as a versionable change)
- `protocols/changelog-protocol.md` (CHANGELOG.md format, scope split)
- `protocols/framework-contract-discipline.md` (contracts that must be honored across versions)

---

## §1 Why this exists

The framework now egresses through two distribution channels: the Claude Code plugin marketplace (raw `.md` files from the GitHub repo) and the npm registry (`@tapintomymind/tap-agents` as a dependency of `<project>`, formerly `<project>` pre-2026-05-14 BL-059, and any future consumer). Both channels read from a single canonical repo. Both consumers — humans installing via `/plugin marketplace`, and the <project> Vercel build pulling from npm — rely on **SemVer being honest** to decide whether to adopt an update.

If a "patch" silently renames an agent or removes a command, downstream consumers break. If a "major" only ships a typo fix, downstream Dependabot auto-merges get paused needlessly. Neither failure is recoverable by readers — the version number is the contract.

This protocol fixes the version number as a binding, mechanically-and-reviewer-enforced statement about the shape of the change.

## §2 Scope

This protocol governs the version field in `package.json` and the corresponding `CHANGELOG.md` heading at the framework root (`.claude/package.json`, `.claude/CHANGELOG.md`).

It governs:
- All Tier 1 doctrinal changes (per `framework-change-discipline.md` §2)
- All structural changes to the npm-package export surface (anything in `scripts/build.ts` output)
- All marketplace-manifest changes (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`)

It does NOT govern:
- `prompt_version: YYYY-MM-DD-N` fields inside individual agent prompts (per-agent prompt versioning is unchanged — see §8 for the relationship)
- Project-scoped `.claude/` artifacts (those carry their own project version, not the framework version)
- `memory/agent-changelog.md` narrative entries (those follow `changelog-protocol.md`)
- Workspace-only artifacts under `workspace/`

## §3 Severity classification

Every change is one of three severities. The version bump follows directly.

### §3.1 PATCH (`0.0.X`) — no consumer-visible change

A patch bump is reserved for changes that **cannot break any downstream consumer**. Examples:

- Wording tweaks inside an existing agent prompt that don't change `fires_when`, authority, or output contract
- Typo fixes in agents, commands, protocols, templates
- README/docs edits
- Internal comments
- Internal hook script changes that don't change the gate's pass/fail semantics
- `scripts/build.ts` refactors that produce byte-identical output

A change is PATCH **only if** the diff would be safe to auto-merge by Dependabot in a downstream Vercel build with no human review.

### §3.2 MINOR (`0.X.0`) — additive, backwards-compatible

A minor bump signals **new capability without removing any existing capability**. Examples:

- New agent file added to `agents/`
- New command added to `commands/`
- New protocol added to `protocols/`
- New template added to `templates/`
- New optional field added to `settings.json` schema (with safe default)
- New optional export added to the npm package's programmatic API
- New `fires_when` trigger added to an agent (existing triggers unchanged)
- New hook added to `hooks/` and wired into `settings.json` (existing hooks unchanged)

A change is MINOR **only if** every existing consumer — at-the-time-of-the-prior-version — continues to function unchanged.

### §3.3 MAJOR (`X.0.0`) — breaking

A major bump signals **any change that could break a downstream consumer at the prior version**. Examples:

- Agent file removed from `agents/`
- Command removed from `commands/`
- Protocol removed or renamed
- Required field added to `settings.json` schema
- Existing field removed from `settings.json` schema
- Existing `fires_when` trigger removed or narrowed
- Existing agent authority or output contract changed in a way prior callers relied on
- Existing npm-package export removed or renamed
- Existing programmatic export changed shape (e.g., array→object, optional→required)
- Marketplace plugin name or ID changed

When in doubt, choose MAJOR. The cost of an unnecessary major bump (Dependabot won't auto-merge — a human reads the release notes) is much smaller than the cost of an unflagged break (downstream consumer's Vercel build silently breaks).

## §4 The five-gate enforcement chain

Honesty of the version field is enforced at five gates. Each layer catches what earlier layers missed. Gates 1-4 verify the release is correctly **authored**. Gate 5 verifies the release was correctly **published** — closing the loop between local intent and registry reality.

### §4.1 Gate 1 — AI-led release flow (`/release` command)

The orchestrator never edits `package.json` `"version"` directly. The only legitimate path is invoking `/release`, which routes to `commands/release.md`. That command:

1. Reads `git diff` against the last published tag
2. Classifies the diff against §3
3. Proposes the new version + drafts the `CHANGELOG.md` entry per `changelog-protocol.md`
4. Writes the version bump + CHANGELOG entry atomically in a single commit
5. Tags the commit `v<version>`

Direct edits to `package.json` `"version"` outside this flow are blocked at Gate 2.

### §4.2 Gate 2 — Mechanical hook (`hooks/version-gate.py`)

A PreToolUse hook fires on `Edit`/`Write` operations targeting `package.json` and on `Bash(git commit:*)` and `Bash(git tag:*)`. It enforces four invariants:

1. **Atomicity** — a `package.json` `"version"` change in the staged diff must coincide with a `CHANGELOG.md` change in the same commit that introduces a heading matching the new version.
2. **Sequence** — the new version must be a legal SemVer successor to the version at the last tag (no skipping major, no going backwards).
3. **Severity-floor heuristic** — if the staged diff includes a removed/renamed file in `agents/`, `commands/`, `protocols/`, or `templates/`, the bump must be MAJOR. If it includes only new files in those directories with no removals or renames, MINOR is the floor. The hook does not enforce the ceiling (a release author can always choose to over-classify); it enforces the floor.
4. **Branch-discipline (added v0.24.0; tightened v0.24.1)** — fires inside the `_check_tag()` path on `Bash(git tag:*)`. The tag must be applied on `main`, OR the HEAD commit message must contain the trunk-discipline override token (with a non-empty, non-placeholder reason) in its **trailer block** — the lines after the last blank line in the commit message, mirroring git's `Co-authored-by:` convention. Prose mentions of the token form in the body do NOT match (they get treated as documentation). Mirrors `tap-agents/.github/workflows/publish.yml` Layer A as the operator-side ceiling under the CI mechanical floor. Trailer-only placement codified in v0.24.1 per `workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md` after the v0.24.0 self-bypass dogfood incident (Layer A's body-search regex matched the placeholder text in its own CHANGELOG documentation commit). See `workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md` for the original spec and `workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md` for the always-compute-ancestry + trailer-only restructure.

Hook failure exits 2 with an actionable message. The release author can either fix the diff or invoke `/release` from scratch.

### §4.3 Gate 3 — CI workflow (`.github/workflows/version-check.yml`)

A required check on every PR to `main`:

1. Diffs `package.json` against `main`'s last tag
2. Re-runs the §3 severity classifier against the PR diff
3. Verifies the proposed version bump matches or exceeds the classifier's floor
4. Verifies `CHANGELOG.md` has a matching heading
5. Verifies the new version is a legal SemVer successor

A PR that fails this check cannot merge. The check is the last line of defense before the version becomes a contract.

### §4.4 Gate 4 — Critic review at release

When the orchestrator dispatches Critic on any artifact during a release, Critic's read-list now includes this protocol. Critic checks:

1. The `CHANGELOG.md` entry's severity claim (e.g., "Added", "Changed", "Removed") matches the `package.json` bump
2. The narrative matches the diff — no hidden removals camouflaged as additions
3. Cross-references to `memory/agent-changelog.md` are present per `changelog-protocol.md` §3

A BLOCKING Critic verdict at this gate stops the release.

### §4.5 Gate 5 — Post-publish artifact verification

Gates 1-4 verify the release is correctly **authored** (local commit, CHANGELOG, tag, classifier-aligned). None of them verify the artifact actually reached the npm registry or that the registry's tarball is complete. Gate 5 closes that loop.

**Why this gate exists.** Two failure modes accumulated in 30 days established the need:

- **v0.15.0 orphan (2026-05-12).** A `release: v0.15.0` commit + `v0.15.0` tag exist in the local `tap-agents/` checkout. `git ls-remote --tags origin` showed the tag was never pushed. `publish.yml` never fired. `npm view @tapintomymind/tap-agents versions` jumped `v0.14.0 → v0.16.0`. The operator step `git push origin v<new>` was issued but its completion was unverified; nothing downstream caught the gap. The release was correctly **authored** but never **published**.
- **v0.11.0–v0.12.1 files-array regression.** `package.json#files` silently lost 4 directories (`playbooks/`, `memory/`, `docs/`, `settings.json`) at v0.11.0. The tag pushed, `publish.yml` ran, `npm publish` succeeded — but the tarball that landed on the registry was missing the dropped paths. Downstream `<project>` prebuild broke. Different failure class, same gap shape: no verification that the **published artifact** matches the release author's intent.

Gate 5 verifies three invariants on every release after `publish.yml` reports success:

1. **Registry presence.** `npm view @tapintomymind/tap-agents@<v> version` returns `<v>` (not a 404, not an older version). Catches: tag-not-pushed (v0.15.0 case), `publish.yml` silent failure, registry-side rejection that the workflow misread as success.
2. **Tarball completeness.** Re-fetch the just-published tarball via `npm view <pkg>@<v> dist.tarball` + curl + `tar -tzf`, then verify each entry in `package.json#files` appears in the tarball under the `package/` prefix. Catches: files-array regression (v0.11.0 case), accidental `.npmignore` clobber, build-step output truncation.
3. **GitHub Release parity.** `gh release view v<v>` returns a non-error result, the release body contains the CHANGELOG entry's title line (or a substring match against the entry's first heading), and `v<v>` appears in `gh release list --limit 50`. Catches: GitHub Release creation step failure (the workflow uses `softprops/action-gh-release@v2`; if the action errors after `npm publish` succeeds, npm has the package but no Release exists).

**What each checkpoint catches.**

- **Operator-side polling (Step 6a-6f in `/release`)** catches:
  - Tag-never-pushed-to-origin (v0.15.0 class) — Step 6a.
  - Workflow-failed-after-tag-push (v0.8.3 class) — Step 6b via `gh run watch --exit-status`.
  - Npm-publish-succeeded-but-tarball-incomplete (v0.11.0 class) — Step 6d via `dist.tarball` cold-pull + `tar -tzf` vs `package.json#files`.
  - GitHub-Release-missing-after-successful-publish — Step 6e.

- **Independent `verify-publish.yml` workflow (live as of v0.19.0)** catches:
  - **Publish-workflow-self-attestation bias.** A workflow that publishes shouldn't also be the sole verifier that its publish worked — that's structurally a self-attestation. An independent workflow running on a different runner network re-establishes the verification chain.
  - **CDN-propagation race against operator-side timing.** Operator-side polling depends on the operator's network; the CI runner pulls from a different network with different CDN-edge cache state. If operator-side caught a stale cache, the CI runner provides a second sampling.
  - **Claim-vs-reality drift between publish.yml's exit code and actual npm state.** `publish.yml` exits 0 when its actions succeeded according to their own attestation. The cold pull from a separate workflow's runner network re-verifies what's actually visible on the public registry.

  **Trigger semantics:** fires on `workflow_run` event for `publish` workflow completed-success. Pre-release tags (any hyphen-containing version, e.g., `v1.0.0-rc.1`) are skipped via a POSIX `case "$VERSION" in *-*) skip ;; esac` filter — mirrors the `notify-adopters.yml` pre-release filter. Lag from publish-success to verify-publish run is typically ~30-120s (workflow_run dispatch lag); end-to-end verification target is completion within 5 minutes of publish-success. Retry budgets are sized smaller than operator-side (e.g., invariant 1 uses 4 × 30s = 2-min budget vs operator's 8 × 30s = 4-min) because most of the CDN-propagation race is consumed by the workflow_run dispatch lag itself.

  **Failure handling:** auto-files a GitHub issue titled `Gate 5 §4.5 verification failed for v<version>` with `gate-5-failure` label. Idempotent — appends a comment if an issue for the same tag already exists rather than opening a duplicate. Exits non-zero so the run is red in the Actions tab. Does NOT close auto-filed issues on subsequent passing runs; operator resolves and closes manually after deciding on remediation (next-version bump vs. accepted-orphan annotation).

  **File location:** `tap-agents/.github/workflows/verify-publish.yml` only. Publish-pipeline asymmetry — same precedent as `publish.yml` and `notify-adopters.yml`. Not mirrored to `.claude/` because the workflow only ever runs in the public repo's Actions runners; the `.claude/` framework HQ does not have a runner.

- **§4.6 cross-channel parity audit (live as of v0.19.0 — see §4.6).** Periodic safety net. Catches any divergence between local tags / remote tags / npm / GitHub Releases that operator-side polling and CI-side `verify-publish.yml` missed (e.g., a release authored months ago that silently rolled back, or a non-canonical-checkout publish). The operator-side check is release-time only; the CI-side check is publish-event only; the parity audit is portfolio-wide and time-independent.

**Implementation scope (post-v0.19.0):** all three checkpoints live. Operator-side polling (`commands/release.md` Step 6a-6f, shipped v0.18.0) is the primary line at release time. CI-side `verify-publish.yml` (shipped v0.19.0) provides independent cold-pull verification with publish-workflow-asymmetric placement. EA daily sweep via `scripts/version-parity-audit.ts` (shipped v0.19.0) provides the long-tail catch-net for divergences that escape both per-release gates.

**Failure handling.**

- Gate 5 failure is a **release-incident**, not a soft warning. The release is not considered "complete" until Gate 5 passes.
- If Gate 5 surfaces a tag-not-pushed condition, the remediation is `git push origin v<new>` (the operator did Step 6 incompletely). The recovery is the same action that should have happened the first time; re-running it is safe and idempotent.
- If Gate 5 surfaces an npm-tarball-incomplete condition, the remediation is **not** to re-publish to the same version (npm packages are immutable per `commands/release.md` "Failure modes"). The remediation is to cut the next version (PATCH or MINOR per §3) with the fix and document the broken version in CHANGELOG.
- If Gate 5 surfaces a GitHub-Release-missing condition, the remediation is to invoke `gh release create v<v>` manually using the CHANGELOG entry as the body. Document in `memory/agent-changelog.md` per `protocols/changelog-protocol.md §1`.

**Surface to user.** Gate 5 failures surface immediately to the user through EA per Gate 5's incident-class severity. Do not silently retry; do not auto-remediate without user direction.

### §4.6 Cross-channel parity audit (EA daily sweep)

Gates 1-5 catch failures at release time. Some failure classes accumulate silently between releases — an orphaned tag that was never pushed, a CHANGELOG entry that never landed in `memory/agent-changelog.md`, a npm version that diverges from the GitHub Releases list. The EA daily briefing includes a **cross-channel version parity audit** as the catch-net for everything the per-release gates missed.

The audit is implemented as `.claude/scripts/version-parity-audit.ts` (tsx-based, mirrors `scripts/test-changelog-format.ts` style — no vitest devDep). It compares five channels:

1. **Local tags** — `git -C <repo> tag -l 'v*'` (default `<repo>` is `../tap-agents/` resolved relative to the script's own location via `import.meta.url`; cwd-independent).
2. **Remote tags** — `git -C <repo> ls-remote --tags origin 'v*'` (origin is the public `tap-agents` GitHub repo; filters out the `^{}` dereferenced peel-pointers).
3. **npm versions** — `npm view @tapintomymind/tap-agents versions --json`.
4. **GitHub Releases** — `gh release list --repo tapintomymind/tap-agents --limit 50 --json tagName` (the same Releases that `publish.yml` creates via `softprops/action-gh-release@v2`).
5. **Main ancestry** (added v0.24.0) — for every version `v` in the npm channel, `git -C <repo> merge-base --is-ancestor v<v> origin/main` is run. Versions whose tag is NOT an ancestor of `origin/main` surface as `missing from [main-ancestry]`. This is the portfolio-wide periodic catch for post-publish trunk-drift (force-push class) — Layer A in `publish.yml` enforces the floor at publish-time; this channel catches divergence that materializes afterward. See `workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md §3.5` for the spec. Pre-v0.24.0 versions that surface only on this channel are annotated as pre-trunk-discipline-era artifacts (not active divergences).

Expected invariant: **for every version v that appears in any one channel, v appears in all five channels** (with the pre-trunk-discipline-era annotation for the main-ancestry channel as documented above).

**Known-orphan handling.** Some versions are documented as permanently missing from one-or-more channels with explicit reasoning. The audit carries a `KNOWN_ORPHANS` map that annotates these as `[ANNOT]` (with the documented reason) rather than `[WARN]`. The annotation is **subset-bounded** — if a known-orphan version unexpectedly becomes missing from a NEW channel beyond what's documented, that new channel-loss surfaces as an unknown divergence and the audit fails. This prevents the annotation from masking new divergences for already-known orphans.

Currently-annotated orphans:
- `v0.15.0` — missing from `[remote, npm, releases]`. Originally local-only in `tap-agents/` (tag pushed retroactively for archaeology). Permanent absence per v0.17.0 + v0.18.0 CHANGELOG entries.
- `v0.8.3` — missing from `[npm, releases]`. Tag pushed cleanly; `publish.yml` ran but failed at the npm publish step pre-Trusted-Publishing-OIDC migration (OIDC fix shipped v0.9.0).

**Deliberate-hold posture.** A deliberately-held version — tagged, GitHub-Released, and withheld from npm by an operator *distribution decision* — is a **first-class, expected** posture, NOT a publish failure and NOT a Gate-5 incident. Its only missing channel is `npm`; it is present in `[local, remote, releases, main-ancestry]`. Such a version MUST be annotated in `KNOWN_ORPHANS` **at hold-time** by the **release-coordinator** (as a release-completion step in the release flow — see `commands/release.md` "Hold path" and `agents/release-coordinator.md`, which owns the hold-time annotation per its 2026-07-01 activation; each append remains user-approved per entry, and Org Designer retains the map-governance policy), NOT retroactively at next-audit-time; annotation that lags the hold leaves the audit red for a non-reason during the gap. **Acceptance criterion:** a held version is correctly annotated iff (1) its only missing channel is `npm`; (2) the `reason` names the later PUBLISHED version that carries the capability forward (the carry-forward check is load-bearing — if the held slice is not carried forward into any published version, do NOT annotate; that is a real distribution gap requiring an explicit user decision, not a silence); (3) a code comment cites the CHANGELOG provenance. A held release is not "complete" until this holds. This is distinct from a publish **failure** (the `v0.8.3` class), which stays a release-incident with forward-version remediation and must never be annotated-away. The audit's fail-on-new subset-guard is unchanged — a held entry annotated `missing_from: ["npm"]` that later loses any channel BEYOND npm still surfaces as an unknown divergence.

**Divergence-shape remediation table.** When an unknown divergence is detected, the audit prints an actionable remediation hint based on the missing-channel pattern:

| Present in | Missing from | Class | Remediation |
|---|---|---|---|
| local | remote, npm, releases | Tag-never-pushed (v0.15.0 class) | `git push origin v<v>` |
| remote, releases | npm | Publish-failed-mid-flight | Release-incident; cut next version with fix per npm immutability rules |
| npm | releases | softprops-action-gh-release errored | `awk` CHANGELOG entry → `gh release create v<v> --notes-file <entry>` |
| npm, releases | local | Non-canonical-checkout publish | Investigate; should not happen in normal flow |

**Output.** Human-readable to stdout by default (the form EA folds into TEAM HEALTH); `--json` flag for machine-readable form (EA-parser-friendly, future <project> ingestion).

**Exit codes.**
- `0` — parity confirmed (zero unknown divergences; known-orphans annotated)
- `1` — unknown divergence detected (audit failure; surface immediately)
- `2` — environment error (couldn't read one of the channels — e.g., gh CLI not authenticated, network failure)

**EA invocation.** EA runs `npm run audit:version-parity` from `.claude/` root daily as part of the briefing-prep pass. Exit code routes the surface treatment:
- Exit 0 + zero known-orphan annotations → silent (parity confirmed; no TEAM HEALTH surface).
- Exit 0 + N>0 known-orphan annotations → FYI-tier line in TEAM HEALTH (N annotations; no action required).
- Exit 1 → **P1 surface — bubble immediately** rather than batching in FYI. The audit's human-readable output is included verbatim in TEAM HEALTH alongside the remediation hint.
- Exit 2 → flagged as an environment error; EA prompts user to verify gh authentication or network access; does NOT surface as a parity-failure (parity is unknown, not divergent).

Silence in TEAM HEALTH = parity confirmed.

## §5 The release commit

A release is **one commit** that contains exactly:

1. The version bump in `package.json`
2. The matching `CHANGELOG.md` entry (newest at top, per Common Changelog format)
3. The matching `memory/agent-changelog.md` narrative entry (newest at top, per `changelog-protocol.md`)
4. Any source changes that justify the bump (agents, commands, protocols, templates, hooks, scripts, configs)
5. The git tag `v<version>` applied to this commit **on the `main` branch** (per the v0.24.0 trunk-discipline amendment — see below)

**Tag-on-main requirement (codified v0.24.0).** As of v0.24.0, the release commit lands on a dedicated `release/v<version>` branch, then is merged to `main` via a squashed PR; the tag is applied to the resulting `main` HEAD. This guarantees the tagged commit is an ancestor of `origin/main` at publish time, satisfying the `publish.yml` Layer A ancestry check by construction. The full Layer B flow is documented in `commands/release.md` Steps 5.5 / 6 / 7 / 8 / 9; `hooks/version-gate.py` invariant 4 is the operator-side ceiling that mirrors Layer A locally. Override token `[trunk-discipline-override: <non-empty reason>]` in the release commit message preserves the prior workflow for genuine hotfix scenarios. See `workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md` for the architect spec and v0.15.0 / v0.23.0 incident provenance.

The commit message follows Conventional Commits:

```
release: v0.8.0 — <one-line summary>

<paragraph summary, same as the CHANGELOG entry's title>
```

The tag triggers the `publish.yml` workflow which builds + `npm publish`es to the registry. Gate 5 (§4.5) then verifies the published artifact reached the registry intact and that all four+1 distribution channels (local tags + remote tags + npm + GitHub Releases + main-ancestry) agree on the version. The release is not considered complete until Gate 5 passes.

## §6 Marketplace and npm channel synchronization

The two distribution channels MUST stay locked to the same version:

- The `package.json` `"version"` field is canonical
- `.claude-plugin/plugin.json` `"version"` field MUST match
- `.claude-plugin/marketplace.json` `plugins[*].version` (nested — there is no
  top-level field) MUST match for every plugin entry under this framework's
  contract
- Any version mismatch across these three is a hard failure

**How alignment is produced and enforced.** The `/release` command aligns all
three in one mechanical step: `scripts/bump-manifest-versions.ts` reads the
canonical `package.json#version` and surgically rewrites both manifests' version
fields (single-line diff per file, idempotent). It reads the LOCAL package.json
(the release tree's own), never a source copy, so it cannot re-introduce a
stale-source downgrade. This replaces the prior per-release hand-edit of both
manifest version fields — error-prone because the manifests are not driven by the
whole-tree sync (they are mirror-only files) and the marketplace.json version is
nested rather than top-level.

**Gate 2 hook coverage is all three files.** `hooks/version-gate.py`'s commit
check hard-blocks (exit 2) on a `package.json`↔`.claude-plugin/plugin.json`
version mismatch AND on a `package.json`↔`.claude-plugin/marketplace.json`
`plugins[*].version` mismatch. Both checks run before the release commit is
allowed; either drift stops the commit with an actionable message naming the
bump script. (Earlier revisions of this section described the hook as covering
all three while the hook in fact checked only `plugin.json`; the
`marketplace.json` check has since been added so the prose and the code agree.)

## §7 Pre-1.0 vs post-1.0

The framework is currently in the `0.X.Y` range. Per SemVer convention, the `0.X` major-zero range permits breaking changes inside MINOR bumps — i.e., `0.7.0 → 0.8.0` MAY include breaking changes that would warrant a major bump at `1.0+`.

**This protocol explicitly overrides that loophole.** The §3 classifier applies as-written regardless of the major-zero phase. Reasoning: downstream consumers (`<project>` Vercel build, future npm consumers) cannot distinguish "we're still in 0.X, things can change freely" from "this minor is a normal additive bump." Honesty wins over convention.

When the framework cuts `v1.0.0`, this protocol stays unchanged. The `v1.0.0` cut itself is a MAJOR bump under §3 (the marketplace plugin name and the npm package name become stable contracts).

## §8 Relationship to agent prompt versions

Individual agent prompts continue to carry `prompt_version: YYYY-MM-DD-N` fields per `framework-change-discipline.md` §9. That is **per-agent fine-grained versioning** — it tracks the specific prompt edit cadence and is read by EA's framework-health briefing.

Framework-release SemVer is **coarser** — it tracks the bundle that downstream consumers depend on. The two layers coexist:

- A prompt-only PATCH-grade change (typo in `critic.md`) → bump `critic.md`'s `prompt_version`, bump framework PATCH.
- A new `fires_when` trigger added to `critic.md` → bump `critic.md`'s `prompt_version`, bump framework MINOR.
- `critic.md` removed entirely → no `prompt_version` to bump (file is gone), bump framework MAJOR.

The two version layers never disagree because they're answering different questions. Downstream cares about framework SemVer. Internal agent-discipline cares about `prompt_version`. The release commit per §5 updates both atomically when both apply.

## §9 Provenance

This protocol responds to the 2026-05-11 distribution-strategy decision: the framework's `tap-agents` repo becomes the canonical source for both Claude Code marketplace consumers and the `<project>` Vercel build (formerly `<project>` pre-2026-05-14 BL-059) (replacing the `scaffold-source/` mirror, which `framework-change-discipline.md` §2 explicitly declares out-of-scope of doctrinal review). With two consumer channels in play, the version field crosses a threshold from internal-discipline to external-contract, and this protocol codifies the discipline.
