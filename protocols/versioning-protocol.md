# Versioning Protocol

**Owner:** Org Designer (codification + maintenance). Critic enforces at artifact level on every release review.
**Status:** Active 2026-05-11.
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

## §4 The four-gate enforcement chain

Honesty of the version field is enforced at four gates. Each layer catches what earlier layers missed.

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

The tag triggers the `publish.yml` workflow which builds + `npm publish`es to the registry.

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
