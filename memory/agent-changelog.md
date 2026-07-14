# Agent Changelog (Public)

Narrative log of structural changes to the team. Public-safe — no project specifics.

For technical changes, see root `CHANGELOG.md`. For project-narrative changes, see `agent-changelog-private.md`.

**Scope rules:** see `protocols/changelog-protocol.md` (framework vs. project scope split, codified 2026-05-06).

**Cross-session coordination:** see `protocols/session-coordination-protocol.md` (parallel-session consistency, codified 2026-05-06).

## 2026-07-14 — Framework v0.38.1 — CHANGELOG-prose consistency: [0.38.0] regression-test distribution scope corrected

A documentation-consistency PATCH in the v0.31.1 class. The published `[0.38.0]` `### Added` block for the `scripts/test-version-floor.py` regression matrix overstated its distribution scope — it read "Included in the published tarball via `scripts/sync-src/manifest.json5`", conflating two mechanisms. The sync manifest governs HQ→mirror propagation (the test correctly ships to the framework repository and runs in CI, 8/8 green); the npm tarball is governed by `package.json#files`, which deliberately excludes `scripts/` (operator-side tooling, per the v0.35.0 `bump-manifest-versions.ts` precedent). The adopter-facing carve-out artifact remains `hooks/version-gate.py`. The functional artifact scope shipped in v0.38.0 was always correct; only the prose was wrong. Because npm tarballs are immutable, the correction ships forward as v0.38.1 rather than a re-publish of v0.38.0 — the same npm-immutability doctrine that produced the v0.31.1 precedent. No config or behavior change; adopters at v0.38.0 execute nothing different. Framework PATCH; documentation only.

Cross-reference: `CHANGELOG.md` v0.38.1 entry; the `[0.38.0]` `### Added` correction in the same file; the v0.31.1 precedent (same CHANGELOG-prose-consistency class).

## 2026-07-14 — Framework v0.38.0 — SemVer severity-floor re-keyed to the active-agent surface (Candidate A carve-out) + release-coordinator stub archive-move retires Shape A′

The doctrine tension flagged at v0.37.0 is resolved at its root — and the fix dogfoods itself in the release that ships it. v0.37.0 activated `release-coordinator` under the one-time "Shape A′" retain-in-place exception because the pre-carve-out severity floor treated any delete/rename anywhere under `agents/**` as MAJOR, so the codified `rename-on-move` archive doctrine (`_planned/x.md → _archive/x-promoted-<date>.md`) would have forced a spurious `0.x → 1.0.0` MAJOR on a purely additive activation. That entry filed the clean fix as a follow-up; this release lands it and immediately exercises it. The release's own staged diff contains exactly the `_planned → _archive` move the OLD floor would have hard-blocked at MAJOR, and under the NEW rule it classifies additive-class at both Gate 2 (`hooks/version-gate.py`, commit-time) and Gate 3 (`scripts/build-src/version-check.ts` / `version-check.yml`, the CI release gate) — so the carve-out passes its own first live test as a precondition of landing at all.

The carve-out is Candidate A of the design (path-exclusion). The severity floor — enforced at Gate 2 and Gate 3 and specified in `protocols/versioning-protocol.md §4.2` invariant 3 (plus the §3.3 clarifier and a §4.3 origin/main correction) — is re-keyed from the raw file tree to the **consumer-visible active surface** of the versioned directories. For `agents/`, the active surface is the top-level dispatchable contracts (`agents/*.md`); the `agents/_planned/**` (not-yet-dispatchable stubs) and `agents/_archive/**` (internal history) sub-namespaces are NOT part of it; `commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/` remain active-surface in full. The load-bearing mechanic: the diff reader retains BOTH rename paths (`_staged_diff_files` returns `(status, old_path, new_path)`; the TS `getDiffEntries` retains `oldPath`/`newPath`), keying removals/renames on the OLD path and additions on the NEW path (`_is_active_surface` + `_AGENT_SUBNAMESPACE_PREFIXES` / `isActiveSurface` + `AGENT_SUBNAMESPACE_PREFIXES`). This closes both directions of the old defect at once: retiring or demoting a LIVE top-level agent stays MAJOR — even when the destination is a path outside the versioned dirs, which the old new-path keying let escape MAJOR — while a `_planned`/`_archive`-confined move (promotion, supersession, or drafting churn) is additive-class and no longer burns a spurious major. Candidate A was chosen over the stricter paired `R`+`A` check because it covers the whole `_planned`/`_archive` lifecycle class rather than just the promotion shape, is a simpler per-entry test, and preserves the MAJOR floor exactly where consumer breakage is real. The enabling gate change is itself MINOR — a new corrected gate capability; nothing removed; the gate is not a consumer-facing contract.

Retro tidy-up + committed regression coverage. With the floor re-keyed, the Shape A′ deviation is unwound: `agents/_planned/release-coordinator.md` is deleted and recreated as `agents/_archive/release-coordinator-promoted-2026-07-01.md` under the standard `rename-on-move` doctrine, retiring the in-place PROMOTED-marker exception; future promotions use rename-on-move directly. This is the change that makes the release its own dogfood — the departing `_planned` tombstone shipped in v0.37.0/v0.37.1 and now leaves the tarball, while the `_archive` replacement is tarball-excluded (`manifest.json5` excludes `agents/_archive/**/*`, only its README ships) and the live dispatchable `agents/release-coordinator.md` is untouched — non-breaking, invisible to the plugin registry, visible only in a byte-level tarball diff. The previously smoke-only carve-out now carries committed coverage: `scripts/test-version-floor.py` (+ the `test:version-floor` npm script, wired into `manifest.json5` so it ships and runs against the published copy) is an 8-case, stdlib-only regression matrix that stages one change-shape per case against the real `_staged_diff_files` / `_classify_severity_floor` and asserts the computed floor — all 8 green. Framework MINOR; additive — the consumer-visible active surface is unchanged (nothing removed, renamed, or narrowed); adopters at v0.37.1 receive a strictly more permissive, better-corrected floor.

Cross-reference: `CHANGELOG.md` v0.38.0 entry; the v0.37.0 entry below (the Shape A′ posture this supersedes); `scripts/test-version-floor.py` (the committed regression matrix); `agents/_archive/release-coordinator-promoted-2026-07-01.md` (the archived stub); `agents/release-coordinator.md` (the unchanged live contract).

## 2026-07-13 — Framework v0.37.1 — Publish-infrastructure fix: Node 22 + npm@11 pin (carries the v0.37.0 content to npm)

The newly-activated release-coordinator's first release was also its first incident — and the incident path worked exactly as codified. The v0.37.0 tag landed cleanly on main, but the publish workflow failed pre-publish at its Trusted-Publishing npm-upgrade step: the unpinned `npm@latest` had moved to npm@12, whose engines floor (Node >=22.22.2) exceeds the workflow's Node-20 pin — an `EBADENGINE` error before build, publish, or Release were ever reached. Pure CI environment drift; zero defect in the release content. Per the publish-failure doctrine, a mid-flight failure is an incident with forward-version remediation — never a hold, never annotated-away silently — so the release-coordinator stopped at the failure, reported it verbatim, and surfaced the remediation options without touching the tag. The approved path: forward-fix as v0.37.1.

The remediation has three parts. The workflow fix pins the publish workflow to Node 22 and the `npm@11` major (satisfying the OIDC >=11.5.1 requirement while immune to future `@latest` engines-floor bumps); the remaining workflows were audited and none runs the `npm@latest` upgrade. The parity-audit annotation adds v0.37.0 to the `KNOWN_ORPHANS` map as a publish-failure incident entry (`missing_from: ["npm", "releases"]`, content carried forward) — prepared by the release-coordinator under its freshly-activated append authority and user-approved per entry, exercising the map-governance policy for the first time post-activation. And the carry-forward: v0.37.1 ships the complete v0.37.0 content, making this PATCH the version that actually delivers the release-coordinator activation to npm. The activation release's own failure became the first live proof of the contract it activated — hold-vs-failure discrimination, stop-and-surface, and per-entry append governance all exercised in production within hours of activation.

Cross-reference: `CHANGELOG.md` v0.37.1 entry; the v0.37.0 entry below (the carried-forward activation); `scripts/version-parity-audit.ts` `KNOWN_ORPHANS` "0.37.0" entry.

## 2026-07-13 — Framework v0.37.0 — Release-coordinator activated: framework release lifecycle gains its owning agent

The framework release lifecycle gains its owning agent. `release-coordinator` — planned since v0.24.0 as the judgment layer that operates atop the mechanical release floor — activates as a live contract at `agents/release-coordinator.md`. The role owns the release arc from `/release` invocation through Gate 5 verification, stopping at successful npm publish + GitHub Release green: the full execution flow (release-branch → PR → tag-on-merged-main → five-channel post-publish verification, including the scripted manifest alignment and the hold path's second terminal state), Gate-5 failure routing with per-failure-mode diagnosis and incident write-up, trunk-state attestation post-publish, release-order coordination across parallel framework sessions, override-token justification routing (honor-but-surface — the mechanical layer still enforces the token's shape), and the hold-time `KNOWN_ORPHANS` annotation codified in v0.36.0 (prepared atomically with a deliberate hold, gated on the carry-forward integrity check). Everything past npm-publish-success, and everything inside a consumer/adopter repo, is explicitly out of its lane — that boundary is reserved for a future adoption-coordinator sibling.

The activation was earned, not speculative. The stub's four-part activation contract was satisfied in full: the mechanical floor the role operates within (tag-ancestry guard, the PR-based release flow, commit-time version-gate invariants, the five-channel parity audit) was dogfooded across 18 releases since v0.24.0 with zero operator-side ambiguity about who owns the coordination decisions, and an independent Critic production-readiness pass on the full contract returned PRODUCTION-READY with zero blocking findings — its warnings were adopted as the promoted file's authoring checklist. The governance handoff fires with the activation: `KNOWN_ORPHANS` appends are now contractually the release-coordinator's to prepare (each append remains user-approved per entry), Org Designer retains the map-governance policy itself (the release-coordinator executes the policy but does not amend it), and the executive-assistant's contract is rewritten to surface-and-route the parity signal, never mutate the map. The versioning protocol's deliberate-hold posture (§4.6) now names the release-coordinator as the hold-time annotation owner.

The promotion shape is deliberately additive (Shape A′): the original planned stub is retained in place at `agents/_planned/release-coordinator.md` with a PROMOTED marker and a pointer to the live contract, rather than being renamed into `_archive/` — a rename under a versioned directory would force a MAJOR bump for what is functionally a pure additive activation, misleading adopters into expecting a breaking change. The in-place marker preserves the archive doctrine's actual goal (a reader immediately sees the file is a historical artifact and can find the live one); a proper doctrine carve-out for future stub promotions is filed as a follow-up. Framework MINOR; additive — the consumer-visible surface gains an agent; nothing removed, renamed, or narrowed; adopters at v0.36.0 continue unchanged. The release also restores the `[0.29.0]`/`[0.29.1]` CHANGELOG sections lost in a 2026-06-02 full-sync regeneration, recovered byte-identical from git history.

Cross-reference: `CHANGELOG.md` v0.37.0 entry; `agents/release-coordinator.md` (the live contract); `agents/_planned/release-coordinator.md` (the retained PROMOTED stub).

## 2026-06-02 — Framework v0.31.0 — Deploy neutrality: framework-sync commits never redeploy a consumer environment

Scaffold-ships a `vercel.json` `ignoreCommand` so a framework-sync commit (per the sync-tapagents-protocol §3 fingerprint) is deploy-neutral on every consumer environment. The `sync-tapagents → main` promotion and the `main → dev` back-merge each push a deploy branch; on `main` a sync-rebuild is merely wasteful, but on `dev`/QA it is dangerous because the back-merge can redeploy in-flight, unpromoted work. The committed `ignoreCommand` asks "did anything outside the framework-scaffold paths change?" — exit 0 skips the deploy, non-zero builds — so pure-scaffold promotions never rebuild the app, while a framework dependency bump (which changes `package.json`, deliberately excluded from the skip set) still verifies on the isolated `sync-tapagents` preview. The mechanism is the deploy-time complement to the existing branch-isolation discipline (Layers A–E): the protocol gains §4.5 and a sixth, scaffold-shipped Layer F; the Tier 2 deployment template gains a scaffold-time install step; the handoff-protocol mechanical checklist gains a verification item. Additive — no existing capability removed; existing consumers adopt it the next time their deployment agent runs or via a one-line surgical commit.

Cross-reference: `CHANGELOG.md` v0.31.0 entry.

## 2026-06-02 — Framework v0.30.2 — Private-data hook: runtime-derive operator home-path (no baked literal)

A patch hardening of the framework's private-data write-guard. The hook exists to keep real private identifiers — project names, infra hosts, operator machine paths — out of the public mirror, yet it was itself carrying the operator's home path as a hardcoded string (used to pick the right rule out of its detection map). A guard against leaking private data should not ship a private datum of its own. This release replaces that hardcoded path with a runtime derivation from the operator's home directory and the hook's own file location, so the published hook contains no operator path at all while still detecting and blocking that path when someone tries to write it into a file that would propagate publicly. Detection behavior is unchanged where it matters (the framework authoring root), and the guard continues to stand down harmlessly in downstream adopter checkouts, exactly as before. Because the hook now holds only the public, intentionally-shipped strings, it was also taken off the two "skip me, I carry detection patterns by construction" lists — it is now checked by the no-re-leak gate like any other file and passes on its own merits.

Cross-reference: `CHANGELOG.md` v0.30.2 entry.

## 2026-06-02 — Framework v0.30.1 — Gate 5 §4.5 Invariant-2: filter npm `!`-negation `files[]` entries

A patch fix to the release machinery. The Gate 5 §4.5 "tarball completeness" check — the safeguard that confirms a published npm tarball actually contains every path the package declares — was reading the package's `files` list literally and checking each entry for presence in the tarball. But that list mixes two kinds of entries: things to include, and npm negation patterns that *exclude* paths (build caches, compiled-Python artifacts, a docs subtree). The exclusions are never in the tarball by design, so checking them for presence guaranteed a "missing files" failure on every release that carried them. The check was effectively failing healthy releases on its own bug.

The cost was real but contained: the independent post-publish verification workflow false-failed three consecutive releases whose tarballs were in fact complete, and dutifully auto-filed an incident issue for each one. Notably, that auto-filing behaved exactly as intended — the failure-to-incident path was sound; only the trigger was wrong — which means a genuine tarball regression would still have been caught and reported. The fix filters the negation entries out before the presence check, in both the operator-side release command (the published surface that makes this a framework PATCH) and the independent CI verification workflow (release-time machinery, not shipped). The corrected check was validated against the actual published v0.30.0 tarball — it passes on the seventeen real inclusion entries and still fails the old form on exactly the four negation entries — and runs green on this very release as its own proof. No part of the team changed; no command surface, authority, or output contract moved. This is a framework PATCH per `versioning-protocol.md §3.1`.

Cross-reference: `CHANGELOG.md` v0.30.1 entry.

## 2026-06-02 — Framework v0.30.0 — Private-data-safe publish pipeline: mechanical genericizer + no-re-leak guardrails

The framework publishes through a public npm mirror, so any real private identifier authored into a framework file — a project codename, an infra hostname, an operator path — would egress to the registry. A manual privacy sweep had removed a batch of these by hand, but a hand sweep is fragile: the very next sync that carried raw content would re-leak it. This release makes the prevention mechanical. A single genericizer map is now the source of truth for the known private-identifier classes; a sync-time lint aborts the publish if any known codename survives into the proposed output; a no-re-leak gate (`npm run verify-genericize`) dry-runs the sync and greps the result before any real apply; and a new PreToolUse hook blocks an author from ever writing a real private identifier into a synced framework file in the first place. The doctrine layer is equally explicit: author clean, never rely on the safety net — the net only knows the identifiers already in its map, so a brand-new identifier class would sail through every automated layer until someone adds it.

This release also closes the one residual the automated grep could not see. The published tarball carries a mirror-native CLI tree that the genericizer never processes (it exists only in the mirror, not at the authoring root) and whose files use an extension the gate did not scan. A bare project-codename sat in a CLI source comment there. The fix scrubs the comment to a placeholder and extends the no-re-leak gate to grade the whole published-tarball surface — mirror-native trees and the additional file extensions — not just the synced subset, so this leak class cannot recur. Pre-existing low-severity historical identifiers in older changelog entries are accepted as-is per operator decision; no credentials were ever at stake.

Cross-reference: `CHANGELOG.md` v0.30.0 entry.

## 2026-06-02 — Framework v0.29.1 — CLI version-lag fix: `tapagents --version` tracks the published version

A patch follow-up to the v0.29.0 `tapagents` CLI. The CLI that shipped in v0.29.0 reported its version from a hardcoded string literal that had been left at `0.28.0` — so the published tool answered `tapagents --version` with `0.28.0`, one release behind itself, and the device-flow telemetry client label likewise announced the stale version. The bug was cosmetic-but-misleading: the version a tool reports is exactly the kind of fact people and audit logs trust to be true, and a hardcoded literal is structurally guaranteed to rot every time the package version moves.

The fix removes the failure mode rather than just correcting the number. Both the CLI's reported version and the device-flow client label now read the `version` field from the package's own `package.json` at runtime, resolved relative to the module's own location so the read works regardless of the working directory. The read is fail-soft — if the file were ever unreadable it falls back to a harmless literal and never throws, so `--version` always answers — and the two test assertions that previously pinned the literal now assert against the live `package.json` version, so a future re-hardcoding would fail the suite instead of silently shipping. This is a framework PATCH per `versioning-protocol.md §3.1`: nothing was added or removed from the team, no command surface changed, and the only observable difference is that the CLI now tells the truth about which version it is. The change is mirror-native — the CLI exists only in the publish mirror — so no internal→public sync was involved. A bundled verify-guard that would catch this lag class at release time is deferred to a separate follow-on.

Cross-reference: `CHANGELOG.md` v0.29.1 entry.

## 2026-06-02 — Framework v0.29.0 — `tapagents login` CLI bin: one-time device-flow onboarding (M-D slice U2)

The framework package grows its first command-line tool. Through v0.27.0 the package shipped only library content — agents, commands, protocols, templates, hooks, and a programmatic export — but never an executable. v0.29.0 adds the package's first `bin`: a `tapagents` CLI whose headline subcommand, `tapagents login`, is the one-time, `gh auth login`-style step that connects a machine to Tap Agents Live telemetry. It directly answers the standing operator requirement that clients should not have to run any command to keep syncing telemetry to the dashboard — after a single login there is no further command, no restart, ever.

The mechanism is the OAuth 2.0 Device Authorization Grant (RFC 8628), the same shape `gh` and other CLIs use when the tool can't host a local redirect. `tapagents login` asks the server for a device code and a short human-readable code, prints "open this URL and enter this code," and then quietly polls until the person has signed in and approved in their browser. It honors the full device-flow vocabulary — keep waiting while approval is pending, back off when told to slow down, and stop cleanly with a clear message on denial, expiry, or an already-used code — plus a defensive client-side timeout so it never polls forever even if the server goes quiet. On approval the CLI writes the credential file that the already-live v0.27.0 read-path consumes on its very next flush, so telemetry begins mirroring with no export and no relaunch.

The security-sensitive part is the credential write, and it is built to the frozen contract exactly: the config directory is created owner-only (0700), and the file is written through a same-directory temporary file that is owner-only (0600) from the moment it is created and then atomically renamed into place, so a reader can never observe a partial or world-readable credential. The file carries the token and ingest URL the telemetry hook reads, plus human-auditable provenance (the connected account, an issue timestamp, and a machine label) that the reader ignores. The round-trip was verified against the actual Python reader, not merely asserted: a file written by the CLI resolves to the exact same token and ingest URL the reader pulls.

A few deliberate design calls. The bin points at a committed raw script with a Node shebang, mirroring how the Python hooks ship as raw runnable files, so it runs straight from the published tarball without depending on the generated `dist/` bundle (which the build wipes and regenerates each run). Token listing and revocation route the user to the dashboard rather than calling with the machine token, because issuance and revocation are deliberately browser-session-only — a leaked machine token must not be able to revoke its siblings. Local logout alone fully stops emission; server-side revocation is the rarer lost-machine case and opens the browser. Everything is Pool A: plain HTTPS to the dashboard via Node's standard library, no Anthropic SDK and no model call anywhere in the flow.

Adding a first `bin` is a net-new export surface with nothing removed, so this is a framework MINOR per `versioning-protocol.md §3.2`. Coverage is 26 cases on Node's built-in test runner against a mock server implementing the contract — happy path, every pending/error/rate-limit branch, the timeout ceiling, the file perms and exact shape and round-trip keys, and the subcommand behaviors — with zero new dependencies and a fully deterministic fake clock. This release bundles the public-mirror privacy sweep alongside the CLI; the sweep is doc-hygiene only and carries no team-shape change, so it has no separate narrative entry here (see the v0.29.0 `CHANGELOG.md` entry for its technical detail).

One operational nuance ships with this release. The CLI's companion endpoints — a separate app-side unit (a device-codes table, three endpoints, and a browser approve page) — are live on the dev environment and ops-security-approved, and the multi-tenant isolation gate that had to close before any client-facing exposure is now closed. Prod activation, however, is a separate operator endpoint-promotion that has not happened yet: until it does, `tapagents login` against the default (prod) host returns a clean error rather than calling a live endpoint. The CLI therefore ships dormant-but-graceful on prod, with explicit operator sign-off — a published tool whose login path lights up the moment the endpoints are promoted, with no further framework release required. The dev-side end-to-end round-trip was deliberately deferred to prod-validation at go-live (preview-environment protection blocked the dev CLI test), again an explicit operator call. Adoption flows through the dedicated `sync-tapagents` branch, not directly through dev.

Cross-reference: `CHANGELOG.md` v0.29.0 entry; `workspace/_global/tapagents-login-device-auth-contract-2026-06-02.md` (the frozen wire contract this implements).

## 2026-05-29 — Framework v0.26.0 — Session work-output telemetry: product files + committed LOC at seal (M-D slice B)

The third M-D telemetry slice lands. Where v0.25.0 mirrored events the framework already produced, this slice captures something new: what a session actually produced. At session seal the team now emits a `session-work-output` / `summary` / `seal` event carrying the product files touched and the lines-of-code committed in that session — the data the dashboard's per-session view needs to show "files done / LOC done."

The single most important design call is that this is a separate telemetry stream, not a widening of the cross-cutting collision manifest. That manifest exists to stop concurrent sessions from colliding on shared framework files, and its deliberate blindness to product source code is what keeps it scannable. "What did this session produce" is a different question with a different reader — the dashboard user, not a sibling session — so it gets its own stream and the collision matcher is left untouched.

LOC is designed around honesty. The only number the framework stands behind is the committed-to-main figure, computed at seal by a new `--numstat` git helper that mirrors the existing committed-files helper one-for-one (same repo context, same `main` branch, same since-the-session-started window). A mid-session or uncommitted figure would be provisional — a later edit to the same region double-counts — so the seal event never emits one; the provisional flag is reserved at `false` so a future live-ticking enhancement stays schema-compatible. Where there is no git repo or no `main` (for instance an orchestrator session at the framework root), the figure is unmeasurable and nothing is emitted at all — the stream only carries data for sessions running inside a product repo. Re-emits across resumes are idempotent: the hook only re-emits when genuinely new commits have landed.

The change is additive and backwards-compatible (`telemetry-events.md §6`): a new source/type/subtype triple flipped from reserved to live, new payload keys, no existing triple mutated, no schema column added (everything rides the existing JSON payload). A new wired-hook behavior emitting a newly-live reserved triple makes the release a framework MINOR per `versioning-protocol.md §3.2`. The work-output POST is an app→app telemetry mirror (Pool A, not an LLM call). The schema spec also records the dashboard render contract for the follow-on display slice, so that surface can be built later without re-deriving field shapes — the render itself is not built here. Coverage: `scripts/test-session-work-output.py` (16 stdlib unittest cases — LOC computation, committed-vs-provisional, dual-emit, no-emit-when-no-work, idempotency, truncation, lifecycle-unaffected). No devDeps added.

Cross-reference: `CHANGELOG.md` v0.26.0 entry; `workspace/_global/m-d-track-scope-sequencing-2026-05-28.md` (Addendum Rev 2, Slice B).

## 2026-05-29 — Framework v0.25.0 — Telemetry cloud-mirror: phase-transitions (M-D slice S1) + session lifecycle (M-D slice A)

The telemetry half of the "wrap up telemetry + dashboard features" push lands in one release, bundling two same-theme M-D track slices because the version was still unpublished when the second slice arrived.

Slice S1 adds a new Stop hook, `stop-phase-transition.py`, that emits the `state-machine` / `transition` / `<from>-<to>` event triple reserved in the frozen telemetry schema (`telemetry-events.md §2.4`) — the live feed the dashboard's 12-step phase track consumes. It diffs each project's current phase against a private sidecar snapshot and emits one transition per genuine phase change (silent on first-seen bootstrap and on no-change; reversions and side-state moves are legitimate transitions). It introduced the dual-emit pattern: a local `emit_event()` (source of truth) followed by a best-effort cloud-mirror `emit_event_http()` (fail-open, a no-op without `TAPAGENTS_LIVE_TOKEN`). Dispatch-outcome — the other §2.4-reserved triple — stays deferred to slice S1b because a Stop hook has no reliable non-heuristic per-dispatch verdict signal; shipping it would require transcript-scraping guesswork.

Slice A extends that same dual-emit pattern to the three existing BL-055 session-tracking hooks — `session-tracking-register.py` (SessionStart), `session-tracking-files.py` (PreToolUse), `session-tracking-seal.py` (Stop). Every existing `emit_event()` call now has a sibling `emit_event_http()` cloud mirror: register × 3 (no-workspace / resume / fresh-stub), files × 1 (cross-cutting file-touch, preserving subagent attribution), seal × 4 (noop / auto-sealed / partial-seal / left-in-progress). The local emits are unchanged — this is purely additive. No new schema surface: these are existing `fire`-type events, newly replicated to the cloud feed. Consumers who do not set `TAPAGENTS_LIVE_TOKEN` see no behavior change; the local `events.jsonl` remains the source of truth in every case. The session-lifecycle POST is an app→app telemetry mirror (Pool A, not an LLM call).

Both slices are additive and backwards-compatible (`telemetry-events.md §6`): for S1 a new producer of an already-reserved triple, for slice A a cloud replica of events the hooks already emitted locally. The new wired hook (S1) makes the release a framework MINOR per `versioning-protocol.md §3.2`; slice A's added cloud-mirror calls are PATCH-grade on their own and are absorbed into the MINOR. Coverage: `scripts/test-phase-transition.py` (17 stdlib unittest cases) for S1; `scripts/test-session-tracking-http.py` (13 stdlib unittest cases) for slice A. No devDeps added.

Cross-reference: `CHANGELOG.md` v0.25.0 entry; `workspace/_global/m-d-track-scope-sequencing-2026-05-28.md` (M-D track scope/sequencing).

## 2026-05-19 — Framework v0.24.1 — Layer A override-regex defense-in-depth (always-compute ancestry + trailer-only placement)

Closes a defect that v0.24.0's own dogfood publish surfaced. The trunk-discipline override mechanism shipped in v0.24.0 carried a regex that searched the entire commit message body for the override token. The v0.24.0 release commit happened to document the token form inline in its CHANGELOG body (where the feature was being introduced); the regex matched the placeholder text, took the early-exit "override accepted" path, and never executed the hard `git merge-base --is-ancestor` check that Layer A exists to enforce. The publish was incidentally ancestrally correct (tag = main HEAD), so no operational harm, but the canary did not actually exercise the canary's intended check. Any future release similarly documenting the override syntax in its body would have re-triggered the same silent bypass.

This patch ships two complementary tightenings, applied symmetrically in CI (.github/workflows/publish.yml Layer A) and in the operator hook (hooks/version-gate.py invariant 4). First, the ancestry check ALWAYS runs — override presence no longer short-circuits the check, only its failure verdict. Override extraction and ancestry computation run independently; the joint outcome decides between silent pass / "override unused" warning / "override allows publish with reason" warning / hard error. Prose false-positives surface as informational warnings, not silent bypasses. Second, override token recognition is restricted to the commit message's TRAILER BLOCK — the lines after the last blank line, mirroring how Co-authored-by trailers are recognized. The line pattern is whole-line anchored; the reason character class rejects angle brackets at the regex level; a placeholder-reason denylist rejects bare "reason"/"todo"/"..." case-insensitively. Prose mentions in the commit body are now treated as documentation, not as operator-issued overrides.

Both fixes verified against the literal v0.24.0 release commit message: under the new code, the v0.24.0 self-bypass does NOT occur (the trailer block is the Co-authored-by line; the body prose mentions are excluded). Legitimate trailer-placed overrides for genuine hotfix scenarios continue to work unchanged.

The protocol prose at versioning-protocol.md §4.2 invariant 4 is amended in-place to document the trailer-only placement constraint and the placeholder-reason rejection. The override regex no longer mirrors hooks/sync-discipline-gate.py OVERRIDE_PATTERN shape exactly — the two patterns diverge here because the sync-discipline-gate token uses a different shape and the trailer-only restriction is specific to the trunk-discipline override.

Discipline note for future CHANGELOG authors: refer to the override mechanism by name (the trunk-discipline override token; `[trunk-discipline-override:]` shape without inline placeholder) rather than embedding the literal placeholder string `[trunk-discipline-override: <placeholder>]` inline in CHANGELOG prose. Embedding the literal form was exactly what triggered the v0.24.0 self-bypass. After v0.24.1 the trailer restriction means even an accidental prose mention won't fire — but treating this as discipline is forward-compatible across consumers running older pre-v0.24.1 versions of the CI workflow.

Release-coordinator agent stays in agents/_planned/ — no activation in v0.24.1 per v0.24.0 W5 default. Activation criteria from the stub call for "one post-v0.24.0 release under the new Layer B flow without operator-side ambiguity"; v0.24.1 IS that release, but the remaining criteria (Critic clears stub's full contract + user approves) remain. Activation queued for a later release.

Cross-reference: `CHANGELOG.md` v0.24.1 entry; `workspace/_global/v0.24.0-ship-reportback-2026-05-19.md` §7 anomaly 1 (incident report); `workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md` (architect+impl tech-strategy spec); `workspace/_global/v0.24.1-impl-reportback-2026-05-19.md` (impl reportback).

---

## 2026-05-19 — Framework v0.24.0 — Trunk-discipline mechanical floor + emit_event_http() cloud-mirror helper

Closes the trunk-drift incident class with a mechanical floor. Two recurrences in six days (v0.15.0 on 2026-05-13 — tag-never-pushed-to-origin; v0.23.0 on 2026-05-19 — tag-pushed-from-feature-branch-and-main-never-back-merged) shared a root cause: the `/release` flow trusted the operator to back-merge to main, with no mechanical verification at the only authoritative pre-publish point. The memory-note discipline (feedback_trunk_must_reflect_published_state.md, codified 2026-05-13) was a soft layer that kept failing.

This release codifies the discipline as Layer A + Layer B. Layer A is a new step in tap-agents/.github/workflows/publish.yml that resolves the tagged commit SHA, fetches origin/main, and verifies ancestry via `git merge-base --is-ancestor` before npm publish runs. Failure short-circuits the workflow non-zero before any registry mutation. Override token `[trunk-discipline-override: <non-empty reason>]` in the release commit message preserves the prior workflow for genuine hotfix scenarios — the audit trail is the cost. Layer A also includes a duplicate-fork-pattern detector (the v0.23.0 incident shape: main HEAD has tree-identical content under a different SHA) with a distinct remediation hint covering both linear-merge and tag-move recovery paths.

Layer B restructures commands/release.md from a single-step tag-and-push into a five-step release-branch flow (5.5 → 6 → 7 → 8 → 9). Step 5.5 asserts content exists to release (guards against empty release branches). Step 6 creates release/v<version> from origin/main with explicit Pattern A/B guidance for staging the source bundle (already-on-main vs cherry-pick-from-feature-branch). Step 7 opens a PR to main and merges via --squash --delete-branch (squashed-merge means main HEAD is the release commit; the subsequent grep check works correctly). Step 8 tags the merged-main HEAD and pushes the tag. Step 9a-9f is the existing Gate 5 verification (formerly Step 6a-6f, renumbered). Layer A passes by construction because the tag is on main by Step 8's design.

hooks/version-gate.py adds invariant 4 — the operator-side ceiling that mirrors Layer A locally. `_check_tag()` refuses git tag operations when the current branch is not main unless the HEAD commit message carries a non-empty `[trunk-discipline-override: <reason>]` token. Override regex shape matches hooks/sync-discipline-gate.py OVERRIDE_PATTERN exactly (standardized across Layer A bash + Layer B python per Critic W4). New `_extract_trunk_override_reason()` helper enforces non-empty-after-strip semantics; `_block_subtype()` gains a `branch-discipline` subtype for telemetry classification.

scripts/version-parity-audit.ts adds a fifth channel (main-ancestry). For every npm-published version, the audit runs `git merge-base --is-ancestor v<v> origin/main`. Versions whose tag is not an ancestor of origin/main surface as `missing from [main-ancestry]`. Layer A's CI gate fires at publish-time; the fifth channel is the portfolio-wide periodic catch for post-publish ancestry breaks (force-push class). Per-version git ops add ~1-1.5s total latency — negligible. Pre-v0.24.0 versions that only fail the fifth channel are dynamically annotated as pre-trunk-discipline-era artifacts (the audit's authority on ancestry starts at v0.24.0).

Release-coordinator agent stub lands at agents/_planned/release-coordinator.md per Org Designer proposal (Option Y staged, post-v0.24.0 activation). Owns /release execution, parallel-session coordination, trunk-state attestation, Gate 5 failure routing, KNOWN_ORPHANS map governance, and override-justification authority — the judgment layer that surrounds the v0.24.0 mechanical floor. Activation criteria documented in the stub: v0.24.0 ships clean AND one post-v0.24.0 release happens under the new Layer B flow without operator-side ambiguity AND Critic clears the stub's full contract AND user approves.

Companion emit_event_http() cloud-mirror helper (carried from Slice 5 of M-D0). Adds an additive sibling to the existing local emit_event() in hooks/_telemetry.py — projects scaffolded against this framework can ship local agent telemetry to a configurable cloud ingest endpoint without affecting the local audit trail. Configurable via TAPAGENTS_LIVE_TOKEN + TAPAGENTS_LIVE_INGEST_URL; in-process batching with 20-event size / 5-second time / atexit drain triggers; fail-open on every code path. Pure stdlib (urllib.request); zero new runtime dependencies.

Critic adversarial review on the trunk-discipline tech-strategy returned CLEAR-WITH-REVISIONS (5 warnings + 4 FYIs); all folded into the implementation per the brief (W1 Step 5.5 guard; W2 `git rev-parse "...^{commit}"`; W3 drop --depth=50; W4 standardized override regex; W5 stub-in-v0.24.0 path; F1 explicit source-bundle staging guidance; F2 use --squash). W6 (duplicate-fork remediation in Layer A error message) added during impl per the brief's post-Critic discovery.

Memory note `feedback_trunk_must_reflect_published_state.md` (the soft discipline) is now annotated as historical reference — the mechanical floor in v0.24.0 is authoritative.

Cross-reference: `CHANGELOG.md` v0.24.0 entry; `workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md` (architect spec); `workspace/_global/critic-trunk-discipline-2026-05-19.md` (Critic CLEAR-WITH-REVISIONS); `workspace/_global/release-coordinator-proposal-2026-05-19.md` (Org Designer Option Y staged).

---

## 2026-05-13 — Framework v0.19.0 — Gate 5 defense-in-depth: verify-publish.yml + version-parity-audit

Completes the Gate 5 amendment (started v0.18.0) by adding the deferred defense-in-depth layer. tap-agents/.github/workflows/verify-publish.yml fires on publish.yml workflow_run completion and re-verifies all three §4.5 invariants from a cold npm pull — independent of publish.yml's own attestation. scripts/version-parity-audit.ts audits four version channels (local tags / remote tags / npm versions / GitHub Releases) for divergence; EA invokes daily via `npm run audit:version-parity` and surfaces unknown divergence as P1 in the daily briefing.

v0.18.0's operator-side Gate 5 remains primary. v0.19.0 adds independent CI verification (catches publish-workflow-self-attestation bias) + periodic safety-net (catches anything operator-side polling missed at release time).

Critic adversarial review APPROVED with high confidence — Critic paste-tested all three load-bearing bash blocks in verify-publish.yml against the live tap-agents/v0.18.0 published tarball + GitHub Release body, and empirically ran the audit script (PASS, 2 known annotations: v0.8.3 + v0.15.0).

The v0.15.0 orphan that originally motivated Gate 5 is now machine-detectable by both new components: verify-publish.yml would have surfaced the missing tag on publish-day, and version-parity-audit.ts surfaces on EA's daily sweep.

Cross-reference: CHANGELOG.md v0.19.0 entry; workspace/_global/org-designer-proposals/20260512-2330-gate-5-post-publish-verification.md (now annotated COMPLETED 2026-05-13).

## 2026-05-13 — Framework v0.18.0 — Gate 5: post-publish verification + /release flow tightening

Closes the publish-side gap in the version-honesty enforcement chain. Adds §4.5 (operator-side post-publish artifact verification covering registry presence, tarball completeness, GitHub Release parity) and §4.6 (cross-channel parity audit, marked [PARTIAL — full implementation deferred to v0.19.0]). `commands/release.md` Step 6 expanded from single `git push origin v<new>` into a six-sub-step verification flow (6a-6f) that operators run before declaring a release done.

Triggered by user observation 2026-05-12 of v0.15.0 missing from npm registry. Empirically validated 2026-05-13 by manual dogfood shipping tap-agents/v0.17.0 to npm (42s tag-push to publish-success; npm view returned 0.17.0 on attempt 1; tarball probe confirmed all four v0.11.0-regression-class directories present).

Critic adversarial review 2026-05-12 → CHANGES-REQUESTED (3 blocking + 6 non-blocking). All blocking resolved (B1 filter correction, B2 heredoc rewrite, B3 structural-pattern reframing across 5 incident classes). Critic pass 2 → CHANGES-REQUESTED on B-2.1 (mechanically broken files-array extraction) + B-2.2 (truncated CHANGELOG). Both resolved. Critic pass 3 → APPROVED.

v0.19.0 will land verify-publish.yml independent CI workflow + scripts/version-parity-audit.* + EA daily-sweep contract update (defense-in-depth on top of operator-side coverage).

Cross-reference: CHANGELOG.md v0.18.0 entry; workspace/_global/org-designer-proposals/20260512-2330-gate-5-post-publish-verification.md (REVISED 2026-05-13 with empirical evidence from Step 1 dogfood + 5-class structural pattern).

---

## 2026-05-13 — Framework v0.17.0 — Auto-adoption producer pipeline (back-sync from tap-agents/)

Reverse-direction sync — producer-pipeline content authored in `tap-agents/` (feature branch `feat/auto-adoption-producer`) shipped to npm as v0.17.0 on 2026-05-13. This commit back-merges the appropriate subset into `.claude/` as the canonical authority. Asymmetric file set per established precedent: `notify-adopters.yml` is publish-pipeline-only (fires on `publish.yml`'s workflow_run completion) and stays in `tap-agents/` exclusively; `scripts/test-changelog-format.ts`, the `version-check.yml` CHANGELOG-format step, and the `test:changelog-format` package script mirror into `.claude/` to validate `.claude/CHANGELOG.md` format. `tsx` was already a devDep at `^4.19.0` in `.claude/package.json`, so the mirror introduced no new dependency.

Coincidence: while this back-sync was queued, the v0.15.0 gap on npm was identified (tagged locally in `tap-agents/` 2026-05-12, never pushed to origin, never published). Functional content is present in v0.16.0 and onwards on npm; `.claude/` itself shipped v0.15.0 cleanly. The Gate 5 amendment (forthcoming as v0.18.0) closes the operator-flow gap that caused the missed tag-push. See `workspace/_global/org-designer-proposals/20260512-2330-gate-5-post-publish-verification.md`.

Cross-reference: `CHANGELOG.md` v0.17.0 entry; `tap-agents/afa41bf` (original producer-pipeline release commit); v0.15.0 orphan narrative will be documented in full at v0.18.0 ship time.

---

## 2026-05-13 — Knowledge Curator stub lands at `_planned/` (continuity-narrative axis)

**Team-shape addition (stub-tier, sibling to active `backlog-curator`).** A new role, **Knowledge Curator**, lands at `agents/_planned/knowledge-curator.md`. Same shape as Backlog Curator (curator-lite, mechanical-then-OD lane discipline, append-only findings file). Distinct axis: Backlog Curator owns mechanical work-item state; Knowledge Curator owns *user-narrative-grade* context — goals + the *why* behind them, decisions made + rationale chain, stakeholders / constraints / deadlines named by the user, glossary of project-introduced terms, and a "story so far" paragraph for cold-resume. The split makes the team's existing curator pattern a two-axis split: mechanical-state curator + narrative-synthesis curator. Both are curator-lite. Both have OD-supervised high-judgment work staying with OD.

**Why a new role rather than extending an existing agent — structural-gap diagnostic.** Five paths were evaluated in the OD proposal §2.1; three were eliminated cleanly; one was accepted on bounded-cost grounds. The headline:

- **Extending EA** was rejected because EA already approaches the >500-line bloat threshold codified in `agents/org-designer.md`, EA's operating principle is *"Brevity is non-negotiable. Read-only on agent artifacts. Summarize, never edit."* — adding narrative-synthesis violates the read-only-on-artifacts principle and adds a fourth output format (briefing / decision-packet / session-close / +knowledge-base). EA's mandate is *surfacing*, not *authoring synthesis*. Different cadence too: EA fires per-event; knowledge curation needs phase-transition + daily sweep. Two different fire models.
- **Extending Backlog Curator** was rejected because backlog-curator is **curator-lite by design** per its founding 2026-05-06 proposal — *"mechanical, not judgmental. You enforce structure (ID uniqueness, mirror parity, count accuracy). You never decide what an item is worth."* That is the *anti-shape* of knowledge curation. Knowledge work is *high-judgment* (which user statements belong in the narrative? which are noise?). Bundling violates the 30-day resize clause that explicitly says *"under-scoped → expand; over-scoped → contract"* — adding a fundamentally different mandate is neither expansion nor contraction; it's role-collapse.
- **Activating the planned `feedback-synthesizer` with broader scope** was rejected because feedback-synthesizer activates on *external* user feedback (reviews, support tickets, social mentions) post-ship; knowledge curation is needed *during* project execution. Different triggers + different inputs (external user feedback vs. internal user-agent conversation) + different output sinks. Forcing one role to do both produces a "feedback-themed knowledge base" that prioritizes external signal over internal narrative — exactly backwards. Both stubs stay distinct.
- **Extending Intake** was rejected because Intake's contract is *interview → brief → handoff*. The agent is **frozen by design** after the brief lands — its own Authority says *"Cannot advance the state machine past `briefed`"* and *"Cannot modify `seed.md` after first capture."* Adding a recurring "update narrative as the project evolves" duty violates Intake's hand-off model. Same anti-shape as merging Designer with UI/UX Reviewer (codified `20260506-1145-ui-ux-reviewer.md`): asking the agent that wrote the spec to also keep critiquing the rendered implementation conflates author and judge. Same here: asking Intake to keep curating the narrative blurs the "Intake owns the briefed-phase artifact, downstream owns derived narrative" line.

The accepted path — new role at `_planned/` stub tier — wins on three grounds: (1) distinct cadence (phase transitions + daily sweep, NOT per-event), (2) distinct sink (single `workspace/<slug>/knowledge-base.md` with six sections in OD-specified order: Goals / Decisions+Rationale / Stakeholders+Constraints+Deadlines / Glossary / Story-so-far / Parked-unresolved), (3) distinct mandate (synthesis over a defined rubric — *"would the user want this recalled in 3 months?"* — same as operator-level MEMORY.md auto-memory). The split lands cleanly: the team's two-axis curator (Backlog Curator + Knowledge Curator) mirrors the four-axis review tier (Critic for plan, QE for runtime functional, Ops/Security for runtime adversarial, UI/UX Reviewer for runtime visual). Each curator/reviewer owns one axis. Each has independent fire conditions. Each has its own append-only memory artifact pattern.

**Why N=1 activation evidence is sufficient.** Same threshold question as the UI/UX Reviewer activation (2026-05-06): mandate-gap vs. frequency-gap. Mapping every active artifact and every active and planned agent against *"who owns user-narrative-grade context for a single project?"* returns empty. That gap does not close on its own as the project ages — it widens. The user-explicit pull substitutes for the 3+-project recurrence trigger per `agents/org-designer.md`. Precedent: `20260506T2330-backlog-reconciliation.md` activated `backlog-curator` on a single-project workspace under the same logic.

**No new hook needed — subscribes to v0.11.0 telemetry.** This is the load-bearing implementation choice. The v0.11.0 telemetry layer already emits structured events for the exact cadence Knowledge Curator needs: phase transitions (`source: conductor, type: phase-transition`), Decision-Packet emissions (`source: ea, type: decision-packet-sent`), and Stop events. The curator subscribes via the same rollup script `python3 .claude/scripts/rollup-metrics.py` that OD uses for weekly trigger sweeps. **No new SessionStop / PostCommit / phase-transition hooks required.** This is a meaningful cost saving — avoids the hook-misdiagnosis class of failures codified in `protocols/hook-misdiagnosis-discipline.md` and the four-branch v0.13.1 hook-coordination class of incident (codified in BL-055 / v0.15.0). Building a hook for a curator that ALREADY has its trigger surface in an emitted event stream would re-introduce the same fragility the v0.11.0 telemetry was designed to retire.

**Phase 0 surface — bounded.** One stub file (`agents/_planned/knowledge-curator.md`, ~150 lines per OD §5; written with charter / triggers / deliverables / integration / activation triggers / permissions / resize clause / cross-references), one template (`templates/knowledge-base.md`, with section-level HTML-comment guidance comments so EA + curator know what each section is for at first-curation-time), one README update (this `_planned/README.md` bump from 9 to 10 stubs + new row in Depth-on-demand specialists table), one entry each in `agent-changelog.md` (this narrative) and `lessons-learned.md`. No CHANGELOG.md stamp this turn — per OD §5 the stub addition waits for the next minor (the stub is a non-breaking addition; the CHANGELOG entry coalesces with the next framework release). No backlog edit this turn — stub creation doesn't add work-items. No live activation — Phase 0 is stub-only. Phase 1 activation triggers are codified in the stub's `activation_trigger` frontmatter and `## Activation Triggers` section; the first-trigger candidate is <project> at ~6 Decision Packets, imminent.

**Authority.** User-explicit pull via `/grow-team` 2026-05-13: *"I want a knowledge base that captures user-narrative-grade context (goals, decisions + why, stakeholders, glossary, story-so-far). Mechanical state lives elsewhere — this is for the connection between framework and user, and is also the product feature for <project> / TapHQ."* OD proposal `20260513T0026-knowledge-curator.md` codifies the role; user approved Phase 0 stub. Phase 1 activation requires a separate OD proposal at trigger time. Phase 2 (TapHQ / <project> product surface that renders the `knowledge-base.md` file) is product-side scope, dispatched separately via `/feature` on `<project>` — decoupled timeline reduces risk.

**Provenance.** OD proposal `workspace/_global/org-designer-proposals/20260513T0026-knowledge-curator.md`. Sibling pattern: `agents/backlog-curator.md` + founding proposal `20260506T2330-backlog-reconciliation.md`. Axis-split pattern precedent: `20260506-1145-ui-ux-reviewer.md` (visual reviewer / Designer seam mitigation). Stub-first activation precedent: `20260505-2330-quality-engineer.md`.

---

## 2026-05-12 — Org Designer ratifies CI-bot authorization path in `destructive-data-ops.md` (v0.16.0)

**What changed.** `protocols/destructive-data-ops.md §4.1` (Authorization sources) and `§8 #6` (sentinel-bound CI scripts carve-out) flipped from `[PROVISIONAL]` to `[Ratified by Org Designer 2026-05-12]`. The amendment, drafted by `db-admin`, opens a third authorization path alongside the two pre-existing operator-typing paths: a named sentinel-bound CI script can perform Tier A/B destructive ops on push-to-branch with the merge commit SHA + author + timestamp recorded as `user_confirmation.verbatim`. Six binding constraints (sentinel-verify, static destructive-pattern guard, atomicity scope, Tier-B-or-lower, branch-ID provenance, audit-log writeback) were already part of the amendment text.

**What Org Designer added (ratification-with-conditions).** Ten C-clauses appended to §4.1 as a binding conditions block. These are not optional addenda — they are part of the ratified carve-out. The most load-bearing:

- **C-3 — Branch-ID probe is a HARD gate (30-day deadline).** The first consumer script treats `NEON_API_TOKEN` as optional, falling back to host-prefix-only check when absent. The ratification makes the API probe mandatory by 2026-06-11; absent token = exit non-zero, no fallback. The 2026-05-06 incident root cause was specifically a CLI flag returning a wrong-routing primary endpoint; a host-prefix check against an operator-supplied label inherits the same trust class (operator labels can themselves be wrong — exactly what `.env.local` comments proved on 2026-05-12). The Neon API call is the only independent verification.
- **C-4 — Branch-protection probe (60-day deadline).** The amendment's merge-commit authorization is forgery-resistant on the audit trail but does not currently verify the GH Actions runner trust surface or branch-protection state on the trigger branch. By 2026-07-11 the script must probe `gh api /repos/{owner}/{repo}/branches/{branch}/protection` and refuse if branch protection is absent.
- **C-7 — Script-hash versioning.** Path-only authorization leaves a "swap the script, keep the name" attack surface. The per-project register must record either file-hash or commit-SHA; runtime hash drift triggers refusal. Closes a gap the original amendment did not address.
- **C-8 — Sunset clause.** Carve-out lapses 2026-11-12 (6 months) unless db-admin + Org Designer jointly re-affirm. Re-affirmation requires zero recorded `bypass-without-authorization`, `refused-script-hash-drift`, or `refused-branch-protection-missing` incidents in the window. Either failure opens a same-day OD review with authority to suspend.
- **C-9 — Monthly Org Designer audit lane.** CI-bot path is included in the recurring framework-contract-discipline / project-leakage audit per `protocols/framework-contract-discipline.md §4`. The audit checks named-scripts list growth (any uncontrolled growth = BLEED-BLOCKING), guard-refusal frequency, branch-ID probe mismatches.
- **C-10 — No expansion without re-ratification.** Carve-out is authorized for additive Drizzle migrations on Tier B Preview only. Index rebuilds, data backfills, archival deletes, dev teardowns, etc. require a new ratification cycle.

**Why ratify rather than reject or restructure.** The amendment is structurally correct. The merge-to-branch event IS a stronger authorization signal than a chat affirmative for repetitive low-risk additive migrations — the migration content was reviewed in the PR diff before merge, the commit SHA is forgery-resistant compared to a free-text chat message, and the GH Actions runner's environment is reproducible. The six pre-existing constraints (sentinel-verify, guard, atomicity, Tier-B-floor, branch-ID probe, audit writeback) are the right primitives. Rejection would push the project toward Option 2 of the BL-056 scope (Vercel build-step `npm run db:push`) which directly violates §8 #6 by design. Restructure-to-operator-only (Option B of the original 2026-05-06 db-admin ratification) is the strictest posture but reproduces the second-occurrence-in-two-days failure pattern: human latency is the failure surface this amendment is closing.

**Why ratify-with-conditions rather than plain ratify.** Three risk surfaces in the as-shipped amendment that needed binding mitigation, not just "noted in passing":

1. The `NEON_API_TOKEN` fallback (host-prefix only) is the same trust class as the 2026-05-06 incident's root cause. The amendment did not require the token; the script downgrades silently when absent. Without C-3's 30-day deadline, the carve-out could ship to production with the very weakness the original incident hardened against.
2. Path-only script authorization leaves an attack surface that the amendment's "named in the register" language does not close. C-7 adds the hash binding.
3. The "joint review process to add a new script" language is correct in spirit but undefined in operational terms. C-1 makes the register-growth gate explicit (register entry with absolute path + tier + branches + proposal-citation; running without an entry = P0 ops-security finding).

**Team-shape recommendation: no new role needed.** This delegation is mechanical (six constraints + ten conditions, all enforceable in script and audit), not human-judgment. A `ci-ops` specialist would weaken the chokepoint — db-admin remains the canonical owner of the protocol; the CI-bot is a delegated executor of db-admin's verification primitive, bound by the protocol db-admin already owns. The four-pass review chain (db-admin authors protocol amendment → org-designer ratifies → ops-security reviews secret surface → critic reviews implementation) is the right cardinality for this surface. Adding `ci-ops` would conflate "owns the protocol" with "owns the bot that defers to the protocol" — wrong cut.

**Pattern recurrence note (post-ratification).** This is the second Org Designer ratification of a doctrinal artifact in the destructive-ops surface (first was the 2026-05-06 db-admin retroactive ratification). Both ratifications added conditions blocks; both surfaced project-leakage and process-rule findings. The pattern is now clear: db-admin's protocol-authoring cadence runs ahead of the team-flow protocol's proposal-review-ratify cycle when incidents are in flight. Process Rule 2 (same-day-incident exception with `[PROVISIONAL]` marker) from the 2026-05-06 ratification IS working — this amendment shipped with the marker and went through Org Designer review on the same-day target. The discipline held.

Cross-reference: `CHANGELOG.md` v0.16.0 entry.

## 2026-05-12 — BL-055: session-tracking goes from manual to default (v0.15.0)

**Framework discipline shift.** The May 6 `session-coordination-protocol.md` Rule 1 required every cross-cutting session to write a YAML block to `active-sessions.md` and seal it manually. The premise was honest discipline. The empirical result: six days passed with zero new entries while four concurrent feature branches collided on the v0.13.1 slot and two parallel sessions independently dispatched architect to fix the same backlog item (BL-049 → BL-051 Path A reconciliation). Manual discipline failed not because operators were lazy but because the entrance fee was wrong — every cross-cutting session paid an opening cost (write the block) AND a closing cost (remember to seal), and the framework didn't make either cost zero.

**What v0.15.0 changes at the team-shape layer.** Session-tracking becomes default behavior, not opt-in discipline. Three coordinated Claude Code hooks materialize, mutate, and seal the manifest entries automatically:

1. **SessionStart writes a stub** the moment a session opens — no operator action. The stub is intentionally minimal (`scope: <auto — pending first cross-cutting edit>`, empty `files_in_flight: []`) because it might never become a "real" session — many sessions read-only browse, never touch cross-cutting files. A stub costs ~1ms; the cost of NOT having it is the BL-055-causing class of incident.

2. **PreToolUse upgrades the stub on the FIRST cross-cutting edit.** The protocol's scope list (memory, agent contracts, protocols, templates, CHANGELOG, backlog, decision packets) is the gate. A cross-cutting edit appends the file to `files_in_flight` and replaces the `-pending-<hash>` suffix with a scope label (e.g., `2026-05-12T15-22-protocol`). Subsequent edits accrete files in set-semantics. Non-cross-cutting edits stay invisible to the manifest — the signal-to-noise ratio stays high.

3. **Stop seals against `git log main`.** The hook reads the sidecar, asks "did the claimed files ship?", and writes one of four terminal states: `sealed` (everything merged), `partial` (some merged, some not), `in-progress` (none merged — session may resume), `noop` (no cross-cutting work happened). The `completion_note` carries the merge SHA + the merged-file count, matching the existing `<project>/scripts/promote-to-prod.sh` auto-seal shape (the two enforcement paths converge on one manifest schema).

**The subagent-attribution call (the load-bearing design choice).** The hardest question was how a PreToolUse fired inside a subagent dispatch finds the parent's manifest entry. Two paths were on the table: (a) env inheritance — SessionStart sets `TAPAGENTS_SESSION_ID`, subagent PreToolUse reads it; or (b) file-based binding — SessionStart writes a sidecar keyed by Claude Code's own `payload.session_id`, subagent PreToolUse looks it up. Empirically (verified during the v0.15.0 architect dispatch this same day): hook scripts are subprocesses; their `os.environ` mutations don't propagate to Claude Code's main process; Claude Code hooks have no `additionalEnv` field. Path (a) is structurally impossible. Path (b) was chosen — and the choice falls out for free because `stop-dispatch-monitor.py` has been relying on `payload.session_id` consistency across orchestrator + subagent contexts since v0.10.0 with no observed drift. The architect's verification step in advance prevented a multi-day debugging arc trying to make path (a) work.

**What this graduates in the protocol.** `protocols/session-coordination-protocol.md §247` flipped from "Future enforcement (hooks)" to "Current enforcement (hooks) — landed v0.15.0". The Rule 1 manual-fallback path stays valid (sessions running outside Claude Code — external editors, command-line agents — can still hand-author entries) but the default path is now hooks-driven. Three Known Limitations enumerated honestly in the protocol: (1) future Claude Code semantics might fragment `payload.session_id` across subagents — forensic-detectable via the auto-emitted HTML-comment sentinels; (2) Stop-hook seal only fires on Stop — abrupt session ends leave `in-progress` entries (the EA stale-session sweep + quarterly cleanup remain the long-tail handlers, unchanged); (3) auto-seal queries `main` only — non-main integration branches won't auto-seal. These aren't future-work TODOs; they're the protocol being honest about what enforcement does and doesn't catch.

**Why this is a MINOR release.** Three new hook scripts + one new shared lib + one new test script + one protocol prose graduation — all strictly additive. No agent contract changes. No agent's authority narrowed. No removed/renamed files. The severity-floor for additions under `hooks/` is MINOR per `versioning-protocol.md §3.2`; the protocol-prose graduation adds enforcement surface that did not previously exist.

**Atomicity of this entry.** Per `protocols/framework-change-discipline.md §9` and `protocols/changelog-protocol.md`, the root `CHANGELOG.md` v0.15.0 entry, this narrative, the three hook script additions, the shared lib, the test harness, the protocol prose edit, the settings.json wirings (both internal + public), the sync-manifest sanitize-list additions, and the version-coordinated bumps in `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` (both trees, byte-identical) all land in a single staged commit before tag `v0.15.0`.

**Authority.** BL-055 P1 Tier 1 filed 2026-05-12 by the curator dispatch; user-confirmed motivation: *"session tracking should be defaulted, and almost always added on session start hook or something."* Implementation dispatched on branch `bl055-session-tracking-hooks` off `main` post-v0.14.0.

**Provenance.** Four-branch v0.13.1 collision incident 2026-05-12. BL-049 → BL-051 Path A reconciliation as the second concrete example. Empirical subagent-env verification 2026-05-12 (architect dispatch) before any code committed. Eight integration-test scenarios passing on the release commit.

---

## 2026-05-11 — Distribution wedge: SemVer protocol + npm pipeline + Claude Code marketplace manifest (v0.8.0)

**Framework structural addition.** The framework becomes a dual-channel distributable: published to the npm registry as `@tapintomymind/tap-agents` (for programmatic consumers — `<project>` will be the first, replacing its `scaffold-source/` mirror) and to the Claude Code plugin marketplace at `tapintomymind/tap-agents` (for end-user `/plugin marketplace add` installs). Both channels read from this canonical repo. One source of truth, two egress paths.

**Why this matters at the team-shape layer.** Before today, the framework had one consumer — the framework operator running it locally — and version drift between `tap-agents` and `<project>/scaffold-source/` was managed by hand-copying. With two real external channels live, the framework's `version` field crosses a threshold from internal-discipline into external-contract. Downstream consumers (`<project>`'s Vercel build, plugin-marketplace users) rely on the number being honest. If a "patch" silently renames an agent, downstream breaks without warning.

**The four-gate enforcement chain.** New `protocols/versioning-protocol.md` codifies the SemVer spec for framework releases. §3 defines severity (PATCH = no consumer-visible change; MINOR = additive backwards-compatible; MAJOR = anything a prior consumer could rely on changing). §7 explicitly overrides the pre-1.0 "anything goes" loophole — the classifier applies as-written regardless of major-zero phase. Honesty wins over convention.

Four enforcement layers, each catching what earlier layers miss:
- **Gate 1 — `/release` slash command.** AI-led release flow. Orchestrator never edits `package.json` `"version"` directly; `commands/release.md` walks through diff classification, version proposal, CHANGELOG draft, atomic commit + tag.
- **Gate 2 — `hooks/version-gate.py` PreToolUse hook.** Mechanical invariants at `git commit` time: atomicity (CHANGELOG must co-land), sequence (legal SemVer successor), severity floor (removals/renames in `agents/`/`commands/`/`protocols/`/`templates/` force MAJOR). Wired into `settings.json` `Write|Edit|Bash` matcher alongside existing `pre-tool-gate.py`.
- **Gate 3 — `.github/workflows/version-check.yml` CI check.** PR gate to `main`. Runs `scripts/build-src/version-check.ts`, which implements the same severity-floor algorithm against `git diff origin/main...HEAD`.
- **Gate 4 — Critic review at release.** Critic's read-list now includes `versioning-protocol.md`; verifies CHANGELOG narrative matches the diff and the bump severity claim.

**The npm publish pipeline.** `package.json` declares `@tapintomymind/tap-agents` as a public scoped package with `exports` surfacing both programmatic API (`dist/index.mjs`) and raw `.md` file paths (`./agents/*`, `./commands/*`, `./protocols/*`, `./templates/*`, `./hooks/*`, `./.claude-plugin/*`). `scripts/build-src/build.ts` (pure Node stdlib + tsx) generates `dist/index.mjs` with inlined agent/command/protocol/template bodies and `dist/index.d.ts` with per-name string literal unions. `scripts/build-src/verify.ts` runs as `prepublishOnly` guard. `.github/workflows/publish.yml` fires on `v*.*.*` tag push — builds, verifies, validates tag/package alignment, publishes to npm with provenance, creates a matching GitHub Release.

**The Claude Code marketplace path.** `.claude-plugin/marketplace.json` + `.claude-plugin/plugin.json` declare a single curated plugin `tapagents` at the framework root (RuFlo's `claude-flow` pattern, intentionally one plugin not a sprawl of forty — narrow scope is the positioning). Marketplace consumers install via `/plugin marketplace add tapintomymind/tap-agents`.

**Relationship to per-agent `prompt_version`.** Per §8 of the new protocol, the per-agent `prompt_version: YYYY-MM-DD-N` fields (introduced in v0.7.8) continue unchanged. They answer a different question — agent-prompt edit cadence read by EA's framework-health briefing. Framework-release SemVer is coarser — the bundle downstream consumers depend on. The two layers coexist: a typo fix to `critic.md` bumps `critic`'s `prompt_version` AND the framework PATCH; a removed `fires_when` trigger bumps `prompt_version` AND the framework MAJOR.

**Authority.** User direction 2026-05-11 in the chat transcript named the file scope ("hooks/commands for SemVer enforcement") and authorized the broader implementation. Per `protocols/framework-change-discipline.md` Rule 1(b), this satisfies the "explicit user direction in current turn" gate. Critic adversarial review will run on the release commit per `versioning-protocol.md` §4.4 before any tag pushes.

**Atomicity of this entry.** The CHANGELOG `[Unreleased]` entry, this narrative, and all 13 added/changed files land in a single staged commit before `/release` cuts v0.8.0.

**Provenance:** Conversation chapter "CLI/marketplace implementation" (2026-05-11). Strategic framing arc: <project> → tapagents marketplace question → RuFlo competitive analysis (`ruvnet/ruflo` reviewed) → decision to take the focused-team positioning + Claude Code marketplace channel over RuFlo's 32-plugin breadth → scaffold-source deduplication requirement → npm package as canonical egress → strict SemVer discipline as the contract that lets the dual channels work.

---

## 2026-05-07 — Framework metrics protocol + agent emit-instructions + UI-discipline gap (v0.7.8)

**Framework structural addition + agent-prompt versioning bootstrap.** Five new protocols landed (framework-metrics, security-scanning-defaults, observability-defaults, agent-input-sanitization, stack-portability-map); two new operator-tier scripts (`scripts/emit-metric.py` + `scripts/rollup-metrics.py`); six agent prompts bumped to first-set `prompt_version: 2026-05-07-1` with metrics-emit instructions (Conductor, Critic, QE, Org-Designer, EA, Intake). New `/feature` slash-command + `templates/feature-brief.md`. New `agents/_planned/test-engineer.md` activation-trigger stub.

**Why this matters at the team-shape layer.** Before today, the framework had no structured event stream — Org Designer's "weekly trigger sweep" had nothing to mine, EA's `/status` had nothing concrete to surface beyond decision-log entries, and Tier 2 projects had no canonical contract for ingesting framework activity. The new `protocols/framework-metrics.md` ties all of that together: every load-bearing agent emits canonical events at canonical hooks; the JSONL is the local source of truth; Tier 2 projects can sync via a documented PG-backed ingest endpoint. Agent-dashboard is the first Tier 2 consumer (its dev branch shipped a complete Tier 2 PG sync + retention cron + silent-failure watchdog the same day).

**Org-discipline incident + proposal.** The session also surfaced a real org-design failure mode: orchestrator (Claude Code) shipped four UI fixes in one <project> session without dispatching `ui-ux-reviewer` or appending to `memory/ui-anti-patterns.md`. User flagged: "I feel like an agent team member should be recognizing this and creating the necessary additional incident tracking." Logged retroactively at `memory/incidents.md` "2026-05-07 — UI-fix dispatch-discipline gap" + `memory/ui-anti-patterns.md` entry #2 + Org Designer formal proposal at `workspace/_global/org-designer-proposal-2026-05-07-ui-discipline.md` (three bundled changes — `ui-ux-reviewer` trigger update for "3+ UI fixes in one session", new `protocols/orchestrator-session-discipline.md`, design-spec tier-treatment table). Awaits user approval per Org Designer's "never acts unilaterally" charter.

**Activation trigger update for the planned Test Engineer.** `agents/_planned/test-engineer.md` lands as a stub with explicit activation contract (fires when feature agents repeatedly fail to write tests at the coding→review gate). Not active today; will activate on accumulated trigger evidence from the new framework-metrics signal stream.

**Atomicity of this entry.** Per `protocols/framework-change-discipline.md §9` (added in this same release), CHANGELOG + agent-changelog entries land atomically with each prompt-version bump. The six agent prompts in this release set their first-ever prompt_version values; this entry records the bump narrative; the root `CHANGELOG.md` v0.7.8 entry records the structural surface.

**Provenance:** Triggered by <project>'s Tier 2 metrics surface design — the dashboard's per-project framework activity panel needed a structured event stream to render. The protocol was the right shape to extract upward into the framework rather than implementing the contract twice. First end-to-end exercise of the protocol shipped same day in <project> `dev`.

---

## 2026-05-07 — End-of-session: BL-034 M1.5 dispatch + Curator reconcile + <project> intake park

**Session close.** Tier 1 session sealed after four operational events — no framework structural changes; no CHANGELOG.md version bump warranted. Narrative recorded here per `protocols/changelog-protocol.md` scope split.

**BL-034 M1.5 dispatched.** A fresh Claude Code session was started in `<project>/` to implement BL-034 Milestone 1.5 — the "Tailor your team" dynamic project creation wizard (2-screen, 6 bucket variant, LLM tailoring Day 1 per PRD rev-5 + scope rev-5 + the approved feature-brief). The Tier 2 conductor session is running autonomously, coordinating W1–W7 of the implementation. This Tier 1 session does NOT own its lifecycle. BL-034 JSON status remains `open` pending the producer session's atomic flip to `in-progress` at impl-start per lane discipline.

**Backlog Curator full reconcile.** Daily sweep ran across all 34 items. One STATUS-DRIFT corrected: BL-032 flipped `open → done` (~3.5h drift after commit 9de4039 which shipped `scripts/check-finder-dupes.mjs` and explicitly stated "Closes BL-032 entirely"). Item counts recomputed: open=20→19, done=10→11. Two carry-over MIRROR-DRIFT findings surfaced (not auto-fixed per lane discipline): BL-034 JSON=open vs. MD=planned (producer session owns flip); BL-012/018/024 still absent from `memory/backlog.md` (OD Option A append authorized per 20260507T0810 proposal, not yet executed). TOP-OF-BACKLOG: BL-028 + BL-017 require user input; BL-030 can be routed to Architect without a user decision.

**EA-style briefing delivered.** Full cross-project status briefed to user: 5 decisions queued, 34-item backlog summary with counts (P0=0 P1=15 P2=14 P3=5; open=19 in-progress=4 done=11), active sessions inventory, project health for <project> (handed-off, Tier 2 in flight) and <project> (briefed, awaiting user approval).

**<project> intake parked.** User elected to defer the <project> brief review ("we'll discuss later"). No state change; `<project>/state.json` remains `briefed` with `blocked_on: user approval of intake-brief.md`. Re-surfaces via normal staleness cadence on next daily sweep.

**Portfolio.json drift noted (pre-existing, non-blocking).** `workspace/_global/portfolio.json` shows `<project>` at phase `planned` (stale since 2026-05-05T07:30) while `state.json` is `handed-off` (entered 2026-05-05T13:50). Pre-existing carry-over; does not affect state-machine gating. OD owns a portfolio.json resync as part of next grooming pass.

## 2026-05-07 — Phase 1 dream-pass capability landing (BL-031)

User approved the BL-031 proposal `Build dream-pass capability for TapAgents memory curation` (per EA Decision Packet at `workspace/_global/decision-packets/20260507-bl-031-dream-pass.md`) with three fork-defaults: weekly Sunday 23:00 UTC cadence + 3-no-op-relax to bi-weekly (Fork 1); default-tier ingest @ 350KB cap (memory + sealed-sessions + portfolio) (Fork 2); legacy in-place stays default for `/consolidate-memory` with `--dream-pass` as opt-in flag (Fork 3). The pattern lifts Anthropic's May 2026 Managed Agents `dreams` feature shape — immutable input → new output memory store; optional review-mode for accept/discard before commit — into the local file-based + Conductor-routed + user-in-loop TapAgents architecture. Pure protocol/skill/contract change; no Managed Agents API dependency.

**Hybrid shape, not a new agent.** The work composes four existing primitives: skill mechanism (extended `consolidate-memory` slash-command body); scheduled-tasks MCP (`mcp__scheduled-tasks__create_scheduled_task` for weekly cron); Org Designer authority over memory-axis decisions (cadence + review); EA Decision Packet (user-touch surface). Per OD proposal §Q1: a new `memory-curator` agent was rejected as over-built — OD already owns memory-axis decisions; one bullet update covers the work. Splitting would have duplicated authority (drift risk) without buying caution. This same single-bullet-update discipline produced the curator-lite Backlog Curator at 2026-05-06.

**New canonical protocol** `protocols/dream-pass.md` codifies: immutable-input invariant (`memory/` never mutated by the pass; output writes only to `memory.next/`); file layout convention (`memory.next/` candidate-store with internal metadata files `_diff.md`, `_instructions.md`, `_provenance.md`; `memory.prev.<ISO-ts>/` post-accept archive at 90-day retention); `MEMORY_ROOT=memory.next/` explicitly forbidden (defeats safety property; agents always read active store); tier'd ingest scope (default-tier 350KB at Phase 1; stretch 1.2MB at Phase 2+; aggressive 2MB at Phase 3+); curation discipline as hard rules not heuristics (axis discipline preserved per `framework-contract-discipline.md §1`; provenance preserved per `memory/README.md §"Provenance required"`; public/private split preserved); `[INVENTED?]` flagging for hallucination defense-in-depth (skill-body annotation + OD diff review + user accept-flow surfacing — patterned on `protocols/destructive-data-ops.md` three-layer enforcement); cadence (weekly Sunday 23:00 UTC = Sunday 19:00 EDT cron `0 19 * * 0`; self-tuning relax via 3-consecutive-no-op trigger); two-layer rollback surface (90-day fast archive + indefinite git history); Phase 1→4 rollout with explicit fail-recovery paths at each phase gate.

**Skill body extension.** `commands/consolidate-memory.md` extends Anthropic's `~/Library/.../skills/consolidate-memory/SKILL.md` (35-line in-place mutator) with two-mode pipeline: legacy mode preserves the original behavior (with TapAgents-shape Phase 3 no-op handling — the original Phase 3 looks for top-level `MEMORY.md` index that TapAgents doesn't have; skill detects absence and emits one-line note + exits without auto-creating, per axis-discipline); dream-pass mode (`--dream-pass`) implements the immutable-input pipeline with defensive preflight (pending-`memory.next/` guard refuses to overwrite; tier-gate guard refuses pre-Phase-2 stretch / pre-Phase-3 aggressive; forbidden-env-var guard refuses `MEMORY_ROOT=memory.next/`). Backward-compat preserved per Fork 3: existing ad-hoc `/consolidate-memory` invocations behave exactly as before; `--dream-pass` is opt-in. The scheduled-task explicitly invokes `--dream-pass` regardless — cadence work happens either way.

**Agent contract diffs.** `agents/org-designer.md` "Authority" section adds dream-pass cadence + review row (OD owns weekly schedule + reviews `_diff.md` before EA Decision Packet; annotates with `approve | approve-with-edits | discard | pause-cadence` recommendation; defers final decision to user; cadence operates alongside not instead of the existing monthly pattern-mining audit; self-blindness mitigation via Phase 2 user `/grow-team` calibration check after week 4); Read-list adds `protocols/dream-pass.md` + `memory.next/_diff.md` + `memory.next/_provenance.md` + latest `memory.prev.<ts>/` archive; Quarterly Review adds dream-pass acceptance-rate tracking (target ≥30% post Phase 2; <20% triggers cadence-relax + curation-discipline retro). `agents/executive-assistant.md` adds Read-list entries for `protocols/dream-pass.md` + `memory.next/` artifacts + `workspace/_global/dream-pass-log.md`; new "Memory health" briefing section (surfaces pending dream-pass with cycle-tier-diff-summary-OD-recommendation; cardinal-zero-rule omit-when-absent; no-op cycles surface as single line + count toward 3-no-op tracker; cadence-relax trigger announcement at N=3); new "Dream-pass Decision Packet" surface format (≤400 words with summary / inputs / top-changes / invented-flag-review / OD-recommendation / artifacts / four-option fork accept-as-proposed / edit-then-accept / discard / pause-cadence). `templates/decision-packet.md` unmodified — variant embeds inline same shape pattern as Ops Decision Packet board-meeting variant.

**Scheduled-tasks integration.** `mcp__scheduled-tasks__create_scheduled_task` registered `weekly-dream-pass` at cron `0 19 * * 0` (the MCP evaluates cron in user's local timezone, not UTC; user is EDT at land time so Sunday 19:00 EDT = Sunday 23:00 UTC — proposal intent preserved). MCP applies a small deterministic dispatch delay; confirmed scheduled "At 07:09 PM, only on Sunday". Task prompt embeds protocol references + preflight discipline + EA-signaling at completion + explicit "do NOT auto-execute the atomic mv accept-flow" guard.

**Filesystem additions** (gitignored). `memory.next/` (transient candidate-store; deleted on accept atomic-mv or discard rm-rf). `memory.prev.<ISO-ts>/` (post-accept archive; 90-day retention). `.gitignore` updated with both patterns + cross-reference to `protocols/dream-pass.md §2` for `MEMORY_ROOT` prohibition.

**Critic adversarial review verdict (no recusal — Critic's contract was not modified).** Pass 1 verdict: REVISE-BEFORE-LAND (0 P0 / 2 P1 / 2 P2 / 8 Notes). One P1 mechanically fixed inline (P1-6 protocol §7 dream-pass-log location hedge dropped in favor of `workspace/_global/dream-pass-log.md` committed across all four implementation references). Pass 2 verdict: LAND (0 P0 / 0 P1 / 0 P2 / 0 Notes; clean on Pass-1 fix). Four Phase-2-retro inputs registered (scheduled-task fail-recovery edge case; stretch-tier phase-gating mechanism; Devil's Advocate steelman 1 mv atomicity multi-mount; steelman 2 cron miss-rate when machine offline) — observation criteria for the dogfood window, not BL-NNN backlog items. Verbatim review at `workspace/_global/critic-review-bl031-phase1-impl.md`. Zero re-raise of proposal-phase Critic findings; clean propagation of all proposal Pass-1+Pass-2 fixes (P0 MEMORY_ROOT-forbidden propagated to skill body + `memory/README.md`; B2 legacy-mode-Phase-3-no-op present; W1 line-count closed at 206 lines within 150-350 budget; W2 Anthropic citation still `[user: ...]` tagged per BL-025 precedent followup-deferred; W3 MCP schema confirmed via successful task creation; W4 Phase-2 fail-recovery present in protocol §9; W5 fork interaction handled in proposal preamble; all 4 FYI addressed; Pass-2 90-day-archive-vs-defect-discovery present in protocol §3 two-layer-rollback).

**Backlog mutation (Curator-mode mechanical recompute per `agents/backlog-curator.md` Algorithm step 3):** BL-031 status `open → in-progress` (Phase 2 dogfood gates closure per BL-025 precedent — Phase 1 lands the protocol/skill/contracts/scheduled-task; Phase 2 is the 4-week observation window with first scheduled fire 2026-05-10 19:00 EDT; closure conditional on acceptance rate ≥30% + zero accepted bad-curation incidents + at least one `--instructions` cycle + user `/grow-team` calibration check after week 4). `item_counts` recomputed: total=31 unchanged; by_status `open: 18→17`, `in-progress: 3→4`; by_priority + by_tier unchanged. Pre-existing 13-item JSON↔MD mirror drift (8 tier1 + 5 tier2; flagged in prior recounts) remains unresolved — NOT introduced by this session, remains Curator next-sweep work.

**Phase 2 dogfood gate (NEW — gates Phase 3):** 4 weekly cycles minimum (extends to 8 weeks if 20-30% acceptance triggers extended observation per OD proposal §4 Phase-2-fail recovery path). User runs `/grow-team` after week 4 to evaluate OD's recommendation calibration. Phase 2 success criteria: (a) 4 weekly cycles complete; (b) acceptance rate ≥30%; (c) zero accepted dream-passes that subsequently surfaced as bad-curation incidents; (d) at least one cycle exercised `--instructions` field. Phase 2 fail-recovery: <20% acceptance triggers OD retro on calibration; revised tuning; relaunch from cycle 1. Bad-curation incident accepted by user (post-accept regret) → Phase 2 hard-fails; rollback via `memory.prev.<ts>/`; OD writes incident entry + follow-up proposal addressing the curation-discipline gap.

**Industry portability framing.** Per `project_team_industry_portability.md` + BL-025 precedent: dream-pass discipline is artifact-shape-agnostic. A marketing-campaign memory store or documentary-curation memory store has the same staleness risk; the protocol generalizes. Validation explicitly deferred to first non-app-dev project per `framework-contract-discipline.md §3` "current-stack-only" annotation pattern.

**Founding team count:** unchanged (9 active + 10 planned). Hybrid-shape work that composes existing primitives; no team-shape change. Per `protocols/framework-contract-discipline.md §1` axis discipline.

**Followup items deferred to Phase 2+** (per proposal followup-list and Critic implementation-review steelman):
- (i) Primary-source URL for Anthropic Dreams pattern (currently `[user: ...]` tagged per BL-025 precedent) captured at next protocol revision pass.
- (ii) Stretch-tier transcript-redaction discipline + per-transcript opt-out flag protocol amendment (Phase 2 entry).
- (iii) Stretch-tier phase-gating machine-readable marker (Phase 2 entry; current implicit-via-protocol-§9 acceptable for Phase 1).
- (iv) Scheduled-task miss-rate tracking when user's machine is offline (Phase 2 retro input).
- (v) `mv` atomicity caveat for multi-mount setups (Phase 2 retro input; Tap's setup is single-machine same-mount).

---

## 2026-05-07 — TapAgents ↔ Managed Agents primitive map doc landed (BL-026)

Architect-as-implementer (session 2026-05-07T01-15) landed `.claude/docs/managed-agents-comparison.md` per BL-026 acceptance — a Tier 1 framework doc codifying the architectural map between TapAgents (local Conductor + roles + state machine + file-based session coordination) and Anthropic's May 2026 Managed Agents announcement (hosted runtime; dreams, outcomes, multiagent orchestration, webhooks, memory). Pre-empts the recurring "should we use Managed Agents for X?" evaluation question.

**Doc structure (~215 lines, single canonical Tier 1 doc):**
- §1 Primitive map — 13-row table mapping each primitive (loop runtime, tool execution, coordination, specialization, state, lifecycle, multi-agent depth, visibility, cost, availability, persistent memory, quality grading, asynchrony, human-in-the-loop) across both architectures.
- §2 Where Managed Agents patterns lift INTO TapAgents — three concrete lifts: (a) Outcomes rubric → BL-025 Phase 1 (already lifted; +8.4-10.1pt task-success delta cited as Anthropic announcement-level claim with `[assumption]` qualifier on citation depth); (b) Dreams → in-flight Org Designer reflective-pass design (`consolidate-memory` skill is the closest existing analogue); (c) iteration-counter pattern → embedded in BL-025 Phase 1 envelope.
- §3 Where hybrid hosting could make sense — three use cases: (a) long-running QE smoke runs in isolated container (overnight, off user's machine); (b) async research agents (`industry-researcher` / `customer-researcher` when activated; activation-gate caveat added per Critic note); (c) sandbox-required ops (untrusted code execution).
- §4 What Managed Agents lacks for TapAgents replacement — seven structural gaps: (4.1) no phase machine; (4.2) no deterministic routing (LLM-driven coordinator vs. Conductor's state-machine); (4.3) no file-based session-coordination protocol; (4.4) no Critic adversarial-review-by-default discipline; (4.5) no `org-designer` continuous team-shape evaluation; (4.6) flat 1-level multiagent depth (vs. arbitrary depth in TapAgents); (4.7) no hard checkpoints / human gates per phase.
- §5 Decision matrix — when to lift a pattern vs. hybrid-host vs. (rejected) replace.
- §6 Re-evaluation triggers — when to re-evaluate this map (Anthropic ships arbitrary-depth multi-agent / deterministic routing / phase-machine primitive; TapAgents activates async-research roles; team hits scaling limit). Owner: Org Designer monthly pattern-mining cadence per `protocols/team-rhythm.md`.
- §7 References — six Anthropic primary sources (announcement blog post + overview / dreams / outcomes / multi-agent / webhooks doc pages) + ten internal TapAgents cross-references.

**Critic adversarial review verdict:** LAND-WITH-FOLLOWUPS (0 P0 / 0 P1 / 1 P2 / 4 Notes). Verbatim review at `workspace/_global/critic-review-bl026-managed-agents-comparison.md`. Devil's Advocate pass surfaced the framing observation that the doc implicitly measures Managed Agents against TapAgents-as-correct, and that a symmetric "TapAgents may be over-engineered" review belongs in Org Designer's continuous team-shape evaluation lane — captured in §6 with cross-reference for OD's next pattern-mining cadence.

**Findings addressed inline before close (no separate BL-NNN allocation warranted at this size):**
- P2 citation-shallowness on +8.4-10.1pt delta → `[assumption: announcement-level summary; primary methodology not separately published as of May 2026]` qualifier added inline at §2.1.
- Note 3.2 → activation-gate caveat added (Managed-Agents hosting of `industry-researcher` / `customer-researcher` is gated behind Org Designer activation contract per `protocols/framework-contract-discipline.md`, not a substitute for it).
- Note 4.6 → "flat coordinator pattern" terminology with `[assumption]` flag for OD verification on next re-evaluation pass.
- Note 6 → cadence-number softened from "Cadence 4" to "monthly pattern-mining cadence" + Devil's Advocate framing surfaced for OD attention.
- Note self-withdrew — phase-enumeration was already present at §4.1 line 109.

**Backlog mutation (Curator-mode post-edit verify, mechanical recompute per `agents/backlog-curator.md` Algorithm step 3):** BL-026 status `open → done`. `item_counts` recomputed: total=30 unchanged; by_status `open: 18 → 17`, `done: 9 → 10`; by_priority + by_tier unchanged. MIRROR-SYNC verification: JSON status=done + `memory/backlog.md` status=done (2026-05-06) + closing_reference fields parity verified post-edit. Pre-existing 13-item JSON↔MD mirror drift (flagged by 2026-05-07T00:50 BL-025 recount) remains unresolved — NOT introduced by this session, remains Curator next-sweep work.

**Founding team count:** unchanged (9 active + 10 planned). Mechanical doc-extraction work; no team-shape change.

---

## 2026-05-07 — Phase 1 outcome-grading rubric envelope landing (BL-025)

User approved the BL-025 proposal `Adopt rubric-style outcome grading in producer↔reviewer handoff` (per EA Decision Packet at `workspace/_global/decision-packets/20260506-bl-025-rubric-outcome-grading.md`) with three fork-defaults: `max_revision_attempts = 2`, codify-only Critic scope (Fork 2), reviewer-extracts rubric authorship (Fork 3). The pattern lifts Anthropic's May 2026 Managed Agents `outcomes` feature shape — explicit rubric of gradeable criteria + separate-context grader returning a structured envelope (`satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade`) — into the local file-based + Conductor-routed + user-in-loop TapAgents architecture. Pure protocol/contract change; no Managed Agents API dependency.

**New canonical protocol** `protocols/outcome-grading.md` codifies: result-envelope YAML schema (per-criterion `id, description, status, evidence, severity` plus envelope-level `result, revision_attempts, max_revision_attempts, rubric_source, criteria_evaluated, findings_summary, verdict, followup_items_filed`); five-value result enum with `failed` reserved for runtime/contract violations and `unable_to_grade` reserved for non-runtime "couldn't run" cases (mandatory `reason_class: infra | tooling | precondition_absent | runtime_error`); iteration loop semantics (Conductor parses LAST yaml-fenced block in append-only review files; cross-reviewer brief assembly with blast-radius-first precedence Ops/Sec > QE > UI/UX > Critic-on-Tier-2); state.json schema delta scoped to `handed-off` phase (`review_iteration` block per reviewer with `revision_attempts, max_revision_attempts, last_result, last_envelope_path, tier2_revision_dispatched_at, history`); rubric-extraction discipline (reviewer extracts criterion IDs from existing producer artifacts — PRD `§Acceptance`, `design-spec.md §7 default-coverage`, `threat-model.md` mitigation map, generated Tier 2 set — zero producer-side change per Fork 3); marker-file mechanism for backward-compat (`workspace/<slug>/.outcome-grading-active` empty file gates the CONTRACT-DRIFT warning logic; not activated this landing — Phase 2 dogfood gate); industry-portability framing (rubric structure is artifact-shape-agnostic; preserves portability per `project_team_industry_portability.md`).

**Reviewer contract diffs** apply uniformly across the four-axis review tier:
- **Critic (codify-only per Fork 2):** the existing BL-019 verdict shape (`0 P0 / 1 P1 / 3 P2 / 7 Note; LAND-WITH-FOLLOWUPS`) is formalized into the YAML envelope. Mapping: GREEN-LAND-NOW → `satisfied`; LAND-WITH-FOLLOWUPS → `satisfied` with `followup_items_filed:` populated (the followups are ancillary metadata, NOT iteration triggers — preserves existing "approve-with-followups" semantics); BLOCK → `needs_revision`; WRONG_AGENT → `failed`; cannot-review → `unable_to_grade`. Behavior unchanged; format formalized. Phase 1 = codify-only at this stage; auto-iteration on Critic-on-Tier-2 review reserved for Phase 3 per user fork.
- **QE, UI/UX Reviewer, Ops/Security (envelope adoption + iteration-loop section):** each contract gains a rubric-extraction step (`AC-N` from `prd.md §Acceptance` for QE; `DC-N` from `design-spec.md §7` for UI/UX; `M-N` from `threat-model.md` mitigation map for Ops/Security) and an "Iteration loop" section codifying the Phase-2 manual-iterate / Phase-3 auto-iterate gating. Existing P0/P1/P2 severity calibration is honored (no clustering thresholds invented at the envelope layer; if reviewer judgment escalates a finding to P0 it gates ship per existing contract). Existing anti-rubber-stamp triggers (Critic Devil's Advocate, QE two-clean-runs, UI/UX cross-run-N=5, Ops/Security forced-paranoid) are unchanged but become forensically auditable — the envelope's `revision_attempts`, `last_result`, `history` make cross-run triggers mechanical instead of memory-based.
- **Conductor (envelope handling + cross-reviewer brief assembly + state.json schema doc):** new `Outcome-grading envelope handling` section adds the parser table mapping each envelope-result combination to a Conductor action; new `Cross-reviewer brief assembly` subsection with 5-step disambiguation (group-by-reviewer, sort-by-severity, rank-by-precedence Ops/Sec > QE > UI/UX > Critic-on-Tier-2, conflict-detection-via-Critic, brief-format-with-rubric-source-attribution); new state.json schema delta documentation. Conductor's read-list adds `protocols/outcome-grading.md`.

**Templates updated:** `templates/critic-review.md` and `templates/design-review.md` add the YAML envelope as the new required first block; `templates/smoke-report.md` and `templates/security-audit.md` are NEW (referenced by reviewer contracts but didn't previously exist as standalone templates) and codify envelope-at-section-top + structured prose.

**Mirror parity:** all 10 framework files (1 protocol + 5 agents + 4 templates) mirrored to `<project>/scaffold-source/`; `diff -q` empty post-write across all pairs.

**Architect adversarial review** (recused-Critic per dispatch instruction — Critic was reviewing its own contract diff, so independent reviewer was the cleaner pattern): GREEN-LAND-WITH-MINOR-FOLLOWUPS, 0 BLOCKING, 0 WARNING, 4 FYI deferred (Conductor file size 422/500 still under bloat threshold; marker-file dual-purpose comment for next reader; Anthropic +8.4-10.1pt citation URL capture; Tier 2 baseline scaffold Phase 3 dependency documented). Verbatim review at `workspace/_global/architect-review-bl025-phase1-impl.md`.

**Phase rollout (per protocol §4.2 + Conductor §"Phase gating"):** Phase 1 = codify-only landing this dispatch (Critic emits envelope; trio contracts updated; Conductor parses; iteration loop reserved). Phase 2 = Quartet dogfood in MANUAL-ITERATE mode — Conductor surfaces `needs_revision` to user via EA Decision Packet, user manually dispatches Tier 2 with cross-reviewer brief; activates by creating `workspace/<slug>/.outcome-grading-active` marker on the next project's `handed-off` cycle post-this-landing. Phase 3 = auto-iterate enabled; gates on Phase 2 dogfood validation + `templates/stacks/_baseline/agents/tier2-conductor.md` updated with "Outcome-grading revision-brief acceptance" (separate OD proposal authors at Phase 3 entry).

**Backlog mutations (Curator post-edit verified):** BL-025 status `open → in-progress` (remains in-progress until Phase 2 dogfood retro completes; flips to done after Phase 2 success criteria met per proposal §5). NEW Tier 1 P3 effort=S **BL-029 — "Codify 'iterate on user's behalf' principle in EA + Conductor + Org Designer contracts"** filed per BL-025 proposal §7 + user founding-principle directive (also captured at `memory/feedback_iterate_on_users_behalf.md`); the principle already operates de facto via 5-hard-checkpoint discipline + Tier-A/B/C/D classification + EA Decision Packet contract; codifying it makes it forensically auditable when calibration drifts. Counts recomputed mechanically: total=30, by_priority P0=0/P1=14/P2=11/P3=5, by_status open=18/in-progress=3/done=9, by_tier tier1=10/tier2=20.

**Anthropic source citation:** May 2026 Managed Agents announcement; the `outcomes` feature pattern (rubric + separate-context grader → structured result envelope) is the reference shape. Anthropic reports +8.4–10.1pt task-success delta on docx/pptx generation versus unstructured "produce, ask the model if it looks good, iterate" loops. The structural win is producer/grader context separation + parseable result enum vs. prose-judgment.

**Organic team precedent:** the team's own crystallized verdict shape (`0 P0 / 1 P1 / 3 P2 / 7 Note; LAND-WITH-FOLLOWUPS`-style) had emerged in prior reviews before this protocol — codification locks in observed practice and gives Conductor a parseable result without changing what reviewers do.

## 2026-05-06 — BL-027 prod webhook replay fix shipped + BL-013 Phase 6 §8.7 PASS

User asked the team to "Look into Phase 6 and close the gaps/loop as needed" for BL-013 (Multi-user prod OAuth path).

**QE Phase 6 dispatch** (session 2026-05-06T21-36) produced the formal test-plan artifact (`workspace/<project>/test-plan-bl013.md`) that session 18-15 owed but never delivered. QE adversarially audited all 11 §8 scenarios, ran every scenario it could exercise without user-attended action, and found scenario 8.7 (replay protection) FAILS on prod 4/4 with HTTP 500 instead of contracted idempotent 200. Root cause traced to `isUniqueViolation()` not walking `err.cause` where neon-http surfaces the 23505 PostgresError. Phase 5 §F4 audit had explicitly predicted this exact failure mode as future-upgrade risk; live evidence showed it as current behavior. The "closed-by-substitution" framing previously offered (BL-023 dev-preview 500 fix as Phase 6 substitute) was rejected on cited evidence — that fix closed a Next.js SSG-vs-dynamic bug, did not exercise any §8 acceptance criterion. QE filed BL-027 (XS, P1, fix) + BL-028 (M, P1, user-attended scenarios runbook).

**BL-027 implementation** (session 2026-05-06T21-54) — Architect rewrote `isUniqueViolation()` to walk `err.cause` chain to depth 3 with visited-set guard against circular refs; added an integration test against the local Neon branch that triggers a real unique-violation through drizzle+neon-http (10/10 PASS; verified revert-proof — 3/10 FAIL when fix removed). Vitest config infra unblocked as a side-effect (pre-existing ESM-only `vite-tsconfig-paths` plugin was breaking config load; replaced with direct `resolve.alias`).

**Critic adversarial review** verdict: LAND-WITH-FOLLOWUPS (0 P0, 1 P1 closed inline via `vite-tsconfig-paths` devDep removal + a macOS Finder duplicate file removal, 4 P2 + 5 Notes filed for Curator allocation).

**Promote-to-prod** (Tier B, ui-only): commit `1943f81` → merge `81eb136` → Vercel deploy `lj47s3cpf` at 22:16. **Live §8.7 verification 2026-05-06T22:18** against `https://hq.tapintomymind.com`: POST 1 with delivery_id returns HTTP 401 (insert lands; sig fails); POST 2 with same delivery_id returns **HTTP 200** (was 500 pre-fix; now correctly hits the `isUniqueViolation` → idempotent path). Phase 5 §F4 prediction now CLOSED.

**Auto-seal observation:** the v0.7.4 auto-seal mechanism correctly skipped sessions 21-36 + 21-54 because both were already manually sealed by their respective producers (QE + Architect) at end of dispatch. Auto-seal's filter (`status: in-progress`) makes it a no-op in the "team flow worked correctly" case — the desired safety-net behavior. First real exercise: clean.

**Cross-session lessons compounded** (writeback by QE during dispatch):
- `memory/runtime-gotchas.md` — class-of-issue: "Driver-wrapper error chains hide SQLSTATE codes on `err.cause` (HTTP-shimmed Postgres clients)".
- `memory/test-patterns.md` — recipe: "Production-target curl smoke for HMAC-signed webhook surfaces" (stack-portable to Stripe/Slack/Linear/Twilio).
- `memory/incidents.md` — incident: BL-013 §8.7 with full audit-prediction lineage from Phase 3.5 §F4 → Phase 5 §F4 → live confirmation → BL-027 closure.

**Status:** BL-027 closed. BL-013 remains `in-progress` only because BL-028 user-attended scenarios (8.1 second-account install, 8.5 uninstall webhook from second account, 8.11 pre-rotation install_id graceful-migration) require the user with a second real GitHub account. Runbook packaged for user 2026-05-06T22:20.

**Founding team count:** 9 active + 10 planned (unchanged — fix work, not team-shape change).

---

## 2026-05-06 — Backlog Curator activated (curator-lite hybrid) + 24-item backlog reconciliation + ID-allocation rule (v0.7.5)

User pulled the team to address backlog hygiene at scale: *"Review all the backlog again and see which ones are still issues are to do items versus what we pushed. We may need our backlog agent to be active in managing the backlog and not let it overflow or stale out."* Org Designer reconciliation pass surfaced four concurrent structural issues — numbering collision (framework BL-017/BL-018 vs project BL-017..BL-023), status drift on five shipped items (BL-011, BL-013, BL-015, BL-016, BL-023), JSON↔MD unsync (six Tier 2 items missing from `backlog.json`), and trajectory analysis showing ~10 items/day during heavy ship cycles — and proposed a three-part bundle: codify the ID-allocation rule, reconcile the data, activate Backlog Curator. User approved Proposal 3 with explicit framing: *"Backlog Curator is needed for our Tap Agents to be able to efficiently work amongst itself and resolve vulnerabilities, functional enhancements, UI/UX, etc."*

**Activation date:** 2026-05-06.

**Reasoning.** The reconciliation pass demonstrated that approximately 30% of an Org Designer dispatch was being consumed by mechanical curator work (status-drift sweep with git-evidence lookup, JSON↔MD diff, counts recomputation, ID-collision detection) that does not require OD's pattern-detection judgment. At the observed item-creation velocity (~10/day during heavy ship cycles), every ship cycle produces a reconciliation need, so OD would have absorbed the 30% time-cost on every subsequent ship-cycle reconciliation indefinitely. Carving the mechanical work into a curator-lite scope frees OD for the high-judgment work it was created to do.

**Curator-lite scope (what landed).** The activated `agents/backlog-curator.md` (graduated from `agents/_planned/`, stub deleted) owns: (1) ID allocation as the canonical allocator per `protocols/backlog-protocol.md §2.1`; (2) JSON↔MD mirror-sync verification (structural assertion only, not silent reconciliation); (3) `item_counts` recomputation in `workspace/_global/backlog.json` (the one mutation curator does without authorization); (4) staleness flagging — Tier 2 P3 items > 90 days old surface to EA + OD (curator does NOT autonomously archive); (5) status-drift sweep via `git log --grep="BL-NNN"` — flags items shipped without status update; (6) top-of-backlog surfacing to EA's `Needs input:` line. Cadence: post-edit verify on every backlog mutation + on-demand ID-allocation gate + daily sweep summary + post-retro focused pass + post-merge sweep when promotion script invokes.

**Curator-lite scope (what stayed with OD).** Re-prioritization based on incident signal (requires cross-project pattern detection — OD's lane), archival decisions on Tier 1 items (load-bearing framework knowledge — OD reviews each), stub-activation proposals when P0/P1 items keep being pushed (OD's authority per its contract), pattern-mining from `incidents.md` to backlog (OD's existing Cadence 4 work). Curator surfaces candidates via `workspace/_global/backlog-curator-notes.md` (NEW append-only file); OD/user decides.

**Why curator-lite over full activation.** The full curator scope from `_planned/backlog-curator.md` (re-prioritization + archival decisions + pattern-mining + stub-activation proposals) duplicated OD's pattern-detection work and risked the curator-OD seam producing the same friction the activation was meant to relieve. Curator-lite is sized to its actual job — mechanical hygiene — with cleaner separation of concerns and a smaller activation surface (lower risk of curator-OD friction). Three alternatives were evaluated: (a) full activation per stub — rejected for scope-creep duplication of OD work; (b) defer activation — rejected because the user explicitly pulled this AND the trajectory at ~10 items/day crosses the 20-item threshold inside 2 days; (c) hybrid (curator-lite) — accepted as resizable: if curator-lite proves under-scoped after first month, expand its mandate per OD evaluation.

**Resize clause (load-bearing).** Curator's contract codifies a 30-day evaluation (target date: 2026-06-05). After 30 days, OD evaluates whether the curator-lite scope is under-scoped (OD still doing >10% curator work in retros → propose mandate expansion), over-scoped (curator firing on noise without producing actionable findings → propose mandate contraction), or right-sized (codify curator-lite shape as canonical activated form). The evaluation lives in OD's monthly Cadence 4 pass per `protocols/team-rhythm.md`. Codified ratchet rather than scope creep — the resize is a deliberate decision point, not a default.

**Contract updates landed in this dispatch.**
- `agents/backlog-curator.md` (NEW — graduated from `_planned/`; ~210 lines; curator-lite scope codified per OD proposal §"Activation contract draft (curator-lite)"; resize clause codified)
- `agents/_planned/backlog-curator.md` (DELETED — stub graduated, not superseded)
- `agents/conductor.md` (Read-list adds `backlog-curator-notes.md`; Backlog pull algorithm step routes ID allocation + post-edit verify to Curator; new `Backlog Routing Matrix` section codifies which work routes to Curator vs OD vs user)
- `agents/executive-assistant.md` (Read-list adds `backlog-curator-notes.md`; BACKLOG SUMMARY format adds `Curator findings (last 24h)` line filtered from curator-notes; cardinal-zero rule applies)
- `agents/org-designer.md` (Read-list adds `backlog-curator-notes.md`; "Backlog grooming" Authority bullet revised — mechanical hygiene delegated to Curator; OD retains pattern-detection + re-prioritization + archival decisions; 30-day resize evaluation codified)

**Industry portability honored.** Scaffold-source mirrors at `<project>/scaffold-source/agents/{conductor,executive-assistant,org-designer,backlog-curator}.md` updated identically. `diff -q` empty post-edit on all 4. Stub also removed from `<project>/scaffold-source/agents/_planned/`. The curator-lite scope is stack-agnostic — greenfield projects spinning up via scaffold inherit Curator activated.

**Bundled with this release (atomic v0.7.5):** the prior reconciliation pass (Proposals 1+2 of OD proposal) — codification of `protocols/backlog-protocol.md §2.1` ID-allocation rule + 24-item canonicalization + status-drift closure on 5 shipped items + JSON↔MD synchronization + framework BL-017→BL-024 collision-recovery renumber. This release pairs the data-correction + protocol amendment + agent activation as ONE atomic unit per `protocols/changelog-protocol.md §6` atomic-cadence rule. The triple-change set is mutually reinforcing: §2.1 prevents future collisions, the reconciliation closes the existing collision + drift, and Curator enforces both going forward.

**Founding team count:** 8 active + 11 planned → **9 active + 10 planned**. Backlog Curator graduated from `agents/_planned/` to `agents/` (stub deleted, not superseded — the activation was a clean promotion of the previously-provisional contract per the activation checklist in the original stub). The "founding team" lens — used since the team's origin to track the canonical spine of seats per OD's Algorithm — increments by one and the planned-stub roster decrements by one in the same transaction. Filesystem count (12 active `agents/*.md` files including later additions like UI/UX Reviewer, Designer, db-admin, Ops/Security) tracks separately from the founding-count narrative; the founding count is the load-bearing measure for OD's mandate-coverage analysis.

---

## 2026-05-06 — Session-tracking auto-seal (A) + EA stale-session sweep (B) shipped (v0.7.4)

User surfaced session-tracking drift at 2026-05-06T21:00: BL-023 (16-00) and BL-013 Phase 5 (18-15) sessions both shipped to prod via `<project>` merge `bf2f08a` at 19:49 but their `active-sessions.md` entries were never sealed — left `status: in-progress` for ~3.5h. User: *"The ones in flight, confirm they finished. I thought I finished both those. Add in the necessary processes to track it better as needed."*

**Diagnosis.** Sealing was a manual checklist step in `protocols/session-coordination-protocol.md` Rule 1. Nothing closed the loop when a producer hot-merged through `promote-to-prod.sh` — the protocol assumed the session author returned to seal, which doesn't survive long-running merges or context resets. There was no automated drift detector either.

**Two complementary mechanisms shipped.**

**(A) Auto-seal on promotion.** `<project>/scripts/promote-to-prod.sh` now walks `active-sessions.md` at start of Gate 5 (success path) and inside `fail_with_audit` (partial-state path) and seals every in-progress entry whose `files_in_flight:` overlaps the merged file set. Sealed entries gain `auto_sealed`, `auto_seal_merge`, `auto_seal_outcome`, `auto_seal_files`, and an `AUTO-SEALED via promote-to-prod.sh ...` `completion_note`. Manually-sealed entries are NOT overwritten — only `auto_*` metadata is appended for forensic record. Manifest-path resolves framework-root-first then project-local fallback for industry portability. Failures are non-blocking (warn-only) — auto-seal is a metadata convenience, not a promotion gate.

**(B) EA stale-session sweep.** `executive-assistant.md` runs a drift-detection sweep on every `/status` and `/briefing`. For each `status: in-progress` entry whose `last_updated` is >2h old, EA cross-references claimed `files_in_flight:` against `git log` since `last_updated` and surfaces drift candidates as a `SESSION-TRACKING DRIFT` section in the briefing. EA stays read-only — auto-seal owns mutation; EA owns surfacing. Catches manual merges, hotfixes, projects without a promotion script, or any path that bypasses the script.

**Lane discipline preserved.** Critic verified Rule 4 (lane ownership) is unchanged — `active-sessions.md` is shared coordination metadata, not an agent-owned artifact. EA's `Authority` section ("Read-only on agent artifacts") is preserved by design — drift surfacing is read-only.

**Industry portability honored.** Scaffold-source mirrors at `<project>/scaffold-source/protocols/session-coordination-protocol.md` and `<project>/scaffold-source/agents/executive-assistant.md` updated identically (`diff -q` empty post-edit). The protocol amendment refers to "promotion script" generically — greenfield stacks without a `promote-to-prod.sh` still flow through EA's drift-sweep with manual-seal suggestion as the recommended fix.

**Reactive-cadence honesty.** Surfaced explicitly in the changelog narrative per Critic Note: EA's sweep is reactive (fires on user invocation), not proactive monitoring. Even with this fix, the 2026-05-06 drift would not have been caught during the 3.5h gap unless `/status` was invoked. The proactive answer is BL-018 (Claude Code pre-edit + pre-commit hooks) — filed as P3 follow-up.

**Team flow (per "Always operate as the team" binding rule).**
- Orchestrator session 21-00 surfaced ground truth + sealed prior-session drift entries truthfully.
- Architect PASS 1 implemented A + B + protocol amendment + scaffold-source mirrors + CHANGELOG draft.
- Critic PASS 1 verdict: LAND-WITH-FOLLOWUPS — 0 P0, 2 P1, 4 P2, 3 Notes.
- Architect PASS 2 closed both P1s (path-suffix matcher tightened to exact-equality after framework/project-rooted normalization, eliminating monorepo false-positives; CHANGELOG draft completeness restored). 4 P2s + 3 Notes filed as BL-017 P2-cluster + BL-018 P3-hooks (1 Note absorbed into BL-018).
- Critic PASS 2 re-spin verdict: GREEN-LAND-NOW.
- Orchestrator landed atomic commit pairing CHANGELOG + agent-changelog narrative + Architect's deliverables + Critic's review + my session entry sealing + backlog updates.

**Cross-session forensics.** Both prior drifted entries (16-00 BL-023, 18-15 BL-013 Phase 5) sealed with truthful `completion_note` narratives + `shipped_to_prod` listings + `historical_*` annotations preserving the pre-seal coordination context. Documents the SEALING DRIFT as part of the historical record rather than rewriting it.

**Founding team count:** 8 active + 11 planned (unchanged — process change, not team-shape change).


---

## 2026-05-06 — Session-coordination Rule 1 tightened (stale ≠ abandoned)

**Trigger.** User correction 2026-05-06 after orchestrator session detected another session's BL-015/16 entry as stale (>1hr since last_updated), read their design-brief in detail, and started preparing to take over the implementation. User said: *"The other session is already doing BL15 and 16. You should be able to identify that."* Followed by: *"Make necessary notes so we don't have team members drifting their focus like this and accidentally doing overlapped work."*

**What changed in the team.**
- `protocols/session-coordination-protocol.md` Rule 1 conflict-resolution flow amended. Previous step 2 ("If sealed or stale — proceed but check for left-behind state") split into three explicit steps: sealed (claim released, proceed) / stale (DO NOT auto-take-over, surface to user, read-only investigation OK) / concurrent-and-can't-wait (decision packet per Rule 3). Self-pivot signal added: *if I find myself reading another session's brief in detail to understand what they were going to do, that IS the signal to stop and surface, even before touching claimed files.*
- User-memory `feedback_session_coordination_dont_drift.md` added so the behavioral rule persists across all future orchestrator invocations.

**Why this matters for team shape.** The original rule encoded a heuristic that doesn't survive contact with real workflows. Sessions can be active without committing — drafting offline, designing in another tool, mid-implementation. The amended rule treats *modifying* claimed files as the threshold requiring user authorization, while *reading* claimed work for awareness remains free. Asymmetric costs: asking is one message; overlapping work wastes producer time, creates divergent implementations, and produces user frustration. Always ask.

**Pattern this codifies.** Stale signals are necessary but not sufficient indicators of abandonment. The parallel-session-coordination problem requires explicit user gates, not just heuristic timeouts.

---

## 2026-05-06 — Team Rhythm Protocol + first institutional idle-cadence run

**Trigger.** User-binding directive 2026-05-06: *"build good idle tendencies so agents are consistently learning and growing with their peer agents and the company itself has a structure so robust and token efficient it makes the output desirable."* The directive came after the user observed agents in a "watch mode" / coordination idle and asked the orchestrator to propose what the team should do during such windows. The orchestrator framed five categories of idle work; the user picked the highest-leverage option (pattern extraction from today's high-signal day) and additionally asked the team to codify the rhythm so the institutional habit self-runs going forward. This entry summarizes both the codification and the first run.

**The doctrine in one line.** A human team's idle is individual — read, learn, rest. An agentic team's idle is structural — active maintenance of the team's collective brain (memory hygiene, cross-axis peer learning, contract drift detection, pattern promotion). Without explicit cadence, memory files decay or stay sparse, contracts drift, patterns get re-discovered. **The protocol institutionalizes the cadence; any individual instance is advisory but the habit is load-bearing.**

**The protocol — `protocols/team-rhythm.md` (NEW).** Five cadences, three principles, six token-efficiency rules. Cadences: (1) Per-session-close lightweight summary (already in place via `templates/session-close.md`); (2) End-of-day pattern extraction (EA + Critic in parallel + a Reconciler role with a 4-step fallback chain — separation of concerns mandates the Reconciler is never one of the parallel synthesis agents); (3) Weekly process-adherence audit (gated until Cadence 2 has run for one month); (4) Monthly Org Designer pass (cross-references `protocols/framework-contract-discipline.md` for the separate leakage-audit cadence); (5a) Quarterly archive sweep + (5b) Annual memory-file currency review. Principles: read-heavy / write-light / deltas not rewrites; peer-agent learning is the highest-leverage memory category; scheduled not constant — token-efficient by default. Anti-patterns explicitly enumerated to prevent drift into refactor / speculation / always-on background / review-bypass / in-line-substitute.

**The first run produced two synthesis artifacts and applied surgical memory deltas.** EA wrote `workspace/_global/patterns-2026-05-06.md` (1,389 words, six sections, citation-dense). Critic wrote `workspace/_global/memory-gap-audit-2026-05-06.md` (590 words, 4 P0 / 5 P1 / 3 P2 / 3 anti-patterns flagged / 6 well-covered / 3 structural memory-design observations). Reconciler (orchestrator session) applied surgical deltas: `lessons-learned.md` filled with a 6-entry 2026-05-06 cohort (was empty placeholder); `security-patterns.md` created (NEW — Ops/Security's Tier 1 axis file, peer to QE's `runtime-gotchas.md`); `patterns.md` gained 3 new entries (parallel-session-aware decision-packet drafting, adjacent-overlap audit, session-coordination protocol bidirectional-validation FYI); `runtime-gotchas.md` gained 1 entry (fixed-absolute-offset for variable-width content sibling overlap, cross-axis peer to ui-anti-patterns); `incidents.md` gained 1 entry (multi-tenant readiness near-miss); `ui-anti-patterns.md` gained a cross-axis peer note; **all six memory files gained Adjacent-files footers** (closes structural memory-design issue #2 from gap audit — cross-axis peer learning was previously invisible from inside any one memory file).

**Critic adversarial review of `team-rhythm.md` itself.** PASS 1 found 3 P0 / 6 P1 / 5 P2; recommendation REVISE BEFORE LAND. Architect (orchestrator) PASS 2 addressed all 3 P0s + P1-5: Cadence 1 ↔ Cadence 2 trigger overlap disambiguated (P0-1 — Cadence 2 fires at most once per working day on `/end-of-day` user trigger OR on session boundary AND substantive day AND no Cadence 2 has fired today); Reconciler role + 4-step fallback chain added (P0-2 — closes the autonomous-mode failure mode where "orchestrator" was undefined); Cadence 5 split into 5a (archive sweep with source-of-truth citations + grandfather clause for the 22K + 14K critic-notes files already on disk) + 5b (annual memory-file currency review with the supersession-marker convention deferred to first 5b run as ratification deliverable); `framework-contract-discipline.md` cross-reference added in Cadence 4 (P1-5 — Cadence 4 does NOT subsume the leakage audit, which has its own separate cadence). Remaining P1/P2 items (habit-bindingness firing-rate threshold, "bounded reading lists" enforcement mechanism, compounding-loops observed-vs-predicted distinction, "NOT speculative" routing gap, 5 minor cleanups) deferred as next-pass amendments per Critic's LAND-WITH-FOLLOW-UPS recommendation; surface in EA briefing.

**Memory-design structural observations (deferred to Org Designer at next pass).** (1) Empty-file deferral smell — `lessons-learned.md` and originally `patterns.md` shipped empty with "filled as projects complete" placeholders that invited indefinite deferral. Recommend every `_planned` agent activation auto-seed at least one entry. (2) Naming convention drift across 7 memory files (5 different shapes — `lessons-learned`, `runtime-gotchas`, `test-patterns`, `ui-references`, `secrets-hygiene`). Recommend Org Designer ratify a single `<axis>-<artifact-type>.md` shape so future files auto-fit. (3) Cross-reference index — addressed in this release via Adjacent-files footers in every memory file.

**Coordination signals — first adversarial test of session-coordination-protocol Rule 1, bidirectionally.** Two concurrent sessions (`2026-05-06T12-49-webhook-ownership-decision` and `2026-05-06T16-47-bl013-and-leakage-audit`) shared multiple overlapping cross-cutting files. Both sessions detected each other in `active-sessions.md`; both wrote `coordination_note` fields acknowledging the dance; the file-modified-since-read race-detection caught two concurrent edits to `active-sessions.md` and forced re-reads cleanly; the parallel session staged a cross-lane edit to `protocols/session-coordination-protocol.md` but did NOT apply it, deliberately respecting this session's lane lock. The 16-47 session also closed BL-014 (Org Designer ratification of QE memory files) which independently resolved gap-audit P0-3 — parallel-session value, not duplication. Both sessions' deferred ops landed atomically once the 16-47 session sealed at 18:10. The protocol works.

**No structural team change** — no agents activated, retired, split, or merged. Memory file `security-patterns.md` is the first NEW Tier 1 memory file added since QE's `runtime-gotchas.md` and `test-patterns.md`; aligned with Ops/Security's 2026-05-06 activation per the F12 Activation Context discipline.

---

## 2026-05-06 — Decision Packet: Webhook Handler Ownership (cross-plan coordination)

**Trigger.** Two approved, execution-ready execution plans (`<project>/.claude/docs/v1.5-execution-plan.md` Task 7 and `workspace/<project>/decision-packet-bl013-multiuser-security.md` Phase 3.5) both touched the same surface — `POST /api/webhooks/github`. The v1.5 plan's inline note ("deduplicate vs BL-013 step 5, do not duplicate plumbing") was correct in spirit but ambiguous in arbitration. Without an explicit ownership statement, both Ops/Security (dispatched into BL-013 Phase 3.5) and the Tier 2 implementer (dispatched into v1.5 Task 7) could reasonably believe they own implementation. This entry summarizes the resolution.

**The doctrine in one line.** When two approved cross-plan artifacts touch the same surface, the resolution lives in ONE decision packet — both plans cross-reference, neither is reopened. The packet names the seam, sequences the work, and arbitrates ambiguity. **First live test of `protocols/session-coordination-protocol.md` Rule 3 (decision packets as cross-plan authority).**

**The resolution.** BL-013 Phase 3 §5.1-5.3 owns the schema migration (`installations` + `webhook_events` tables). v1.5 Task 7 owns the handler implementation (route + signature verifier + per-event handlers); Task 7 does NOT generate SQL DDL — its handler code reads/writes the schema BL-013 created. Behavioral contracts (HMAC-over-RAW-bytes, X-GitHub-Delivery replay-rejection, installation.deleted atomic-transaction shape, cross-app guard) come from BL-013 §5.1-5.3 as design spec. BL-013 Phase 3.5 owns the security audit lens — Ops/Security's first real dispatch — running against landed Task 7 code.

**Sequencing (load-bearing).** `BL-013 Phase 3 (schema migration) → v1.5 Task 7 (handler implementation) → BL-013 Phase 3.5 (Ops/Security mini-audit) → BL-013 Phase 4`. You cannot audit what does not exist, and Task 7's handler code cannot be implemented against a schema that has not been migrated.

**Process notes.** First adversarial test of `protocols/session-coordination-protocol.md` Rule 1. When the BL-013 packet, CHANGELOG.md, and agent-changelog.md were held by the concurrent 16-47 session, this session paused edits on those files and proceeded only with parallel-safe work — drafting the new packet, applying the v1.5 plan cross-reference, staging the CHANGELOG draft. Cross-reference application split: §5.1 (v1.5 plan) applied at packet landing; §5.2 (BL-013 packet) applied after the 16-47 session sealed at 18:10. Both cross-references now in place. Architect drafted; Critic adversarial-reviewed (4 P1 findings, LAND WITH NOTED FOLLOW-UPS); Architect PASS 2 fixed two before-commit items (changelog-draft accuracy + schema-ownership clarification + sequencing diagram correction); three post-commit follow-ups deferred (Phase 3.5 → Task 7 P0 arbitration loop, Phase 0 status check, migration-slot collision one-liner promotion).

**Authority.** Load-bearing for Ops/Security's BL-013 Phase 3.5 dispatch. Supersedes the inline "deduplicate vs BL-013 step 5" note in v1.5 Task 7 (cross-reference application replaced the note with a pointer to the packet). Does NOT re-open either plan — both remain approved and execution-ready; only the seam is named.

**No structural team change.** New artifact class (cross-plan coordination decision packet) but the artifact type and shape were already codified in session-coordination-protocol Rule 3. This is the second packet of this class (after BL-005 custom-domain); the third recurrence (counting BL-013 §F-3 amendment) met the user-stated 3+ threshold for `patterns.md` promotion — codified as a pattern entry in this same release (under the Team Rhythm + memory-hygiene v0.7.2 entry).

---

## 2026-05-06 — Project-leakage audit cleanup (Round 1 + Round 2 dispatch)

**Trigger.** User structural enforcement directive 2026-05-06 — *"Make sure all the contents in the agent-team are specifically for the agent team and not for specific dashboard ui or project items. ... The bleed overlap is what makes it hard to properly market each apps change (agent team and dashboard independelty)"* — invoked an Org Designer leakage audit. Round 1 produced 21 findings (5 BLEED-BLOCKING / 7 WARNING / 9 FYI) at `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`. Critic adversarial-reviewed the audit (YELLOW; C1/C2/C4 BLOCKING-FOR-DISPATCH + 5 WARNING + 1 FYI). User approved continuation 2026-05-06T17:05: *"Yes, continue with the changes."* This entry summarizes the cleanup.

**The doctrine in one line.** The convention (per `protocols/changelog-protocol.md`) is correct; the discipline lapsed during a high-velocity single-project session. The fix is migration of pre-protocol BLEED-BLOCKING entries to project-private locations (with framework-portable lessons retained as residue) plus codification of forward-looking discipline rules. **No structural team change** — no agents activated, retired, split, or merged.

**The four amendments (A1–A6 from the audit, codified in protocols):**

- **A1 — Audit-routing by scope.** `protocols/autonomous-ops-permissions.md §6.1.1` (new sub-section) codifies that Tier B / Tier C audit entries route by scope, not by uniform default. Project-scoped actions append to `<project>/.claude/memory/agent-changelog.md`; framework-scoped actions append to `.claude/memory/agent-changelog.md`; cross-cutting actions append both atomically. Closes the structural cause of Cluster 1 (six BLOCKING/WARNING findings clustering in framework changelog and `memory/agent-changelog.md` because the prior protocol pointed at framework-changelog as the single audit destination regardless of scope).

- **A2 — Retroactive migration policy.** `protocols/changelog-protocol.md §7.1–§7.3` (new sub-sections) codify that BLEED-BLOCKING entries pre-dating this protocol are migrated retroactively, the migration breadcrumb format (*"Full project narrative: see <destination> — <YYYY-MM-DD> entry on <topic>."*), and the cross-reference preservation policy (neighbor entries' cross-refs are NOT rewritten; the version slot + breadcrumb preserves resolution). Closes Critic C4.

- **A3 + A4 + A5 + A6 — `protocols/framework-contract-discipline.md` shipped (NEW).** Single new protocol document holds the four content-discipline rules: Activation Context discipline (newly-activated agents' contracts record category-level rationale; project-attributable detail goes to org-designer-proposal artifact + private narrative); provenance-citation discipline (incidents.md citations are date-pointers, not descriptive titles that name a stack); stack-specific examples are illustrative, not binding (single-sentence framing per stack-example block); project-leakage audit cadence (monthly during single-project phase, relaxes to quarterly when a second active project ships its first artifact OR two consecutive monthly audits return clean).

**The three Round-1 BLOCKING migrations executed (F1 / F2 / F3).** Three framework-CHANGELOG entries (v0.4.5 BL-005 cutover, v0.4.6 dev→main promotion, v0.5.0 v1.5 Phase 0 dashboard-side artifacts) had their full project-narrative bodies migrated to `<project>/.claude/CHANGELOG.md` (created as the migration destination — per EA flag #1, the destination did not previously exist). Framework-public residue retained: a 4–6 line entry with the framework-portable lessons (force-issue-TLS-when-third-party-NS, Tier-B-becomes-Tier-C-on-M-milestone-scope, QE-merge-not-overwrite-doctrine), the section title intact, the version slot intact, and the breadcrumb pointer to the migration destination. Cross-references from neighbor entries (v0.5.1 → v0.4.7; v0.5.2 → v0.5.1) remain valid pointers per A2 §7.3.

**The three activation-context sanitizations executed (F5 / F12 / F12.1).** Active `agents/ops-security.md` `## Activation Context` rewritten to category-level triggers + the F18-shape italicized footnote pointing at `memory/agent-changelog-private.md` for project-attributable evidence. Post-promotion `_planned/ops-security.md` historical-record stub received identical surgery. UI/UX Reviewer activation entry in this file (above) now references project-attributable evidence by pointer rather than embedding specific BL-IDs and dashboard file paths inline. The category-level triggers are stable; the implementation evidence is project-attributable and lives in the private narrative.

**Cross-lane edits drafted but NOT committed.** Per `protocols/session-coordination-protocol.md` Rule 4 (lane ownership), the A5 stack-example reframings on `agents/architect.md`, `agents/critic.md`, `agents/quality-engineer.md`, `agents/ui-ux-reviewer.md`, `agents/ops-security.md` (algorithm step), plus the F22 reframing on `protocols/session-coordination-protocol.md`, are STAGED as surgical patches in `workspace/_global/org-designer-proposals/20260506T1705-cross-lane-edits-staged.md` — pending Critic per-edit review pre-commit. Org Designer drafted; owners apply.

**Audit verification (Critic adversarial-review of Round 1):** YELLOW with 3 BLOCKING-FOR-DISPATCH (C1 = session-coordination-protocol bleed not audited; C2 = `_planned/` stubs not audited at all; C4 = cross-reference integrity not addressed in migration design) plus 5 WARNING and 1 FYI. Round 2 amendment §8 of the audit closes all three BLOCKING findings explicitly: F22 opened (C1); F12.1 + F23–F29 stub-spot-audit table (C2 + C2b — 7 clean / 1 needed surgery / 1 acceptable-by-archival-purpose); A2 cross-reference policy + breadcrumb format (C4). All five WARNINGs addressed inline (C3 backlog Tier-1 spot-audit returned 5 lessons-generalize / 0 mis-tiered; C5 cadence reconciliation landed in `framework-contract-discipline.md §4`; C6 F12-F18 symmetry landed; C7 marketing-framing acknowledgment recorded as FYI; C8 other-templates follow-up tracked for next monthly cycle; C9 BL-014 closed with cross-reference).

**Active count unchanged:** 11 active + 11 planned. Founding team count unaffected. No team-shape change.

**Cross-references.**
- Audit log + Round 2 amendment: `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`
- Cross-lane edit drafts: `workspace/_global/org-designer-proposals/20260506T1705-cross-lane-edits-staged.md`
- New protocol: `protocols/framework-contract-discipline.md`
- Amended protocols: `protocols/changelog-protocol.md §7`, `protocols/autonomous-ops-permissions.md §6.1.1`
- Migration destination: `<project>/.claude/CHANGELOG.md`
- `CHANGELOG.md` v0.6.x entry (this date) for the technical-release view (stamped at landing per `session-coordination-protocol` Rule 2; draft at `workspace/_global/changelog-drafts/2026-05-06T17-05-leakage-audit-cleanup.md`)
- User memory: `project_team_industry_portability.md`, `feedback_changelog_proactive.md`
- Industry-portability stress test: `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md §6` (3 hypothetical-project stress tests; verdict "partial portability — surgical, not structural")

---

## 2026-05-06 — Session Coordination Protocol shipped (cross-session consistency formalized)

**Trigger.** User directive 2026-05-06: *"I can't have cross session drifts and consistency is key. The whole team is connected and needs to act that way ALL the time."* The directive came after concrete friction observed earlier the same day: CHANGELOG entries [0.4.7] (UI/UX activation) → [0.5.0] (v1.5 Phase 0) → [0.5.1] (UI/UX refinements) → [0.5.2] (UI/UX P0 fixes) all landed within hours from independent sessions, with no cross-session awareness. Agent-changelog files race-edited mid-edit. v1.5 plan and BL-013 decision packet both spec the webhook handler at `POST /api/webhooks/github`. Mutual unawareness across sessions.

**What this changes.** Multiple parallel Claude sessions now operate as one coherent team rather than several independent threads sharing a filesystem. The protocol at `protocols/session-coordination-protocol.md` codifies six rules: session manifest declaration before cross-cutting work; CHANGELOG drafts pattern (version claimed at landing, not edit time); decision packets as cross-plan arbitrators; agent file ownership with dispatch on cross-lane edits; EA briefing opens every non-trivial session; atomic git commits per landed unit. Together these eliminate the version-claim race, make in-flight work visible, and ensure plan conflicts surface as packets rather than as inline edit collisions.

**The diagnostic gap this closes.** Critic owns artifact-level review. QE owns runtime functional review. Ops/Security owns runtime adversarial review. UI/UX Reviewer owns visual/IA review. None of them owned cross-session coordination — the protocol is a meta-axis that operates ABOVE the agent layer, governing how sessions interact with shared workspace state. It is not a new agent; it is operational discipline shared by every session.

**First user is the protocol itself.** Session-id `2026-05-06T15-30-session-coord-protocol` registered in `workspace/_global/active-sessions.md` as the inaugural manifest entry; this CHANGELOG entry drafted in `workspace/_global/changelog-drafts/` rather than written directly to canonical CHANGELOG.md; landed atomically with this narrative; manifest sealed on completion. Bootstrapping pattern future sessions mirror.

**Cross-references.** `protocols/session-coordination-protocol.md` (the protocol); `workspace/_global/active-sessions.md` (the registry); `workspace/_global/changelog-drafts/` (staging dir); related protocols at `protocols/changelog-protocol.md`, `protocols/conflict-resolution.md`, `protocols/consistency-check.md`, `protocols/ea-protocol.md`. CHANGELOG entry: v0.6.0.

**Future hardening (backlog).** Pre-edit hook on CHANGELOG.md checking active-sessions; pre-edit hook on conductor.md requiring manifest entry; pre-commit hook validating atomic-cadence rule. Configured via `.claude/settings.json` per the `update-config` skill. Currently advisory at filesystem layer; enforced by team norms and user-binding directive.

---

## 2026-05-06 — UI/UX Reviewer P1 quality-of-symmetry fixes (refinement pass #3, final)

**Trigger.** Final refinement pass on UI/UX Reviewer activation, landing the seven P1 quality-of-symmetry warnings from Critic's adversarial review (`workspace/_global/critic-notes-ui-ux-reviewer-activation.md`). The three P0s landed in v0.5.2; this pass closes the structural-symmetry items so the contract reaches peer-agent shape parity with Ops/Security and QE. User direction at session wrap: no critic re-review will follow — last touch on the contract.

**The doctrine in one line.** Peer-agent shape parity is a contract obligation, not a stylistic nicety. When two agents with overlapping write authority (Reviewer + Designer on `memory/ui-references.md`) and overlapping runtime surfaces (Reviewer + QE on Playwright) ship without explicit per-file authority and per-mode failure handling, the seam friction the proposal §"Cost / risk" predicted shows up as runtime ambiguity. The seven P1 fixes close all such seams.

**The seven P1 fixes (each surgical, no scope creep):**

1. **Activation Context section + originating-proposal/user-quote citation (P1-A merged with P1-G).** Mirrors `agents/ops-security.md:229-247`. New `## Activation Context` section preserves the user's verbatim `/grow-team` ask inside the contract — *"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create and implement the most modern stack/design theming ... seeing layout and changes that are logical without needing user screenshots or inputs."* — so future invocations reading only the contract retain the role's "what good looks like" intent. Maps the four phrases in the ask onto the four operating principles. Names the four-axis review tier this completes (Critic plan / QE runtime functional / Ops/Security runtime adversarial / UI/UX Reviewer runtime visual+IA). Activation date 2026-05-06. Links proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`.

2. **Memory File Authority table (P1-B).** Mirrors `agents/ops-security.md:211-228`. Codifies per-file read/write semantics across 12 files: UI/UX Reviewer's append-only canon (`memory/ui-references.md` / `ui-patterns.md` / `ui-anti-patterns.md`), peer-owned read-only files (`lessons-learned.md` / `incidents.md` / `runtime-gotchas.md`), per-project artifacts (`design-review.md` owner; `backlog.md` append-only for P1), and Playwright config files (`tests/visual/playwright.visual.config.ts` owner; `playwright.config.ts` read-only — QE's exclusive territory). **Designer is granted append authority on `memory/ui-references.md`** with provenance-required (project + date + role-of-author). Rationale: both roles benefit from canon currency, and dual-authoring with provenance prevents stale-canon while preserving audit trail. Neither role edits prior entries — append-only with audit trail satisfies both "currency" and "non-collision" without requiring lock coordination.

3. **L74 framing language reconciliation (P1-C).** Verified: L74 is already project-type-agnostic post-Option-C (lists "first dashboard project, first marketing site, first dev-tool console" as parallel examples, none baked). Verified the founding-project exception language at L85 also doesn't bake project-type assumption. No edit needed; verification documented in CHANGELOG for audit trail. The "team's only shipped project type" phrasing the original critic notes flagged was already removed by Option C in v0.5.1.

4. **Founding-project exception sunset criteria (P1-D).** Single-line addition to the exception at L85. Prior text said "After first pass, the design-spec must own the list" — implicit but not codified. Now explicit: *"Sunset criteria: the exception lapses on the next pass once `design-spec.md` exists with a §7 default-coverage block — Reviewer reads the block from spec on that pass, no further exploratory routing."* Closes the bounded-criteria gap Critic flagged.

5. **Failure Modes for runtime-infrastructure failures (P1-E).** New four-class failure-mode block. (a) **Deployed URL unreachable / 502 / connection refused** — abort, log `§What couldn't be reviewed`, signal Conductor `blocked`; NOT a P0 visual finding (infrastructure block, not visual block). (b) **Playwright browser crash / navigation timeout** — retry once with extended 30→90s timeout; on second failure, log and abort; do NOT proceed to checklist on missing screenshots (hollow review > blocked review). (c) **Redirect loop** — classify as routing bug; route via `WRONG_AGENT: → Quality Engineer`; no P0 against a surface that never rendered. (d) **Auth-bypass not set** — detection rule (>50% of default-coverage routes resolving to same auth path); cross-references QE's `TEST_AUTH_BYPASS` pattern at `agents/quality-engineer.md:90-100`. Required env: `TEST_AUTH_BYPASS=1` plus `TEST_AUTH_USERNAME`, guarded by `NODE_ENV !== 'production'`. Each class has a specific surfacing rule rather than silent skip or hollow review.

6. **Future-Growth Lens section (P1-F).** Mirrors `agents/quality-engineer.md:166-174`. Documents fragmentation triggers at 5x team size or 10 shipped projects: likely split into Visual Reviewer / IA Strategist / Pattern Researcher (the three sub-roles the originating proposal §"Risk this proposal is wrong" already named); sub-role spawns for Accessibility Tester / Mobile-First Reviewer / Brand-System Auditor; Tier 2 mirror pattern; memory-artifact compounding; merge-with-Designer assessment (unlikely — author/judge separation is load-bearing); industry-portability binding per `project_team_industry_portability.md` (UI/UX Reviewer industry-portable; Designer per-project adapter).

**Why each fix matters.**

- **P1-A merged with P1-G:** without the Activation Context section, the user's verbatim "what good looks like" framing lives only in the proposal — which a future invocation reading only the contract would never see. The four-phrases-onto-four-principles mapping is the contract's conscience: it lets a future Reviewer self-validate that its outputs honor the role's mandate, not just its mechanics.
- **P1-B:** dual-authoring on `memory/ui-references.md` is a load-bearing decision. Designer's market-scan work should land in the canon directly; gating through Reviewer-only-append creates either bottleneck or stale-canon. The provenance requirement (project + date + role-of-author) lets future audits trace any reference back to its authoring agent without requiring lock coordination at edit time.
- **P1-C:** verification-without-edit is the right call when the prior critic notes flagged language that's already been removed. Documenting the verification in CHANGELOG closes the audit-trail gap without re-editing settled text.
- **P1-D:** "exception applies once per project" was implicit but ambiguous on the trigger condition (next invocation? next phase? next year?). Tying the sunset to the existence of `design-spec.md §7` makes it observable and self-evident — no judgment call required at firing time.
- **P1-E:** infrastructure failures look like visual findings under naïve handling (Reviewer screenshots a 502 page, files findings against the empty `<body>`). The four-class block ensures runtime-infra failures get classified correctly upstream — abort, signal `blocked`, do not pollute `design-review.md` with infrastructure-block reports masquerading as visual findings.
- **P1-F:** documenting fragmentation triggers in the contract preserves the calibration lens for the future Org Designer review. Without it, the proposal §"Risk this proposal is wrong" callout (likely fragmentation at scale) lives only in the originating proposal — a future Org Designer reviewing whether to split the role would have to re-derive the analysis.

**No regressions to prior state.** The 179-line v0.5.2 baseline grows to 235 lines — well under the 300 ceiling, within the +50-80 target. All four review-tier axes remain intact. No structural team change; no new agents activated; no agents retired. Counterpart-agent shape parity reached: UI/UX Reviewer now matches Ops/Security and QE on Activation Context / Memory File Authority / Future-Growth Lens sections.

**Active count unchanged:** 11 active + 11 planned (UI/UX Reviewer remains the 11th live agent).

**Critic re-review status.** No re-review will follow — user direction at session wrap, last touch on the contract. P1 fixes are surgical, structural-symmetry items mapped cleanly to peer-agent precedents (Ops/Security L211-228 / L229-247; QE L166-174); no novel doctrine introduced; no behavioral change to the Algorithm beyond explicit failure-mode handling (which strictly tightens, never loosens, the contract). Steady-state contract.

**Cross-references.**
- Critic notes (P1 source): `workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- `CHANGELOG.md` v0.5.3 entry (this date) for the technical-release view.
- Prior P0 fixes: this file's `2026-05-06 — UI/UX Reviewer P0 fixes` entry (immediately below).
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`.
- Industry-portability binding: user memory `project_team_industry_portability.md`.
- Peer-agent precedents: `agents/ops-security.md:211-247`, `agents/quality-engineer.md:90-100,166-174`.

---

## 2026-05-06 — UI/UX Reviewer P0 fixes from critic adversarial review (refinement pass #2)

**Trigger.** Same-day adversarial pass against the v0.5.1-baseline UI/UX Reviewer contract by Critic. Notes written to `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md`. Three P0 (blocking) concerns surfaced — all on the load-bearing surfaces the original org-designer proposal §"Cost / risk" already flagged as the largest risk vectors. User approved fixing the P0s atomically while leaving the 7 P1 quality-of-symmetry warnings (Activation Context section, Memory File Authority table, Future-Growth Lens section, dev-server / auth-bypass / Playwright-crash failure modes, etc.) for a follow-up pass. The 2 P2 observations stay unaddressed.

**The doctrine in one line.** Authoring stays orthogonal to judging — Reviewer files findings against impl, Designer owns spec edits, the two routes are independent and never substitutive. Anti-sycophancy gets peer-agent-parity teeth at three levels (single-pass substantive, cross-run, severity calibration). Playwright config gets fully separated — QE and Reviewer share the runner, never the config file.

**The three P0 fixes (each surgical, no scope creep):**

1. **Designer-seam protection invariant + worked example (P0-1).** Critic's reading: the prior Operating Principle 3, when read against the proposal's pressure-test scenario (spec says 40px, impl renders 32px, modern competitors all ship 32px), licensed `WRONG_AGENT: → Designer` revision-only routing as a substitute for filing the impl-side finding. That's exactly the seam collapse the role-split was supposed to prevent. Fix: Operating Principle 3 now opens with a load-bearing invariant — *"Reviewer files findings against implementation. Spec edits are Designer's exclusive territory. The two are independent: a finding can be filed AND a spec-revision recommended in the same pass; they do not block each other."* — followed by a worked example walking the 32px case end-to-end. Resolution path is explicit: file the impl-side finding (P0/P1 per visible impact); separately, optionally, file a `WRONG_AGENT: → Designer` handoff tagged `spec-revision-candidate` with reference rationale. The two are decoupled. The Wrong-Agent Returns table gains two new rows distinguishing the spec-internally-contradictory case (revision-only) from the references-have-moved case (additive, parallel impl finding still files). Algorithm step 4 (market calibration) updated to reference the doctrine.

2. **Anti-sycophancy with peer-agent parity teeth (P0-2).** Critic's reading: the prior single-pass trigger (`if P0=0 AND P1=0`) could be satisfied by five P2 polish items — calibrated-permissive drift would log as a logically-clean pass. Plus the cross-run rubber-stamp trigger (the 5-consecutive-clean-runs check) lived in Failure Modes, not Algorithm — observation, not enforcement. QE has it at Algorithm level (`agents/quality-engineer.md:79`); Ops/Security has it at Algorithm level (`agents/ops-security.md:110`); Critic has it at Algorithm level (`agents/critic.md:88-99`). UI/UX Reviewer didn't. Fix: Operating Principle 4 now codifies three triggers — (a) single-pass substantive (P2-heavy passes with ≥3 P2 and zero P0/P1 do NOT exempt the requirement), (b) cross-run (5+ consecutive zero-P0 reviews force the adversarial pass regardless of P1 count; threshold N=5 tunable by Org Designer), (c) severity calibration check (every pass, ask "would the user disagree with this severity? If yes-or-uncertain, escalate one tier" — re-rate before sign-off). Algorithm step 7 enumerates the three checks in order. Failure Modes "Rubber-stamp risk" updated to reference Algorithm enforcement rather than duplicate the rule.

3. **Playwright config separation — Authority↔Failure-Mode contradiction resolved (P0-3).** Critic flagged a direct internal contradiction: Authority forbade editing `playwright.config.ts`; Failure Modes mitigation said Reviewer "adds a `projects: []` entry only if needed" — a config edit. The original activation pass had already worked around the contradiction organically by creating `<project>/tests/visual/playwright.visual.config.ts` and running with `--config=tests/visual/playwright.visual.config.ts`. Critic recommended Option A (codify the organic pattern); Option B was allow scoped edits with QE handoff. Picked A. Fix: Algorithm step 4 now mandates the separate-config-file pattern — Reviewer creates and owns `tests/visual/playwright.visual.config.ts` (own testDir, viewport projects for the 375/768/1024/1440 sweep, own reporters, own headed-mode toggles); runs `npx playwright test --config=tests/visual/playwright.visual.config.ts` (or via an `npm run test:visual` script if QE/Tier 2 adds one). Authority table replaces the prior "Extend `playwright.config.ts`" cannot-row with two rows: a can-row for the separate config file plus an explicit cannot-row barring edits to QE's `playwright.config.ts`. Failure Modes "Tooling drift with QE" updated — neither config imports nor extends the other; no shared `projects: []` array.

**Why each fix matters.**

- **P0-1 doctrine:** without the invariant, the seam between Designer (author) and Reviewer (judge) collapses exactly when modern references move ahead of a dated spec — which is the most common drift scenario and the one the proposal §"Cost / risk" identified as the largest risk. Codifying the parallel-route rule (impl finding + optional spec-revision flag) prevents the future bad-pattern where Reviewer skips the impl finding because "the spec might be wrong anyway."
- **P0-2 teeth:** anti-sycophancy in a calibrated-permissive Reviewer is a runtime-observable failure mode the cross-run trigger catches earlier than the single-pass count check. Lifting it from Failure Modes (observation) into Algorithm (enforcement) matches the QE/Ops/Security/Critic shape — cross-pass calibration is a contract obligation, not just a debugging signal.
- **P0-3 config split:** internal contradictions in agent contracts are how seam friction starts. The first activation pass already discovered the working pattern organically; codifying it now means future invocations don't re-litigate the seam and don't risk a second-pass agent reading the contradiction the other way.

**No regressions to prior state.** The 154-line v0.5.1 baseline grows to 179 lines — well under the 300 ceiling and exactly at the 180 target upper bound. All four review-tier axes (Critic plan / QE runtime functional / Ops/Security runtime adversarial / UI/UX Reviewer runtime visual+IA) remain intact. No structural team change; no new agents activated; no agents retired.

**Active count unchanged:** 11 active + 11 planned (UI/UX Reviewer remains the 11th live agent).

**Critic re-review recommendation.** Batch critic re-review with the P1 pass — the 7 P1 warnings are quality-of-symmetry items (Activation Context, Memory File Authority, Future-Growth Lens, missing failure modes for dev-server / auth-bypass / Playwright-crash, project-type-agnostic framing language at L74, founding-project exception bounding) and merit a single coherent refinement cycle rather than two adversarial passes back-to-back. P0 fixes are self-evident structural corrections cleanly mapped to Critic's recommended directions; re-running adversarial review on a self-evident fix is amortizable.

**Cross-references.**
- Critic notes: `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- `CHANGELOG.md` v0.5.2 entry (this date) for the technical-release view.
- Prior refinement: this file's `2026-05-06 — UI/UX Reviewer refinements` entry.
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md` §"Cost / risk".

---

## 2026-05-06 — UI/UX Reviewer refinements: default-coverage portability + canon balance + changelog scope protocol + industry-portability vision codified

**Trigger.** Post-activation refinement pass on UI/UX Reviewer (activated earlier same day). User reviewed four open clarification items from activation and made calls. The non-trivial one — where the dashboard-specific default-coverage screenshot list lives — got resolved with a new binding strategic constraint: the team structure built for App Development must generalize across industries. User memory note `project_team_industry_portability.md` (2026-05-06) names marketing as the second concrete industry the team should support and instructs that defaults naming a stack be parameterized by project type or pushed upstream into the project's spec. This is now load-bearing for every future org decision.

**The industry-portability decision in one line.** UI/UX Reviewer is industry-portable; Designer is the per-project adapter. The team's architectural commitment is that framework-level agents stay project-type-agnostic; per-project specifics flow through Designer's `design-spec.md`.

**What changed (one logical refinement unit, atomic per `feedback_changelog_proactive.md`):**

1. **`agents/designer.md`** — Algorithm gains step 7: "Define `default-coverage` block." Output structure gains §7 (Default-Coverage for UI/UX Reviewer); existing §7 (Open Questions) renumbers to §8. Authority gains the right to define the block. Designer is now responsible for translating PRD user stories into the per-project screenshot list with auth/admin gates, breakpoints, states, and auth-setup notes.

2. **`agents/ui-ux-reviewer.md`** — Algorithm step 2 replaced: instead of a hardcoded dashboard-specific list, Reviewer reads `design-spec.md`'s `default-coverage` block (§7). If absent, emits `WRONG_AGENT: → Designer` with a specific message. A new founding-project exception covers the bootstrap case (e.g., <project> at activation): Reviewer may run a one-time exploratory pass and output a "Recommended default-coverage block for design-spec.md" section that Designer lifts into the spec on next iteration. Wrong-Agent Returns table gains "Project missing design-spec.md default-coverage block → Designer" row. Net file size: 160 → 154 lines (-6, well under the 300 ceiling).

3. **`templates/design-spec.md`** — §7 (Default-Coverage) added with route table + breakpoints + states + auth-setup notes; §7→§8 renumber for Open Questions.

4. **`memory/ui-references.md`** — Anthropic Console entry removed to avoid self-referential bias risk for an Anthropic-built agent team. Top-of-file revision note added. New "Considered but not seeded" section documents the deferral rationale so a future addition is informed. Quarterly canon review may reconsider.

5. **`protocols/changelog-protocol.md`** — **NEW.** Codifies the scope split: framework changelog (`.claude/memory/agent-changelog.md`) for team-shape changes that span projects; project changelog (`<project>/.claude/memory/agent-changelog.md`) for project-scoped agent activity. Both updated atomically when a team-shape change has project-specific consequences. Operationalizes the atomic-cadence rule from user memory `feedback_changelog_proactive.md`. Pointers added to both `agent-changelog.md` headers.

**Why each refinement matters:**

- **Default-coverage portability:** without it, the team can't ship a marketing-site project (or any non-dashboard project type) without rewriting Reviewer's prompt. With it, Reviewer's contract is stable across industries; Designer absorbs project-type variability where it belongs.
- **Canon balance:** an agent team built by Anthropic citing Anthropic's own product as a "modern reference" creates a subtle taste-bias risk that compounds over time. Removing it now is cheaper than catching the drift later. Six entries (4 Tier-A + 2 Tier-B) are sufficient for the dashboard project type; quarterly canon review can revisit.
- **Changelog scope protocol:** the prior implicit-scope arrangement was already showing drift (entries occasionally appearing in only one file when they belonged in both). Codifying the split now — with two active changelogs and the user's atomic-cadence rule in force — prevents the drift compounding.

**No regressions to prior activation.** The 160-line `ui-ux-reviewer.md` baseline is preserved structurally; this pass surgically replaced one block (hardcoded list) and added one paragraph (founding-project exception) and one table row. All four review-tier axes (Critic plan / QE runtime functional / Ops/Security runtime adversarial / UI/UX Reviewer runtime visual+IA) remain intact.

**Active count unchanged:** 11 active + 11 planned (UI/UX Reviewer remains the 11th live agent). No new agents activated, no agents retired, no splits or merges proposed.

**Cross-references.**
- `CHANGELOG.md` v0.5.1 entry (this date) for the technical-release view.
- Prior activation: this file's `2026-05-06 — UI/UX Reviewer activated` entry.
- User memory note: `~/.claude/projects/<project>/memory/project_team_industry_portability.md`.
- Atomic-cadence source: `~/.claude/projects/<project>/memory/feedback_changelog_proactive.md`.

---

## 2026-05-06 — UI/UX Reviewer activated (live, fourth review-tier axis)

**Trigger:** User `/grow-team` invocation surfaced a structural mandate gap — no agent owned the runtime visual / IA / interaction-pattern axis of review. Designer writes the spec forward-looking; Critic reviews text-on-disk; QE reviews runtime correctness; Ops/Security reviews runtime adversariality. None of them screenshot the deployed UI and compare against the spec or against modern reference dashboards. Mapping every active and planned agent against the question *"who owns visual / IA critique of running UIs?"* returned empty. Same diagnostic shape that justified QE (2026-05-05) and Ops/Security (2026-05-06) activations: when the gap is a **mandate gap** rather than a **frequency gap**, you fix the mandate even on N=1.

User directive, verbatim: *"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create and implement the most modern stack/design theming ... seeing layout and changes that are logical without needing user screenshots or inputs."* User approval, verbatim: *"Yes. I approve this. The additional agent will really help in overall app development processes and especially user functionality."* Full proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`.

**What changed (6 net-new files + 4 small updates to existing contracts):**

1. **NEW:** `agents/ui-ux-reviewer.md` — full agent contract (160 lines). Live activation, not stub-first. Mandate: visual review of running UIs, IA review of multi-button rows and navigation hierarchies, modern-stack market scan against Tier-A reference dashboards, default-coverage screenshot pass at handed-off → shipped, market calibration against `design-spec.md` at Designer-finalize. Three invocation paths in the algorithm: Designer-finalize calibration / pre-ship gate default-coverage / on-demand `/design-review`. Authority section explicitly forbids editing `design-spec.md` (Designer's territory) and Tier 2 code (implementer's territory). Anti-sycophancy clause + Designer-seam-protection clause in Operating Principles.
2. **NEW:** `templates/design-review.md` — output template. Sections: Project context, Pages reviewed (enumerated with screenshot path), Blocking findings (P0), Notable findings (P1), Polish backlog (P2), References cited, Anti-sycophancy log, Sign-off.
3. **NEW:** `commands/design-review.md` — slash command. `/design-review <slug>` for full default-coverage; `/design-review <slug> <page>` for focused review.
4. **NEW:** `memory/ui-references.md` — append-only canon seeded with 7 reference dashboards (Tier-A: Vercel, Linear, Stripe Dashboard, Railway; Tier-B: GitHub Projects, Notion, Anthropic Console). Each entry: name, URL, why-it's-on-the-list, what-pattern-to-borrow, provenance.
5. **NEW:** `memory/ui-patterns.md` — empty file with append-only protocol header. Fills as projects ship.
6. **NEW:** `memory/ui-anti-patterns.md` — append-only file with one seed entry (`Mixed-mental-model button row`) — peer-positioning a primary CTA, an ambient maintenance action, and admin-only navigation in one button row breaks IA. (Seed entry's project-attributable provenance — file path + project slug — lives in the file itself per the per-file provenance convention; not duplicated here.)
7. **UPDATED:** `agents/designer.md` — Wrong-Agent Returns table gains row `Critique of running UI / drift from spec → UI/UX Reviewer`. One-line addition; does not change Designer's mandate.
8. **UPDATED:** `agents/critic.md` — Wrong-Agent Returns table gains row `Critique of running UI / visual / IA → UI/UX Reviewer`. One-line addition.
9. **UPDATED:** `agents/conductor.md` — new "Review-tier fan-out at `handed-off → shipped`" subsection (~10 lines) under Hard Checkpoints. Documents that QE, Ops/Security, and UI/UX Reviewer fire in parallel at the gate; Decision Packet consolidates findings only after all reviews report.
10. **UPDATED:** `agents/executive-assistant.md` — Read-on-Every-Invocation list gains three review-tier artifact paths (`smoke-report.md`, `security-audit.md`, `design-review.md`) so EA surfaces all three in handed-off Decision Packets.

**Pattern this completes — four-axis review tier:**

| Axis | Owner | Reviews |
|---|---|---|
| Plan / artifact | Critic | Text on disk (PRDs, scopes, design specs) |
| Runtime functional | QE | Does the deployed system do what was specified? |
| Runtime adversarial | Ops/Security | Can the deployed system be made to do what wasn't specified? |
| **Runtime visual / IA / interaction** | **UI/UX Reviewer** | **Does the deployed UI feel logical, modern, and faithful to spec?** |

Each axis has independent fire conditions, parallel-friendly placement at the `handed-off` gate, its own append-only memory file(s), and an independent blocking authority. The pattern is symmetric across all four axes — same Operating-Principle shape (citation discipline, anti-sycophancy fallback, append-only memory, scope-aware paranoia where applicable).

**Why live activation (vs. stub-first):**

The user invoked with concrete evidence already in hand (a screenshot surfaced two concrete findings — both filed at activation as project backlog entries) AND was naming a forward-looking responsibility the team has been under-fulfilling. A stub would be one round-trip of overhead; the user had already done the trigger work. Live activation matches the Ops/Security 2026-05-06 precedent.

> *Project-attributable evidence (specific findings, file paths, backlog IDs, the screenshot diagnosis):* see `memory/agent-changelog-private.md` — *2026-05-06 entry on UI/UX Reviewer activation surfaced from a single screenshot*. The categorical activation rationale (mandate gap on the runtime visual / IA / interaction axis) is stable; the specific findings that surfaced it are project-attributable.

**Key risk and mitigation:**

The single largest risk is **mandate confusion with Designer**. Three layers of mitigation in the contract: (1) mandate-line-of-demarcation — Designer writes the spec forward-looking, UI Reviewer reads it; UI Reviewer never edits the spec; drift between spec and impl is filed as an implementation bug, not a spec bug. (2) Wrong-Agent Returns codified in both contracts — UI Reviewer redirects spec-revision requests to Designer, Designer redirects "critique of running UI" to UI Reviewer. (3) Org Designer audits the seam quarterly — does friction surface in routing-log? Are there `WRONG_AGENT` returns between Designer and UI Reviewer? If yes after 90 days of co-existence, reconsider the split.

**Tooling integration — no new dependencies:**

Playwright is already installed as part of QE infrastructure. Opus 4.7 is multimodal — reads screenshots directly. UI/UX Reviewer's tests live in `tests/visual/` (architecturally separate from QE's `tests/e2e/`); QE retains sole ownership of `playwright.config.ts`. UI Reviewer adds test files only, never extends config.

**Will measure:**

- **Findings density per pass** — target 1-3 P0+P1 findings per first-pass `design-review.md`. Zero = anti-sycophancy fallback fires (forced second pass). >5 P2 with no P0/P1 = pixel-pusher drift signal.
- **Designer/Reviewer seam friction** — count `WRONG_AGENT: → Designer` revision requests per project. >1 per project = surface to Org Designer for seam audit.
- **Reference-canon currency** — `memory/ui-references.md` entries with provenance >6 months old get reviewed quarterly for currency by Org Designer.
- **30-day calibration window** — if UI Reviewer fires <3 substantive findings per project across the next 30 days, recalibrate or retire (proposal-stated risk acknowledgment of N=1 evidence base).

**Notes for future agents:**

- `bug_reports` table is for runtime errors (`withErrorCapture`); `incidents.md` is for structural failures; `design-review.md` is for visual / IA findings. Mis-routing is detectable from the output type. UI/UX Reviewer must not pollute the bug-reports table.
- When 3+ projects share a positive UI pattern in `memory/ui-patterns.md` or anti-pattern in `memory/ui-anti-patterns.md`, Org Designer proposes promotion to `templates/design-spec.md` defaults or to a `templates/stacks/<stack>/docs/` design convention via the standard org-designer-proposals path.
- The four-axis review tier is now load-bearing for `handed-off → shipped`. If any one axis goes silent across 3+ ships, that's a calibration signal — Org Designer mines it.

**Founding team count:** 10 active + 11 planned → **11 active** + 11 planned. UI/UX Reviewer is the 11th live agent.

---

## 2026-05-06 — QE prompt merge: planned-stub institutional memory absorbed into active (v1.5 Phase 0.1)

**Trigger.** Managed-surface positioning under TapAgents v1.5 (the milestone where the dashboard pushes framework updates into user repos rather than asking users to pull) puts vendor-owned regression discipline at every release gate. QE is the agent that owns runtime verification — the active prompt was production-tested but missing institutional memory the planned stub had. With v1.5 introducing weekly minor / monthly major / quarterly structural release cadence, that gap couldn't stay open.

**What changed.** Active `agents/quality-engineer.md` (12K) gained four additive sections from the planned stub at `agents/_planned/quality-engineer.md` (17K): tier clarification (HQ vs Tier 2 QE coexistence), future-growth lens (fragmentation triggers and sub-role spawn thresholds), cross-references block, and a 2-sentence state-machine 2-step gate narrative in the Algorithm intro. The active file's production gains — `TEST_AUTH_BYPASS` pattern, refined `trigger_conditions` frontmatter, full "Read on Every Invocation" list — were preserved.

**Org-designer's load-bearing finding.** This was originally framed as a wholesale overwrite ("planned 17K replaces active 12K"). A diff revealed neither file was a superset; overwriting would have destroyed production-tested behavior. The proposal at `agents/_planned/_proposals/qe-promotion-2026-05-06.md` reframed it as a merge. Critic-style adversarial review of producer's first instinct — surfaced before any file moved.

**Disposition of the stub.** Renamed `_planned/quality-engineer-superseded-2026-05-06.md`. Retained indefinitely as user-confirmed historical reference (carries the original activation rationale and the 11-step activation checklist that documents how the agent came online).

**Lesson worth keeping.** Promotions of `_planned` agents to active are merges by default, not overwrites. When `_planned` was authored before activation, the live version may have evolved past it; assume neither file is a superset until you've diffed them.

**Cross-references.** v1.5 execution plan at `<project>/.claude/docs/v1.5-execution-plan.md` Phase 0.1; promotion proposal at `agents/_planned/_proposals/qe-promotion-2026-05-06.md`.

---

## 2026-05-06 — Tier B audit: <project> `dev → main` promotion (M1 → M2 cutover, 21-commit merge)

**Tier B operation per protocol §3.1 (`git push to main`).** User-explicit approval requested + given (verbatim text *"Go. Let's do it."*) due to scope: 19-commit promotion + 1 inline UX fix + merge commit. Surfacing was the right call — Tier B becomes Tier C in spirit when scope crosses M-milestone boundaries even if the mechanical action (push to main) is technically autonomous-with-audit.

**Sequence:** post-BL-005 smoke test surfaced user-visible regression on `/auth/success` → diagnosis revealed dev/main drift (19 commits) → architect-style proposal-with-rollback → user approval → code change + push dev + merge dev→main with --no-ff + push main → Vercel auto-deploy fires (build 40s) → end-to-end verification on `https://hq.tapintomymind.com`.

**Two protocol-level lessons:**
1. **Dev-vs-main drift is silent.** Nothing in current protocols surfaces "dev is N commits ahead of main" when N grows past load-bearing. Codify a Conductor or EA-briefing check; belongs in `protocols/local-first-dev.md` (still on backlog as BL-001).
2. **Tier B becomes Tier C in spirit when scope crosses M-milestone boundaries.** Heuristic to add to the protocol: a Tier B push warrants explicit user gate when (a) M-milestone scope, (b) DB schema additions, (c) new agent activations, or (d) cross-cutting feature flags. One of these → decision packet.

---

## 2026-05-06 — Tier C audit: first custom-domain cutover for a Tier 2 project

**Tier C operation (Production env vars + DNS + GitHub App config).** The team produced a decision packet, user approved with verbatim text *"Let's go for custom domain first, then BL13 is next"*, team executed under user approval. End-to-end smoke test confirmed by user post-cutover: *"The new domain worked fully."*

**Sequence:** decision packet authored by Architect → user approval → Conductor + deployment-agent equivalent execute (Vercel domain registration → Squarespace DNS → SSL force-issue → env-var swap on Production scope only with Preview-scope preserved → production redeploy → end-to-end OAuth verify) → user smoke test → Tier C audit entry.

**Lesson surfaced for the protocol:** when not migrating to Vercel-managed nameservers (i.e., A-record approach against a third-party registrar), Vercel does not auto-issue the Let's Encrypt certificate. Manual `vercel certs issue <domain>` is required after DNS resolves. This belongs in `protocols/autonomous-ops-permissions.md §3.1` or in a future `templates/stacks/nextjs/docs/custom-domain-setup.md` so future Tier 2 cutovers don't waste a polling cycle waiting on auto-issuance that never fires.

**Lesson surfaced for the team flow:** scoping `vercel env rm <name> production` removes from BOTH Production AND Preview when the existing entry covers both targets — the entry is atomic, not per-scope. Re-add to Preview explicitly as a follow-on step. Captured in the project-private narrative.

---

## 2026-05-04 — Initial team scaffold

Founding team established with 7 agents:
- Intake (Director of Product Discovery)
- Executive Assistant (Chief of Staff)
- Conductor (CTO/CPO)
- Strategist (VP Product)
- Architect (VP Engineering)
- Critic (Independent advisor)
- Org Designer (Head of People)

Plus 5 stub agents in `_planned/` for future activation:
- GTM Strategist
- Growth Analyst
- Customer Researcher
- Industry Researcher
- Feedback Synthesizer

Model strategy:
- Opus for reasoning-heavy roles (Intake, Strategist, Architect, Critic, Org Designer)
- Sonnet for routing/summarization (Conductor, EA)

Why these 7: balance of CEO-facing (Intake + EA) and backstage (Conductor + producers + Critic + Org Designer). Adversarial separation between producers and Critic from day one. Org Designer separated from Conductor so team-evolution doesn't get crowded out by execution.

Why these 5 stubs: post-shipping roles (GTM, Growth, Feedback) and depth-on-demand specialists (Researchers). Intentionally NOT building until first project triggers their activation.

Design spec: `docs/specs/2026-05-04-framework-design.md`

---

## 2026-05-05 — Activated Designer agent (from `_planned/`)

**Trigger:** User explicitly approved at intake Round 3 (Q7=A) for the first Tier 2 `<project>`. The project requires a robust design system as a v1 deliverable, not a v2 retrofit.

**What changed:**
- `agents/_planned/designer.md` (stub) → `agents/designer.md` (full contract).
- Designer's contract follows Strategist/Architect shape: mandate, inputs, outputs, authority, failure modes, triggers, wrong-agent returns.
- Model: Opus (reasoning-heavy taste calls).
- Triggers: parallel to Strategist during `briefed`/`stratego`, parallel to Architect during `scoping` (when project has UI scope).
- New slash command: `commands/designer.md`.
- New template: `templates/design-spec.md` (the design system + UX deliverable).

**Why activated this early (vs waiting for friction across multiple projects):**
- The team's first real project (the companion app for the framework itself) demands a coherent design system from v1, not a Tailwind-default afterthought.
- Activating early lets us validate the role under real workload immediately.

**Will measure:**
- Does Designer's output let Architect reduce tech-strategy effort on UI? (Should — pre-defined tokens and components mean Architect just picks libraries.)
- Does Tier 2 implementation match the spec without heavy revision? (Tracked via critic-notes in Tier 2.)
- Does user override Designer's calls frequently? (If yes, calibration off.)

**Founding team count:** 7 → 8.

---

## 2026-05-05 — Dispatch-efficiency protocol added

**Trigger:** User flagged token waste during the <project> session (~12 subagent dispatches with redundant 64KB context inlined and model-mismatched defaults). Org Designer dispatched for audit + codification.

**What changed:**
- New file: `protocols/dispatch-efficiency.md` — codifies the lean dispatch pattern (template, section-level pointing, model selection table, when-not-to-dispatch, anti-patterns, self-check).
- Two new entries in `memory/patterns.md`: "Dispatch efficiency" and "Model selection by task complexity".
- Cross-reference appended to `agents/conductor.md` so future Conductor invocations follow the protocol.

**Why now (vs friction-prove-itself threshold):**
- Token waste was visible in a single session — no need to wait for a 3-project pattern.
- The fix is purely additive (new protocol + cross-references), not a structural change to any agent's role.
- Conductor and EA both dispatch subagents; codifying once benefits both.

**Will measure:**
- Dispatch brief sizes (target: ~500–800 bytes).
- Model distribution across dispatches (expect: more Sonnet, less Opus on mechanical tasks).
- Frequency of dispatch-for-tiny-fixes (expect: drops; more inline handling).

## 2026-05-05 — Production deployment + cross-tier bug observability shipped

**Trigger:** First Tier 2 project (TapHQ / <project>) reached production-ready state. User completed Vercel Pro signup, Neon DB setup, GitHub App registration. Production URL went live at the prod Vercel alias (`<prod-vercel-alias>`).

**What changed:**
1. **Production deployment infrastructure** — Vercel Pro project linked to `<org>/<project>`, env vars configured (10 vars including encrypted token key + GitHub App private key inline-PEM), GitHub App callback URLs registered for prod URL, `maxDuration=120` set on the create-project route to clear Vercel Pro's 60s default ceiling. Custom domain `hq.tapintomymind.com` queued (DNS + SSL pending).
2. **First production incident captured + resolved** — `scaffold_build_failed (500)` on initial smoke test. Root cause: `build-tree.ts` hardcoded a Mac filesystem path that doesn't exist on Vercel serverless. Fix: bundle Tier 1 framework into `<project>/scaffold-source/` at build time, committed snapshot to repo, prebuild script made tolerant of missing source. See `memory/incidents.md` §1 for the full incident.
3. **Cross-tier bug observability system** — new mechanism for capturing failures and routing them through the team's learning loop:
   - **Tier 2 (<project>):** new `bug_reports` table, `withErrorCapture` middleware wrapping API routes, `/admin/bugs` admin view (gated to `<operator>`), `error.tsx` global client error boundary, `/api/bugs/report` ingest, `/api/bugs/[id]/promote` returns formatted markdown for manual paste into incidents.md.
   - **Tier 1 (this framework):** new `memory/incidents.md` (cross-project failure log, append-only), Conductor contract updated to write incidents on 6 trigger events (consistency-check failure, wrong-agent return, hard-checkpoint blocked unexpected, Tier 2 blocked >24h, dissent fired, audit-gap-caught-later), Org Designer contract updated to mine incidents for patterns (3+ similar → propose pattern or audit-template update), EA contract updated to surface recent incidents (last 7 days) in briefings, new `protocols/incident-protocol.md` defining the full workflow.

**Why this much, this fast:**
- User explicit ask: "I want to be robust in my company so having a bug logger is also crucial for learning."
- Production-readiness audit (commit 9233fa9) had a scoped 4-item checklist that missed filesystem dependencies → a single bug exposed a real audit gap. Closing this loop systemically (every bug now traces to a checklist update or pattern proposal) prevents the same class of miss recurring.
- Cross-tier integration was the right call — bugs become institutional learning input, not just runtime errors.

**Will measure:**
- Time from bug capture to root-cause identification (currently: hours of conversation; target: minutes via /admin/bugs feed).
- Frequency of pattern-candidate fires from Org Designer (target: 1+ pattern proposed per 5 incidents).
- Production audit-checklist evolution: scaffold incident already triggered "filesystem dependencies" as a pattern candidate. Track whether 3+ incidents fire similar patterns within the next 4-week window.

**Notes for future agents:**
- All Tier 2 implementations should wrap API routes with `withErrorCapture` from day 1. Don't bolt on observability later.
- All production-readiness audits must explicitly check filesystem-and-network dependencies. The audit template should evolve to require this.
- The bug → incident → pattern → audit-template-update loop is now the canonical learning mechanism. Use it.

**Founding team count:** 8 (no agent activations tonight).

---

## 2026-05-05 — Autonomous Operations Permissions framework codified

**Trigger:** User observation during the production deployment session: *"Why can't you do this? I would need this done by my agent team if we want an autonomous team."* Two operational permission walls hit in the same session — `git push` to main, and `npm run db:push` against the dev branch — both resolved by adding entries to `settings.local.json`'s `allow` array. The pattern was clear: the team needed an explicit doctrine for what is autonomous, what gets gated, and what is never agent-driven, rather than ad-hoc permission asks every time a new ops shape appeared.

User directive, verbatim: *"I want autonomy with auditing and, if we really deem necessary, user gates where we get more inputs in the form of a board meeting with the ceo himself."*

**What changed (3 files):**
1. **NEW:** `protocols/autonomous-ops-permissions.md` — full doctrine. Four tiers (A: fully autonomous; B: autonomous with audit; C: gated via board-meeting Decision Packet; D: always user, never agent), with concrete examples per tier. Per-Neon-branch logic for `db:push` (recommend `NEON_BRANCH` env var; fall back to `DATABASE_URL` hostname parsing; default to Tier C on ambiguity). How to grant new permissions via `~/.claude/settings.local.json` or project-local `.claude/settings.local.json` `allow` arrays, with common Bash patterns documented. Conductor-may-escalate rule (B → C) with concrete triggers (user-id schema touches, payment code, post-CI-failure pushes, stacked Tier B actions). Audit definition: every Tier B (and approved Tier C) gets one grep-able entry in `agent-changelog.md`; failures route to `incidents.md` with a breadcrumb.
2. **UPDATED:** `agents/conductor.md` — added `## Operations Routing` section (after Tier 2 Reportback Monitoring, before Incident Logging). Conductor is the classifier for every ops action; references the protocol for tier definitions; defines state-signaling per tier; adds an Ops routing-log entry shape. New Read on every invocation entry for the protocol.
3. **UPDATED:** `agents/executive-assistant.md` — added `## Output Formats` variant `Ops Decision Packet — Board Meeting Format` (Tier C) plus a Tier D `User Action Required` hand-off shape. Same 250–400 word envelope as other Decision Packets. Tone: framed as a board meeting with the CEO — irreversibility + rollback + exact command up front so the CEO can decide quickly. New Read on every invocation entry for the protocol.

**Why now (vs friction-prove-itself threshold):**
Two ops blocks in a single session was sufficient signal — pattern was already visible. The fix is purely doctrinal (one new protocol + cross-references in two existing agent contracts), not a structural team change. Codifying once unblocks every future project; waiting for a third or fourth wall would have been pure overhead given the user's explicit autonomy directive.

**Decisions made during codification:**
- **Neon branch detection mechanism:** recommend the explicit `NEON_BRANCH` env var (explicit > implicit), with `DATABASE_URL` hostname parsing as fallback. Architect's stack templates should bake `NEON_BRANCH` into the env scaffold from day one.
- **Escalation threshold:** "better to over-escalate than under-escalate" is the doctrinal rule; concrete triggers listed in §5 (user-id constraints, drop/rename column, payment code paths, post-CI-failure pushes, >3 Tier B actions in <10 min).
- **No runtime code:** this is doctrine the team enforces, not an `ops-tier.ts` helper. The Conductor classifier is a contract, not a library. Keeps the framework declarative and stack-agnostic.
- **Settings precedence:** project-local `.claude/settings.local.json` overrides global `~/.claude/settings.local.json` for that project's session; both honor the `Bash(...)` pattern in the `allow` array. Use the `update-config` skill for any allow-array edits.

**Will measure:**
- Frequency of Tier C "board meeting" escalations — target: <1/week once steady-state. Higher = doctrine is too cautious or escalation rule too aggressive.
- Time-to-execute for Tier B ops — target: <30 sec inline (no permission round-trip; just classify, execute, append audit entry).
- User-facing surprise count — target: zero. The user should never be surprised by what the team did or did not do. Any "wait, you ran what?" or "wait, why didn't you run that?" moment is a calibration miss to log under `audit_gap_caught_later` in `incidents.md`.
- Calibration of the escalation rule (§5) — Org Designer should mine the audit log periodically: too few escalations = under-cautious; too many = annoying.

**Founding team count:** 8 (no agent activations).

---

## 2026-05-05 — Quality Engineer hired as STUB (10th planned role) + 2 parallel patches

**Trigger:** Org Designer evaluation triggered by user question — *"Does our C-suite need a tester agent?"* — surfaced after the team's first post-deploy production incident (`memory/incidents.md` 2026-05-05 — Scaffold path fails on Vercel serverless). The incident's root cause traced to an audit gap: Architect's production-readiness audit had a 4-item checklist that missed filesystem-dependency assumptions. Mapping every active and planned agent against the question *"who exercises the running system before / after ship?"* returned empty. Gap is structural, not statistical (N=1).

User directive, verbatim: *"I want to give the most robust and well versed team to people where the agents are top quality, as if we are the ones who run Anthropic and large companies to decision make."* Hiring decision treated with that bar.

**What changed (4 files + 1 new):**

1. **NEW:** `agents/_planned/quality-engineer.md` — stub for the 10th planned role. Mandate: owns runtime axis of review (smoke-test execution against deployed system, bug reproduction + fix verification, environment-dependency audits, exploratory testing of running code). Counterpart to Critic on the plan axis. Two-axis review tier when activated. Full provisional contract included so activation is a fill-in, not a redesign.
2. **UPDATED:** `agents/_planned/README.md` — stub count 9 → 10; new "Review tier (HQ)" section with QE row; "Why These 9 Specifically" → "Why These 10 Specifically" with QE rationale; "Not in stubs" note refined to clarify the QA/quality boundary (Tier 2 owns *implementation* QA inside one codebase; HQ QE owns *cross-project quality strategy + smoke-test execution + runtime-pattern memory*).
3. **UPDATED:** `agents/architect.md` — mechanical verification checklist (scaffold phase, L96+) gains a **Runtime-environment dependency review** item with explicit sub-checks for filesystem, network egress, env vars/secrets, region/latency, and concurrency/persistence assumptions. Treats absence of `tech-strategy.md §"Runtime Assumptions"` as a blocking gap. Provenance cited inline: 2026-05-05 scaffold-path incident.
4. **UPDATED:** `agents/critic.md` — Pattern Library Tech-strategy-specific section gains two new flags: (a) missing or incomplete `§"Runtime Assumptions"` section → `blocking` (mirrors Architect's new requirement); (b) no deployed-system test plan referenced → `warning` (placeholder until QE activates).

**Activation trigger for QE (refined from initial draft):** activates on the **first** of — (a) next post-deploy incident with runtime/deploy/env root cause not catchable by code review; (b) project handling paid users / payments / user-data writes; (c) project where Architect's tech-strategy explicitly cites runtime risk as one of the 3 named risks. OR-conditions; first to fire activates.

**Why STUB form (vs live activation):**

- N=1 evidence. Org Designer's own 3+ recurrence threshold normally protects against premature specialization on noise. The structural-gap argument breaks the rule, but stub form is the minimum-cost expression of the same conclusion.
- The two parallel patches (Architect audit-checklist + Critic pattern-library) close the seed-incident's class of failure without a live agent, providing layered defense until activation.
- The activation trigger is concrete and near — likely fires within weeks of normal product work — so stub-form ROI is high.
- Stub on disk = ready-to-fire design. When trigger fires, activation is filling in templates + slash command + state-machine wiring, not designing under pressure.

**Why this hiring proposal was treated formally (vs an inline edit):**

The user's "as if we run Anthropic" directive raised the bar. Hiring evaluations get a formal proposal artifact in `workspace/_global/org-designer-proposals/` with cited evidence, alternatives considered, future-growth lens, and implementation sketch — exactly the artifact a real Head of People would produce for an exec-staff hiring discussion. Proposal: `workspace/_global/org-designer-proposals/20260505-2330-quality-engineer.md`.

**Will measure:**

- Time from QE stub creation to activation trigger firing — informs whether the trigger is well-calibrated (target: 2-12 weeks; faster = trigger too sensitive; slower = trigger too conservative).
- Number of incidents avoided by the parallel patches alone (Architect's runtime-assumptions check + Critic's blocking-on-missing-section flag) before QE activates. If 2+ incidents are caught at the artifact-review stage by Critic flagging a missing Runtime Assumptions section, the patches are doing real work.
- Once QE activates: percentage of `handed-off → shipped` transitions blocked by smoke-report failures vs cleared. Calibration target: 1-2 blocks per 10 ships in the first quarter (low number = QE adding insufficient signal; high number = either deployment quality is off or QE is over-flagging).
- At 10+ shipped projects: whether QE has accumulated enough material in `memory/runtime-gotchas.md` and `memory/test-patterns.md` to compound (target: 5+ entries per file).

**Future-growth path baked in:**

At 5x team size or 10 shipped projects, QE fragments into Test Strategist (plans, exploratory) + Verification Engineer (executes, files reproductions). Sub-roles spawn: Performance Engineer at >1k DAU; Accessibility Tester at enterprise/regulated; Compatibility Tester at multi-platform. Per-project Tier 2 mirrors at scale (matching how Tier 2 already gets a deployment agent). Plan documented in `_planned/quality-engineer.md` §"Future-Growth Lens" so the role isn't an evolutionary dead-end.

**Founding team count:** 8 active + 9 planned → 8 active + 10 planned. No live activation tonight; live count unchanged.

---

## 2026-05-05 — Dev/main branch workflow + observability ping endpoint

**Trigger:** User stated workflow preference, verbatim: *"I usually always want main, dev, and feature branch setups when we work. The main branch is what keeps deploying, but the dev is where we work locally to test changes before pushing to main."* In the same session, an attempt to verify bug capture by sending malformed JSON to `/api/bugs/report` failed because that route returns 400 (correct behavior — handles parse errors gracefully) but the bug logger only fires on 5xx. Both issues resolved together.

**What changed (Tier 2 / <project>):**
1. **NEW:** `src/app/api/admin/test-error/route.ts` — observability ping endpoint. Admin-gated (404 not 403, same pattern as `/admin/bugs`). `?type=throw` triggers a thrown Error; `?type=500` returns a 5xx response. Both paths get captured by `withErrorCapture` → written to `bug_reports` table. Standard pattern — every observability stack has one (Sentry's "Send a test event," Datadog synthetic checks). Commit: `fe22b4c` on <project> main.
2. **NEW:** `dev` branch on `<org>/<project>`. Workflow now: local development on `dev`, push to `dev` triggers Vercel preview deployment, `dev` → `main` merge triggers Vercel production deployment. Local → QA → Prod rhythm formalized.
3. **`.env.local` updated** to point at the dev Neon branch (`<dev-neon-branch>`) instead of the original/prod branch (`<prod-neon-branch>`). Added `NEON_BRANCH=dev` env var per `protocols/autonomous-ops-permissions.md` per-branch logic. Vercel prod env still has the prod branch URL (gitignored from the repo).

**What changed (Tier 1 / this framework):** nothing structural. The autonomous-ops-permissions doctrine codified earlier today already accommodates this workflow. The `dev = Tier B autonomous, main = Tier B autonomous with audit + extra escalation triggers` mapping in §3 of that protocol applies cleanly.

**Why now (vs deferring to a future "local-first-dev" protocol doc):**
The user's preference was explicit and immediate. Setting up the dev branch + the test endpoint mid-session unblocked the bug-logger smoke test (which had been stuck because there was no clean way to trigger a 5xx). Codifying the dev/main/feature flow as its own protocol doc is still queued (`protocols/local-first-dev.md` — pending user go-ahead) — this entry is the operational record; the protocol doc would be the formal codification.

**Decisions made during execution:**
- **Branch creation order:** created `dev` from current `main` HEAD (which already had `ca8050b` scaffold-source snapshot). `dev` immediately diverged when the test-error endpoint was committed there; merged back to `main` via fast-forward after local verification.
- **GitHub App callback URLs:** preview URLs (`*-<org>-projects.vercel.app`) are NOT registered yet. Sign-in works on local + prod but NOT on preview. Two future options: (a) wildcard `https://*.vercel.app/api/auth/github/callback` registered with GitHub App; (b) Vercel "preview branch domain" feature for stable preview URL. Both deferred — for tonight, preview is "did the build pass?" check only.
- **Test endpoint scope:** GET only, two query-param modes (`throw` / `500`). Kept intentionally narrow. Documented inline that this endpoint must NEVER be called from client code or background jobs (every call generates a `bug_reports` row).

**Will measure:**
- **Time-to-confidence per change** — local test pass + preview build pass + prod deploy pass. Baseline: ~5 min for a small change tonight (npm run dev → test → commit → push dev → preview build → merge to main → prod build → prod test). Target: stable around there for small Tier B changes.
- **Frequency of "preview build broke prod" incidents** — should be ZERO if local + preview verification is honest. Any incident here = local/preview QA was insufficient → escalate to Tier C for that change class.
- **GitHub App callback URL friction** — if user hits sign-in failures on preview URLs more than 2x, that's the trigger to register wildcard or stable preview domain (no longer optional).

**Founding team count:** 8 active (no agent activations).

---

## 2026-05-06 — Incident-loop revolution closed (v0.4.0): protocol enhanced + cross-tier infra shipped

**Trigger:** Tap directive to "confirm with the rest of the 3 since I have another session working and make sure we have everything we need," referencing the three open punch-list items from earlier session: (1) no SQL migration for `bug_reports`, (2) no `protocols/incident-protocol.md`, (3) `withErrorCapture` only on 3 of 9 API routes. Other session was concurrently working on dashboard production deployment debugging on the `dev` branch (added `/api/admin/test-error` synthetic capture in `fe22b4c` and the protocol document itself in an earlier commit).

User branch strategy clarified mid-session: `main` = prod, `dev` = local + qa, `feature` = isolated. Tap-agents framework currently on `main` only; <project> uses dev → main flow.

**What changed:**

1. **Incident protocol enhanced** — `protocols/incident-protocol.md` was authored by the other session at 2026-05-05T23:19. Rather than rewrite, this session added 4 enhancement passes (~70 lines added to a ~140-line base):
   - **§1.1 Sanitization Contract** — codified the security boundary as a table (headers stripped, body keys redacted, query params dropped, failure fallback). Sanitization is now visible in the protocol, not just buried in `error-capture.ts`. Future-reviewers don't have to reverse-engineer security guarantees from code.
   - **§4.5 Conductor Auto-Triggers** — listed the 6 framework-internal trigger events that bypass manual paste (Conductor appends directly). Documented that `incidents.md` interleaves user-pasted and Conductor-appended entries, both same shape, so Org Designer mining works uniformly across both sources.
   - **§5 threshold rules refined** — keeps N=3 pattern threshold but explicitly allows N=1 one-shot lessons when the diagnosis is structurally complete (lock-in of the 2026-05-05 scaffold path → Architect runtime-deps patch precedent).
   - **§5.1 Quality Engineer reference** — first formal cross-reference to `_planned/quality-engineer.md`, naming QE as future owner of bug reproduction + smoke-test patterns + pre-ship gating.
   - **Anti-Patterns (7 items)** — A1 no auto-write, A2 don't promote everything, A3 no empty `[fill in]` slots, A4 append-only enforcement, A5 status+promotion travel together, A6 `wontfix` is triage not judgment, A7 every new route wraps with `withErrorCapture` in the same commit.

2. **Cross-tier infrastructure shipped (<project>, `dev` branch):**
   - **`5f31757` — bug_reports migration.** Drizzle `0002_mixed_red_hulk.sql` generated via `npm run db:generate`. Closes the gap between schema (defined 2026-05-05 in `2c25d85`) and applicable SQL. FK to `users.id ON DELETE set null` (preserves bug history). 3 indexes (status / timestamp / user_id) match `/admin/bugs` query patterns.
   - **`fdc3b3f` — withErrorCapture sweep.** Wraps the 6 previously-unwrapped API routes (`auth/github/callback`, `auth/github/init`, `bugs/[id]/promote`, `bugs/[id]/status`, `repos/create-test`, `repos/delete-test`). Now every API route in the dashboard writes runtime failures to `bug_reports` automatically. Verified clean tsc + lint (one pre-existing warning in `admin/bugs/page.tsx` unrelated to this work).

3. **Process change — proactive changelog discipline.** User directive: "I want to be proactive with changelog reporting." Codified as feedback memory and applied to this entry: CHANGELOG.md + agent-changelog.md updates now ship in the same atomic unit as the change. No more "I'll catch up the changelogs later." Treated as a quality bar consistent with the "as if we run Anthropic" framing — drift between shipped and documented is unprofessional.

**Why this much, this fast:**

- The 3 open items were known structural gaps after the prior session ended. Coordinating with the parallel dev session via git commits (not file conflicts) let both sessions ship complementary work without stepping on each other.
- The protocol was already drafted by the other session; enhancing was higher-leverage than rewriting. Demonstrates that two parallel agent sessions can productively co-author a single artifact when each session adds disjoint value.
- The migration was a production-blocking gap (`bug_reports` table didn't exist on Neon despite the schema being in code). Shipping was non-negotiable.
- The route sweep had cumulative value: 3 wrapped routes can't catch the bugs that fire in the other 6. Coverage is binary at the per-route level — wrapped or not.

**Will measure:**

- **Capture coverage** — every API route runtime failure should now produce a `bug_reports` row. Target: zero uncaught 5xx in production by 2026-05-13. Anti-pattern A7 enforcement should keep this true going forward.
- **Sanitization integrity** — first 30 days of bug_reports rows audited for accidental secret leakage (search jsonb payload for known secret prefixes). Target: zero leaks. If any are found, sanitizer needs deepening (deep-traverse jsonb, header pattern expansion).
- **Promotion discipline** — fraction of `bug_reports` rows that get promoted to `incidents.md`. Target: <10%. Higher fraction = either too many bugs share structural lessons (good — pattern density), or anti-pattern A2 firing (bad — promotion inflation).
- **Conductor auto-trigger volume** — incidents appended automatically per week vs. user-promoted. Target ratio: 1:3 to 1:1. Heavy auto-trigger volume = framework friction (Conductor catching things that should never have made it that far). Low auto-trigger = either calibration off or things genuinely working.
- **Dev-to-main promotion latency** — time between dev push and main push for the framework changes. Target: <24h once QA passes. Branch strategy is new — measure if the dev/qa step adds real value or just delay.

**Notes for future agents:**

- Incident protocol now has the muscle to back its claims. If you wrap a route, you actually capture failures (anti-pattern A7 enforces this). If you promote a bug, the markdown shape is clear and the gate is the user (anti-pattern A1 enforces this). If you skip wrapping or auto-write to Tier 1, you're violating the protocol — these aren't preferences.
- When two sessions work in parallel on related artifacts, prefer enhancement over rewrite. Rewriting collides with the other session's intent; enhancement preserves it. The 4-pass enhancement model (sanitization, auto-triggers, QE reference, anti-patterns) used here is repeatable.
- Changelog discipline is now a contract, not a virtue. Same atomic unit as the change. No exceptions for "small" changes — small changes are exactly the ones that drift undocumented.

**Founding team count:** 8 active + 10 planned (unchanged). No agent activations. v0.4.0 is a process + protocol release, not a team-shape release.

---

## 2026-05-05 — Backlog system added (cross-tier file pattern + stub Curator)

**Trigger:** User directive, verbatim: *"Do we have a backlog collection agent who is tracking all future development ideas, to dos, required ones, etc? How are we tracking an ongoing company setup where we would be able to keep pushing out new features?"*

**What changed (8 files):**

1. **NEW:** `memory/backlog.md` — Tier 1 cross-project backlog. Append-only. Entry format specifies category, tier, priority, status, description, acceptance, effort. Seeded with 3 Tier 1 items (local-first-dev protocol, NEON_BRANCH env scaffold, preview-domain strategy). Lifecycle: open → in-progress → done | wontfix; stale P3 items archived after 90 days.
2. **NEW:** `workspace/_global/backlog.json` — machine-readable mirror. 12 items seeded (3 Tier 1, 9 Tier 2 / <project>). EA reads counts from this file; Conductor reads items for dispatch pulls. Schema documented inline.
3. **NEW:** `protocols/backlog-protocol.md` — lifecycle doctrine. Two-tier separation (Tier 1 = framework-wide; Tier 2 = per-project). Entry mechanisms (any agent can add; user via chat or /backlog command). Grooming cadence (Org Designer weekly). Conductor dispatch-pull responsibility. EA briefing integration. Anti-patterns. Backlog Curator stub reference.
4. **NEW:** `workspace/<project>/backlog.md` — Tier 2 example backlog seeded with 8 <project>-specific items from tonight: M2 real-data hookup (in-progress), custom domain, wildcard GitHub App callback, M3 Decision Packet UI, additional pages real-data hookup, vercel-setup.md NEON_BRANCH doc update, Playwright 90s ceiling test, M4 landing page + demo video.
5. **NEW STUB:** `agents/_planned/backlog-curator.md` — provisional contract for dedicated backlog hygiene role. Activation trigger: 20+ unactioned items for 2+ weeks OR OD time-share >10%. Until activation: Org Designer covers. Full contract included so activation is fill-in, not redesign.
6. **UPDATED:** `agents/conductor.md` — new step 4 in Algorithm (backlog pull before every dispatch); reads Tier 1 + Tier 2 backlog, includes relevant open items in agent brief. New read-on-invocation entries for backlog-protocol.md and memory/backlog.md.
7. **UPDATED:** `agents/executive-assistant.md` — BACKLOG SUMMARY section added to Executive Briefing and Session-Close formats; reads counts from backlog.json (not markdown parsing); surfaces 1-3 "Needs input" P0/P1 items per briefing. New read-on-invocation entries.
8. **UPDATED:** `agents/org-designer.md` — pre-activation backlog grooming responsibility added to authority section (weekly review, archive stale, propose re-prioritization, propose stub-activation if items keep being pushed, update JSON counts). New read-on-invocation entries.

**Architectural decision — Tier 2 items in workspace, not memory:**
Per-project backlogs live in `workspace/<slug>/backlog.md` (project-scoped, managed alongside project state). Tier 1 items live in `memory/backlog.md` (framework-wide, persists across all projects). JSON mirror in `_global/` bridges both tiers for machine-readable counting.

**Why now:**
Single-session signal was sufficient — the user explicitly named the gap. The fix is purely additive (new files + cross-references in 3 existing contracts). The backlog system is the first forward-looking memory primitive; all prior memory was event-driven (changelog = done; incidents = failures; patterns = recurring decisions).

**Will measure:**
- Whether backlog items are pulled into agent briefs and marked in-progress (not just accumulated). Signal: in-progress count grows, done count grows, open count doesn't grow unboundedly.
- Time from item-added to item-done for P1 items. Target: resolved within 2 sessions of addition.
- Whether Org Designer backlog grooming appears in OD invocation output (pre-Curator health check).
- Backlog Curator activation: unactioned count watched weekly. Crosses 20 → flag for activation.

**Founding team count:** 8 active + 10 planned → 8 active + 11 planned (Backlog Curator added as stub).

---

## 2026-05-06 — Ops audit: db:push applied to dev Neon (Tier B)

**Action:** `npm run db:push` against `NEON_BRANCH=dev` (the dev Neon branch `<dev-neon-branch>`).

**Outcome:** Drizzle reported "No changes detected" — the dev branch was already in sync with the schema, indicating the parallel session had pushed `bug_reports` earlier in the day. Verified post-action via direct `@neondatabase/serverless` query:
- Table `bug_reports` present
- 14 columns match `src/lib/db/schema.ts` (id, timestamp, route, user_id, error_message, stack_trace, request_payload, environment, user_agent, vercel_deployment_id, status, promoted_to_incident, created_at, updated_at)
- 3 indexes match migration 0002 (`bug_reports_status_idx`, `bug_reports_timestamp_idx`, `bug_reports_user_id_idx`) plus `bug_reports_pkey`
- FK `bug_reports_user_id_users_id_fk` → `users` confirmed (ON DELETE set null per schema)
- 2 rows already captured (Layer 1 actively working in dev)

**Tier:** B (autonomous with audit) per `protocols/autonomous-ops-permissions.md` §3.1 — explicit `NEON_BRANCH=dev` env var classifies this branch as non-prod.

**Authorized by:** User directive 2026-05-06: *"For db changes, you should be able to do it. Remember, I have dev and prod environments."*

**Prod status:** outstanding. Tier C Decision Packet surfaced in same session reply. Prod DB not modified by this action.

**Founding team count:** 8 active + 11 planned (unchanged — operational entry, no team-shape change).

---

## 2026-05-06 — Ops audit: db:push attempted against prod Vercel env (Tier C, approved) — surfaced shared Neon branch

**Action:** `npx vercel env run -e production -- npx drizzle-kit push` against the linked Vercel project (`<org>/<project>`). Used `vercel env run` (in-memory env injection) instead of `vercel env pull` (file-on-disk) per the file-deletion-safety memory and to avoid prod creds sitting on disk even briefly.

**Authorization:** User Decision Packet response 2026-05-06: *"Sure do A. You handle running this and keep the dbs up to date as of now."* — explicitly approving the Tier C operation AND granting forward authority to apply pending migrations to both environments.

**Outcome — and a meaningful discovery:** `drizzle-kit push` reported "No changes detected" against the prod env. Verification via direct query revealed why: **Vercel's prod `DATABASE_URL` resolves to the same Neon endpoint as dev's `.env.local` URL** (the dev Neon branch `<dev-neon-branch>`). The dashboard currently runs both Vercel environments against a single Neon branch.

This means the dev push earlier today (logged in the previous audit entry) effectively covered prod as well — the bug_reports table is live for both Vercel environments because there is only one DB. The 2 captured rows are visible to prod traffic.

**Implications captured to project memory (`project_db_topology.md`):**
- The Tier B / Tier C split for `db:push` in `protocols/autonomous-ops-permissions.md` §3.1 is procedurally correct but topologically moot today (one DB, one push).
- When the user separates Neon branches in the future, reinstate the dual-push pattern (once per branch) and re-establish the Tier B / Tier C distinction in practice.
- The `NEON_BRANCH=dev` value in `.env.local` is annotation-only; it does not currently route to a separate branch.

**Recommendation surfaced to user:** consider whether the shared-DB topology is intentional (cost / simplicity, common at this stage) or a config gap. Both are defensible; the framework should know which.

**Tier:** C (approved per Decision Packet) — but topology turned this into a no-op write. Logged here per protocol's "every approved Tier C gets a grep-able entry" rule.

**Tooling preference codified:** `vercel env run -e <env> -- <cmd>` is preferred over `vercel env pull` for one-shot prod operations. Keeps creds in memory; no `.env.production` cleanup to manage. Saved as approach for future migrations.

**Founding team count:** 8 active + 11 planned (unchanged — operational entry).

---

## 2026-05-06 — Ops audit: 3-branch Neon topology wired correctly (Tier C, approved + executed)

**Context:** The earlier "shared Neon branch" finding was a snapshot of an in-progress topology. User clarified there are actually three Neon branches (`production`, `dev`, `local`) and updated DATABASE_URL on multiple Vercel scopes — but verification showed all four endpoints (Vercel Production, Preview, Development, `.env.local`) still resolved to the `local` branch host. Diagnosis: the user's Vercel updates created the right scope split (separate Production and Preview entries) but neither stored the correct branch URL.

**Authorization:** User Decision Packet response 2026-05-06: *"Go"* on the rewire + redeploy plan.

**Actions taken (Tier C-class — Vercel production env var changes + redeploy):**

1. **Updated `.env.local`** — pulled `local` branch connection string via `neonctl connection-string local --pooled`, substituted into `.env.local` via shell-pipe → python regex (no creds in conversation). Backup saved at `<project>/.env.local.bak.1778042003`. Set `NEON_BRANCH=local`.

2. **Verified schema present on all three branches** — Drizzle `db:push` against the production-branch URL reported "No changes detected." Direct query confirmed all 7 tables (`analytics_events`, `bug_reports`, `idempotency_keys`, `oauth_tokens`, `projects`, `sessions`, `users`) exist on all three branches. Neon's branch-create-from-parent inherits schema, which explains why no migrations needed re-applying.

3. **Rotated Vercel Production scope DATABASE_URL** → `production` branch URL. Method: `vercel env rm` then `echo "$URL" | vercel env add` (stdin pipe; URL never in argv or my context). Confirmed via `vercel env ls` showing new "1m ago" timestamp on the Production-scoped entry.

4. **Rotated Vercel Preview scope DATABASE_URL** → `dev` branch URL. Required passing an empty-string git-branch arg (`vercel env add DATABASE_URL preview ""`) to bind to "all preview branches" rather than a specific git-branch — first attempt without that arg returned a JSON disambiguation hint and didn't complete.

5. **Triggered production redeploy** — `vercel redeploy <latest-prod-deployment-url> --target=production`. Build completed in 47s; aliased to the production Vercel alias (`<prod-vercel-alias>`). New env vars now live on the deployed app.

**Final topology (verified by direct neonctl queries):**

| Environment | Neon branch | Host | Row counts at audit time |
|---|---|---|---|
| Vercel Production | `production` | `<prod-neon-branch>` | 1 bug_report, 1 user |
| Vercel Preview | `dev` | `<dev-neon-branch>` | 2 bug_reports, 1 user |
| `.env.local` | `local` | `<local-neon-branch>` | 1 bug_report, 1 user |

The Tier B / Tier C distinction in `protocols/autonomous-ops-permissions.md` §3.1 is now operationally meaningful again — three real branches, three real environments, one-to-one mapping.

**Lessons learned (added to memory):**

- `vercel env run -e <env>` and `vercel env pull` both layer `.env.local` on top of Vercel-API values. Sensitive vars come back encrypted/empty, and `.env.local` fills them in. **Local CLI verification of the Vercel-side value of a sensitive var is not reliable.** For verification, observe deployment behavior (synthetic capture → check expected branch's row count delta).
- `vercel env add <name> preview` (no git-branch arg) prompts for branch context and refuses non-interactively. Pass `""` (empty string) as third positional arg to mean "all preview branches."
- Neon branches inherit schema from parent at creation time. Migrations don't need to be re-applied per branch unless the branch was created before the schema landed on its parent. Migration ordering only matters within a single branch's history.
- The migration verification flow `Drizzle push → row count` works even when the schema is already in sync (returns "No changes detected" but still confirms connectivity to the right branch).

**Provenance:** First end-to-end exercise of the autonomous-ops Tier C path with full Vercel-CLI mediation. The pattern proven here — Decision Packet → user "go" → execute → audit entry — is now the canonical Tier C flow for env var changes and prod schema operations.

**Founding team count:** 8 active + 11 planned (unchanged — operational entry).

---

## (Future entries appended here as team evolves)

## 2026-05-06 — Framework: destructive-ops Phase 1 land + framework-change-discipline doctrine

**Tier:** B (multiple framework-doctrine writes; user-approved per the ratify-with-amendments verdict and explicit Phase 1 dispatch).

**Project:** framework

**Files touched:**
- `protocols/framework-change-discipline.md` (NEW; codifies Process Rules 1-3 from Org Designer ratification)
- `protocols/destructive-data-ops.md` (project-leakage strips, §3.1-§3.8 edge-cases extension, §6 audit log markdown spec, [PROVISIONAL] marker, reconciliation note with autonomous-ops Tier D)
- `agents/db-admin.md` (project-leakage strips, [PROVISIONAL] marker, trust model section, PITR query mechanism)
- `protocols/autonomous-ops-permissions.md` (Tier D rewrite — destructive SQL reclassified per Option A; §7 ❌-bullet carve-out)
- `protocols/dev-to-main-promotion.md` (§5 bullets 14+15 + §3.2 routing note; db-admin sentinel-verify mandatory on destructive path)
- `<project>/scripts/promote-to-prod.sh` (Gate 2.5 inserted; two-step operator flow for db-admin sentinel-verify)
- 11 binding sections marked [PROVISIONAL] (5 Tier 1 + 6 Tier 2 agent files)
- 5 scaffold-source agent mirrors marked [PROVISIONAL]
- 4 `templates/stacks/_baseline/` Tier 2 templates (framework + scaffold-source × tier2-conductor/critic/implementer/deployment) — db-admin bindings added
- `agents/architect.md` (scaffold-checklist amendment: db-register.md instantiation gate + binding-section verification)
- `memory/lessons-learned.md` (#10 added — Framework-doctrine changes need a process gate)
- `memory/agent-changelog.md` (this entry)
- `memory/patterns.md` (sentinel-verify candidate flagged, not yet promoted to canonical)
- `memory/incidents.md` (cross-reference to lesson #10 added)

**Outcome:** Land complete; Critic R-land review pending. Verdict-flow trail: Architect R1 (549 lines) → Critic R1 (YELLOW, 12 items) → Architect R2 (936 lines, all 12 closed) → Critic R2 (YELLOW, single line-cite drift in db-admin.md PROVISIONAL placement) → Orchestrator R3 correction (verified L22 H1 via awk; corrected brief) → GREEN. Phase 1 implementation per ratified brief; Phase 2 (runtime hook enforcement + token-mint mechanism) is the next dispatch.

**Provenance:** 2026-05-06 cross-branch wipe incident remediation. Originating Org Designer ratification at `workspace/_global/org-designer-proposals/20260506-db-admin-ratification.md` (RATIFY-WITH-AMENDMENTS). Originating Critic provisional review at `workspace/_global/critic-review-destructive-data-ops-protocol.md` (YELLOW; P0-1 hook enforcement, P0-2 Tier D contradiction, P1-1 scaffold templates, P1-3 sentinel edge cases, P1-4 promote-to-prod tension, P2-6 framework-change meta-protocol). Architect Phase 1 brief at `workspace/_global/architect-brief-destructive-ops-phase1.md`. User decisions confirmed 2026-05-06: Option A philosophy (agents execute Tier B autonomously after sentinel-verify; user gates Tier C) + three Process Rules approved + Phase 1+2 plan accepted.
