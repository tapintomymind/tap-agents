# Sync-TapAgents Protocol

**Owner:** Architect codifies; Org Designer maintains; Critic enforces at every framework-adoption commit.
**Status:** Active 2026-05-14.
**Authority:** User direction 2026-05-14 — *"We need to enforce this strictly somehow. And this is also important for the TapAgents framework to remember in general about project flow. We can't override process."*
**Trigger incident:** v0.20.0 adoption on <project> (2026-05-14) — dev → main no-ff merge dragged 4 unrelated dev commits (`3c4f32d` BL-049/050, `c09bf96` BL-061, `80752fa` BL-043, `cbda843` tailor-scaffold telemetry) into the prod build alongside the framework version bump. The framework adoption commit shipped, but it shipped *with riders*. The branch `sync-tapagents` exists precisely to prevent this — `cc7fa17` ("chore(vercel): whitelist sync-tapagents branch — framework→dashboard propagation") configured Vercel to build it — but the discipline of routing framework adoptions through it had eroded between v0.16.0 (2026-05-12) and v0.20.0 (2026-05-14). This protocol restores the discipline mechanically.

**Related:**
- `protocols/versioning-protocol.md` — what the framework publishes; this protocol governs how consumers adopt
- `protocols/dev-to-main-promotion.md` — the default consumer-side promotion flow; this protocol is the carve-out for framework adoptions
- `memory/feedback_no_direct_commits_on_main_back_merge_discipline.md` — the parent convention; this protocol adds the framework-sync exception
- `tap-agents/.github/workflows/notify-adopters.yml` — producer-side dispatch that already targets the consumer's `sync-tapagents` branch
- `<project>/.github/workflows/adopt-tap-agents.yml` (path reflects post-2026-05-14 BL-059 cascade-rename; was `<project>/`) — consumer-side auto-adoption that opens PRs on `sync-tapagents`

---

## §1 Why this exists

The framework `@tapintomymind/tap-agents` ships through npm; downstream consumers (currently `<project>`, formerly `<project>` pre-2026-05-14 BL-059 cascade-rename; future Tier 2 projects scaffolded via TapAgents) adopt each release by bumping the dependency pin + regenerating `scaffold-source/`. The mechanical surface of a framework adoption is small and well-defined: three to five files changed, all under a known fingerprint (see §3).

If framework adoptions land on `dev` and are then promoted via `dev → main` no-ff merge, they accumulate **rider commits** — any unrelated dev work merged into `dev` between releases also crosses to main alongside the framework bump. That is the v0.20.0 incident: 4 unrelated commits rode along, all of which independently had legitimate paths to prod through the standard `dev → main` promotion flow, but none of which had been individually approved as ready for prod.

Two problems flow from this:

1. **Auditability.** A `git log --oneline` on main for "what shipped at 14:30 on 2026-05-14?" returns 5 commits, only 1 of which is the framework bump. The mental model "framework adoption is one isolated commit, easy to revert / inspect / cite" breaks down. The audit trail Tier 2 ↔ Tier 1 telemetry depends on (per the dashboard product design) gets noisy.
2. **Rollback shape.** If the framework adoption breaks prod (e.g., the v0.11.0–v0.12.1 files-array regression class), reverting the framework bump requires also reverting the 4 rider commits or surgically un-merging the framework portion of the no-ff merge commit. Both are expensive; the simple shape of "revert one SHA" is gone.

The `sync-tapagents` branch isolates framework adoptions to a single-purpose branch that ONLY ever carries framework-sync commits. Promoting that branch to main is a no-ff merge of pure framework-adoption content, no riders. Then `main → dev` back-merges so dev catches up to whatever just shipped. This is the same shape as a hotfix-on-main back-merge (per `feedback_no_direct_commits_on_main_back_merge_discipline.md`), but the "hotfix" is a framework version bump and the originating branch is a dedicated long-lived branch rather than an ephemeral fix branch.

## §2 Scope

This protocol governs the adoption of `@tapintomymind/tap-agents` npm releases by any Tier 2 project scaffolded via TapAgents (currently `<project>`, formerly `<project>` pre-2026-05-14 BL-059; future projects inherit the convention).

It governs:
- Commits that modify `package.json` to change the `@tapintomymind/tap-agents` dependency version
- Commits that modify `package-lock.json` corresponding to the above version change
- Commits that regenerate `scaffold-source/` (typically from `npm run prebuild` per <project> convention, OR equivalent in future consumers)
- Commits that update `scaffold-source/.scaffold-meta.json` (or equivalent scaffold metadata file declaring the bundled framework version)
- Commits to consumer-side `.bot-manifest.json`, hook payload sync state, or any other adoption-bookkeeping files written by `adopt-tap-agents.yml`

It does NOT govern:
- Application code changes
- Test or doc changes unrelated to framework adoption
- New feature work, even feature work that consumes a newly-shipped framework capability (that's a follow-on commit on a feature branch, not the adoption itself)
- Hotfixes to application code

## §3 The framework-sync fingerprint

A commit is a "framework-sync" commit (and therefore governed by this protocol) if its staged diff matches at least ONE of these signatures:

**Signature A — dependency-pin bump.**
- `package.json` diff contains a `dependencies` or `devDependencies` entry change for `@tapintomymind/tap-agents`
- AND the diff is ONLY the version-string change (plus optionally `package-lock.json` resolutions for the same dep)

**Signature B — scaffold-source regen.**
- `scaffold-source/` tree changes (multi-file copy from `node_modules/@tapintomymind/tap-agents/`)
- AND `scaffold-source/.scaffold-meta.json` (or equivalent) updates the `frameworkVersion` field

**Signature C — adoption bookkeeping.**
- `.bot-manifest.json` baseline-version field change
- AND/OR `hooks/` payloads copied from a freshly-published framework version

A commit whose staged diff matches NONE of A/B/C is not a framework-sync commit and this protocol does not constrain it.

A commit whose staged diff matches A/B/C **AND ALSO contains unrelated changes** (e.g., a `package.json` dep bump plus a route handler refactor in `src/api/foo/route.ts`) violates atomicity. Split into two commits before proceeding.

## §4 The canonical flow

A framework version `X.Y.Z` is adopted in five steps. All consumer-side mutation lives on `sync-tapagents` until the no-ff promotion to `main`.

**Step 1 — Land the adoption on `sync-tapagents`.**
- Either: the auto-adoption workflow (`adopt-tap-agents.yml`) opens a PR targeting `sync-tapagents` after a `tap-agents-published` repository_dispatch event; the operator reviews + merges the PR (or the workflow auto-merges per its own policy, which the consumer controls).
- Or: the operator manually checks out `sync-tapagents`, runs `npm install @tapintomymind/tap-agents@X.Y.Z` + `npm run prebuild`, commits with a Conventional-Commits message of the form `sync: bump @tapintomymind/tap-agents to vX.Y.Z`, and pushes.

Either path lands the framework-sync commit(s) on `sync-tapagents` and ONLY on `sync-tapagents`. No mirroring to `dev` at this stage. No application changes mixed in.

**Step 2 — Verify the sync-tapagents preview build.**
- Push to `sync-tapagents` triggers a Vercel preview build (per `cc7fa17` whitelist).
- Confirm the preview is green before promotion. If red, fix on `sync-tapagents` directly (the branch is allowed to carry follow-on commits that are part of the same adoption — e.g., a TypeScript fixup required because the framework's published type changed).

**Step 3 — Promote `sync-tapagents` to `main` via no-ff merge.**
- `git checkout main` → `git merge --no-ff sync-tapagents` → `git push origin main`.
- The merge commit message follows the convention `sync: promote vX.Y.Z to main`.
- The merge commit's diff against main's prior HEAD contains ONLY framework-sync content (per §3 signatures). No rider commits.
- Vercel prod build fires from the main push and goes through standard prod checks.

**Step 4 — Back-merge `main` to `dev` via no-ff merge.**
- `git checkout dev` → `git merge --no-ff main` → `git push origin dev`.
- The merge commit message follows the convention `Merge main into dev — adopt vX.Y.Z framework bump`.
- This brings the framework adoption to `dev` so any future `dev → main` promotion of application work doesn't carry an out-of-date framework pin.
- If dev had other commits since the last back-merge, this is also where they unify with the new framework adoption surface.

**Step 5 — Confirm all three Vercel builds green.**
- sync-tapagents preview (Step 2 — should already be green)
- main prod (Step 3)
- dev preview (Step 4)

Only when all three are green is the adoption considered complete. State.json + reportback.md updates per Tier 2 ↔ Tier 1 reportback protocol are written by whichever agent owns the adoption.

## §5 The five enforcement layers

Discipline this strict needs mechanical backing. Five layers cover the surface; each catches what the prior misses.

### §5.1 Layer A — Release/adoption scripts (operator-leveled)

The producer-side `/release` command pushes a new framework tag. The consumer-side auto-adoption workflow (`adopt-tap-agents.yml`) targets `sync-tapagents` by default — already correct as of v0.17.0 producer-side and pre-existing on the consumer. Manual adoption (operator running `npm install` + commit) is governed by the docstring in `commands/release.md` (producer) which references this protocol, AND the docstring in `commands/feature.md` (consumer) when adoption is part of a feature scope.

**Effect.** Anyone reading the canonical release/adoption commands sees the `sync-tapagents` instruction up-front. Reduces accidental dev-targeting in routine flows.

### §5.2 Layer B — PreToolUse hook (`sync-discipline-gate.py`)

A new Claude Code PreToolUse hook fires on Bash commands matching `git commit` and `git push`. It detects:

1. The staged diff matches one of the §3 framework-sync signatures
2. The current branch (per `git rev-parse --abbrev-ref HEAD`) is `dev` OR `main`
3. The commit message lacks the `[sync-protocol-override: <reason>]` token

If all three: BLOCK with exit 2 and a stderr message naming `protocols/sync-tapagents-protocol.md` + the right remediation (`git checkout sync-tapagents` and commit there).

The hook does NOT block:
- Commits on `sync-tapagents` itself (correct destination)
- Commits on any other branch (e.g., feature branches that touch package.json for an unrelated dep) — fingerprint match alone isn't enough; branch context matters
- Override-tokened commits (`[sync-protocol-override: <reason>]` in the message), provided the reason is non-empty
- Commits that don't match the §3 fingerprint

**Effect.** Catches Claude Code-driven framework adoption attempts that target the wrong branch.

### §5.3 Layer C — CI guard (`.github/workflows/sync-protocol-check.yml`)

A GitHub Actions workflow runs on every pull request targeting `dev` or `main`. It diffs the PR contents against the target branch's HEAD and checks:

1. Does the PR diff include any §3 framework-sync signature files?
2. If yes, is the PR's source branch `sync-tapagents`?
3. If source is NOT `sync-tapagents`: fail the check with a link to this protocol.

The check is the strongest layer because it catches human-authored commits that bypass Claude Code entirely (e.g., a contributor manually editing `package.json` in a feature PR).

**Effect.** Cannot be bypassed by skipping the local hook. Stops at the GitHub merge gate.

### §5.4 Layer D — CLAUDE.md doctrine

The framework HQ `CLAUDE.md` and each Tier 2 project's `CLAUDE.md` reference this protocol in a "Sync discipline" section near the "What you CANNOT do inline" block. Plain prose, no enforcement primitive — the doctrine layer that makes the convention legible to anyone reading the playbook.

**Effect.** New contributors / new agents see the rule documented at the entry point. Org Designer can cite the section when codifying related discipline.

### §5.5 Layer E — Memory entries

Two `~/.claude/projects/<your-machine-tag>/memory/` entries:

1. `feedback_no_direct_commits_on_main_back_merge_discipline.md` — extended with the framework-sync carve-out clause referencing this protocol.
2. `project_sync_tapagents_protocol_2026-05-14.md` — new memory file capturing the protocol's existence, the v0.20.0 incident that triggered it, and when to consult it.

**Effect.** Future orchestrator sessions across all projects see the convention in MEMORY.md automatically. Auto-memory transports the rule across machine + session boundaries.

## §6 Exception clause

A framework hotfix that genuinely needs to ship via `dev` (e.g., the framework version bump is part of a coordinated multi-file feature where the framework upgrade and the application code that consumes the new capability must land atomically) requires an explicit override:

**The commit message MUST include the token `[sync-protocol-override: <reason>]` with a non-empty `<reason>` describing why the carve-out applies.**

The PreToolUse hook (§5.2) recognizes the token and allows the commit. The CI guard (§5.3) recognizes the token in the PR's commit messages and bypasses the branch-source check. Both layers log the override.

Override use generates an audit-trail entry: the next orchestrator session that encounters the override-tokened commit during a `/status` or `/inbox` flow should surface it as an "exception used; document the decision" prompt. The user can confirm the override was warranted or escalate to Org Designer if the exception class is recurring (3+ in 30 days → propose protocol amendment).

**Non-exception classes** (these CANNOT be override-tokened; they're just framework adoptions that should follow the canonical flow):
- "I forgot the protocol and committed on dev" → revert, re-do on sync-tapagents
- "The CI was slow and I wanted to ship faster" → wait for CI
- "It's a tiny patch bump" → tiny patches go through sync-tapagents too; the discipline is uniform

## §7 Branch naming

Default consumer branch name: `sync-tapagents`. Tier 2 projects scaffolded via TapAgents inherit this default.

A consumer may customize the branch name by writing to `.tapagents-manifest.json` at the project root:

```json
{
  "syncBranch": "custom-name-here"
}
```

The PreToolUse hook (§5.2) and CI guard (§5.3) both read this file (with fallback to the `sync-tapagents` default) when present. Customization is allowed but discouraged — the cross-project convention has value.

## §8 Provenance

This protocol responds to the 2026-05-14 v0.20.0 adoption incident on <project>. The branch `sync-tapagents` already existed (since 2026-05-12 per `cc7fa17`) with deliberate Vercel whitelist configuration; the producer-side auto-adoption workflow already targets it. What was missing was the strict-enforcement discipline that the branch is the ONLY legitimate destination for framework-sync content. This protocol fixes that.

The protocol is generic: it applies to any current or future Tier 2 project scaffolded via TapAgents. <project> is the first dogfood case; the same rules will apply to `<project>`, `<project>` (the marketing site if it ever consumes the framework), and any new project the user spins up.

## §9 Related protocols at a glance

| Protocol | Relationship |
|---|---|
| `versioning-protocol.md` | Governs how the framework publishes. This protocol governs how consumers adopt. They form a producer/consumer pair. |
| `dev-to-main-promotion.md` | The default consumer-side promotion flow. This protocol carves out framework adoptions from that flow. |
| `framework-change-discipline.md` | What changes qualify as Tier 1 doctrinal. This protocol is itself a Tier 1 doctrinal addition. |
| `destructive-data-ops.md` | The other chokepoint protocol — same pattern: dedicated path for a specific class of operation, refuse-by-default outside it. |

## §10 HQ topology: filesystem-only (effective 2026-05-17)

**Status:** Active 2026-05-17 — framework HQ adopts filesystem-only authoring, retiring its prior local git layer.

### §10.1 What changed

Prior to 2026-05-17, the framework HQ carried its own local `.git/` directory at the authoring root. That layer was never wired to a remote — no `origin` was ever pushed — and it created two compounding hazards:

1. **Doubled audit surface.** HQ-side commits drifted from `tap-agents/` commits, producing a second "source of truth" that nobody actually consulted. Releases are cut from `tap-agents/` commits + npm tags; the HQ-side commit history added noise without adding signal.
2. **Sync-mode ambiguity.** `scripts/sync-src/sync.ts` used `.git/` presence at the source root to choose between `git ls-files` enumeration and filesystem-walk enumeration. With a `.git/` directory present at BOTH the HQ source root and the `tap-agents/` target root, the two enumeration modes had subtly different file sets (git-mode honored `.gitignore`; filesystem-walk did not), and the choice depended on which directory was passed as `--source`.

HQ now becomes a filesystem-only working tree. The HQ git layer is retired. The prior `.git/` directory at the HQ root was renamed on 2026-05-17 to `.git.archived-2026-05-17/` at the same path — kept as a tombstone for one-command reversibility, scheduled for deletion at v1.0.0 final cleanup (or sooner once filesystem-only mode has soaked).

### §10.2 The new topology

| Layer | Role | Version control |
|---|---|---|
| Framework HQ (authoring root, filesystem-only) | Working source-of-truth for protocols, agents, hooks, scripts, memory, workspace. Edited directly. | None. Filesystem snapshots via Time Machine or equivalent. |
| `tap-agents/` (publish target) | npm-publishable mirror of HQ content. Read-only with respect to authoring — propagated INTO via sync.ts. | Full git history. Commits + tags + npm releases provide the audit trail. |
| `scripts/sync-src/sync.ts` (propagation bridge) | One-way HQ → tap-agents propagation. Lint validation + plan/apply staging + idempotent overwrite. | Lives in HQ; runs from `tap-agents/` working directory typically. |

The audit trail moves entirely into `tap-agents/` — every framework version that ever shipped is reconstructable from `tap-agents/` commits + npm tags + the per-release CHANGELOG. HQ's role is the authoring surface; `tap-agents/` is the publish-record surface.

### §10.3 How sync works now

`scripts/sync-src/sync.ts` auto-detects source enumeration mode at the source root:

- `.git/` present at source → `git ls-files` mode (respects `.gitignore`; matches the prior behavior for tap-agents-as-source)
- `.git/` absent at source → filesystem-walk mode (full directory traversal; the only mode HQ supports now)
- `--source-mode <auto|git|filesystem>` flag available for explicit override

With HQ's `.git/` archived, the default invocation `tsx scripts/sync-src/sync.ts --apply --source <HQ> --target <tap-agents>` runs in filesystem-walk mode automatically. The stderr emits `[sync] source enumeration: filesystem (no .git/ at source root)` so the mode choice is visible in every run.

### §10.4 Editing discipline going forward

Authoring at HQ no longer involves `git add` / `git commit`. The workflow is:

1. Edit files under the HQ authoring root directly via the orchestrator's normal subagent dispatch (Architect, Strategist, Org Designer, etc.).
2. When ready to propagate: run `tsx scripts/sync-src/sync.ts --dry-run --source <HQ-authoring-root> --target <tap-agents-checkout>` to preview.
3. Verify the dry-run plan matches expectations (file counts, lint pass).
4. Run with `--apply` instead of `--dry-run` to perform the propagation.
5. Commit + tag + publish only inside `tap-agents/` (per the producer-side flow in `versioning-protocol.md` and `commands/release.md`).

Steps 1–4 are HQ work; step 5 is `tap-agents/` work. The boundary is clean. There is no "HQ commit step" anymore — that ceremony was retired.

### §10.5 Risk + mitigation

Filesystem-only HQ has no commit-level audit trail at the HQ layer itself. Mitigations:

1. **`tap-agents/` commits provide publish-granularity audit.** Every state that ever shipped is on a `tap-agents/` commit, tagged, and published. The "what changed between vX.Y.Z and vX.Y.Z+1" question is answered by `git log` in `tap-agents/`, not by anything at HQ.
2. **Time Machine (or equivalent filesystem backup) covers in-flight authoring.** Authoring states between sync-applies are recoverable from filesystem snapshots if a destructive edit goes wrong before the next propagation.
3. **`sync:dry-run` before `--apply` is mandatory discipline.** Every propagation previews what will change. Surprises surface before they're written. The lint layer (per `scripts/sync-src/lint.ts`) catches structural defects before they cross to the publish target.
4. **The archived `.git.archived-2026-05-17/` tombstone is the one-command rollback.** If filesystem-only mode produces a problem we didn't anticipate, renaming the tombstone back to `.git/` at the HQ authoring root restores the prior topology without any data loss. Tombstone retention through v1.0.0 final cleanup, minimum.

### §10.6 Cross-references

- `protocols/versioning-protocol.md` — producer-side release flow that still owns the publish-granularity audit trail
- `scripts/sync-src/sync.ts` — implements auto-detect + `--source-mode` flag described in §10.3
- `scripts/sync-src/lint.ts` — structural lint layer that guards the propagation step
