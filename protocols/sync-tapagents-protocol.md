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
- Vercel prod build fires from the main push and goes through standard prod checks **UNLESS the promoted content is pure scaffold** (per the §3 fingerprint), **in which case §4.5 deploy neutrality SKIPS the build** — no prod deploy fires, and the skip IS the success signal (the merge commit's first-parent diff in non-scaffold paths is empty → `ignoreCommand` exit 0 → SKIP). A framework *dependency* bump (Sig A, `package.json`) is the one promotion that still builds here. So: do NOT wait for a prod build on a pure-scaffold promotion — there won't be one, by design.

**Step 4 — Back-merge `main` to `dev` via no-ff merge.**
- `git checkout dev` → `git merge --no-ff main` → `git push origin dev`.
- The merge commit message follows the convention `Merge main into dev — adopt vX.Y.Z framework bump`.
- This brings the framework adoption to `dev` so any future `dev → main` promotion of application work doesn't carry an out-of-date framework pin.
- If dev had other commits since the last back-merge, this is also where they unify with the new framework adoption surface.

**Step 5 — Confirm the Vercel build state green-or-skipped.**
- sync-tapagents preview (Step 2 — should already be green; this is the one build a pure-scaffold adoption DOES run, and a dependency bump verifies here)
- main prod (Step 3) — **green OR skipped per §4.5**. For a pure-scaffold promotion this build is SKIPPED (deploy-neutral); treat the skip as the success signal, not a stuck build. Only a `package.json` dependency-bump promotion produces an actual main prod build to wait on.
- dev preview (Step 4) — **green OR skipped per §4.5**. A pure-scaffold back-merge is SKIPPED here too — which is the entire point of §4.5 (it removes the QA-redeploy hazard of a `dev` back-merge redeploying in-flight unpromoted work).

The adoption is complete when each of these three is **green or deploy-neutral-skipped** as appropriate. Do NOT block on a "main prod green" or "dev preview green" that will never appear for a pure-scaffold promotion — §4.5 intentionally suppresses those deploys; the skip is the expected, successful outcome. State.json + reportback.md updates per Tier 2 ↔ Tier 1 reportback protocol are written by whichever agent owns the adoption.

## §4.5 Deploy neutrality (effective 2026-06-02)

**Status:** Active 2026-06-02 — framework-sync commits are deploy-neutral on every consumer environment.
**Authority:** User direction 2026-06-02 — *"framework syncs should be DEPLOY-NEUTRAL on every consumer environment, permanently."* Boundary explicitly confirmed: pure scaffold syncs skip deploys everywhere; a framework **dependency** bump still builds (on the isolated `sync-tapagents` preview only).
**Trigger:** The `sync-tapagents → main` promotion (Step 3) and the `main → dev` back-merge (Step 4) each push a deploy branch, which fires a consumer Vercel build. On `main` (prod) that rebuild is merely wasteful — it redeploys byte-identical application output. On `dev`/QA it is **dangerous**: the back-merge push triggers a rebuild of the `dev` branch, and `dev` routinely carries ongoing, *unpromoted* application work. A sync-triggered `dev` rebuild can therefore redeploy in-flight work that was never approved for the QA environment. Deploy neutrality removes both the waste and the hazard.

### §4.5.1 The principle

**A framework-sync commit (per the §3 fingerprint) MUST NOT trigger a consumer application deploy.** The scaffold surface (`.claude/`, framework docs, scaffold metadata, bot manifest) is not application code; changing it cannot change what the deployed app does. So a commit that touches *only* that surface has no reason to rebuild or redeploy the app — on any branch, on any host.

This is the deploy-time complement to the build-time discipline already in this protocol. §5 keeps framework-sync commits *isolated to the right branch*; §4.5 makes those commits *invisible to the deploy pipeline* once they land. The two together mean: a framework adoption is one auditable commit AND it never moves a live environment unless it actually changes the app (which only a dependency bump can).

### §4.5.2 The host-agnostic contract: the §3 fingerprint is the skip key

Deploy neutrality is keyed off the **same §3 framework-sync fingerprint** that the rest of this protocol uses — there is exactly one definition of "this is framework-scaffold content," and every layer (the PreToolUse gate, the CI guard, and now the deploy-skip) reads from it. Concretely, the scaffold paths are:

- `.claude/` (the entire scaffolded Tier 2 directory)
- `*.md` (framework + project docs — README, CHANGELOG, protocol prose)
- `.scaffold-meta.json` (the bundled-framework-version declaration, where a consumer keeps it at repo root)
- `.bot-manifest.json` (adoption bookkeeping written by `adopt-tap-agents.yml`)

A commit whose diff is confined to those paths is deploy-neutral. A commit that touches anything *outside* them — application source, config, and crucially `package.json` — builds normally. This is host-agnostic: the contract is "did anything outside the scaffold paths change?", expressible on any deploy host that supports a content-based build-skip.

**The dependency-bump boundary (load-bearing).** `package.json` is deliberately **NOT** in the skip set. A framework *dependency* bump (Signature A) changes `package.json`, so it still builds. That is intentional: a dependency change can alter runtime behavior and MUST be verified — but per §4 Step 2 it verifies on the isolated `sync-tapagents` **preview** build only, and is promoted to live environments through the §4 no-ff flow, never by a silent auto-redeploy of `main`/`dev`. Deploy neutrality skips the *scaffold-copy* rebuilds (Steps 3 and 4 when the promoted content is pure scaffold); it does not skip dependency verification.

### §4.5.3 The canonical Vercel mechanism

A committed `vercel.json` at the consumer project root, carrying an `ignoreCommand`:

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ':(exclude).claude' ':(exclude)hooks' ':(exclude)scaffold-source' ':(exclude)*.md' ':(exclude)*.scaffold-meta.json' ':(exclude).bot-manifest.json'"
}
```

The exclude set is the **full §3 framework-sync fingerprint** minus the intentional `package.json` carve-out: `.claude/` (the scaffolded Tier 2 dir), `hooks/` (Sig C — top-level git-tracked hook payloads, which on the real consumer live OUTSIDE `.claude/`), `scaffold-source/` (Sig B — the scaffold regen tree, for consumers that track it rather than gitignoring it as a build artifact), `*.md` (framework + project docs), `*.scaffold-meta.json` (Sig B metadata — globbed so it matches the real nested `scaffold-source/.scaffold-meta.json`, not just a root copy), and `.bot-manifest.json` (Sig C adoption bookkeeping). Keeping the exclude set equal to the §3 fingerprint is the load-bearing invariant — if a §3 signature path is missing from the exclude set, that class of framework-sync commit wrongly BUILDS.

Semantics: Vercel runs `ignoreCommand` per build. **Exit 0 → Vercel SKIPS the deploy; non-zero → Vercel BUILDS.** The diff asks "did anything outside the scaffold paths change between the previous commit and this one?" — if no (`--quiet` finds no diff → exit 0), skip; if yes (exit 1), build. It is **branch-agnostic**: the same file protects prod (`main`), QA (`dev`), and every preview uniformly, because it lives on the branch and runs on every deploy of that branch.

Behavior verified in isolation under POSIX `sh` (Vercel's runner) and against real consumer adoption commits, including the hooks-bearing syncs `f1522ce` (`.bot-manifest.json` + two `hooks/*.py`) and `3abc70c` (six `hooks/*.py` + `package.json`):

| Commit shape | `ignoreCommand` exit | Vercel action |
|---|---|---|
| Scaffold-only (`.claude/` + `*.md` + nested `scaffold-source/.scaffold-meta.json`) | `0` | **SKIP** (deploy-neutral) ✅ |
| Hook-payload sync (`hooks/*.py` ± `.bot-manifest.json`, e.g. `f1522ce`) | `0` | **SKIP** (deploy-neutral) ✅ |
| `scaffold-source/` regen (tracked, ± nested `.scaffold-meta.json`) | `0` | **SKIP** (deploy-neutral) ✅ |
| Application source change (`src/…`, `drizzle/…`) | `1` | **BUILD** ✅ |
| `package.json` dependency bump (e.g. the `3abc70c` `package.json` portion) | `1` | **BUILD** (dep verifies) ✅ |
| `sync-tapagents → main` no-ff merge of pure scaffold | `0` (HEAD^ = first parent) | **SKIP** ✅ |
| Initial commit (no `HEAD^`) | non-zero (`fatal: bad revision`) | **BUILD** (fail-safe) ✅ |

The merge-commit row matters: Vercel deploys the *merge commit*, and `HEAD^` resolves to the merge's **first parent** (the prior tip of the deployed branch), so the first-parent diff of a pure-scaffold promotion is empty → skip. The initial-commit row is the designed fail-safe: when `HEAD^` does not exist the command errors non-zero, so Vercel **builds** rather than skips — the mechanism never *wrongly skips*; its only failure direction is a harmless extra build.

**Shallow-clone note + the hardened form.** Vercel checks out a shallow clone (small depth; not contractually fixed and has changed historically), so `HEAD^` resolves for non-initial commits. The one degenerate case is depth = 1, where `HEAD^` is absent and the command fails non-zero → an unnecessary build (still fail-safe — it never wrongly redeploys). If a consumer ever observes scaffold-only commits over-building (a symptom of depth-1 checkouts), upgrade the `ignoreCommand` in place to the hardened form, which prefers Vercel's `VERCEL_GIT_PREVIOUS_SHA` (the last *successfully deployed* SHA, independent of clone depth) and falls back to `HEAD^`:

```jsonc
{
  "ignoreCommand": "base=\"${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}\"; git cat-file -e \"$base^{commit}\" 2>/dev/null || exit 1; git diff --quiet \"$base\" HEAD -- ':(exclude).claude' ':(exclude)hooks' ':(exclude)scaffold-source' ':(exclude)*.md' ':(exclude)*.scaffold-meta.json' ':(exclude).bot-manifest.json'"
}
```

The hardened form was exercised, in isolated POSIX-`sh` repros, to: SKIP on scaffold-only (both via the env var and via the `HEAD^` fallback), SKIP on hook-payload and tracked-`scaffold-source/` syncs, BUILD on app/`package.json` changes, and BUILD fail-safe when `VERCEL_GIT_PREVIOUS_SHA` is unset/empty/unreachable. It carries the SAME exclude set as the simple form (see the lockstep note below) — both forms exclude `.claude/`, `hooks/`, `scaffold-source/`, `*.md`, `*.scaffold-meta.json`, `.bot-manifest.json`. The simple form is the default scaffold because it is maximally readable and its only failure mode is a harmless over-build; the hardened form is the documented drop-in upgrade. Both never redeploy a live environment for a pure-scaffold sync, which is the whole point.

> **Change all forms in lockstep (Critic N-3).** The exclude set is ONE set, expressed in five places: the simple `vercel.json` form (above), the hardened `vercel.json` form (here), the GitHub Actions `paths-ignore` and Netlify `[build] ignore` forms (§4.5.4), and the `vercel.deploy-neutral.json` copy-source. They MUST stay byte-identical in coverage. If you add or remove a §3 signature path, change all five together — a drift between them means one host or one form silently builds (or skips) a class the others don't.

### §4.5.4 Host-agnostic equivalents

The contract is the scaffold-path set; the mechanism is whatever the host provides. Keyed off the **same paths**:

- **Vercel** — committed `vercel.json` `ignoreCommand` (above). The canonical scaffold-shipped form.
- **GitHub Actions** (consumer building/deploying via a workflow) — `paths-ignore` on the deploy workflow's `push` trigger:
  ```yaml
  on:
    push:
      branches: [main, dev]
      paths-ignore:
        - '.claude/**'
        - 'hooks/**'
        - 'scaffold-source/**'
        - '**/*.md'
        - '**/*.scaffold-meta.json'
        - '.bot-manifest.json'
  ```
  A push whose changes are entirely within these paths does not start the workflow → no deploy. (`paths-ignore` skips only when ALL changed files match; once `hooks/**` and `scaffold-source/**` are in the list, a hooks-only or scaffold-regen sync matches entirely and skips.)
- **Netlify** — the `ignore` key in `netlify.toml` (mirrors Vercel's `ignoreCommand` verbatim — same `git diff` pathspec; exit 0 cancels the build):
  ```toml
  [build]
    ignore = "git diff --quiet HEAD^ HEAD -- ':(exclude).claude' ':(exclude)hooks' ':(exclude)scaffold-source' ':(exclude)*.md' ':(exclude)*.scaffold-meta.json' ':(exclude).bot-manifest.json'"
  ```

All three express the identical predicate — "nothing outside the framework-scaffold paths changed → don't deploy" — so a consumer on any of these hosts inherits the same deploy-neutral guarantee.

**These three exclude sets are the SAME set; change them together (Critic N-3).** The Vercel `git diff` pathspec, the GitHub Actions `paths-ignore` globs, and the Netlify `ignore` `git diff` pathspec all encode the identical §3 fingerprint. The only syntactic difference is form: Vercel/Netlify use git pathspec (`:(exclude)hooks`, `:(exclude)*.scaffold-meta.json`), GitHub Actions uses path globs (`hooks/**`, `**/*.scaffold-meta.json`). If a §3 signature path is added or removed, update all three (and both `vercel.json` forms in §4.5.3) in lockstep — a drift means one host builds a framework-sync class the others skip.

### §4.5.5 Where the mechanism comes from (scaffold-shipped)

Deploy neutrality is **scaffolded into every consumer**, not configured per project by hand. The mechanism ships from the framework's Tier 2 deployment template:

- `templates/stacks/_baseline/vercel.deploy-neutral.json` — the canonical config, as a concrete copy-source (plain JSON, no comments — see N-2) so it cannot drift from this protocol.
- `templates/stacks/_baseline/tier2-deployment.md` §"Deploy neutrality (framework-sync skip)" — instructs the deployment agent to install the `ignoreCommand` at scaffold time, **merging** into any pre-existing `vercel.json` (e.g., one that already carries `crons`) rather than overwriting it.
- The handoff-protocol mechanical checklist gains a verification item so scaffolding confirms the config landed.

Because it ships from the template, every NEW project scaffolded via TapAgents inherits deploy neutrality automatically.

**Existing-consumer adoption is MERGE-not-overwrite — do NOT clobber a pre-existing `vercel.json`.** Add ONLY the `ignoreCommand` key to whatever `vercel.json` the consumer already has; never write a fresh file over an existing one. This matters concretely: the real dogfood consumer's `vercel.json` carries 4 `crons` (incl. retention sweeps) and no `ignoreCommand`. A naive single-line replacement or a template-overwrite would silently drop those 4 scheduled jobs. So while the *diff* is one added key, the *operation* is a structured merge, not a one-line file replacement — align to the tier2-deployment template's "merge, do NOT overwrite" instruction (it enumerates the keys at risk: `crons`, `functions`, `headers`, `rewrites`). Land the merged config on the branch(es) the host deploys: if the repo promotes `dev → main`, land on `dev` and let promotion carry it to `main`; if `main` deploys prod directly and needs immediate protection, promote per the repo's rules (tier2-deployment.md step 3 has the branch-landing nuance). New projects get this from the template; existing consumers adopt it the next time their deployment agent runs, or via this surgical merge-commit of the config.

### §4.5.6 Relationship to the rest of this protocol

| Concern | Owned by | Mechanism |
|---|---|---|
| Framework-sync content lands on the right branch | §5 (Layers A–E) | PreToolUse gate, CI guard, doctrine, memory |
| Framework-sync content, once landed, doesn't move a live deploy | §4.5 | Scaffold-shipped `ignoreCommand` keyed off the §3 fingerprint |
| Framework *dependency* bumps still get verified | §4 Step 2 + §4.5.2 | `package.json` excluded from the skip set → builds on `sync-tapagents` preview |

§4.5 is effectively a sixth, **scaffold-shipped** enforcement layer (the deploy-time one), distinct from the five author-time/commit-time layers in §5 because it acts after the commit lands, at the host's deploy boundary, on every consumer environment uniformly. See §5.6.

## §5 The enforcement layers

Discipline this strict needs mechanical backing. Five author-time/commit-time layers cover the *branch-isolation* surface; each catches what the prior misses. A sixth, deploy-time layer (§5.6, specified in §4.5) covers the *deploy-neutrality* surface.

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

Two `~/.claude/projects/<project>/memory/` entries:

1. `feedback_no_direct_commits_on_main_back_merge_discipline.md` — extended with the framework-sync carve-out clause referencing this protocol.
2. `project_sync_tapagents_protocol_2026-05-14.md` — new memory file capturing the protocol's existence, the v0.20.0 incident that triggered it, and when to consult it.

**Effect.** Future orchestrator sessions across all projects see the convention in MEMORY.md automatically. Auto-memory transports the rule across machine + session boundaries.

### §5.6 Layer F — Deploy-neutrality skip (scaffold-shipped, deploy-time)

The sixth layer is specified in full in §4.5 and differs in kind from Layers A–E: it is **scaffold-shipped** (it ships into every consumer project as a committed config file, not as an HQ-side gate) and it acts at **deploy time** (the host's build-skip boundary) rather than at author/commit time. Layers A–E keep framework-sync content on the right branch; Layer F makes that content deploy-neutral once it lands, on every consumer environment uniformly.

- **Mechanism:** committed `vercel.json` `ignoreCommand` (canonical), or host-agnostic equivalent (`paths-ignore` / `netlify.toml ignore`), keyed off the §3 fingerprint (§4.5.2–§4.5.4).
- **Where it ships from:** `templates/stacks/_baseline/vercel.deploy-neutral.json` + the deployment-agent template (§4.5.5).
- **What it does NOT skip:** `package.json` dependency bumps (the §4.5.2 boundary) — those still build and verify on the `sync-tapagents` preview.

**Effect.** A framework adoption that promotes pure scaffold content to `main`/`dev` does not rebuild or redeploy the live application. The QA-redeploy hazard (a `dev` back-merge redeploying unpromoted work) is structurally removed for every consumer, present and future, without any per-project Vercel-dashboard change — the guarantee is entirely in the committed config.

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

The protocol is generic: it applies to any current or future Tier 2 project scaffolded via TapAgents. <project> (formerly <project>) is the first dogfood case; the same rules will apply to `<project>`, `tapintomymind` (the marketing site if it ever consumes the framework), and any new project the user spins up.

## §9 Related protocols at a glance

| Protocol | Relationship |
|---|---|
| `versioning-protocol.md` | Governs how the framework publishes. This protocol governs how consumers adopt. They form a producer/consumer pair. |
| `dev-to-main-promotion.md` | The default consumer-side promotion flow. This protocol carves out framework adoptions from that flow. |
| `framework-change-discipline.md` | What changes qualify as Tier 1 doctrinal. This protocol is itself a Tier 1 doctrinal addition. |
| `destructive-data-ops.md` | The other chokepoint protocol — same pattern: dedicated path for a specific class of operation, refuse-by-default outside it. |
| `handoff-protocol.md` | The scaffold-time mechanical-verification checklist gains a "deploy-neutral config present" item (§4.5.5) so every scaffolded Tier 2 ships the deploy-neutrality config. |
| `templates/stacks/_baseline/tier2-deployment.md` | The scaffold-shipping source for §4.5 Layer F — installs the `ignoreCommand` (merging into any pre-existing `vercel.json`) at scaffold time. |
| `templates/stacks/_baseline/vercel.deploy-neutral.json` | The canonical copy-source for the `ignoreCommand` config (§4.5.3) — concrete artifact so the mechanism cannot drift from this protocol's prose. |

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
