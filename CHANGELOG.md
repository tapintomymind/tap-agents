# Changelog

All notable structural changes to the Claude Team are recorded here. Project-specific work and agent prompt-narrative live in `memory/agent-changelog.md`. Scope split codified at `protocols/changelog-protocol.md`.

Format: see [Common Changelog](https://common-changelog.org/).

## [0.8.3] — 2026-05-11 — docs/ included in npm tarball + Trusted Publishing migration

**Two-axis infrastructure patch.** No framework surface changes — agents, commands, protocols, templates, hooks, settings.json, memory/, and playbooks/ are byte-identical to v0.8.2. This release widens the npm package's `files` allow-list to include `docs/` AND swaps the publish workflow's auth mechanism from a long-lived NPM_TOKEN secret to OIDC-based Trusted Publishing.

### Changed

- **`package.json`** `files` field — added `"docs"` so `docs/managed-agents-comparison.md`, `docs/specs/2026-05-04-claude-team-design.md`, and any other `docs/` content the framework carries now ship in the published tarball. `agent-dashboard`'s `scaffold-overlay/docs/` directory becomes redundant after this release and can be retired in a follow-up dashboard commit.
- **`package.json`** `exports` field — added `"./docs/*"` so consumers can resolve `docs/*` paths via `import` / `require.resolve`.
- **`.github/workflows/publish.yml`** — removed the `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` env binding from the "Publish to npm" step. The npm CLI auto-detects the GitHub Actions OIDC context via the existing `id-token: write` permission and authenticates against npm without a long-lived token. The `NPM_TOKEN` repo secret remains in place for the migration cutover; after the first successful Trusted Publishing publish, it can be deleted from both `tap-agents` and `tap-agents-internal` repos.

### Provenance

User direction 2026-05-11. Two related but independent infrastructure improvements bundled because both are PATCH-grade publish-surface changes with no consumer behavior delta. The Trusted Publishing migration is the second leg of the npm hardening pattern the API skill recommends (long-lived token → OIDC); the `docs/` inclusion closes the gap surfaced during the agent-dashboard migration session where two framework-canonical docs were temporarily living in `scaffold-overlay/` because they weren't yet shipped by the npm package.

---

## [0.8.2] — 2026-05-11 — README v2 + Dependabot seed for the public repo

**Discoverability + dependency hygiene patch.** No framework surface changes — agent prompts, commands, protocols, templates, hooks, and the npm package's programmatic API are all byte-identical to v0.8.1. This release is what people see when they land on the GitHub repo, and how the repo manages its own dependency updates over time.

### Changed

- **`README.md`** — full rewrite. Centered hero, four shield-style badges (npm version, Claude Code plugin, MIT, GitHub stars), explicit two-path Quick Start (marketplace install + npm install) at the top, a "Claude Code with vs. without TapAgents" comparison table that makes the wedge explicit, a Distribution Pipeline table explaining the dual-egress model, and a Versioning section pointing at `protocols/versioning-protocol.md`. Preserves the load-bearing parts of v0.8.1's README — the Founding Team table, the State Machine, Tier 1 vs Tier 2, the Public/Private Split, and the Memory section — and adds a footer with quick-links. The previous README served as a strong internal design doc; this version sells.

### Added

- **`.github/dependabot.yml`** (NEW, ~80 lines) — seeds the enable-with-ignore pattern from the framework operator's 2026-05-07 memory note BEFORE Dependabot's first run on this repo, avoiding the 13-PR-flood failure mode that hit agent-dashboard on its first Dependabot activation. Locks major-version bumps on `@types/node` (lockstep with Node runtime) and `typescript` (TS 6 deprecates APIs that would require code changes). Groups patch + minor updates into one PR/week per dep-class. Mirror config for GitHub Actions ecosystem with majors locked on `actions/checkout`, `actions/setup-node`, and `softprops/action-gh-release` where v→vN+1 contracts have historically shifted.

### Provenance

User direction 2026-05-11 to ship README + Dependabot as a focused docs patch, holding the `docs/`-in-npm-tarball packaging fix (originally bundled into the v0.8.2 plan) for v0.8.3 to keep each release's changelog narrative cohesive. Per `protocols/versioning-protocol.md` §3.1, PATCH is correct: README is docs, `.github/dependabot.yml` is config outside the versioned dirs (`agents/`, `commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/`), and no consumer behavior changes. Severity-floor classifier confirms PATCH allowed.

---

## [0.8.1] — 2026-05-11 — Packaging fix: settings.json + memory/ + playbooks/ included in npm tarball

**Packaging-only patch.** No framework surface changes — only the npm-package `files` + `exports` fields. Consumer-facing addition: three previously-omitted top-level surfaces now ship with the published tarball.

### Changed

- **`package.json`** `files` field — added `"memory"`, `"playbooks"`, `"settings.json"` so they ship in the npm tarball. The dashboard's prebuild + runtime resolvers expected these and would have failed integrity checks against the v0.8.0 install.
- **`package.json`** `exports` field — added `"./memory/*"`, `"./playbooks/*"`, `"./settings.json"` so consumers can resolve these paths via `import` / `require.resolve`.

### Provenance

Surfaced during the `agent-dashboard` migration session — the prebuild integrity check (`scripts/copy-scaffold-source.mjs:findMissing`) flagged the gap when `node_modules/@tapintomymind/tap-agents/` was checked against `REQUIRED_ENTRIES`. PATCH-grade because no existing consumer's behavior changes (the v0.8.0 install was unusable for the dashboard's path; v0.8.1 fixes that). Per `protocols/versioning-protocol.md` §3.1 — fixing a packaging oversight that no consumer relied on at v0.8.0 is consistent with PATCH semantics.

---

## [0.8.0] — 2026-05-11 — Distribution wedge: SemVer protocol + npm publish pipeline + Claude Code marketplace manifest

**Framework structural addition — initial public release.** Establishes the framework as a dual-channel distributable: published to the npm registry as `@tapintomymind/tap-agents` for programmatic consumers (starting with `agent-dashboard`, which will replace its `scaffold-source/` mirror with this dependency), and published to the Claude Code plugin marketplace at `tapintomymind/tap-agents` for end-user `/plugin marketplace add` installs.

With two consumer channels live, the framework's version field crosses from internal-discipline into external-contract. The new `protocols/versioning-protocol.md` codifies strict SemVer enforcement at four gates (AI-led `/release` command → mechanical `hooks/version-gate.py` → CI `version-check.yml` → Critic review at release).

The `agent-dashboard` repo's `scaffold-source/` mirror is the legacy mechanism this replaces. `protocols/framework-change-discipline.md` §2 already declared scaffold-source out-of-scope of doctrinal review; this release operationalizes the replacement by giving scaffold-source a canonical upstream it can subscribe to via SemVer.

### Added

- **`protocols/versioning-protocol.md`** (NEW canonical, ~280 lines) — SemVer spec for the framework-release scope. §3 defines severity classification (PATCH = no consumer-visible change; MINOR = additive backwards-compatible; MAJOR = anything that could break a downstream consumer). §4 defines the four-gate enforcement chain. §6 locks `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` versions together. §7 overrides the pre-1.0 "anything goes" SemVer loophole — the classifier applies as-written regardless of major-zero phase. §8 codifies the relationship to per-agent `prompt_version` (the two version layers answer different questions and coexist).
- **`hooks/version-gate.py`** (NEW, ~280 lines) — PreToolUse hook that enforces three invariants at `git commit` time: atomicity (`package.json` version change must coincide with matching `CHANGELOG.md` heading in same staged diff), sequence (new version must be a legal SemVer successor to last tag), severity floor (removal/rename in `agents/`/`commands/`/`protocols/`/`templates/` forces MAJOR; addition forces MINOR floor). Soft-blocks (exit 2 with actionable message) — does not bypass via `--no-verify`. Wired into `settings.json` PreToolUse `Write|Edit|Bash` matcher alongside existing `pre-tool-gate.py`.
- **`commands/release.md`** (NEW slash command) — AI-led release flow. Six-step workflow: establish baseline → classify diff against §3 → propose version → draft `CHANGELOG.md` entry → draft `memory/agent-changelog.md` narrative → execute atomic release commit + tag. Each step has explicit "stop and surface to user" conditions for ambiguous classifications.
- **`package.json`** (NEW) — npm package manifest. Name `@tapintomymind/tap-agents`, scoped public package. Initial publish target: v0.8.0 on this release commit. `exports` field surfaces both programmatic API (`dist/index.mjs`) and raw `.md` file access (`./agents/*`, `./commands/*`, `./protocols/*`, `./templates/*`, `./hooks/*`, `./.claude-plugin/*`).
- **`tsconfig.json`** (NEW) — strict TypeScript config for `scripts/build-src/*.ts`. Targets `ES2022`/`ESNext`, `noUncheckedIndexedAccess`, isolated modules.
- **`scripts/build-src/build.ts`** (NEW, ~340 lines) — generates `dist/index.mjs` (programmatic exports with inlined agent/command/protocol/template bodies), `dist/index.d.ts` (TypeScript declarations with per-name string literal unions), `dist/manifest.json` (metadata-only summary read by EA's framework-health briefing). Pure Node stdlib + tsx runtime — zero external runtime deps.
- **`scripts/build-src/verify.ts`** (NEW, ~150 lines) — `prepublishOnly` guard. Hard-fails npm publish if any of: dist artifacts missing, manifest version drift, plugin.json/marketplace.json version drift, source files dropped from manifest, generated index.mjs not loadable.
- **`scripts/build-src/version-check.ts`** (NEW, ~210 lines) — Gate 3 CI counterpart to `hooks/version-gate.py`. Validates PR diff against base branch with the same algorithm (atomicity + sequence + severity-floor) but reading from `git diff <base>...HEAD` instead of `git diff --cached`.
- **`.github/workflows/version-check.yml`** (NEW) — required PR check on `main`. Path-filtered to fire only when the version surface is touched. Runs `version-check.ts` against `origin/main`.
- **`.github/workflows/publish.yml`** (NEW) — fires on `v*.*.*` tag push. Builds, verifies, validates tag/package alignment, publishes to npm with provenance, creates a GitHub Release extracting the matching CHANGELOG section.
- **`.claude-plugin/plugin.json`** (NEW) — Claude Code plugin manifest. Single plugin `tapagents` at framework root (RuFlo's `claude-flow` pattern, intentionally one curated plugin not a sprawl of forty).
- **`.claude-plugin/marketplace.json`** (NEW) — marketplace manifest. Declares the `tapagents` plugin with `source: "."` so the marketplace serves the framework root directly.

### Changed

- **`settings.json`** — PreToolUse `Write|Edit|Bash` matcher now includes a second hook entry pointing at `version-gate.py` alongside the existing `pre-tool-gate.py`. Two parallel gates, distinct concerns: `pre-tool-gate.py` handles dangerous-shell pattern matching; `version-gate.py` handles SemVer invariants. Both fire on every relevant tool call; either exit 2 blocks.
- **`.gitignore`** — adds `dist/`, `.npm`, `npm-debug.log*`, `*.tgz` to the build-artifacts section. `dist/` is regenerated by `scripts/build-src/build.ts` on every publish; never committed.

### Provenance

User direction 2026-05-11 to operationalize the distribution wedge (Claude Code marketplace + npm registry). Conversation chapter "CLI/marketplace implementation" — full design rationale in the chat transcript, condensed into this release's protocol and code artifacts. Authority: explicit user authorization for this scope (per `protocols/framework-change-discipline.md` Rule 1(b)) — files affected named in chat in advance of landing. Critic adversarial review will run on the release commit per `versioning-protocol.md` §4.4 before any tag is pushed.

---

## [0.7.8] — 2026-05-07 — Framework metrics protocol + agent emit instructions + UI-discipline proposal

**Framework structural addition.** Five new protocols (security scanning, observability, framework metrics, agent input sanitization, stack portability) + emit/rollup scripts (Python stdlib only) + agent-prompt updates (six agents bumped to `prompt_version: 2026-05-07-1` with metrics-emit instructions) + new `/feature` command + Designer/UI-UX-Reviewer activation discipline incident captured.

The framework metrics protocol is the load-bearing addition — it ties the agent prompts to a structured event stream that downstream Tier 2 projects (e.g., agent-dashboard) can ingest into their own production stores. agent-dashboard's Tier 2 PG-backed metrics surface (landed same day in agent-dashboard `dev` branch) is the first Tier 2 consumer of this event stream.

### Added

- **`protocols/framework-metrics.md`** (NEW canonical, ~520 lines) — event taxonomy (agent.invoked, critic.review, qe.smoke, qe.test_plan, gate.passed, conductor.transition, project.created, agent.run.completed, ea.briefing.delivered + counters), emit primitive contract (atomic single-line JSONL append; size budget; no PII / secrets / artifact contents per §4); rollup architecture (window + project + agent dimensions); five-layer reader contract (file → parse → window-filter → project-filter → tally); operator vs agent vs project-scope split (§7); prompt-version + agent-changelog atomicity rule (§9); production-sync follow-up (§11) — points at the PG-backed Tier 2 path agent-dashboard now implements.
- **`protocols/security-scanning-defaults.md`** (NEW canonical, ~340 lines) — five-layer protocol (SAST + SCA + secret-scan + license-check + DAST). Per-stack appendix shows Next.js + Python + Go + Rust + Ruby concrete tooling. The agent-dashboard's `.github/workflows/{vitest,audit,codeql,gitleaks}.yml` are the Next.js reference implementation.
- **`protocols/observability-defaults.md`** (NEW canonical, ~290 lines) — five-layer protocol (request-ID correlation + structured logs + tracing + error tracking + RUM). Per-stack appendix; agent-dashboard's middleware + instrumentation + logger is the Next.js reference impl.
- **`protocols/agent-input-sanitization.md`** (NEW canonical, ~210 lines) — three-tier trust model (system instructions → user input → external content) + per-agent bindings. Closes the prompt-injection defense gap — Tier 2 implementers (e.g., agent-dashboard's job handlers) now have explicit guidance on what's safe to put in payloads.
- **`protocols/stack-portability-map.md`** (NEW canonical, ~410 lines) — translation matrix across nine stacks (Next.js + Remix + SvelteKit + Astro + Express + FastAPI + Django + Rails + Go-stdlib). Used by Architect when picking tooling for new projects.
- **`scripts/emit-metric.py`** (NEW, ~280 lines) — Python stdlib-only event emitter. Atomic single-line JSONL append. Best-effort dual-write to a Tier 2 PG-backed ingest endpoint when `FRAMEWORK_METRICS_INGEST_URL` + `FRAMEWORK_METRICS_INGEST_SECRET` env vars are set (gated by env so JSONL-only operators are unaffected). Network failures + non-2xx responses log to stderr but never fail the script — JSONL is the local source of truth.
- **`scripts/rollup-metrics.py`** (NEW, ~210 lines) — rollup with `--window`, `--full`, `--format` flags. Reads JSONL, computes byEvent / byAgent / byProject / criticVerdicts / qeSmokes tallies. Mirrors the TS reader's contract so agent-dashboard's `/admin/framework` page renders the same numbers operators see locally.
- **`agents/_planned/test-engineer.md`** (NEW activation-trigger stub) — backstop role for inline test-writing during feature dev when feature agents repeatedly fail to write tests at the coding→review gate. Activates only on accumulated trigger evidence (per `protocols/agent-changelog-activation-protocol.md`).
- **`commands/feature.md`** (NEW slash-command body) — feature-mode invocation of Intake. Anchors to existing PRD/scope/decisions for an existing project; Strategist turns the resulting feature-brief into a PRD-revision or mini-PRD.
- **`templates/feature-brief.md`** (NEW) — canonical shape for the feature-brief artifact `/feature` produces. Mirrors `templates/intake-brief.md`'s discipline (cited claims only) but scoped to feature-grain decisions.

### Changed

- **`agents/conductor.md`** (+~80 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `agent.invoked` / `gate.passed` / `conductor.transition`); `prompt_version: 2026-05-07-1` first set.
- **`agents/critic.md`** (+~70 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `critic.review` with verdict + blocking_concerns + severity_distribution payload); `prompt_version: 2026-05-07-1`.
- **`agents/quality-engineer.md`** (+~75 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `qe.smoke` + `qe.test_plan` + `agent.invoked`); `prompt_version: 2026-05-07-1`.
- **`agents/org-designer.md`** (+~95 lines) — Read-list adds `protocols/framework-metrics.md` + `protocols/agent-input-sanitization.md`. New "weekly trigger sweep" section (§5) — fires every Sunday 23:00 UTC, mines `memory/framework-metrics.jsonl` for accumulated triggers (agent prompt size, WRONG_AGENT rate, recurring failure patterns); produces a Decision Packet via EA when a structural-change recommendation lands. New "monthly memory curation" hook + "quarterly framework-metrics rollup" hook. `prompt_version: 2026-05-07-1`.
- **`agents/executive-assistant.md`** (+~110 lines) — Read-list adds `protocols/framework-metrics.md`. New "framework health" briefing section in `/status` and `/briefing` (surfaces ingest-volume, agent-invocation-rate, critic-block-rate, last-QE-smoke per project; cardinal-zero-rule omits when absent); new emit-instructions for `ea.briefing.delivered` events. `prompt_version: 2026-05-07-1`.
- **`agents/intake.md`** (+~25 lines) — feature-mode invocation path added (handles `/feature` slash-command); read-list adds `templates/feature-brief.md`.
- **`commands/intake.md`** (+~10 lines) — disambiguates between `/team` (full intake-brief) and `/feature` (feature-brief mode); points at `agents/intake.md` for routing.
- **`protocols/framework-change-discipline.md`** (+§9 ~60 lines) — prompt-version naming convention (`YYYY-MM-DD-N`), atomicity rule (CHANGELOG + agent-changelog updates land with each agent prompt edit), trigger conditions for prompt bumps. Used by Conductor/Critic/QE/Org-Designer/EA's first version-set in this release.
- **`protocols/checkpoint-protocol.md`** (+~25 lines) — checkpoint-events include framework-metrics emit hooks so `gate.passed` events surface in the rollup automatically.
- **`protocols/intake-protocol.md`** (+~40 lines) — intake-mode-vs-feature-mode disambiguation; feature-brief output schema reference.
- **`templates/decision-packet.md`** (+~30 lines) — references the new `protocols/framework-metrics.md` ingest contract; explicit "include rollup metric IDs in `Provenance` section" guidance.
- **`memory/incidents.md`** (+~80 lines) — new entry "2026-05-07 — UI-fix dispatch-discipline gap [project: agent-dashboard]" capturing the orchestrator-discipline failure mode where Claude Code shipped four UI fixes in one session without dispatching `ui-ux-reviewer` or appending to `memory/ui-anti-patterns.md`. Cross-cutting class-of-issue: design-system tokens applied inconsistently across same-tier peer components.
- **`memory/agent-changelog.md`** (+~20 lines) — narrative entry for the six agent-prompt bumps (Conductor/Critic/QE/Org-Designer/EA — first prompt_version set; Intake — feature-mode addition). Public-safe; no project-specific details.
- **`workspace/_global/backlog.json`** (+~3 entries) — `framework-metrics-Tier-2-pg-sync` (LANDED 2026-05-07 in agent-dashboard `dev`); `framework-metrics-silent-failure-watchdog` (LANDED same day); `scan-and-adopt-ui-surface-v1.5-task-9` (LANDED same day).

### Org-discipline note

`workspace/_global/org-designer-proposal-2026-05-07-ui-discipline.md` — Org Designer formal proposal awaiting user approval per the agent's "never acts unilaterally" charter. Three bundled changes:
- **A.** `agents/ui-ux-reviewer.md` prompt-version bump to `2026-05-07-2` adding a fourth `fires_when` trigger for "orchestrator reports 3+ UI/UX fixes in one session/branch without intervening review."
- **B.** New `protocols/orchestrator-session-discipline.md` (Org Designer to own) — pins the rule "3+ UI fixes → either dispatch reviewer OR append `memory/ui-anti-patterns.md` entry."
- **C.** New `templates/design-spec.md §3.0` tier-treatment table (Primary CTA / Ambient-tier icon / Filter-chip / Metadata-badge / Destructive-tier action) so future implementers can't drift on visual contracts for same-class components.

A+B is the minimum-coherent pair (closes the dispatch loop). C is independently approvable.

### Adjacent ui-anti-patterns entry

`memory/ui-anti-patterns.md` entry #2 — "Design-system tokens applied inconsistently across same-tier peer components" — bundles the four observed agent-dashboard fixes (Scan icon mismatch with peer SyncButton; chip dark-mode invisibility; per-agent model badge legibility; description ellipsis with no expansion) as ONE class-of-issue, not four separate entries. Resolved by the agent-dashboard `fix(ui)` commit on `dev` 2026-05-07.

### Provenance

agent-dashboard 2026-05-07 dev session — first end-to-end exercise of the `protocols/framework-metrics.md` Tier 2 PG-backed sync path. Agent-dashboard's commits at `https://github.com/tapintomymind/agent-dashboard.git` `dev` branch (10 commits between `86c25bb..181fc25`).

---

## [0.7.7] — 2026-05-07 — BL-031 Phase 1: dream-pass capability landing

**Framework structural addition.** Lifts Anthropic's May 2026 Managed Agents `dreams` feature shape (immutable input → new output memory store; optional review-mode for accept/discard before commit) into TapAgents memory curation. Hybrid shape (skill extension + scheduled-task hook + Org Designer cadence ownership + EA Decision Packet for review) — composes four existing primitives, no new agent contract. Pure protocol/skill/contract change — no Managed Agents API dependency.

### Added

- **`protocols/dream-pass.md`** (NEW canonical, ~305 lines) — immutable-input invariant (`memory/` never mutated; output writes only to `memory.next/`); `MEMORY_ROOT=memory.next/` explicitly forbidden; file layout convention (`memory.next/` candidate-store with `_diff.md`, `_instructions.md`, `_provenance.md` internal metadata files; `memory.prev.<ISO-ts>/` post-accept archive at 90-day retention); tier'd ingest scope (default-tier 350KB at Phase 1; stretch 1.2MB Phase 2+; aggressive 2MB Phase 3+); curation discipline as hard rules (axis discipline preserved; provenance preservation; public/private split preservation); `[INVENTED?]` flagging for hallucination defense-in-depth (skill annotation + OD diff review + user accept-flow surfacing — three-layer pattern); cadence (weekly Sunday 23:00 UTC = Sunday 19:00 EDT cron `0 19 * * 0`; self-tuning 3-no-op-relax to bi-weekly then monthly); Phase 1→4 rollout with explicit fail-recovery paths; industry-portability framing.
- **`commands/consolidate-memory.md`** (NEW slash-command body, ~206 lines extending Anthropic `consolidate-memory` skill) — two-mode pipeline. Legacy mode preserves the original Anthropic 35-line in-place behavior with TapAgents-shape Phase 3 no-op handling. Dream-pass mode (`--dream-pass`) implements the immutable-input pipeline with defensive preflight (pending-`memory.next/` guard refuses to overwrite; tier-gate guards refuse pre-Phase-2 stretch / pre-Phase-3 aggressive; forbidden-env-var guard refuses `MEMORY_ROOT=memory.next/`); supports `--instructions=<prose>`, `--tier=default|stretch|aggressive`, `--dry-run`, `--legacy`. Backward-compat preserved per Fork 3.
- **`mcp__scheduled-tasks` `weekly-dream-pass` task entry** — cron `0 19 * * 0` (Sunday 19:00 EDT = Sunday 23:00 UTC; MCP evaluates cron in user's local timezone; small deterministic dispatch delay confirmed at :09 minutes). Task prompt embeds protocol references + preflight discipline + EA-signaling at completion + explicit "do NOT auto-execute the atomic mv accept-flow" guard; `notifyOnCompletion: false` to avoid noise on no-op cycles. **First scheduled fire: Sunday 2026-05-10 19:00 EDT (= 23:00 UTC).**

### Changed

- **`agents/org-designer.md`** (+~15 lines) — Read-list adds `protocols/dream-pass.md` + `memory.next/_diff.md` + `memory.next/_provenance.md` + latest `memory.prev.<ts>/` archive. Authority adds dream-pass cadence + review row (OD owns weekly schedule + reviews `_diff.md` before EA Decision Packet; annotates with `approve | approve-with-edits | discard | pause-cadence` recommendation; defers final decision to user; cadence operates alongside not instead of monthly pattern-mining audit; self-blindness mitigation via Phase 2 user `/grow-team` calibration check after week 4). Quarterly Review section adds dream-pass acceptance-rate tracking (target ≥30% post Phase 2; <20% triggers cadence-relax + curation-discipline retro).
- **`agents/executive-assistant.md`** (+~85 lines) — Read-list adds `protocols/dream-pass.md` + `memory.next/_diff.md` + `memory.next/_provenance.md` + `workspace/_global/dream-pass-log.md`. New "Memory health" briefing section (surfaces pending dream-pass with cycle-tier-diff-summary-OD-recommendation; cardinal-zero-rule omit-when-absent; no-op cycles surface as single line + count toward 3-no-op tracker). New "Dream-pass Decision Packet" surface format (≤400 words with summary / inputs / top-changes / invented-flag-review / OD-recommendation / artifacts / four-option fork: accept-as-proposed / edit-then-accept / discard / pause-cadence).
- **`memory/README.md`** (+~15 lines) — `Configurable Path` section adds `MEMORY_ROOT=memory.next/` forbidden note. New "Dream-pass cadence" section.
- **`.gitignore`** (+~10 lines) — `memory.next/` and `memory.prev.*/` patterns added with cross-reference to `protocols/dream-pass.md §2`.
- **`memory/backlog.md`** + **`workspace/_global/backlog.json`** — BL-031 status changed `open → in-progress` with Phase 1/2/3/4 status detail; new fields (`phase_status`, `user_forks_applied`, `implementation_session`, `files_landed_phase_1`, `approval_packet`, `critic_review_path`); `item_counts` recomputed mechanically (total=31 unchanged; by_status `open: 18→17`, `in-progress: 3→4`).

### Mirrored

3 framework files mirrored to `agent-dashboard/scaffold-source/` with `diff -q` empty parity (re-mirrored after Critic Pass 1 P1-6 fix to protocol §7): `protocols/dream-pass.md`, `agents/org-designer.md`, `agents/executive-assistant.md`. `commands/consolidate-memory.md` is NOT mirrored — slash-command bodies are framework-local.

### Phase rollout

- **Phase 1 (this landing):** protocol + skill body + contract diffs + scheduled-task + .gitignore + memory/README.md cadence section + scaffold-source mirrors. NO live dream-pass run during Phase 1 land.
- **Phase 2 (4 weekly cycles dogfood observation, gates Phase 3):** first scheduled fire 2026-05-10 19:00 EDT. 4 cycles minimum; extends to 8 weeks if 20-30% acceptance triggers extended observation. User `/grow-team` after week 4 evaluates OD's recommendation calibration. Success criteria: (a) 4 weekly cycles complete; (b) acceptance rate ≥30%; (c) zero accepted bad-curation incidents; (d) at least one `--instructions` cycle exercised.
- **Phase 3 (aggressive-tier ingest + event-driven trigger evaluation):** gated on Phase 2 success. Separate OD proposal at Phase 3 entry.
- **Phase 4 (framework-default promotion):** gated on Phase 3 settlement. Promotion to `templates/stacks/_baseline/`.

### User forks applied (per BL-031 EA Decision Packet 2026-05-07)

| Fork | User decision | Implementation |
|---|---|---|
| Fork 1 — Default cadence | **weekly Sunday 23:00 UTC + 3-no-op-relax to bi-weekly** | `mcp__scheduled-tasks__create_scheduled_task` `weekly-dream-pass` cron `0 19 * * 0`; self-tuning relax codified in protocol §6 |
| Fork 2 — Default ingest tier | **default-tier @ 350KB cap** | Protocol §4 + skill body Step 1 input cap enforcement; `agent-changelog.md` 134KB / 48% special-handling note in protocol §4 |
| Fork 3 — Default mode for `/consolidate-memory` | **legacy in-place stays default; --dream-pass opt-in** | Skill body "Mode resolution" preserves legacy as default; `--dream-pass` is opt-in flag; scheduled-task explicitly invokes `--dream-pass` regardless |

### Critic verdict

Pass 1 REVISE-BEFORE-LAND (0 P0 / 2 P1 / 2 P2 / 8 Notes); one P1 mechanically fixed inline (P1-6 protocol §7 dream-pass-log location hedge). Pass 2 LAND (clean on Pass-1 fix). Four Phase-2-retro observation criteria registered (not BL-NNN items): scheduled-task fail-recovery edge case; stretch-tier phase-gating machine-readable marker; `mv` atomicity multi-mount caveat; cron miss-rate tracking when machine offline.

---

## [0.7.6] — 2026-05-07 — BL-025 Phase 1: outcome-grading rubric envelope landing

**Framework structural addition.** Lifts Anthropic's May 2026 Managed Agents `outcomes` feature shape (rubric + separate-context grader → structured result envelope) into TapAgents' four-axis review tier. Pure protocol/contract change — no Managed Agents API dependency.

### Added

- **`protocols/outcome-grading.md`** (NEW canonical, ~340 lines) — rubric-style result envelope schema; result enum (`satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade`) with mandatory `reason_class: infra | tooling | precondition_absent | runtime_error` for `unable_to_grade`; iteration loop semantics scoped to `handed-off → shipped` only; rubric-extraction discipline (reviewer-extracts criterion IDs from existing producer artifacts — zero producer-side change per user Fork 3); marker-file backward-compat mechanism (`workspace/<slug>/.outcome-grading-active`); industry-portability framing.
- **`templates/smoke-report.md`** (NEW) — formerly referenced by `agents/quality-engineer.md` but didn't exist as standalone template; now codifies envelope-at-section-top + structured prose with criteria-evaluated → §What-was-tested cross-reference.
- **`templates/security-audit.md`** (NEW) — formerly referenced by `agents/ops-security.md` but didn't exist as standalone template; now codifies envelope-at-section-top + structured prose with mitigation-map ID (`M-N`) → criteria-evaluated cross-reference.
- **NEW Tier 1 P3 BL-029** — "Codify 'iterate on user's behalf' principle in EA + Conductor + Org Designer contracts" filed per BL-025 proposal §7 + user founding-principle directive 2026-05-06 (also captured at `memory/feedback_iterate_on_users_behalf.md`).

### Changed

- **`agents/critic.md`** (codify-only per user Fork 2; +57 lines net) — adds "Result Envelope" section after Severity Reference with BL-019 verdict-shape mapping table (LAND-WITH-FOLLOWUPS → `satisfied` with `followup_items_filed:` populated; BLOCK → `needs_revision`; etc.); explicit codify-only scope language.
- **`agents/quality-engineer.md`** (+27 lines) — Algorithm step 4 inserted to codify rubric-extraction from `prd.md §Acceptance` items (`AC-N` IDs); Algorithm step 5 (smoke-report write) updated to require YAML envelope at section-top; new "Iteration loop" section codifying Phase-2 MANUAL-ITERATE mode + `max_revision_attempts = 2` per user Fork 1.
- **`agents/ui-ux-reviewer.md`** (+18 lines) — Algorithm step 6 (design-review write) updated to require YAML envelope with `criteria_evaluated` from `design-spec.md §7 default-coverage` route + state IDs (`DC-N`).
- **`agents/ops-security.md`** (+25 lines) — Algorithm step 7 (security-audit write) updated to require YAML envelope with `criteria_evaluated` from `threat-model.md` mitigation-map IDs (`M-N`).
- **`agents/conductor.md`** (+60 lines) — Read-list adds `protocols/outcome-grading.md`; new "Outcome-grading envelope handling" section with parser table mapping all 5 envelope results to Conductor actions; new "Cross-reviewer brief assembly" subsection (precedence Ops/Sec > QE > UI/UX > Critic-on-Tier-2); new "Phase gating" subsection (Phase 1 codify-only / Phase 2 manual-iterate / Phase 3 auto-iterate).
- **`templates/critic-review.md`** (+24 lines) — adds YAML envelope as new required first block.
- **`templates/design-review.md`** (+30 lines) — adds new §0 "Result envelope" section.
- **`memory/backlog.md`** + **`workspace/_global/backlog.json`** — BL-025 entry status `open → in-progress` with Phase 1/2/3 status detail; new entry for BL-029.

### Mirrored

All 10 framework files mirrored to `agent-dashboard/scaffold-source/` with `diff -q` empty parity.

### Phase rollout

- **Phase 1 (this landing):** Critic emits envelope (codify-only); trio (QE/UI-UX/Ops-Security) contracts updated to emit envelopes; Conductor parses LAST yaml-fenced block; iteration loop reserved.
- **Phase 2 (next ship cycle dogfood):** activates on the next project's `handed-off` cycle by Conductor creating `workspace/<slug>/.outcome-grading-active` marker. MANUAL-ITERATE mode.
- **Phase 3 (auto-iterate, future):** gated on Phase 2 dogfood validation + Tier 2 baseline scaffold update — separate OD proposal at Phase 3 entry.

### User forks applied (per BL-025 EA Decision Packet 2026-05-06)

| Fork | User decision | Implementation |
|---|---|---|
| Fork 1 — `max_revision_attempts` default | **2** | Hard-coded `default = 2` across all 5 reviewer contracts + protocol + state.json schema |
| Fork 2 — Critic codification scope | **codify-only** | Critic contract notes Phase 1 = codify-only; Critic-on-Tier-2 auto-iteration reserved for Phase 3 |
| Fork 3 — Rubric authorship discipline | **reviewer-extracts** | Protocol §8 + reviewer Algorithm steps cite "extract from existing producer artifacts"; no producer contract amended |

### Bundled in same commit (separately tracked, not v0.7.6 scope)

- **BL-026 doc landing** — `.claude/docs/managed-agents-comparison.md` (NEW, 215 lines, Critic LAND-WITH-FOLLOWUPS clean). Status: `open → done`. Public-safe narrative in `memory/agent-changelog.md`.
- **BL-031 proposal artifacts** — `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md` (~750 lines), Critic review, EA Decision Packet. Awaiting user decision; agent-changelog narrative lands at Phase 1 implementation per BL-025 precedent.
- **BL-031 backlog entry** filed canonically by Backlog Curator; `item_counts` recomputed: total=31, P2=12, open=18, tier1=11.
- Earlier in-flight session work captured (separate sessions, not landed individually): `agents/db-admin.md` activation, `protocols/destructive-data-ops.md`, `protocols/framework-change-discipline.md`, baseline scaffold tier2 template updates, registry/portfolio touches.

---

## [0.7.5] — 2026-05-06

### Added — Backlog Curator activated (curator-lite hybrid scope)

Backlog Curator graduated from `agents/_planned/` to `agents/` with curator-lite scope per user-approved Proposal 3 of `workspace/_global/org-designer-proposals/20260506T2330-backlog-reconciliation.md`. User direction: *"Backlog Curator is needed for our Tap Agents to be able to efficiently work amongst itself and resolve vulnerabilities, functional enhancements, UI/UX, etc."*

**Scope of curator-lite (what landed).** ID allocation as canonical allocator per `protocols/backlog-protocol.md §2.1`; JSON↔MD mirror-sync verification (structural assertion only — never silent reconciliation); `item_counts` recomputation in `workspace/_global/backlog.json` (the only mutation curator does without authorization); simple staleness flagging — Tier 2 P3 items > 90 days flagged via `STALENESS-CANDIDATE` finding (curator does NOT autonomously archive); status-drift sweep via `git log --grep="BL-NNN"` flagged as `STATUS-DRIFT-CANDIDATE`; top-of-backlog surfacing to EA's `Needs input:` line. Cadence: post-edit verify on every backlog mutation + on-demand ID-allocation gate + daily sweep summary signaled to EA + post-retro focused pass + post-merge sweep when promotion script invokes.

**What stayed with Org Designer.** Re-prioritization based on incident signal, archival decisions on Tier 1 items, stub-activation proposals when P0/P1 items keep being pushed, pattern-mining from `incidents.md` to backlog. Curator surfaces candidates via NEW append-only file `workspace/_global/backlog-curator-notes.md`; OD/user decides.

**Why curator-lite over full activation.** The full curator scope from the original `_planned/` stub (re-prioritization + archival + pattern-mining + stub-activation proposals) would have duplicated OD's pattern-detection work and risked the curator-OD seam producing the same friction the activation was meant to relieve. Curator-lite is sized to its actual job — mechanical hygiene — with cleaner separation of concerns and a smaller activation surface. The 30% time-cost data point from the same-day reconciliation pass (proof-of-need) drove sizing.

**Resize clause (load-bearing).** `agents/backlog-curator.md` codifies a 30-day evaluation (target 2026-06-05). OD evaluates whether curator-lite scope is under-scoped (>10% OD curator work in retros → propose mandate expansion), over-scoped (curator firing on noise → propose contraction), or right-sized (codify curator-lite shape as canonical activated form). Codified ratchet rather than scope creep.

**Lane discipline.** Curator owns `backlog.json` mutation (counts + ID-allocation), `backlog.md` mirror sync verification, `protocols/backlog-protocol.md §2.1` cadence enforcement. Curator does NOT decide priority bumps without OD/user authorization, does NOT delete items (mark wontfix/archived only — audit trail preserved), and does NOT detect cross-project patterns.

### Added — Backlog protocol §2.1 ID-allocation rule

`protocols/backlog-protocol.md` gained a new §2.1 "ID Allocation" section codifying single-shared-monotonic `BL-NNN` namespace + mandatory full-scan allocator + atomic JSON-MD pairing rule. Closes the failure mode that surfaced 2026-05-06: framework session 21-00 allocated BL-017/BL-018 from `backlog.json`'s then-max=16 while project sessions had previously allocated BL-017..BL-023 in `workspace/agent-dashboard/backlog.md` without mirroring to JSON, producing a numbering collision. The rule: allocator MUST scan `workspace/_global/backlog.json` + `memory/backlog.md` + `workspace/<slug>/backlog.md` for **every active project** in `portfolio.json` before picking `max(observed) + 1`. Append entry to the correct tier file AND mirror to `backlog.json` as the **same atomic unit** — never one without the other. Collision recovery: later allocator (by `added` date, then file mtime) renumbers + updates all references via `git grep`. Backlog Curator is the canonical allocator.

### Changed — 24-item backlog reconciliation (data correction pass)

`workspace/_global/backlog.json` rewritten end-to-end with reconciled state:
- **Status drift closed on 5 shipped items** with full git-evidence citations: BL-011 (commit `d929df3`), BL-013 Phases 1-5 (commits `9bca272`, `9800d4f`, `4c66fb6`; merges `47a1205`, `dafe25b`, `bf2f08a`), BL-015 + BL-016 (commit `00311e4` → merge `47a1205`), BL-023 (commit `1c176ee` → merge `bf2f08a`; migration `0004_bumpy_catseye.sql` to prod Neon at audit `a725f85`).
- **Status accuracy update on 1 item:** BL-006 from `open` to `in-progress` (implementation brief filed, doctrine doc exists, code not yet landed at commit baseline).
- **6 previously-unsynced project items added to JSON:** BL-019, BL-020, BL-021, BL-022, BL-023 (Tier 2 items existed in `workspace/agent-dashboard/backlog.md` but were missing from JSON; EA's BACKLOG SUMMARY had been undercounting Tier 2 by 6).
- **Framework BL-017→BL-024 + BL-018→BL-025 collision-recovery renumber:** project BL-017..BL-023 had earlier `added` timestamps and won the recovery per §2.1 rule. Renumbered framework entries carry `renumbered_from` field documenting the rename trail. Historical references in already-shipped CHANGELOG.md / sealed sessions / `_landed/0.7.4.md` left **unchanged** (they correctly say what was filed at the time).
- **Final post-recon counts:** Total 24 items; by_priority P0=0 P1=10 P2=10 P3=4; by_status open=14 in-progress=2 done=8 wontfix=0; by_tier tier1=7 tier2=17.

### Changed — Conductor + EA + OD contracts updated for Curator activation

- `agents/conductor.md` — Read-list adds `workspace/_global/backlog-curator-notes.md`; Backlog pull algorithm step 4 routes ID allocation + post-edit verify to Curator; NEW `Backlog Routing Matrix` section codifies which work routes to Curator vs OD vs user (13-row routing table).
- `agents/executive-assistant.md` — Read-list adds `backlog-curator-notes.md`; BACKLOG SUMMARY format adds `Curator findings (last 24h):` line filtered from curator-notes timestamps (cardinal-zero rule applies).
- `agents/org-designer.md` — Read-list adds `backlog-curator-notes.md`; Authority "Backlog grooming (pre-Curator)" bullet revised to "delegated to Backlog Curator since 2026-05-06"; 30-day resize evaluation codified inline (target 2026-06-05; lives in OD's monthly Cadence 4 pass per `protocols/team-rhythm.md`).
- Scaffold-source mirrors at `agent-dashboard/scaffold-source/agents/{conductor,executive-assistant,org-designer,backlog-curator}.md` updated identically (`diff -q` empty post-edit).

### Removed — `agents/_planned/backlog-curator.md` (graduated, not superseded)

Stub at `agents/_planned/backlog-curator.md` deleted — clean promotion of the previously-provisional contract per the activation checklist in the original stub. The active contract at `agents/backlog-curator.md` carries the curator-lite scope; the stub's "full curator" scope was deliberately not adopted.

### Founding team count: 8 active + 11 planned → 9 active + 10 planned

Backlog Curator graduated from `_planned/` (decrementing planned roster by 1, incrementing active roster by 1) in the same atomic transaction.

### Files changed

- `.claude/agents/backlog-curator.md` (NEW — graduated from `_planned/`; curator-lite scope; resize clause codified)
- `.claude/agents/_planned/backlog-curator.md` (DELETED — clean promotion)
- `.claude/agents/conductor.md` (Read-list + Backlog pull algorithm + NEW Backlog Routing Matrix section)
- `.claude/agents/executive-assistant.md` (Read-list + BACKLOG SUMMARY format with Curator findings line)
- `.claude/agents/org-designer.md` (Read-list + Authority Backlog grooming bullet revised + 30-day resize evaluation codified)
- `.claude/protocols/backlog-protocol.md` (§2.1 ID-allocation rule added; §8 anti-patterns updated for status-drift + single-source-allocation)
- `.claude/workspace/_global/backlog.json` (full rewrite with reconciled state)
- `agent-dashboard/scaffold-source/agents/backlog-curator.md` (NEW mirror)
- `agent-dashboard/scaffold-source/agents/conductor.md` (mirror)
- `agent-dashboard/scaffold-source/agents/executive-assistant.md` (mirror)
- `agent-dashboard/scaffold-source/agents/org-designer.md` (mirror)
- `agent-dashboard/scaffold-source/agents/_planned/backlog-curator.md` (DELETED — mirror)
- `.claude/CHANGELOG.md` (this entry)
- `.claude/memory/agent-changelog.md` (atomic narrative pair per `protocols/changelog-protocol.md §6`)

### Cross-references

- `workspace/_global/org-designer-proposals/20260506T2330-backlog-reconciliation.md` — OD proposal artifact with full evidence (Proposals 1+2 LANDED in prior dispatch; Proposal 3 = curator activation HYBRID approved by user).
- `protocols/backlog-protocol.md §2.1` — load-bearing ID-allocation rule (codified 2026-05-06; Curator is canonical allocator).
- `protocols/changelog-protocol.md §6` — atomic-cadence rule (data correction + protocol amendment + agent activation paired as one v0.7.5 release).
- Prior session 21-00 (v0.7.4) auto-seal hardening filed BL-017 (P2-cluster) and BL-018 (P3-hooks) which became the framework BL-024/BL-025 in collision-recovery rename — `renumbered_from` field in `backlog.json` documents the trail.

---

## [0.7.4] — 2026-05-06

### Process — Session-tracking auto-seal + EA drift-detection

Closes the session-tracking drift gap that surfaced 2026-05-06: BL-023 (16-00) + BL-013 Phase 5 (18-15) sessions left their `active-sessions.md` entries `status: in-progress` for ~3.5h after merge bf2f08a landed at 19:49. Two complementary mechanisms now make this self-healing:

**(A) Auto-seal on promotion** — `agent-dashboard/scripts/promote-to-prod.sh` now walks `active-sessions.md` at start of Gate 5 (success path) and inside `fail_with_audit` (partial-state path) and seals every in-progress entry whose `files_in_flight:` list overlaps the merged file set. Sealed entries gain `auto_sealed`, `auto_seal_merge`, `auto_seal_outcome`, `auto_seal_files`, and an `AUTO-SEALED via promote-to-prod.sh ...` `completion_note` (with a CAUTION line when claimed-files > shipped-files). Manually-sealed entries (existing `completion_note:`) are NOT overwritten — only `auto_*` metadata is appended for forensic record. Manifest path resolves framework-root-first then project-local fallback for industry portability. Failures are non-blocking (warn-only) — auto-seal is a metadata convenience, not a promotion gate. Implemented in inline python3 (multi-line YAML block parsing in pure bash is too brittle).

**(B) EA stale-session sweep** — `executive-assistant.md` runs a drift-detection sweep on every `/status` and `/briefing`. For each `status: in-progress` entry whose `last_updated` is >2h old, EA cross-references claimed `files_in_flight:` against `git log` since `last_updated`. Drift candidates surface as a `SESSION-TRACKING DRIFT` section with the suggested fix (re-run promotion script, or manually seal). EA is read-only — auto-seal owns mutation; EA owns surfacing. Catches cases auto-seal can't see: manual merges, hotfixes, projects without a promotion script, or any path that bypasses the script.

**Protocol amendment.** `session-coordination-protocol.md` Rule 1 now documents both mechanisms verbatim (field shapes, idempotency rules, fallback behavior). The "Future enforcement (hooks)" section was split: A and B moved into a new "Current enforcement (active)" section; pre-edit hooks remain as future work. Rule 1's "On session end" paragraph adds a one-line note clarifying that promote-script-merged work is auto-sealed; manual seal is only for non-promote paths. Path-format contract codified per Critic PASS 2: claims must be full repo-relative paths from framework workspace root, not basenames — the auto-seal matcher enforces exact-equality after framework/project-rooted normalization.

**EA reactive-cadence honesty.** EA's stale-session sweep is **reactive** — it fires on `/status` or `/briefing`, not on a timer or background hook. The 2026-05-06 drift surfaced because the user manually asked at 21:00, ~3.5h after merge. Even with this fix, EA would not have caught the gap during those 3.5h unless invoked. Auto-seal (A) is the active mechanism that closes the most common drift path; EA's sweep (B) is the reactive safety net for cases auto-seal can't see; the proactive answer (Claude Code pre-edit + pre-commit hooks) remains a P3 backlog item — see BL-018.

**Industry portability.** Scaffold-source mirrors at `agent-dashboard/scaffold-source/protocols/session-coordination-protocol.md` and `agent-dashboard/scaffold-source/agents/executive-assistant.md` updated identically (`diff -q` empty post-edit). `promote-to-prod.sh` is project-specific and has no scaffold-source mirror — other-stack promotion scripts SHOULD implement the same `auto_seal_active_sessions()` shape.

**Team flow.** Routed through Architect (PASS 1 + PASS 2) → Critic (PASS 1 LAND-WITH-FOLLOWUPS → PASS 2 GREEN-LAND-NOW). Two P1s closed before commit (path-suffix matcher false-positive elimination + CHANGELOG draft completeness). 4 P2s + 3 Notes filed as backlog: BL-017 (P2-cluster hardening — em-dash literal docs, EA guard rewrite, git-log timezone, sanity-line-count threshold, MERGE_SHA defense-in-depth, mktemp portability) + BL-018 (P3 Claude Code hooks).

### Files changed

- `agent-dashboard/scripts/promote-to-prod.sh` — §0.1 manifest-path resolution (framework-first/project-fallback); `auto_seal_active_sessions()` helper (~220 lines of inline python3); Gate 5 success-path call; `fail_with_audit` partial-state call; PASS 2 matcher tightening to exact-equality + basename-only-claim warn.
- `.claude/protocols/session-coordination-protocol.md` — Rule 1 amended; new "Current enforcement (active)" section; Path-format contract codified per Critic PASS 2.
- `agent-dashboard/scaffold-source/protocols/session-coordination-protocol.md` — mirror, identical post-edit.
- `.claude/agents/executive-assistant.md` — `active-sessions.md` + `session-coordination-protocol.md` added to Read on Every Invocation; new "Session-Tracking Drift Sweep" section (algorithm + non-actions + surface format + cadence + stack-agnostic note); Briefing format spec updated with conditional `SESSION-TRACKING DRIFT` section.
- `agent-dashboard/scaffold-source/agents/executive-assistant.md` — mirror, identical post-edit.
- `.claude/workspace/_global/active-sessions.md` — sealed prior 16-00 (BL-023) + 18-15 (BL-013 Phase 5) entries truthfully (both shipped via merge bf2f08a); registered + sealed this session's entry.
- `.claude/workspace/_global/backlog.json` — appended BL-017 (P2 Tech-Debt cluster, M effort, tier1) + BL-018 (P3 Process hooks, L effort, tier1); `item_counts` recomputed (total 18, P0:0/P1:6/P2:8/P3:4).
- `.claude/workspace/_global/changelog-drafts/_landed/0.7.4.md` — landed draft archive (moved from `2026-05-06T21-00-session-tracking-fix.md`).
- `.claude/workspace/_global/critic-review-session-tracking-fix.md` — NEW; Critic PASS 1 + PASS 2 review.
- `.claude/CHANGELOG.md` — this entry.
- `.claude/memory/agent-changelog.md` — atomic narrative pair per `protocols/changelog-protocol.md` §6.

### Cross-references

- Originating drift incident: merge `bf2f08a` ("Merge dev into main — promote-to-prod (additive, 6 commits)") on `agent-dashboard` 2026-05-06T19:49:58 — sealed sessions 16-00 (BL-023) + 18-15 (BL-013 Phase 5) shipped via this merge but were left `in-progress` until user surfaced the gap at 21:00.
- `.claude/workspace/_global/critic-review-session-tracking-fix.md` — Critic adversarial review (PASS 1 LAND-WITH-FOLLOWUPS → PASS 2 GREEN-LAND-NOW).
- `.claude/workspace/_global/backlog.json` BL-017 — P2-cluster hardening (em-dash literal docs, EA guard rewrite, git-log timezone, sanity-line-count threshold, MERGE_SHA defense-in-depth, mktemp portability).
- `.claude/workspace/_global/backlog.json` BL-018 — P3 Claude Code hooks (pre-edit on CHANGELOG/conductor.md + pre-commit atomic-cadence validator + session-close drift-sweep auto-fire) — graduate from Future-enforcement to Current.
- Reference implementation in `agent-dashboard/scripts/promote-to-prod.sh` `auto_seal_active_sessions()` helper.
- Prior protocol amendment: [0.7.3] — Rule 1 stale-but-still-claimed conflict-resolution; this release adds the active-mechanism layer beneath that defensive rule.

---

## [0.7.3] — 2026-05-06

### Changed — Session-coordination Rule 1 tightened: stale ≠ abandoned, ASK before auto-take-over

User-binding correction 2026-05-06: *"Make necessary notes so we don't have team members drifting their focus like this and accidentally doing overlapped work."* Triggered by 2026-05-06 incident in which an orchestrator session detected another session's BL-015/16 entry as stale (>1hr since last_updated) and started reading their design-brief in detail to take over implementation. User corrected: *"The other session is already doing BL15 and 16. You should be able to identify that."* The original rule wording — *"proceed but check for left-behind state"* — was insufficient.

**Rule 1 conflict-resolution flow amended.** Previous step 2 ("If sealed or stale — proceed but check for left-behind state") split into:
- Step 2 (sealed): proceed normally — claim is released.
- Step 3 (stale + in-progress): **DO NOT auto-take-over claimed files.** Stale ≠ abandoned. Other session may be drafting offline, designing in another tool, mid-implementation without committing. Read-only investigation is allowed; modifying claimed files requires explicit user authorization. Self-pivot signal added: detailed reading of another session's brief = preparing to take it over = surface to user.
- Step 4 (genuinely concurrent + cannot wait): write decision packet (Rule 3) — unchanged.

**Why this matters.** The prior rule encoded a heuristic ("1 hour stale = probably abandoned") that doesn't survive contact with real workflows. A producer drafting a long document offline doesn't ping last_updated. A session designer thinking in Figma for 2 hours is still active. The cost of asking is one message; the cost of overlapping work is real (wasted producer time, divergent implementations, conflict-resolution overhead, user frustration). The asymmetry favors asking.

**Companion memory note.** New user-memory entry `feedback_session_coordination_dont_drift.md` captures the behavioral rule for orchestrator-style sessions across all future invocations, indexed in `MEMORY.md`.

**Cross-reference v0.7.x context.** This release retroactively records the session-coordination tightening that was needed alongside the v0.7.x series. The dev-to-main-promotion protocol shipped earlier under the v0.7.3 git tag (commit 103b3e3) — its battle-test on BL-013 Phase 3 succeeded; the missing-from-CHANGELOG quirk is a separate housekeeping FYI tracked here for future reconciliation.

### Files changed

- `protocols/session-coordination-protocol.md` — Rule 1 conflict-resolution flow amended (step 2 → split into 2/3/4; new explicit "DO NOT auto-take-over" + "self-pivot signal" + asymmetric-cost framing).
- User-memory: `feedback_session_coordination_dont_drift.md` (NEW) + `MEMORY.md` index updated.

### Provenance

Triggered by 2026-05-06 BL-015/16 overlap incident. Lesson captured atomic with the protocol amendment per `feedback_changelog_proactive.md`.

---

## [0.7.2] — 2026-05-06

### Added — Team Rhythm Protocol + first institutional idle-cadence run (memory hygiene pass)

User-binding directive 2026-05-06: *"build good idle tendencies so agents are consistently learning and growing with their peer agents and the company itself has a structure so robust and token efficient it makes the output desirable."* This release codifies idle-cadence work as an institutional habit and runs the first instance of it.

**The protocol — `protocols/team-rhythm.md` (NEW).** Three principles (read-heavy, write-light, deltas not rewrites; peer-agent learning is the highest-leverage category; scheduled not constant). Five cadences with explicit triggers, owners, outputs, and costs: (1) Per-session-close summary (already in place via `templates/session-close.md`), (2) End-of-day pattern extraction (EA + Critic in parallel + Reconciler), (3) Weekly process-adherence audit (gated until first month of Cadence 2 has run), (4) Monthly Org Designer pass (cross-references `protocols/framework-contract-discipline.md` for separate leakage-audit cadence), (5a) Quarterly archive sweep + (5b) Annual memory-file currency review (supersession-marker convention deferred to first 5b run as ratification deliverable). Anti-patterns enumerated: NOT a license to refactor, NOT speculative, NOT continuous background, NOT a way to bypass review, NOT a substitute for in-line writing. Token-efficiency rules: bounded reading lists, deltas not rewrites, ~15K critic-notes cap (forward-only — existing files grandfathered), parallel dispatches over sequential, Adjacent-files footers in memory files. Three feedback loops claimed (one observed today: pattern extraction → faster future packets; two predicted: cross-axis peer learning → fewer recurring bugs; memory hygiene → smaller dispatches).

**Cadence 2 — Reconciler role.** Defined explicitly to close the autonomous-mode failure mode. Reconciler is NEVER the same agent as one of the parallel synthesis agents. Fallback chain (first match wins): user's active main session → Conductor → Org Designer → defer with backlog entry + next-briefing surface. Today's first run used fallback step 1.

**The first run — pattern extraction + memory hygiene pass (this session).** EA produced `workspace/_global/patterns-2026-05-06.md` (~1,389 words, 6 sections, citation-dense). Critic produced `workspace/_global/memory-gap-audit-2026-05-06.md` (~590 words, 4 P0 / 5 P1 / 3 P2; surgical delta proposals; structural memory-design observations). Reconciler (this session) applied surgical deltas:

- `memory/lessons-learned.md` — was empty placeholder; now has 6-entry 2026-05-06 cohort: force-issue TLS when nameservers stay third-party (v0.4.5 source); platform env-var removal scope-bleeds (v0.4.5); dev-vs-main drift is silent under current protocols (v0.4.6); Tier B → Tier C elevation when scope crosses milestones (v0.4.6); `_planned` agent promotions are merges not overwrites (v0.5.0); verification-before-completion applies to protocol-written claims about siblings (Critic-review-webhook-handler-ownership P1-1).
- `memory/security-patterns.md` (NEW) — Ops/Security's Tier 1 axis file (peer to QE's `runtime-gotchas.md`). Seeded with stack-agnostic webhook-handler security baseline: HMAC-over-raw-bytes, X-event-id replay rejection at DB layer, atomic cleanup-on-revoke, cross-tenant guard. Sourced from BL-013 §5.1-5.3, generalized off GitHub specifics.
- `memory/patterns.md` — 3 new entries: "Parallel-session-aware decision-packet drafting" (P0-4, third recurrence threshold met); "Adjacent-overlap audit during cross-plan packet authoring" (P1-2, from webhook-ownership §6); "Session-coordination protocol Rule 1 validates bidirectionally — first proven 2026-05-06" (P1-4, FYI codifying that the protocol does what it says).
- `memory/runtime-gotchas.md` — 1 new entry (P1-1): "Fixed absolute offset for variable-width content sibling causes intermittent overlap" — the runtime-axis class for the BL-015 ProjectCard z-index bug. Cross-axis peer to `memory/ui-anti-patterns.md`.
- `memory/incidents.md` — 1 new entry (P1-5): "Owner-only beta GitHub-App posture would have shipped to production without an explicit security baseline (near-miss)" — pattern candidate Y for "multi-tenant readiness audit must precede every dev → prod promotion that introduces an external auth surface."
- `memory/ui-anti-patterns.md` — added bidirectional cross-axis peer note pointing to the new runtime-gotchas entry.
- **Adjacent-files footers** added to all 6 memory files (structural memory-design issue #2 from gap audit) — single-line per file pointing to peer-axis siblings, making cross-axis peer learning discoverable from inside any one file.

**Critic adversarial review of `team-rhythm.md` itself.** PASS 1 found 3 P0 / 6 P1 / 5 P2; recommendation REVISE BEFORE LAND. PASS 2 fixed all 3 P0s + P1-5: (P0-1) Cadence 1 ↔ Cadence 2 trigger overlap disambiguated; (P0-2) Reconciler role + 4-step fallback chain added; (P0-3) Cadence 5 split into 5a (archive sweep, with source-of-truth citations + grandfather clause for 22K + 14K critic-notes files) + 5b (annual memory-file currency review with supersession-marker convention as first-run ratification deliverable); (P1-5) `framework-contract-discipline.md` cross-reference added in Cadence 4. Remaining P1/P2 deferred as next-pass amendments — surface in EA briefing.

**Memory-design structural observations from gap audit (deferred to Org Designer):** (1) Empty-file deferral smell — every `_planned` agent activation should auto-seed at least one memory entry; (2) Naming convention drift across 7 memory files (5 different shapes) — Org Designer ratify a single `<axis>-<artifact-type>.md` shape; (3) Cross-reference index — addressed by Adjacent-files footers in this release.

**Coordination signals.** First adversarial test of `protocols/session-coordination-protocol.md` Rule 1 — protocol worked bidirectionally. Two concurrent sessions (`2026-05-06T12-49-webhook-ownership-decision` and `2026-05-06T16-47-bl013-and-leakage-audit`) shared overlapping files; both detected each other in `active-sessions.md`; both wrote `coordination_note` fields acknowledging the dance; the file-modified-since-read race-detection caught two concurrent active-sessions.md edits; the parallel session staged a cross-lane edit to `protocols/session-coordination-protocol.md` but did NOT apply it, deliberately respecting this session's lane lock. The 16-47 session also closed BL-014 (Org Designer ratification of QE memory files) which independently resolved gap-audit P0-3.

### Files changed

- `protocols/team-rhythm.md` — **NEW** (~5KB → ~7KB after PASS 2; 5 cadences, 3 principles, 6 token-efficiency rules)
- `workspace/_global/patterns-2026-05-06.md` — **NEW** (EA day-end synthesis)
- `workspace/_global/memory-gap-audit-2026-05-06.md` — **NEW** (Critic gap audit)
- `workspace/_global/critic-review-team-rhythm.md` — **NEW** (Critic adversarial review of team-rhythm.md PASS 1)
- `memory/lessons-learned.md` — was empty placeholder → 6-entry 2026-05-06 cohort + Adjacent-files footer
- `memory/security-patterns.md` — **NEW** (Ops/Security Tier 1 axis file with seed entry + Adjacent-files footer)
- `memory/patterns.md` — placeholder removed; +3 entries; + Adjacent-files footer
- `memory/runtime-gotchas.md` — +1 entry; + Adjacent-files footer
- `memory/incidents.md` — +1 entry; + Adjacent-files footer
- `memory/ui-anti-patterns.md` — + cross-axis peer note + Adjacent-files footer

### Cross-references

- User-binding directive: this conversation 2026-05-06
- First-run companion artifacts: `workspace/_global/patterns-2026-05-06.md` + `workspace/_global/memory-gap-audit-2026-05-06.md`
- Adversarial review: `workspace/_global/critic-review-team-rhythm.md`
- Adjacent protocol (separate cadence, separate codification): `protocols/framework-contract-discipline.md`
- Coordination test evidence: `active-sessions.md` 2026-05-06 entries (sessions 12-49 and 16-47)

## [0.7.1] — 2026-05-06

### Added — Decision Packet: Webhook Handler Ownership (v1.5 Task 7 ↔ BL-013 Phase 3.5)

Cross-plan coordination artifact resolving the implicit overlap between two approved execution plans, both of which touch `POST /api/webhooks/github`. The v1.5 plan's Task 7 inline note ("deduplicate vs BL-013 step 5, do not duplicate plumbing") was correct in spirit but ambiguous in arbitration; this packet makes the seam explicit, names the arbitration rule, and hardens the sequencing.

**Resolution.** **BL-013 Phase 3 §5.1-5.3 owns the schema migration** (`installations` + `webhook_events` tables, generated as the next free `drizzle/*.sql` slot at landing time). **v1.5 Task 7 owns the handler implementation** (route + signature verifier + per-event handlers); Task 7 does NOT generate SQL DDL — its handler code reads/writes the schema BL-013 created. **Behavioral contracts come from BL-013 §5.1-5.3** (HMAC-over-RAW-bytes, X-GitHub-Delivery replay-rejection, installation.deleted atomic-transaction shape, cross-app guard); Task 7 consumes these as design spec. **BL-013 Phase 3.5 owns the security audit lens** — Ops/Security's first real dispatch — running against landed Task 7 code with P0 findings blocking BL-013 Phase 4.

**Sequencing (load-bearing).** `BL-013 Phase 3 (schema migration) → v1.5 Task 7 (handler implementation) → BL-013 Phase 3.5 (Ops/Security mini-audit) → BL-013 Phase 4`. You cannot audit what does not exist, and Task 7's handler code cannot be implemented against a schema that has not been migrated. BL-013 Phase 1+2 (prod App registration + Vercel env-var rotation) remain independent of Task 7 and were executed in parallel session 2026-05-06T16-47-bl013-and-leakage-audit.

**Adjacent overlaps named (no separate packet).** `GITHUB_APP_WEBHOOK_SECRET` is touched by both plans (v1.5 Task 8 code-side, BL-013 Phase 2 platform-side) — complementary, not conflicting. `bug_reports` and `webhook_events` both fire on signature failure — different sinks (existing error trail vs new audit log), Tier 2 wires both. Migration-slot collision flagged for Tier 2 implementer to handle at landing time.

**Process notes.** First adversarial test of the `protocols/session-coordination-protocol.md` (v0.6.0). Conflict-resolution flow (Rule 1) was triggered when active-sessions.md showed the BL-013 packet, CHANGELOG.md, and agent-changelog.md held by a concurrent session — this session paused edits on those files and proceeded only with parallel-safe work (new packet draft, v1.5 plan cross-reference, this CHANGELOG draft). Cross-reference application split: §5.1 (v1.5 plan) applied at packet landing; §5.2 (BL-013 packet) applied after the concurrent session sealed at 2026-05-06T18:10. Both cross-references now in place. Critic adversarial review surfaced 4 P1 findings; Architect PASS 2 addressed two before-commit items (changelog-draft accuracy + schema-ownership clarification + sequencing diagram correction); three post-commit follow-ups deferred (Phase 3.5 P0 arbitration paragraph, Phase 0 status check, migration-slot one-liner promotion).

**Authority.** Load-bearing for Ops/Security's BL-013 Phase 3.5 dispatch. Supersedes the inline "deduplicate vs BL-013 step 5" note in v1.5 Task 7. Does NOT re-open either plan's content — both remain approved and execution-ready; only the seam is named.

### Files changed

- `workspace/agent-dashboard/decision-packet-webhook-handler-ownership.md` — **NEW** (decision packet, 125 lines)
- `workspace/agent-dashboard/critic-review-webhook-handler-ownership.md` — **NEW** (Critic adversarial review)
- `workspace/agent-dashboard/decision-packet-bl013-multiuser-security.md` — §5.3 footnote cross-reference added (per packet §5.2)
- `agent-dashboard/.claude/docs/v1.5-execution-plan.md` — Task 7 Accept clause cross-reference applied (per packet §5.1)
- `workspace/_global/active-sessions.md` — session 2026-05-06T12-49-webhook-ownership-decision registered, sealed at landing

### Cross-references

- `protocols/session-coordination-protocol.md` — first adversarial test of Rule 1 (conflict-resolution) and Rule 3 (decision packets as cross-plan authority)
- `workspace/agent-dashboard/decision-packet-bl013-multiuser-security.md` — paired plan; cross-reference applied 2026-05-06T18:10+ after session 16-47 sealed
- `agent-dashboard/.claude/docs/v1.5-execution-plan.md` — paired plan; cross-reference applied at packet landing

## [0.7.0] — 2026-05-06

### Changed — Project-leakage audit cleanup: BLOCKING entries migrated, activation contexts sanitized, framework-contract-discipline protocol shipped

**Org Designer leakage audit cleanup (Round 1 + Round 2 dispatch).** Closes the Round-1 BLEED-BLOCKING and BLEED-WARNING findings + the Round-2 Critic-flagged blockers (C1 / C2 / C4) + EA flags. Founding audit at `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` (now amended with §8 "Round 2 Amendments"). User approved continuation 2026-05-06T17:05: *"Yes, continue with the changes."* Critic Round-2 verdict: GREEN — all 7 cross-lane edits APPROVED-AS-IS, migrations + sanitizations + protocols all approved.

**Headline.** Convention is right; discipline lapsed. Migrated 3 BLEED-BLOCKING `CHANGELOG.md` entries (v0.4.5 / v0.4.6 / v0.5.0) by replacing project-attributable bodies with framework-portable lesson summaries + breadcrumb pointers to the migrated full narratives. Sanitized 3 activation-context surfaces (active `agents/ops-security.md`, post-promotion `agents/_planned/ops-security.md`, UI/UX Reviewer activation entry in `memory/agent-changelog.md`) per the new Activation Context discipline. Codified 4 amendments (A1 audit-routing, A2 migration policy, A3 + A4 + A5 framework-contract-discipline, A6 cadence). Applied 7 cross-lane edits (architect + critic + QE + UI/UX Reviewer + Ops/Security + session-coordination-protocol) post Critic GREEN verdict.

**A1 — `protocols/autonomous-ops-permissions.md §6.1` audit-routing amended.** New §6.1.1 "Audit-routing destination" codifies that Tier B / C audit entries route by scope: project-scoped actions append to `<project>/.claude/memory/agent-changelog.md`; framework-scoped actions append to `.claude/memory/agent-changelog.md`; cross-cutting actions append both atomically per `changelog-protocol.md §3`.

**A2 — `protocols/changelog-protocol.md §7` Migration Note amended.** New §7.1 (retroactive migration of pre-protocol BLEED-BLOCKING entries), §7.2 (migration breadcrumb format), §7.3 (cross-reference preservation policy). Closes Critic C4 — cross-reference integrity preserved through the migration without cascading edits.

**A3 + A4 + A5 + A6 — `protocols/framework-contract-discipline.md` shipped (NEW).** Codifies four discipline rules: §1 Activation Context discipline (category-level + footnote pattern); §2 Provenance-citation discipline (date-pointers); §3 Stack-specific examples are illustrative, not binding (single-sentence portability framing); §4 Project-leakage audit cadence (monthly during single-project-phase; relaxes to quarterly on observable triggers).

**Round 1 BLOCKING migrations (F1 + F2 + F3) executed.** Three entries' framework-public residue retained (the lessons that generalize: force-issue-TLS-when-third-party-NS, Tier-B-becomes-Tier-C-on-M-milestone-scope, QE-merge-not-overwrite-doctrine); full project narratives migrated to a new `agent-dashboard/.claude/CHANGELOG.md` (created as the migration destination per EA flag #1) under three "Migrated 2026-05-06" entries.

**Activation-context sanitization (F5 + F12 + F12.1) executed.** Active Ops/Security contract's `## Activation Context` rewritten to category-level triggers + the F18-shape footnote pointing at `memory/agent-changelog-private.md` for project-attributable evidence. Post-promotion `_planned/ops-security.md` historical-record stub received identical surgery. UI/UX Reviewer activation entry in `memory/agent-changelog.md` now references project-attributable evidence by pointer.

**Cross-lane edits applied (7 total, post Critic GREEN verdict).** Surgical patches applied to `agents/architect.md` (L106 + L111 — F10), `agents/critic.md` (L135–L136 — F11), `agents/quality-engineer.md` (L91–L100 — F18 + L181 — F13), `agents/ui-ux-reviewer.md` (L87 + L154 — F16), `agents/ops-security.md` (L75 — F17), `protocols/session-coordination-protocol.md` (L18 + L42 — F22). Each patch preserves load-bearing technical specificity inside the contract; project-attributable specifics demoted to italicized footnotes per `framework-contract-discipline.md §1`.

**Round 2 audit amendments + Critic findings closed.** F22 (session-coordination-protocol stack-example bleed) opened and closed. F12.1 (`_planned/ops-security.md` post-promotion bleed) opened and closed. F23–F29 spot-audit of the 7 unactivated `_planned/` stubs returned 7 clean / 1 already-surgeried / 1 acceptable-by-archival-purpose. F30 spot-audit of the 5 Tier-1 backlog entries' source-attribution returned 5 lessons-generalize / 0 mis-tiered. C5 cadence reconciliation landed in `framework-contract-discipline.md §4`. C6 F12 symmetry with F18 landed. C7/C8/C9 acknowledged or closed.

### Cross-references

- Audit log: `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`
- Cross-lane edit archive: `workspace/_global/org-designer-proposals/20260506T1705-cross-lane-edits-staged.md`
- A2 in: `protocols/changelog-protocol.md §7.1–§7.3`
- A1 in: `protocols/autonomous-ops-permissions.md §6.1.1`
- A3–A6 in: `protocols/framework-contract-discipline.md`
- Migration destination: `agent-dashboard/.claude/CHANGELOG.md`
- Industry-portability binding: user memory `project_team_industry_portability.md`
- Session coordination: `protocols/session-coordination-protocol.md`

---

## [0.6.0] — 2026-05-06

### Added — Session Coordination Protocol: cross-session consistency for parallel Claude sessions

User-binding directive 2026-05-06: *"I can't have cross session drifts and consistency is key. The whole team is connected and needs to act that way ALL the time."* Codifies how multiple parallel Claude sessions stay consistent when editing shared workspace state. Complements (does not duplicate) `protocols/changelog-protocol.md` (scope split between framework and project changelogs), `protocols/conflict-resolution.md` (within-project artifact conflicts), and `protocols/consistency-check.md` (automated diff at state-machine transitions). Uniquely owns: inter-session coordination across concurrent sessions.

Real friction observed prior to codification: CHANGELOG entries [0.4.7] → [0.5.0] → [0.5.1] → [0.5.2] landed within hours from four independent sessions, mutual unawareness; agent-changelog files race-edited during in-flight work; v1.5 plan and BL-013 decision packet both spec the webhook handler at `POST /api/webhooks/github`.

**Six rules.** (1) **Session manifest** at `.claude/workspace/_global/active-sessions.md` — every cross-cutting session declares scope, files-in-flight, status before editing. (2) **CHANGELOG drafts** at `.claude/workspace/_global/changelog-drafts/` — version stamped at landing, not edit time, eliminating version-claim races. (3) **Decision packets** as single authority for cross-plan conflicts; both plans cross-reference, never edit-both-concurrently. (4) **Lane ownership** — each agent owns specific files (Designer→design-spec, QE→test-plan/smoke-report, Conductor→state.json, etc.); cross-lane edits dispatch the owner. (5) **EA briefing** opens every non-trivial cross-cutting session — cross-session standup. (6) **Atomic git commits** per landed unit, no accumulated work across sessions.

**Scope.** MUST follow when editing: `.claude/CHANGELOG.md`, `memory/agent-changelog.md`, agent contracts, protocols, templates, conductor.md, cross-cutting plans, decision packets, files referenced by ≥2 agents' read-on-invocation lists. MAY skip for: scoped per-project work, read-only operations.

**Conflict resolution flow.** When `active-sessions.md` shows another session editing the file you want: pause if `in-progress` and `last_updated` < 30min ago; proceed-with-caution if sealed or stale (>1h); write decision packet if genuinely concurrent and cannot wait.

**Future enforcement.** Hooks in `.claude/settings.json` (per `update-config` skill): pre-edit hook on CHANGELOG.md checking active-sessions; pre-edit hook on conductor.md requiring manifest entry; pre-commit hook validating atomic-cadence rule. Out of scope for initial protocol; backlog item.

**First session under the new protocol** is the protocol's own authorship: session-id `2026-05-06T15-30-session-coord-protocol` registered in active-sessions.md, CHANGELOG entry drafted in `changelog-drafts/`, landed atomically with the narrative entry, then sealed.

### Files changed

- `protocols/session-coordination-protocol.md` — **NEW** (load-bearing protocol document)
- `workspace/_global/active-sessions.md` — **NEW** (session manifest registry, seeded)
- `workspace/_global/changelog-drafts/README.md` — **NEW** (drafts directory protocol)
- `workspace/_global/changelog-drafts/_landed/0.6.0.md` — **NEW** (this entry archived)
- `CHANGELOG.md` — this entry stamped at landing
- `memory/agent-changelog.md` — narrative entry (atomic with this CHANGELOG entry)
- User auto-memory: `feedback_session_coordination.md` + `MEMORY.md` pointer (binding for orchestrator sessions)

### Cross-references

- User directive: 2026-05-06 — *"I can't have cross session drifts..."*
- Atomic-cadence rule: `~/.claude/projects/.../memory/feedback_changelog_proactive.md`
- Complements: `protocols/changelog-protocol.md`, `protocols/conflict-resolution.md`, `protocols/consistency-check.md`, `protocols/ea-protocol.md`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — Session Coordination Protocol shipped

## [0.5.3] — 2026-05-06

### Fixed — UI/UX Reviewer P1 quality-of-symmetry fixes (refinement pass #3, final)

Final refinement pass on UI/UX Reviewer activation, landing the seven P1 quality-of-symmetry warnings from Critic's adversarial review (`workspace/_global/critic-notes-ui-ux-reviewer-activation.md`, dated 2026-05-06). The three P0s landed in v0.5.2; this pass closes the structural-symmetry items so the contract reaches peer-agent shape parity with Ops/Security and QE. **No structural team change** — last touch on the contract that activated in v0.4.7, refined through Option C in v0.5.1, hardened on P0s in v0.5.2, and reaches steady-state shape here.

**P1-A merged with P1-G — Activation Context section + originating-proposal/user-quote citation.** Mirrors `agents/ops-security.md:229-247` precedent. New `## Activation Context` section preserves the user's verbatim `/grow-team` ask (*"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create and implement the most modern stack/design theming ... seeing layout and changes that are logical without needing user screenshots or inputs."*) inside the contract itself — so future invocations reading only the contract retain the role's "what good looks like" intent. Maps the four phrases in the ask onto the four operating principles. Names the four-axis review tier this completes (Critic plan / QE runtime functional / Ops/Security runtime adversarial / UI/UX Reviewer runtime visual+IA). Links originating proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`. Activation date 2026-05-06. Slash command `/design-review` per `commands/quality-engineer.md` precedent.

**P1-B — Memory File Authority table.** Mirrors `agents/ops-security.md:211-228` table-form precedent. New `## Memory File Authority` section codifies per-file read/write semantics across 12 files spanning `memory/ui-references.md` / `memory/ui-patterns.md` / `memory/ui-anti-patterns.md` (UI/UX Reviewer append-only with provenance), peer-owned files (`memory/lessons-learned.md` / `memory/incidents.md` / `memory/runtime-gotchas.md` — read-only), per-project artifacts (`workspace/<slug>/design-review.md` owner + append-only across passes; `workspace/<slug>/backlog.md` append-only for P1 visual findings), and Playwright config files (`tests/visual/playwright.visual.config.ts` and `tests/visual/*.spec.ts` — owner; `playwright.config.ts` — read-only, QE's exclusive territory). **Designer is granted append authority on `memory/ui-references.md`** with provenance-required (project + date + role-of-author). Rationale: both roles benefit from canon currency, and dual-authoring with provenance prevents stale-canon while preserving audit trail. Neither role edits prior entries.

**P1-C — Reconcile L74 framing language to project-type-agnostic.** L74 is already project-type-agnostic post-Option-C (lists "first dashboard project, first marketing site, first dev-tool console" as parallel examples, none baked). Verified the founding-project exception language at L85 also doesn't bake project-type assumption — uses "any project without design-spec.md" with agent-dashboard as one example. No edit needed; verification documented here for audit trail. The "team's only shipped project type" phrasing the v0.5.2 critic notes flagged was already removed by Option C in v0.5.1.

**P1-D — Founding-project exception sunset criteria.** Single-line addition to the founding-project exception at L85. Prior text said "This exception applies once per project. After first pass, the design-spec must own the list" — implicit but not codified. Now explicit: *"Sunset criteria: the exception lapses on the next pass once `design-spec.md` exists with a §7 default-coverage block — Reviewer reads the block from spec on that pass, no further exploratory routing."* Closes the bounded-criteria gap Critic flagged at note ⚠ "Founding-project exception clause not yet defined for the contract."

**P1-E — Failure Modes for runtime-infrastructure failures.** New four-class failure-mode block addressing what happens when the review can't proceed. (a) **Deployed URL unreachable / 502 / connection refused** — abort, write `§What couldn't be reviewed`, signal Conductor `blocked` (NOT a P0 visual finding — infrastructure block). (b) **Playwright browser crash / navigation timeout** — retry once with extended 30→90s timeout; on second failure, log to `§What couldn't be reviewed`, do NOT proceed to checklist on missing screenshots (hollow review > blocked review). (c) **Redirect loop** — classify as routing bug; route via `WRONG_AGENT: → Quality Engineer`, no P0 against the surface that never rendered. (d) **Auth-bypass not set** — detection: >50% of default-coverage routes resolving to same auth path. Cross-references QE's `TEST_AUTH_BYPASS` pattern at `agents/quality-engineer.md:90-100` (Auth-Protected Test Gap section). Required env: `TEST_AUTH_BYPASS=1` plus `TEST_AUTH_USERNAME` (default `tapintomymind`), guarded by `NODE_ENV !== 'production'`. If unset, abort and signal Conductor `blocked` rather than file findings against the auth page. Closes Critic's note ⚠ "Failure mode missing: dev server not running when /design-review fires."

**P1-F — Future-Growth Lens section.** Mirrors `agents/quality-engineer.md:166-174` precedent. New `## Future-Growth Lens` section documents fragmentation triggers at 5x team size or 10 shipped projects across multiple project types: likely split into Visual Reviewer / IA Strategist / Pattern Researcher (the three sub-roles the originating proposal §"Risk this proposal is wrong" already named); sub-role spawns for Accessibility Tester / Mobile-First Reviewer / Brand-System Auditor; Tier 2 mirror pattern (per-project Visual Reviewer, HQ Reviewer becomes cross-project pattern keeper); memory-artifact compounding (`ui-patterns.md` / `ui-anti-patterns.md` become load-bearing); merge-with-Designer assessment (unlikely — author/judge separation is load-bearing); industry-portability binding per `project_team_industry_portability.md`.

### Files changed

- `agents/ui-ux-reviewer.md` — Founding-project exception sunset criteria added (L85); Failure Modes runtime-infrastructure four-class block added after "Mis-routes findings as bugs" (L150-154); new `## Memory File Authority` section between Wrong-Agent Returns and Format (L181-198); new `## Activation Context` section after Memory File Authority (L200-218); new `## Future-Growth Lens` section after Activation Context (L220-227). Net file size: 179 → 235 lines (+56, well under the 300 ceiling, within the +50-80 target).
- `CHANGELOG.md` — this entry stamped at landing.
- `memory/agent-changelog.md` — narrative entry (atomic with this CHANGELOG entry).

### Critic re-review status

No critic re-review will follow — user direction at session wrap. P1 fixes are surgical, structural-symmetry items mapped cleanly to peer-agent precedents (Ops/Security L211-228 / L229-247; QE L166-174); no novel doctrine introduced; no behavioral change to the Algorithm beyond explicit failure-mode handling (which strictly tightens, never loosens, the contract). Counterpart-agent shape parity reached: UI/UX Reviewer now matches Ops/Security and QE on Activation Context, Memory File Authority, and Future-Growth Lens sections. Steady-state contract.

### Cross-references

- Critic notes (P1 source): `workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`
- Prior P0 fixes: CHANGELOG v0.5.2 (this date)
- Industry-portability binding: user memory `project_team_industry_portability.md`
- Peer-agent precedents: `agents/ops-security.md:211-247`, `agents/quality-engineer.md:90-100,166-174`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer P1 quality-of-symmetry fixes

## [0.5.2] — 2026-05-06

### Fixed — UI/UX Reviewer P0 fixes from critic adversarial review (refinement pass #2)

Surgical pass against the three blocking concerns surfaced by Critic in `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md` (review dated 2026-05-06, post-v0.5.1 baseline). User approved fixing the P0s; the 7 P1 quality-of-symmetry warnings and 2 P2 observations are deferred to a follow-up pass. **No structural team change** — this hardens the contract that activated in v0.4.7 and refined in v0.5.1.

**P0-1 — Designer-seam protection invariant.** Critic flagged that Operating Principle 3, as written, contained a load-bearing escape hatch: when implementation drifts AND modern competitors agree with the implementation (the spec might be the wrong call), the contract could be read as licensing `WRONG_AGENT: → Designer` revision-only routing instead of routing the finding as an implementation-side fix. That collapses the author/judge separation that justified the role split — the very risk the original org-designer proposal §"Cost / risk" identified as the largest seam risk. Fix: Operating Principle 3 now opens with a single-line invariant — *"Reviewer files findings against implementation. Spec edits are Designer's exclusive territory. The two are independent: a finding can be filed AND a spec-revision recommended in the same pass; they do not block each other."* — followed by a worked example covering the 32px button case (spec says 40, impl renders 32, references show 32). The example states the resolution algorithm explicitly: file the impl-side finding (P0/P1 per visible impact), AND optionally file a separate `WRONG_AGENT: → Designer` handoff tagged `spec-revision-candidate` with rationale; the two are decoupled. The Wrong-Agent Returns table gains two new rows distinguishing the spec-internally-contradictory case (revision-only) from the references-have-moved case (additive, parallel impl finding still files). Algorithm step 4 (market calibration) updated to reference the doctrine rather than imply a substitutive route.

**P0-2 — Anti-sycophancy fallback strengthened to peer-agent parity.** Critic flagged that the prior single-pass trigger (`if P0=0 AND P1=0`) could be tripped by five P2 polish items with zero P0/P1 — calibrated-permissive drift would satisfy the count-based trigger logically while bypassing the spirit. Plus the cross-run anti-sycophancy mechanism (the 5-consecutive-clean-runs trigger that QE and Ops/Security have at the *Algorithm* level) lived only in Failure Modes, not Algorithm — wrong location for enforcement. Fix: Operating Principle 4 now codifies three triggers — (a) single-pass substantive (a P2-heavy pass with ≥3 P2 and zero P0/P1 does NOT exempt the second-pass requirement), (b) cross-run (5+ consecutive zero-P0 reviews force the second pass regardless of P1 count, threshold tunable by Org Designer), (c) severity calibration check (every pass, ask "would the user disagree with this severity? If yes-or-uncertain, escalate one tier" — re-rate before sign-off). Algorithm step 7 enumerates the three checks in order; Failure Modes "Rubber-stamp risk" updated to reference Algorithm enforcement rather than duplicate the rule.

**P0-3 — Playwright config separation Authority↔Failure-Mode contradiction resolved (Option A — separate config file).** Critic flagged a direct contradiction: the Authority table forbade editing `playwright.config.ts` (QE's exclusive territory), while Failure Modes mitigation said Reviewer "adds a `projects: []` entry only if needed" — which is a config edit. The first activation pass had already worked around the contradiction organically by creating `agent-dashboard/tests/visual/playwright.visual.config.ts` and running with `--config`. Fix: codify the organic pattern as Option A. Algorithm step 4 now mandates the separate-config-file pattern — Reviewer creates and owns `tests/visual/playwright.visual.config.ts` (own testDir, viewport projects for the 375/768/1024/1440 sweep, own reporters, headed-mode toggles) and runs `npx playwright test --config=tests/visual/playwright.visual.config.ts` (or via an `npm run test:visual` script). Authority table replaces the "Extend `playwright.config.ts`" cannot-row with two rows: a "Run Playwright runner via own config" can-row and an explicit "Edit `playwright.config.ts`" cannot-row. Failure Modes "Tooling drift with QE" updated to point at Algorithm step 4 — neither file imports nor extends the other; no shared `projects: []` array between them.

### Files changed

- `agents/ui-ux-reviewer.md` — Operating Principle 3 expanded with invariant + worked example (L35-42); Operating Principle 4 expanded with three-trigger anti-sycophancy doctrine (L43-45); Algorithm step 4 (market calibration) updated to reference Operating Principle 3 doctrine (L76); Algorithm step 4 (Playwright runner) replaced with separate-config doctrine (L87-95); Algorithm step 7 (anti-sycophancy fallback) replaced with three-check enumeration (L104-109); Authority table reworked for Playwright config separation (L137-138); Failure Modes "Rubber-stamp risk" + "Tooling drift with QE" updated (L145, L148); Wrong-Agent Returns gains two new rows for the spec-revision routing cases (L162-163). Net file size: 154 → 179 lines (+25, well under 300 ceiling, exactly at the 180 target upper bound).

### Critic re-review status

P0 fixes ratified for self-validation per the contract; recommend batching critic re-review with the P1 pass to amortize one cycle vs. two. Three P0s landed; 7 P1 quality-of-symmetry items + 2 P2 observations open for a future refinement pass. No P0 leakage from the fixes themselves.

### Cross-references

- Critic notes: `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- Prior activation + refinement: this CHANGELOG v0.4.7, v0.5.1; `memory/agent-changelog.md` 2026-05-06 (both prior entries).
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md` §"Cost / risk".
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer P0 fixes.

## [0.5.1] — 2026-05-06

### Changed — UI/UX Reviewer refinements: default-coverage portability, reference canon balance, changelog scope protocol, industry-portability vision codified

Surgical post-activation refinements to the UI/UX Reviewer team integration, driven by user clarifications on the four open items from the activation pass and a binding strategic note on industry portability.

**Industry-portability vision codified.** User memory note `~/.claude/projects/.../memory/project_team_industry_portability.md` (2026-05-06) makes the team structure cross-industry by design — the App Development agent team should generalize to marketing, media, curation, and other industries. Defaults that name a stack must be parameterized by project type or pushed upstream into the project's spec, not hardcoded into framework-level agents. **Binding for all future org decisions.**

**Default-coverage portability (Option C — push upstream into Designer).** The dashboard-specific screenshot list previously hardcoded in `agents/ui-ux-reviewer.md` Algorithm step 2 has been removed. Designer now owns a per-project `default-coverage` block in `design-spec.md` §7 (new section, between Accessibility §6 and Open Questions, which renumbered to §8). The block enumerates routes, breakpoints, states, and auth-state setup notes — all sourced from the PRD's user stories. UI/UX Reviewer reads the block on every pre-ship pass; if absent, returns `WRONG_AGENT: → Designer`. A founding-project exception applies once per project for cases where no design-spec.md exists yet (e.g., agent-dashboard at activation time): Reviewer may run a one-time exploratory pass and output a "Recommended default-coverage block" section that Designer lifts into the spec.

**Reference canon balance.** `memory/ui-references.md` removes Anthropic Console (Tier-B entry 7) to avoid self-referential bias risk for an Anthropic-built agent team. Tier-A canon (Vercel, Linear, Stripe Dashboard, Railway) plus Tier-B (GitHub Projects, Notion) is sufficient. Removal rationale documented in a new "Considered but not seeded" section so a future addition is informed. Quarterly canon review will reconsider.

**Changelog scope protocol codified.** New `protocols/changelog-protocol.md` fixes the scope split between framework `.claude/memory/agent-changelog.md` (team-shape changes that span projects) and project `<project>/.claude/memory/agent-changelog.md` (project-scoped agent activity). Both files are updated atomically when a team-shape change has project-specific consequences. The atomic-cadence rule from user memory (`feedback_changelog_proactive.md`) is operationalized as: same turn / commit / PR — not deferred sweep. One-line pointers added to both `agent-changelog.md` files referencing the new protocol.

### Files changed

- `agents/designer.md` — Algorithm step 7 added (Define default-coverage block); design-spec output structure §7 added (renumbered §7→§8); Authority gains "Define default-coverage block" bullet.
- `agents/ui-ux-reviewer.md` — Algorithm step 2 replaced (read design-spec block; WRONG_AGENT if absent) + step 3 added (run pass per block) + founding-project exception paragraph + steps 4–9 renumbered; Wrong-Agent Returns table gains "missing default-coverage block → Designer" row. Net: 160 → 154 lines (-6, well under 300 ceiling).
- `templates/design-spec.md` — §7 (Default-Coverage) added with route table + breakpoints + states + auth-setup notes; §7→§8 renumber.
- `memory/ui-references.md` — Anthropic Console entry removed; "Considered but not seeded" section added with deferral rationale; top-of-file revision note updated.
- `protocols/changelog-protocol.md` — **NEW.** Scope split codified, atomic-cadence rule operationalized.
- `memory/agent-changelog.md` (this directory) — pointer added to changelog-protocol.md; narrative entry above v0.4.7.
- `agent-dashboard/.claude/memory/agent-changelog.md` — pointer added to changelog-protocol.md.

### Cross-references

- User memory note: `~/.claude/projects/-Users-tapandesai-Desktop-tapintomymind-App-Development/memory/project_team_industry_portability.md`
- Atomic-cadence rule: `~/.claude/projects/-Users-tapandesai-Desktop-tapintomymind-App-Development/memory/feedback_changelog_proactive.md`
- Prior activation: this CHANGELOG v0.4.7; `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer activated.
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer refinements.

## [0.5.0] — 2026-05-06

### Added — QE prompt merge: planned-stub institutional memory absorbed into active (framework-scoped Phase 0.1)

**0.1 — QE prompt merge** (`agents/quality-engineer.md`). Per org-designer proposal at `agents/_planned/_proposals/qe-promotion-2026-05-06.md`: a **merge, not a wholesale overwrite**. The active 12K file was ahead on the test-bypass auth pattern, refined `trigger_conditions` frontmatter (`fires_when` / `does_not_fire_when` / `parallel_with`), and the full "Read on Every Invocation" list — overwriting would have lost these production gains. The 17K planned stub contributed additive institutional-memory sections only. Merge adds four sections to active: `## Tier Clarification` (HQ vs Tier 2 QE coexistence), `## Future-Growth Lens` (fragmentation triggers + sub-role spawn thresholds + Critic-merge assessment), `## Cross-References` (links to source proposal, seed incident, counterpart roles), and a 2-sentence state-machine 2-step gate narrative in `## Algorithm` intro. Superseded stub renamed `_planned/quality-engineer-superseded-2026-05-06.md` (retained indefinitely as user-confirmed historical reference). **Lesson worth keeping (framework-portable):** promotions of `_planned` agents to active are merges by default, not overwrites. When `_planned` was authored before activation, the live version may have evolved past it; assume neither file is a superset until you've diffed them.

**Phase 0 prerequisite trigger:** managed-surface auto-push positioning under TapAgents v1.5 requires vendor-owned regression discipline at every release gate. Phase 0.2 (dashboard-side agent-changelog initialization) and Phase 0.3 (GitHub App webhook configuration docs) are project-scoped artifacts; their narrative was migrated per leakage audit.

> Phase 0.2 + 0.3 (project-scoped artifacts) full narrative: see `agent-dashboard/.claude/CHANGELOG.md` — 2026-05-06 entry on TapAgents v1.5 Phase 0 dashboard-side artifacts. Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F3).

### Cross-references
- Promotion proposal: `agents/_planned/_proposals/qe-promotion-2026-05-06.md`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — QE prompt merge

## [0.4.7] — 2026-05-06

### Added — UI/UX Reviewer agent activated (live, fourth review-tier axis)

Live activation of UI/UX Reviewer per Org Designer proposal `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`. User-approved with verbatim text *"Yes. I approve this. The additional agent will really help in overall app development processes and especially user functionality."* This is a **new role**, not a stub promotion — the team had no `_planned/ui-ux-reviewer.md` stub. Trigger: user `/grow-team` invocation surfaced the structural gap (no agent owned the runtime visual / IA / interaction-pattern axis); single-project evidence (agent-dashboard) was sufficient because the gap is a mandate gap, not a frequency gap, mirroring the QE (2026-05-05) and Ops/Security (2026-05-06) activation precedents.

**Pattern this completes:** Four-axis review tier. Critic reviews **plan** (artifacts on disk). QE reviews **runtime functional** (does the deployed system do what was specified?). Ops/Security reviews **runtime adversarial** (can an attacker break it?). UI/UX Reviewer reviews **runtime visual / IA / interaction** (does the deployed UI feel logical, modern, and faithful to spec?). Together: plan / functional / adversarial / experiential — orthogonal coverage, parallel firing at `handed-off → shipped`, four independent blocking authorities.

### Added (live agent activation — 6 net-new files)

- `agents/ui-ux-reviewer.md` — full agent contract (160 lines, well under the 300-line ceiling and slightly under the 180-250 target). Sections: frontmatter, role intro, Job in One Sentence, Operating Principles (incl. anti-sycophancy clause + Designer-seam-protection clause), Read on Every Invocation, Algorithm (3 invocation types: Designer-spec finalize market-calibration, pre-ship default-coverage screenshot pass parallel with QE, on-demand `/design-review`), Output Structure, Authority (Can/Cannot table — explicitly forbids editing `design-spec.md` and Tier 2 code), Failure Modes, Trigger Thresholds, Wrong-Agent Returns, Format.
- `templates/design-review.md` — output template. Sections: Project context, Pages reviewed (enumerated with screenshot path per page), Blocking findings (P0), Notable findings (P1), Polish backlog (P2), References cited, What couldn't be reviewed, Anti-sycophancy log, Sign-off.
- `commands/design-review.md` — slash command. Two modes: `/design-review <slug>` for full default-coverage pass; `/design-review <slug> <page>` for focused review.
- `memory/ui-references.md` — append-only canon of reference dashboards seeded with 7 entries (Tier-A: Vercel, Linear, Stripe Dashboard, Railway; Tier-B: GitHub Projects, Notion, Anthropic Console). Append-only protocol documented at top.
- `memory/ui-patterns.md` — empty file with append-only protocol header. Fills as projects ship.
- `memory/ui-anti-patterns.md` — empty file with header + protocol + ONE seed entry: "Mixed-mental-model button row" (provenance: agent-dashboard 2026-05-06; cited surface: `src/app/dashboard/page.tsx L135-157`).

### Changed (one-line / few-line additions to existing contracts)

- `agents/designer.md` — Wrong-Agent Returns table gains row `Critique of running UI / drift from spec → UI/UX Reviewer`.
- `agents/critic.md` — Wrong-Agent Returns table gains row `Critique of running UI / visual / IA → UI/UX Reviewer`.
- `agents/conductor.md` — new "Review-tier fan-out at `handed-off → shipped`" subsection under Hard Checkpoints (~10 lines): documents that QE, Ops/Security, and UI/UX Reviewer all fire in parallel at the gate, each on its own axis, and the Decision Packet consolidates findings only after all reviews report.
- `agents/executive-assistant.md` — Read-on-Every-Invocation list gains three artifact paths: `workspace/*/smoke-report.md`, `workspace/*/security-audit.md`, `workspace/*/design-review.md` — so EA surfaces all three review-tier artifacts in handed-off Decision Packets.

### Backlog filed (atomic with activation)

- **BL-015** Tech-Debt — ProjectCard z-index/overlap with PhasePill (P1, agent-dashboard). Cited surface: `src/components/ui/project-card.tsx L244-260`.
- **BL-016** Feature — Dashboard header IA: split admin-nav from primary-action and ambient-action (P1, agent-dashboard). Cited surface: `src/app/dashboard/page.tsx L135-157`. References the codified anti-pattern in `memory/ui-anti-patterns.md #1`.
- `workspace/_global/backlog.json` updated: total 14 → 16, P1 4 → 6, open 11 → 13, tier2 9 → 11.

### Tooling integration

No new dependencies. Playwright is already installed as part of QE infrastructure; Opus 4.7 is multimodal (reads screenshots directly). UI/UX Reviewer's tests live in `tests/visual/` (architecturally separate from QE's `tests/e2e/`); QE retains sole ownership of `playwright.config.ts`.

### Hard constraints honored at activation

- `agents/_planned/README.md` not edited (this role was never stubbed; activation is fresh, not promotion).
- No `state.json` files modified (Conductor's territory).
- No first-pass `design-review.md` seeded for agent-dashboard (dev server status not confirmed; first real review fires on next `handed-off` checkpoint or user `/design-review` invocation).
- No new dependencies in any `package.json`.
- Agent contract line count: 160 (under 300 ceiling).

### Provenance

User `/grow-team` invocation 2026-05-06 surfaced the gap with both diagnostic specificity (a single screenshot named two concrete failures: ProjectCard overlap + dashboard header IA mismatch) and forward-looking framing (*"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create ... seeing layout and changes that are logical without needing user screenshots or inputs"*). Org Designer drafted full proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`; user approved verbatim. Activation pass executed atomically per "Changelog updates are proactive" memory rule — agent files + memory seeds + backlog filing + changelog entry shipped in one commit-equivalent unit.

### Founding team count

10 active + 11 planned → **11 active** + 11 planned. The 11 active: Intake, Executive Assistant, Conductor, Strategist, Architect, Designer, Critic, Quality Engineer, Ops/Security, Org Designer, and now UI/UX Reviewer.

---

## [0.4.6] — 2026-05-06

### Changed — Tier B promotion of M-milestone scale demonstrated; two protocol-level heuristics codified

A Tier 2 project executed a multi-commit `dev → main` promotion to align production with main-branch development. The mechanical action (push to main) is technically Tier B (autonomous-with-audit), but the scope (cross-milestone code drift, schema additions, multiple feature flags) crossed the threshold where Tier B in-spirit-is-Tier-C. The team surfaced for explicit user approval anyway. Pattern is now empirically validated for future cross-milestone promotions regardless of project type.

**Two protocol-level lessons (framework-portable; remain in this changelog as the protocol-level residue):**

1. **Dev-vs-main drift is silent under current protocols.** A Tier 2 project ran multiple commits ahead of its prod branch with no protocol-level surfacing of the growing gap. Belongs as a check in `protocols/local-first-dev.md` (BL-001) — Conductor cron, EA briefing line, or pre-Tier-C audit step that surfaces "dev is N commits ahead of main" when N exceeds a threshold (proposed: N > 5) or when milestone-shaped work has been merged to dev but not promoted.

2. **Tier B becomes Tier C in spirit when scope crosses M-milestone boundaries.** Heuristic to add to `protocols/autonomous-ops-permissions.md`: a Tier B push warrants explicit user gate when (a) M-milestone scope, (b) DB schema additions, (c) new agent activations, or (d) cross-cutting feature flags. One of these → decision packet, even if the mechanical action is autonomous-with-audit.

> Full project narrative: see `agent-dashboard/.claude/CHANGELOG.md` — 2026-05-06 entry on `dev → main` promotion (Tier B with explicit user approval). Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F2).

---

## [0.4.5] — 2026-05-06

### Changed — First end-to-end Tier C decision-packet flow exercised; two operational lessons codified

A Tier 2 project executed its first custom-domain cutover end-to-end via the formal Tier C decision-packet flow (Architect packet → user approval → execution → user smoke test → audit). Pattern is now empirically validated for future Tier C operations regardless of project type.

**Two operational lessons (framework-portable; remain in this changelog as the protocol-level residue):**

1. **Force-issue TLS when nameservers stay third-party.** Hosting platforms typically auto-issue ACME/Let's Encrypt certs only when their DNS controls the apex. When the project keeps DNS at a third-party registrar (A-record approach), the platform does not auto-issue. Manual `<platform> certs issue <domain>` after DNS resolves provisions the cert. Future custom-domain Tier C packets should include a force-issue step as standard, not as a fallback. Belongs in `protocols/autonomous-ops-permissions.md §3.1` as a custom-domain-cutover sub-step.

2. **Platform env-var removal can affect more scopes than the command names.** When a `<platform> env rm <name> <scope>` operation is run against an entry whose underlying record covers multiple scopes (e.g., Production + Preview as a single entry), the rm operation wipes both — not just the named scope. Pre-check the entry's `target` field. Re-add explicitly for any collateral-damaged scopes. Future Tier C packets touching env vars include this pre-check.

> Full project narrative: see `agent-dashboard/.claude/CHANGELOG.md` — 2026-05-06 entry on first custom-domain cutover (Tier C). Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F1).

---

## [0.4.4] — 2026-05-06

### Fixed — auth-bypass.spec.ts strict-mode selector violation (cross-tier)

Latent bug exposed by BL-011's workflow restructure. `page.locator("nav, header")` on `/dashboard` matches 2 elements (the sticky TopNav `<header>` AND a page-heading `<header>` from `src/app/dashboard/page.tsx`); Playwright strict mode rejects. Pre-BL-011 the bug was hidden because pass-1 (unauth specs) failed first under the workflow's job-level `TEST_AUTH_BYPASS=1`, so pass-2 (this spec) never ran.

### Cross-tier shipped (agent-dashboard repo on `dev` branch — committed 2026-05-06)

  - **`tests/e2e/auth-bypass.spec.ts:66`** (commit 66a3879) — replaced ambiguous `page.locator("nav, header")` with `page.getByRole("banner").first()`. Targets TopNav unambiguously; the other `<header>` on `/dashboard` is not a `role="banner"` so the role-based selector resolves to exactly one element. `npm run build` PASSED. Runtime verification deferred — there's an unrelated 500-on-/dashboard state on the user's existing dev server (separate issue, surfaced for awareness).

### Process — first per-task lightweight authorization observed

User's bug report message included file:line + symptom + fix recipe + verification approach + explicit out-of-scope boundaries. Interpreted as per-task lightweight authorization (the user did the diagnostic team-flow work themselves in the message). Confirmed direction with the user inline rather than dispatching QE+Critic for a one-line selector fix. This is the documented pattern for the lightweight escape hatch from the 2026-05-06 "always operate as the team" directive: explicit, per-task, with the user's diagnostic work standing in for the team-flow steps that would otherwise produce it.

### Provenance

Triggered by user observation 2026-05-06 (verified strict-mode violation against `TEST_AUTH_BYPASS=1` dev server). Fix lands as a follow-on to BL-011's workflow restructure rather than reopening BL-011, since the bug pre-existed BL-011 — BL-011 just made it visible.

---

## [0.4.3] — 2026-05-06

### Added — BL-011 90s ceiling regression test (P1, in-progress) + BL-014 Org Designer ratification (P2, open)

QE's first design-axis deliverable beyond infrastructure. The route `POST /api/projects/create` has `maxDuration = 120` on Vercel Pro; we want a regression alarm at 90s for a 30s buffer. QE picked **(D) Hybrid** design after a 4-option analysis (CI-on-every-PR with real creds vs. local pre-deploy gate vs. scheduled canary vs. hybrid):

  - **Structural half** runs in CI on every push to `dev`/`main` and on every PR to `main`. Asserts the auth gate fires correctly with the right response shape (401 not_authenticated for cookieless requests, regardless of body validity). No credentials, no real GitHub work, no DB rows, no cleanup. Catches handler-import crashes, gate-ordering regressions, response-shape regressions, withErrorCapture wrapper regressions.
  - **Timing half** is gated behind `TAPHQ_RUN_TIMING_TEST=1` and runs locally against deployed prod with the user's own `taphq_session` cookie. Asserts `commit_path === "tree-api"` and total wall ≤ 90s. Skipped by default — never fires in CI. Multi-account-friendly (cookie source is whichever account the user is logged in as).

**Why split:** the dev GitHub App is configured "Only on this account" per `agent-dashboard/.claude/docs/github-app-setup.md §3.8`. CI runners cannot install the App, so a CI-stored UAT would not exercise the IAT-first production code path inside `commitScaffold`. The structural-vs-timing seam respects that constraint.

**Acceptance amendment** to BL-011: original "runs in CI on every PR to main" was scope-eroded by the design constraints. Amended to: structural half on every PR + timing half at dev → main promotion (manual, gated). Forcing function added: a `pre-promotion-checklist.md` artifact in `workspace/agent-dashboard/` with date-stamped sign-off.

### Cross-tier shipped (agent-dashboard repo on `dev` branch — committed 2026-05-06)

  - **`tests/e2e/create-project-ceiling.spec.ts`** — 5 specs total. 4 structural (CI-eligible) + 1 timing (manual, gated). Defensive `beforeAll` probe self-skips with a clear reason if the dev server has `TEST_AUTH_BYPASS=1` active (catches accidental local runs against the wrong env). Failure messages include 5-step investigation order; created-repo URL is logged BEFORE the timing assertion so the user can clean up even on failure.
  - **`.github/workflows/playwright.yml`** — restructured into 2 passes. Pass 1 starts the dev server with `TEST_AUTH_BYPASS=0` and runs unauth specs (including the structural half of the ceiling test). Pass 2 restarts with bypass=1 and runs `auth-bypass.spec.ts`. Job-level `TEST_AUTH_BYPASS` removed; per-step scoping prevents the bypass from accidentally activating during unauth runs (this was Critic finding #1, blocking — fixed).
  - **`package.json`** — added `test:e2e:ceiling` (structural only) and `test:e2e:ceiling:real` (timing, requires env vars) scripts.
  - **`.claude/docs/quality-testing.md`** — added §"Create-Project 90s Ceiling Test" with cookie-extraction procedure, pre-promotion checklist reference, jitter-rerun guidance, and the manual cleanup story.

### QE memory file convention (open question — BL-014 P2)

QE created `memory/runtime-gotchas.md` and `memory/test-patterns.md` as new top-level memory files during BL-011. The QE role spec at `agents/quality-engineer.md` instructs append-to these files and the activation plan at `agents/_planned/quality-engineer.md:165` says "initialize" them, but Critic flagged that "append" is not "create" without Org Designer ratification. BL-014 captures this for Org Designer review. Until ratified: files exist with QE's seed entries; QE continues to use them per the role spec but does not extend their format/scope.

### Process — formal flow exercised

This was the first deliverable run end-to-end through the formal team flow per the user's 2026-05-06 directive ("I almost always want us functioning as our team, even if we determine only one agent/employee is involved"):
  1. Conductor orientation read (Playwright infra + CI workflow + route + auth bypass).
  2. QE produced test-plan + spec + workflow + docs.
  3. Critic reviewed adversarially: 2 BLOCKING + 8 WARNING + 1 FYI(positive).
  4. QE addressed: 2 BLOCKING fixed, 6 WARNINGS mix-fixed-acknowledged, 1 WARNING surfaced as BL-014 for Org Designer.
  5. Build re-verified clean (18/18 routes, 0 TS errors, 2 pre-existing lint warnings unchanged).
  6. Conductor consistency check.
  7. Commit.

The flow caught a BLOCKING bug (workflow-level `TEST_AUTH_BYPASS=1` would have made the structural test fail at first CI run) that QE's local verification missed because the local env didn't match CI. This is exactly the value the formal flow exists to deliver — adversarial review catches what self-review misses.

### Provenance

BL-011 was a P1 audit-gap from the M1 dispatch (2026-05-05). BL-014 is a derivative process question raised during the BL-011 critic round. Total backlog now 14 items / 4 P1 / 7 P2 / 3 P3. Open: 12. In-progress: 2 (BL-004 M2 dashboard, BL-011 ceiling test).

---

## [0.4.2] — 2026-05-06

### Added — Backlog item BL-013: Multi-user prod OAuth path (P1)

Surfaces the structural work needed to take any GitHub-App-based Tier 2 project from "owner-only beta" to "anyone with a GitHub account can use this." The 6-step ordered plan (separate prod App registration → Any-account visibility → custom-domain callback → Vercel env-var isolation → install-uninstall webhook → user-facing error UX) is captured in `workspace/agent-dashboard/backlog.md` with explicit acceptance criteria + 3-phase sequencing (Phase 1 = trusted-tester, Phase 2 = open beta, Phase 3 = post-launch). Counts mirrored in `workspace/_global/backlog.json` (BL-013, P1, L). Total backlog now 13 items / 4 P1.

### Cross-tier shipped (agent-dashboard repo on `dev` branch — committed 2026-05-06)

Two small UI patches to make the GitHub-App-account-mismatch failure mode self-explanatory before users can be hurt by it. Triggered by user incident: same dashboard works on Mac (signed into `tapintomymind`) but returned a 404 on Windows (signed into a different GitHub account). Root cause documented in `agent-dashboard/.claude/docs/github-app-setup.md §3.8` ("Only on this account"); the fix is a UX guardrail until the prod App ships.

- **`src/app/page.tsx`** — added a help-text block under the "Connect GitHub" button telling the user to sign into the right account at `github.com` first, with explicit copy that names the 404-on-consent-screen failure mode.
- **`src/app/auth/error/page.tsx`** — added `REASON_MESSAGES` map translating raw reason codes (`missing_code`, `state_mismatch`, `access_denied`, `exchange_failed:*`, `user_lookup_failed:*`, `unknown`) to user-actionable sentences. Raw reason now lives under a `<details>` "Technical details" disclosure (preserved for support/debugging without burdening end users). Added a fixed "Common cause: wrong GitHub account" hint block that catches the post-GitHub-redirect-back case where the 404 came from `github.com` itself.

`npm run build` — PASSED (18/18 static pages, no type/lint errors, no bundle-size regressions).

### Process — Decision packet vs lightweight flow distinction codified inline

User explicitly asked whether this work was operating "in the flow specified" (i.e., dispatched-through-Tier-2-conductor with `react-component-agent` doing the edits + `tier2-critic` review pre-commit). Decision: stayed in lightweight mode (direct edits + inline backlog/changelog updates) for tiny UI-copy + a backlog entry. The trade-off is now explicit: lightweight is appropriate for ≤2-file UI copy + docs work; formal flow kicks in the moment we touch the actual prod-App registration in BL-013. No protocol change; just clarification of when each mode applies.

### Provenance

Triggered by 2026-05-06 multi-account incident on production prod-alias `agents-dashboard-olive.vercel.app`. The fix doesn't unblock multi-user end-to-end (that requires BL-013) — it just makes the existing single-user failure mode self-explanatory so future testers don't get stuck without a breadcrumb. The full structural fix (BL-013) is queued P1.

---

## [0.4.1] — 2026-05-06

### Changed — autonomous-ops protocol §3.1: refined NEON_BRANCH classifier + Vercel CLI caveat

**`protocols/autonomous-ops-permissions.md` §3.1 — `NEON_BRANCH` classifier:**
- Updated branch-name match list to reflect real Neon branch names (`production`, `prod`, `live` → Tier C; `dev`, `test`, `preview`, `local` → Tier B). Previous version listed only `prod` for Tier C.
- Added note that Neon allows arbitrary branch names; classifier checks the *role* not literal match.
- Added canonical migration-application order: local first, dev second, production last.
- **New caveat (load-bearing):** `vercel env run -e <env>` and `vercel env pull` both layer `.env.local` on top of Vercel-API env. Sensitive Production/Preview values come back encrypted/empty, and `.env.local` fills them in. Local CLI cannot reliably verify Vercel-side sensitive values; use deployment-observation flow instead.
- Documented the `DATABASE_URL="$(npx neonctl connection-string <branch> --pooled)" npx drizzle-kit push` pattern for explicit-branch CLI work.

### Cross-tier shipped (agent-dashboard, no code changes — Vercel env + redeploy)

These are operational changes recorded here for audit traceability; no code commits in agent-dashboard repo.

- **Vercel Production scope `DATABASE_URL`** rotated → `production` Neon branch (`ep-aged-brook-apg2g57j-pooler...`).
- **Vercel Preview scope `DATABASE_URL`** rotated → `dev` Neon branch (`ep-broad-moon-apiaksv1-pooler...`). Required empty-string git-branch arg (`vercel env add DATABASE_URL preview ""`) to bind "all preview branches."
- **`.env.local`** updated → `local` Neon branch (`ep-aged-wildflower-aprg1xfd-pooler...`); `NEON_BRANCH` annotation flipped from `dev` → `local`. Backup saved at `.env.local.bak.1778042003`.
- **Production redeploy** triggered via `vercel redeploy <latest-prod-deployment> --target=production`. Build completed in 47s; aliased to `agents-dashboard-olive.vercel.app`. New env vars live on deployed app.

### Verified — 3-branch isolation confirmed

Direct queries via `neonctl connection-string <branch> --pooled` against each branch returned distinct hosts and distinct row counts (production: 1 bug_report; dev: 2 bug_reports; local: 1 bug_report). The Tier B / Tier C split in §3.1 is now operationally meaningful — three real branches, three real environments, one-to-one mapping.

### Provenance

First end-to-end exercise of the autonomous-ops Tier C path with full Vercel-CLI mediation. Decision Packet flow: user posed the topology question → I drafted plan with rollback + verification → user approved with "Go" → execute → audit entry. This pattern is now the canonical Tier C flow for env var changes and prod schema operations.

---

## [0.4.0] — 2026-05-06

### Changed — Incident protocol enhanced for security + Conductor parity + QE forward-reference

**`protocols/incident-protocol.md` enhancements (additive, no rewrites of prior content):**

- **§1.1 Sanitization Contract** — new section codifying the security boundary as a table (headers stripped, body keys redacted via regex, query params dropped, sanitization-failure fallback to null). References `agent-dashboard/src/lib/error-capture.ts` directly so the protocol cannot drift from the implementation. Calls out that capture-then-patch leaks; patch-then-capture is correct.
- **§4.5 Conductor Auto-Triggers (parallel path)** — new section listing the 6 Conductor auto-trigger events from `conductor.md:178+` (`consistency_check_failed_blocking`, `wrong_agent_return`, `hard_checkpoint_blocked_unexpected`, `tier2_reportback_blocked_24h_or_more`, `user_dissent_fired`, `audit_gap_caught_later`). Documents that `incidents.md` interleaves user-pasted entries and Conductor-appended entries, both following the same shape so Org Designer mines uniformly.
- **§5 Pattern Detection — refined threshold rules** — keeps the N=3 pattern proposal threshold but adds an explicit one-shot lesson allowance: Org Designer may propose individual contract patches without waiting for N=3 when the diagnosis is structurally complete from a single high-signal incident. Locks in the precedent set by the 2026-05-05 scaffold path → Architect runtime-deps audit-checklist patch (a successful one-shot lesson).
- **§5.1 Quality Engineer reference** — first formal mention of the QE stub in the protocol, naming QE as the future owner of bug-reproduction + smoke-test pattern accumulation + pre-ship gating. Notes that the protocol works without QE; QE just makes verification formal and consistent.
- **Anti-Patterns section (7 items)** — auto-write from Tier 2 to Tier 1 forbidden, promotion discipline, mandatory `[fill in]` slots, append-only enforcement, status+promotion travel together, `wontfix` is triage not judgment, every new route must wrap with `withErrorCapture` in the same commit. Each anti-pattern includes the failure mode it prevents.
- **References expanded** — added pointers to `_planned/quality-engineer.md`, `api/admin/test-error/route.ts` (synthetic capture ping), `drizzle/0002_mixed_red_hulk.sql`, and the seed incident.

### Cross-tier shipped (agent-dashboard repo on `dev` branch — committed 2026-05-06)

These commits live in the dashboard repo but are cross-referenced here because they are load-bearing for the framework's incident-learning loop. Without them, the protocol can't actually fire.

- **`5f31757` — `feat(db): add 0002 migration for bug_reports table`.** Drizzle migration `drizzle/0002_mixed_red_hulk.sql` generated via `npm run db:generate`. Closes the gap between schema definition (committed in `2c25d85` on 2026-05-05) and applicable SQL — production writes were failing with `relation does not exist` until this. FK to `users.id ON DELETE set null` preserves bug history when a user is deleted. 3 indexes for `/admin/bugs` query patterns.
- **`fdc3b3f` — `feat(observability): sweep withErrorCapture onto 6 unwrapped API routes`.** Wraps `auth/github/callback`, `auth/github/init`, `bugs/[id]/promote`, `bugs/[id]/status`, `repos/create-test`, `repos/delete-test`. Together with the 3 already-wrapped routes (`api/projects/create`, `api/admin/test-error`, `api/bugs/report`), every API route in the dashboard now writes runtime failures to `bug_reports`. Anti-pattern A7 in the incident protocol now has teeth: the assertion "every API route should be wrapped" is enforced, not aspirational.

### Process — Proactive changelog discipline codified

Per user directive 2026-05-06 ("I want to be proactive with changelog reporting"), changelog updates now travel in the same atomic unit as the change itself — not as a follow-up step. CHANGELOG.md (technical, this file) + `memory/agent-changelog.md` (narrative) update together with the work that necessitated them. Recorded as feedback memory; applies to all future structural changes.

### Provenance

All four enhancements (incident protocol, migration, route sweep, changelog discipline) trace to the bug-learning loop's first end-to-end exercise: production smoke-test fail (2026-05-05) → bug_reports + admin/bugs UI → first incident entry → first formal hiring proposal (QE stub) → audit-checklist patches → protocol formalization. The loop now has a complete first revolution: capture → triage → promote → learn → patch contracts and team shape. v0.4.0 closes that revolution.

---

## [0.3.0] — 2026-05-05

### Added — Quality Engineer stub (10th planned role) + first formal hiring proposal artifact

**New planned agent (`agents/_planned/quality-engineer.md`):**
- Counterpart to Critic on the runtime axis. Critic = plan axis (artifacts on disk); QE = runtime axis (deployed system behavior).
- Provisional mandate: test strategy per feature, smoke-test execution against deployed artifact, bug reproduction + fix verification, environment-dependency audits, exploratory testing of running code.
- Provisional non-mandate: unit-test authoring (Tier 2 implementer), security audits (Ops/Security stub), artifact code review (Critic), production monitoring (out-of-scope), CI/CD architecture (Architect/Tier 2).
- Activation trigger: first of — (a) next post-deploy incident with runtime/deploy/env root cause, (b) project handling paid users / payments / user-data writes, (c) project where Architect's tech-strategy cites runtime risk as one of 3 named risks.
- Workflow placement at activation: parallel with Architect at `scoping → planned` (produces `test-plan.md`); solo at `handed-off → shipped` (produces `smoke-report.md`, gates the existing hard checkpoint).
- Future-growth path documented inline: at 5x scale, fragments into Test Strategist + Verification Engineer; spawns Performance Engineer / Accessibility Tester / Compatibility Tester sub-roles; per-project Tier 2 mirrors mirror the deployment-agent pattern.

**First formal hiring proposal artifact:**
- `workspace/_global/org-designer-proposals/20260505-2330-quality-engineer.md` — full proposal in Org Designer's standard format (Observation / Cited incidents / Pattern / Proposal / Cost-risk / Alternatives considered / Future-growth lens / Implementation sketch / Recommendation).
- Sets the precedent: hiring decisions get a formal proposal artifact, not an inline edit. Treats the team-shape decision with the seriousness an exec-staff hiring discussion warrants.

### Changed — Architect contract: runtime-environment dependency review

- `agents/architect.md` scaffold-phase mechanical verification checklist (L96+) gains a **Runtime-environment dependency review** item with explicit sub-checks across five dimensions: filesystem, network egress, env vars / secrets, region / latency, concurrency / persistence.
- Treats absence of `tech-strategy.md §"Runtime Assumptions"` section as a blocking gap (not `fyi`).
- Provenance cited inline: 2026-05-05 scaffold-path bug (`memory/incidents.md`).

### Changed — Critic contract: two new tech-strategy pattern flags

- `agents/critic.md` Pattern Library Tech-strategy-specific section gains:
  - Missing or incomplete `§"Runtime Assumptions"` section → `blocking` (mirrors Architect's new requirement; ensures Critic catches the gap at review time before handoff).
  - No deployed-system test plan referenced → `warning` (placeholder until Quality Engineer activates and produces `workspace/<slug>/test-plan.md`).

### Changed — `_planned/README.md`

- Stub count 9 → 10.
- New "Review tier (HQ)" subsection added to the stub table for Quality Engineer.
- "Why These 9 Specifically" → "Why These 10 Specifically" with QE rationale appended.
- "Not in stubs (intentionally)" note refined to clarify the QA / quality boundary: implementation QA inside one codebase belongs to Tier 2; cross-project quality strategy + smoke-test execution + runtime-pattern memory belongs to HQ via QE.

### Layered defense rationale

The two contract patches (Architect runtime-deps review + Critic blocking-on-missing-section) provide defense-in-depth even before QE activates. The progression at scaffold time becomes: Architect generates and audits → Critic reviews and flags missing Runtime Assumptions → User signs off knowing the runtime axis was checked at the artifact level. When QE activates, it adds a fourth layer: actually exercising the deployed system. Each layer catches a different failure mode.

### Provenance

All four changes trace to `memory/incidents.md` 2026-05-05 — Scaffold path fails on Vercel serverless, the team's first post-deploy production incident. Closing the loop systemically (one incident → one stub + two contract patches + one proposal artifact + this changelog entry) sets the operating cadence for incidents going forward: every production incident produces structural learning, not just a fix.

---

## [0.2.0] — 2026-05-04

### Added — Hooks + Portfolio Registry + Verification Protocol (post-landscape-benchmark absorptions)

**Stop-hook auto-Critic:**
- `hooks/stop-critic-check.py` — blocks session end when projects have unresolved blockers, contested artifacts, or BLOCKING Critic concerns
- `stop_hook_active` guard prevents infinite continuation loops
- Fail-open on parse errors (don't break Claude Code with flaky hooks)

**PreToolUse deterministic gates:**
- `hooks/pre-tool-gate.py` — pattern-blocks `rm -rf /`, `sudo rm`, `chmod 777`, `.env` access, `git push --force`
- Blocks edits to immutable `seed.md`
- Blocks edits to artifacts marked `[CONTESTED]` in state.json
- Pattern-based gates run faster + more reliably than agent-judgment gates

**Hook wiring:**
- `.claude/settings.json` configures Stop and PreToolUse hooks
- `hooks/README.md` documents pattern + tuning approach

**Master portfolio registry:**
- `workspace/_global/portfolio.json` — machine-readable cross-project state aggregate
- `workspace/_registry.md` — human-readable scannable view
- Conductor MUST update both on every state transition (added to state-machine protocol + Conductor agent)
- EA + Org Designer use these for cross-project briefings + portfolio-level patterns

**Resumable bootstrap state:**
- `workspace/_global/setup_state.json` — Org Designer's interruptible wizard state
- Setup flows can pause mid-step (waiting on user) and resume on next invocation without restart

**Verification-before-completion:**
- `protocols/verification-before-completion.md` — paste-able evidence required for any "complete/done/shipped/passing" claim
- Per-claim verification commands enumerated
- Critic + Tier 2 agents must reference specific output, not paraphrase
- Stop-hook enforces at session boundaries

**Agent updates:**
- Conductor adds portfolio-registry update step on every transition
- Critic reads verification-before-completion protocol; sign-offs must reference specific lines/sections
- Org Designer reads setup_state.json + portfolio.json + _registry.md

**.gitignore updates:**
- portfolio.json + setup_state.json + _registry.md now ship publicly (with empty-state defaults)
- Real workspace project state still gitignored

### Sources for these absorptions
- Stop / PreToolUse hooks pattern: [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- Master registry pattern: [wshobson/agents Conductor](https://github.com/wshobson/agents/tree/main/plugins/conductor)
- Resumable wizard state: [wshobson/agents Conductor](https://github.com/wshobson/agents/tree/main/plugins/conductor)
- Verification-before-completion pattern: [obra/superpowers](https://github.com/obra/superpowers)

---

## [0.1.0] — 2026-05-04

### Added
- Initial team scaffold: 7 founding agents (Intake, Executive Assistant, Conductor, Strategist, Architect, Critic, Org Designer)
- Model assignments per agent (Opus for reasoning roles, Sonnet for routing/summarization)
- `AGENTS.md` canonical roster + onboarding doc
- 9 protocol documents covering state machine, handoffs, conflict resolution, consistency checks, citations, checkpoints, intake, EA, reportback
- Template library: PRD, scope, tech-strategy, intake-brief, decision-packet, executive-briefing, dissent-entry, handoff-package, reportback, session-close, critic-review, research-brief
- Question bank with 8 dimensions for Intake's interview framework (+ reserved 9th for compliance)
- 9 planned-but-not-built agent stubs in `agents/_planned/`:
  - Post-shipping: GTM Strategist, Growth Analyst, Feedback Synthesizer
  - Depth specialists: Customer Researcher, Industry Researcher, Designer, Ops/Security, Biz/Finance, Biz/Legal
- 11 slash commands for direct invocation (with spec-file mode in `/team`)
- Memory seed files (private) + 5 example files (public)
- `seed-to-mvp.md` flagship playbook + `portfolio-review.md`
- 4 planned-playbook stubs: validate-feature-idea, post-launch-retro, pivot-from-feedback, legacy-rebuild
- Public/private repo split via `.gitignore`
- Complete example project (`example-tools-cli`) in `workspace/_examples/` showing all artifact types end-to-end
- MIT license

### v1 absorptions (post-Loki Mode benchmark)
- Anti-sycophancy / Devil's Advocate rule added to Critic — forced adversarial second pass when reviews are too clean
- Spec-file mode for `/team` — Intake reads `.md`/`.json`/`.yaml`/`.txt`/`.openapi` files as seed
- Legacy-rebuild playbook stub for non-greenfield projects
- 4 additional planned-agent stubs (Designer, Ops/Security, Biz/Finance, Biz/Legal) — moved from "later" to visible-as-stubs

### Dynamic Tier 2 generation (made the existing flow actually robust)
- Baseline Tier 2 kit at `templates/stacks/_baseline/` — 4 agents (conductor, implementer, critic, deployment) that work for any stack when no specific template exists
- Tier 2 README template at `templates/tier2-readme.md` — generated for every Tier 2; orients the project team
- Critic reviews generated Tier 2 set before handoff completes — semantic check beyond mechanical verification
- Pre-handoff checklist expanded — at least conductor + implementer + critic + deployment must be present
- Tier 2 critic carries anti-sycophancy rule (inherited from Tier 1)
- Capability-request reportback type — Tier 2 can request new agents mid-build via Org Designer's normal proposal flow

### Design references
- `docs/specs/2026-05-04-claude-team-design.md` — founding design spec
