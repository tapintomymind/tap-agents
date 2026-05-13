# Versioning Protocol

**Owner:** Org Designer (codification + maintenance). Critic enforces at artifact level on every release review.
**Status:** Active 2026-05-11. Amended 2026-05-12: Gate 5 (post-publish artifact verification) + §4.6 cross-channel parity audit added — response to v0.15.0 orphan-tag incident.
**Authority:** User direction 2026-05-11 — distribution wedge requires strictly-enforced SemVer for npm + Claude Code marketplace dual-channel publish. Replaces ad-hoc `prompt_version: YYYY-MM-DD-N` agent-level versioning at the framework-release scope (prompt-version per agent stays unchanged — see §8).
**Related:**
- `protocols/framework-change-discipline.md` (Tier 1 doctrinal change rules — what *qualifies* as a versionable change)
- `protocols/changelog-protocol.md` (CHANGELOG.md format, scope split)
- `protocols/framework-contract-discipline.md` (contracts that must be honored across versions)

---

## §1 Why this exists

The framework now egresses through two distribution channels: the Claude Code plugin marketplace (raw `.md` files from the GitHub repo) and the npm registry (`@tapintomymind/tap-agents` as a dependency of `agent-dashboard` and any future consumer). Both channels read from a single canonical repo. Both consumers — humans installing via `/plugin marketplace`, and the agent-dashboard Vercel build pulling from npm — rely on **SemVer being honest** to decide whether to adopt an update.

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

A PreToolUse hook fires on `Edit`/`Write` operations targeting `package.json` and on `Bash(git commit:*)` and `Bash(git tag:*)`. It enforces three invariants:

1. **Atomicity** — a `package.json` `"version"` change in the staged diff must coincide with a `CHANGELOG.md` change in the same commit that introduces a heading matching the new version.
2. **Sequence** — the new version must be a legal SemVer successor to the version at the last tag (no skipping major, no going backwards).
3. **Severity-floor heuristic** — if the staged diff includes a removed/renamed file in `agents/`, `commands/`, `protocols/`, or `templates/`, the bump must be MAJOR. If it includes only new files in those directories with no removals or renames, MINOR is the floor. The hook does not enforce the ceiling (a release author can always choose to over-classify); it enforces the floor.

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
- **v0.11.0–v0.12.1 files-array regression.** `package.json#files` silently lost 4 directories (`playbooks/`, `memory/`, `docs/`, `settings.json`) at v0.11.0. The tag pushed, `publish.yml` ran, `npm publish` succeeded — but the tarball that landed on the registry was missing the dropped paths. Downstream `agent-dashboard` prebuild broke. Different failure class, same gap shape: no verification that the **published artifact** matches the release author's intent.

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

- **Independent `verify-publish.yml` workflow (DEFERRED to v0.19.0).** Would catch the "publishing-workflow-self-attesting" bias — i.e., the same workflow that publishes should not also self-attest registry presence. An in-`publish.yml` post-check is the same workflow that just published verifying its own output, which is structurally weaker than a separate cold-pull. This is defense-in-depth on top of the operator-side check; the operator-side check already empirically covers the v0.15.0 and v0.11.0 failure classes per the 2026-05-13 manual dogfood of `tap-agents/v0.17.0`. v0.19.0 territory.

- **§4.6 cross-channel parity audit (DEFERRED to v0.19.0 — see §4.6 PARTIAL marker).** Periodic safety net. Catches any divergence between local tags / remote tags / npm / GitHub Releases that operator-side polling missed (e.g., a release authored months ago that silently rolled back, or a non-canonical-checkout publish). The operator-side check is release-time only; the parity audit is portfolio-wide and time-independent.

**v0.18.0 implementation scope:** operator-side polling (per `commands/release.md` Step 6a-6f) covers all three invariants for go-forward releases. Defense-in-depth via an independent `verify-publish.yml` CI workflow is **DEFERRED to v0.19.0** — operator-side already empirically covers the v0.15.0 (tag-never-pushed) and v0.11.0 (tarball-incomplete) failure classes per the 2026-05-13 manual dogfood that shipped `tap-agents/v0.17.0` to npm. The deferred workflow adds independent self-attestation (mitigates "publishing-workflow-self-attesting" bias) but is not load-bearing for v0.18.0.

**Failure handling.**

- Gate 5 failure is a **release-incident**, not a soft warning. The release is not considered "complete" until Gate 5 passes.
- If Gate 5 surfaces a tag-not-pushed condition, the remediation is `git push origin v<new>` (the operator did Step 6 incompletely). The recovery is the same action that should have happened the first time; re-running it is safe and idempotent.
- If Gate 5 surfaces an npm-tarball-incomplete condition, the remediation is **not** to re-publish to the same version (npm packages are immutable per `commands/release.md` "Failure modes"). The remediation is to cut the next version (PATCH or MINOR per §3) with the fix and document the broken version in CHANGELOG.
- If Gate 5 surfaces a GitHub-Release-missing condition, the remediation is to invoke `gh release create v<v>` manually using the CHANGELOG entry as the body. Document in `memory/agent-changelog.md` per `protocols/changelog-protocol.md §1`.

**Surface to user.** Gate 5 failures surface immediately to the user through EA per Gate 5's incident-class severity. Do not silently retry; do not auto-remediate without user direction.

### §4.6 Cross-channel parity audit (EA daily sweep)

`[PARTIAL — full implementation deferred to v0.19.0]` This section codifies the cross-channel parity audit's intent. The full implementation (`scripts/version-parity-audit.*` invocation + EA agent contract update specifying daily-sweep responsibility + EA tools-allowlist additions for `Bash(npm view:*)` / `Bash(gh release list:*)` / `Bash(git ls-remote:*)`) lands as v0.19.0. v0.18.0 ratifies the protocol clause; implementation follows.

Gates 1-5 catch failures at release time. Some failure classes accumulate silently between releases — an orphaned tag that was never pushed, a CHANGELOG entry that never landed in `memory/agent-changelog.md`, a npm version that diverges from the GitHub Releases list. The EA daily briefing includes a **cross-channel version parity audit** as the catch-net for everything the per-release gates missed.

The audit compares four channels:

1. **Local tags** — `git tag -l 'v*'` (run in the framework root `tap-agents/` checkout).
2. **Remote tags** — `git ls-remote --tags origin 'v*'` (origin is the public `tap-agents` GitHub repo).
3. **npm versions** — `npm view @tapintomymind/tap-agents versions --json`.
4. **GitHub Releases** — `gh release list --limit 50` (the same Releases that `publish.yml` creates via `softprops/action-gh-release@v2`).

Expected invariant: **for every version v that appears in any one channel, v appears in all four channels.**

Any divergence is flagged to the user immediately in the next briefing under TEAM HEALTH. Common divergence shapes:

- **v in local, missing from remote** — tag was never pushed (the v0.15.0 class). Surface with the specific command to remediate: `git push origin v<v>`.
- **v in remote + Releases, missing from npm** — `publish.yml` ran but npm publish failed mid-flight; the package wasn't registered. Surface as a release-incident; remediation requires republish under a new version per immutability rules.
- **v in npm, missing from Releases** — `npm publish` succeeded but `softprops/action-gh-release@v2` errored in the workflow. Surface for manual `gh release create` remediation.
- **v in npm + Releases, missing from local** — a release was published from a non-canonical checkout (e.g., a teammate's machine). Surface for investigation; this should not happen in normal flow.

EA runs the audit on every briefing where the `tap-agents/` workspace has been touched since the last sweep, and unconditionally once per 24h regardless of activity. Implementation hint: a small `scripts/version-parity-audit.ts` script that emits a structured comparison and exit-codes non-zero on divergence; EA reads the audit's output and includes the report in TEAM HEALTH when divergence is detected. Silence in TEAM HEALTH = parity confirmed.

## §5 The release commit

A release is **one commit** that contains exactly:

1. The version bump in `package.json`
2. The matching `CHANGELOG.md` entry (newest at top, per Common Changelog format)
3. The matching `memory/agent-changelog.md` narrative entry (newest at top, per `changelog-protocol.md`)
4. Any source changes that justify the bump (agents, commands, protocols, templates, hooks, scripts, configs)
5. The git tag `v<version>` applied to this commit

The commit message follows Conventional Commits:

```
release: v0.8.0 — <one-line summary>

<paragraph summary, same as the CHANGELOG entry's title>
```

The tag triggers the `publish.yml` workflow which builds + `npm publish`es to the registry. Gate 5 (§4.5) then verifies the published artifact reached the registry intact and that all three distribution channels (npm + GitHub Releases + git remote tags) agree on the version. The release is not considered complete until Gate 5 passes.

## §6 Marketplace and npm channel synchronization

The two distribution channels MUST stay locked to the same version:

- The `package.json` `"version"` field is canonical
- `.claude-plugin/plugin.json` `"version"` field MUST match
- `.claude-plugin/marketplace.json` plugin entries MUST match
- Any version mismatch across these three is a hard CI failure

The `/release` command updates all three atomically. Gate 2's hook checks alignment before allowing the commit.

## §7 Pre-1.0 vs post-1.0

The framework is currently in the `0.X.Y` range. Per SemVer convention, the `0.X` major-zero range permits breaking changes inside MINOR bumps — i.e., `0.7.0 → 0.8.0` MAY include breaking changes that would warrant a major bump at `1.0+`.

**This protocol explicitly overrides that loophole.** The §3 classifier applies as-written regardless of the major-zero phase. Reasoning: downstream consumers (`agent-dashboard` Vercel build, future npm consumers) cannot distinguish "we're still in 0.X, things can change freely" from "this minor is a normal additive bump." Honesty wins over convention.

When the framework cuts `v1.0.0`, this protocol stays unchanged. The `v1.0.0` cut itself is a MAJOR bump under §3 (the marketplace plugin name and the npm package name become stable contracts).

## §8 Relationship to agent prompt versions

Individual agent prompts continue to carry `prompt_version: YYYY-MM-DD-N` fields per `framework-change-discipline.md` §9. That is **per-agent fine-grained versioning** — it tracks the specific prompt edit cadence and is read by EA's framework-health briefing.

Framework-release SemVer is **coarser** — it tracks the bundle that downstream consumers depend on. The two layers coexist:

- A prompt-only PATCH-grade change (typo in `critic.md`) → bump `critic.md`'s `prompt_version`, bump framework PATCH.
- A new `fires_when` trigger added to `critic.md` → bump `critic.md`'s `prompt_version`, bump framework MINOR.
- `critic.md` removed entirely → no `prompt_version` to bump (file is gone), bump framework MAJOR.

The two version layers never disagree because they're answering different questions. Downstream cares about framework SemVer. Internal agent-discipline cares about `prompt_version`. The release commit per §5 updates both atomically when both apply.

## §9 Provenance

This protocol responds to the 2026-05-11 distribution-strategy decision: the framework's `tap-agents` repo becomes the canonical source for both Claude Code marketplace consumers and the `agent-dashboard` Vercel build (replacing the `scaffold-source/` mirror, which `framework-change-discipline.md` §2 explicitly declares out-of-scope of doctrinal review). With two consumer channels in play, the version field crosses a threshold from internal-discipline to external-contract, and this protocol codifies the discipline.
