# Backlog

Cross-project forward-looking capture. Append-only by default; status field may be updated in-place. This is the institutional memory for what the team intends to build, fix, or decide — not what it has done (that's `agent-changelog.md`) and not what has broken (that's `incidents.md`).

## Purpose

The backlog system exists at two levels:

- **Tier 1 (this file):** Framework-wide ideas, protocol gaps, doc debt, and cross-project patterns that benefit every future project. Owned by Org Designer; groomed weekly.
- **Tier 2 (per-project):** Feature backlog, tech debt, mock-data swaps, and project-specific to-dos. Lives at `workspace/<slug>/backlog.md`. Seeded by the team during and after active work.

Machine-readable mirror: `workspace/_global/backlog.json` — used by EA/Conductor to surface item counts in briefings without parsing markdown.

## Lifecycle

```
open → in-progress → done
     ↘ wontfix (decided not to pursue, reason required)
```

Items enter from any agent or the user. Org Designer grooms weekly: re-prioritizes, archives stale Tier 1 P3 items older than 90 days (move to `##Archived` section below), proposes stub-activation when P0/P1 items keep getting pushed. Conductor pulls relevant items when starting a new agent transition and injects them into the agent brief.

## Entry Format

```
## CATEGORY — Title
**Source:** who/what surfaced this (e.g., "user request 2026-05-05", "incident #1 root cause", "Org Designer pattern mining")
**Tier:** Tier 1 framework | Tier 2 per-project (slug: <slug>)
**Priority:** P0 (blocking) | P1 (next sprint) | P2 (planned) | P3 (someday/wishlist)
**Status:** open | in-progress | done | wontfix
**Description:** 1-3 sentences.
**Acceptance:** What "done" looks like.
**Estimated effort:** S (<1 hr) | M (1-4 hr) | L (>4 hr)
```

Categories: `Feature`, `Tech-Debt`, `Doc`, `Process`, `Audit-Gap`, `Pattern-Candidate`, `Stub-Activation`

---

## Doc — Write `protocols/local-first-dev.md`

**Source:** agent-changelog 2026-05-05 (dev/main workflow entry)
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** open
**Description:** The dev/main/feature branch workflow was established operationally during the agent-dashboard session but never codified as a protocol. The changelog entry is the operational record; this protocol would be the formal, reusable doctrine for all future Tier 2 projects.
**Acceptance:** `protocols/local-first-dev.md` exists; covers branch naming, when to use dev vs main, local-test-before-merge expectation, Vercel preview vs prod distinction, and NEON_BRANCH env var per branch.
**Estimated effort:** S

---

## Tech-Debt — Add NEON_BRANCH to Architect stack-template env scaffolds

**Source:** agent-changelog 2026-05-05 (autonomous-ops-permissions decisions + dev/main workflow)
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** open
**Description:** The `NEON_BRANCH` env var was identified as the correct explicit mechanism for per-branch Neon DB targeting (explicit > hostname-parsing fallback). Architect's stack templates should bake this into the env scaffold by default so future Tier 2 projects don't repeat the implicit-to-explicit migration.
**Acceptance:** `templates/stacks/*/env.example` (or equivalent) includes `NEON_BRANCH=<branch-name>` with a comment explaining the dev/prod mapping.
**Estimated effort:** S

---

## Process — Evaluate stable preview-domain strategy for Tier 2 projects

**Source:** agent-changelog 2026-05-05 (GitHub App callback URL decisions)
**Tier:** Tier 1 framework
**Priority:** P3
**Status:** open
**Description:** Preview URLs on Vercel (`*-tapintomyminds-projects.vercel.app`) cannot be registered as wildcard GitHub App callback URLs without a workaround. Two options exist: (a) wildcard `*.vercel.app` registration; (b) Vercel "preview branch domain" for stable URL. Neither was chosen; preview is currently "did the build pass?" only. If the user hits sign-in failures on preview URLs more than twice, this moves to P1.
**Acceptance:** A decision is documented in `protocols/local-first-dev.md` or a new doc; either wildcard is registered or a stable preview domain is configured.
**Estimated effort:** M

---

## Process — Org Designer ratification of QE-created memory files

**Source:** BL-011 critic finding #4 (2026-05-06): "QE created `memory/runtime-gotchas.md` and `memory/test-patterns.md` without Org Designer ratification, exceeding the 'append' authority granted in the role spec."
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** done (2026-05-06T17:55)
**Description:** The QE role spec at `agents/quality-engineer.md` (L35, L45-47, L104-105, L114, L156) instructs QE to read and append to `memory/runtime-gotchas.md` and `memory/test-patterns.md`. The activation plan at `agents/_planned/quality-engineer.md` L165 explicitly says: "Initialize `memory/runtime-gotchas.md` and `memory/test-patterns.md` (empty files with format header)." QE created both files on 2026-05-06 during BL-011 implementation, populating with one entry each. The Critic (correctly) flagged that the QE role's contract was "append" not "create" — a process question.

**Closing decision (2026-05-06T17:55):** Current state ratified. The structural separation from `lessons-learned.md` / `patterns.md` is load-bearing — runtime gotchas are stack-shaped institutional knowledge that compound across runtime+deployment-target combinations differently than text-axis lessons; test-patterns are stack-shaped smoke-test recipe collections. The role spec's "initialize then append" instruction (per `_planned/quality-engineer.md:165`) covers the create operation under activation; QE acted within the contract. **Closing reference:** `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md §8 Round 2` (per Critic C9); ratified via the broader Activation Context discipline framing in `protocols/framework-contract-discipline.md §1`.

**Acceptance:** Met. Files ratified in current form. QE continues to use them per the role spec; format/scope extension still requires Org Designer proposal.

**Estimated effort:** S (closed)

---

## Process — Adopt rubric-style outcome grading in producer↔critic handoff (BL-025)

**Source:** Conversation 2026-05-06 — Anthropic Managed Agents announcement review (dreaming, outcomes, multiagent orchestration). Outcomes pattern (rubric + separate-context grader → result enum) maps onto existing critic / QE / UI-UX reviewer / ops-security loops. Anthropic reports +8.4–10.1pt task success on docx/pptx generation vs. unstructured prompting loops.
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** in-progress (Phase 1 LANDED 2026-05-07; Phase 2 dogfood gate pending)
**Description:** Producers ship artifacts with implicit acceptance criteria; critics return free-form prose findings. Lift Anthropic's outcomes pattern to: (1) reviewers extract criterion IDs from existing producer artifacts (PRD §Acceptance, scope milestone exit criteria, design-spec §7 default-coverage, threat-model.md mitigation map) — zero producer-side change per user fork 3; (2) reviewers return a structured envelope (`satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade`) with per-criterion findings; (3) Conductor enforces a bounded iteration loop with `max_revision_attempts = 2` (per user fork 1) before escalating to user via EA Decision Packet. Pure protocol/contract change — no Managed Agents API dependency.
**Acceptance:** (a) Rubric format codified in `protocols/outcome-grading.md`; (b) `critic.md`, `quality-engineer.md`, `ui-ux-reviewer.md`, `ops-security.md` return result-envelope output; (c) `conductor.md` enforces iteration loop + max_iterations escalation; (d) one project's producer→critic cycle dogfoods the pattern end-to-end before broader rollout.

**Phase 1 status (2026-05-07T00:35):** LANDED — `protocols/outcome-grading.md` (NEW; canonical) + `agents/critic.md` codify-only diff (Fork 2) + `agents/quality-engineer.md`, `agents/ui-ux-reviewer.md`, `agents/ops-security.md` envelope + iteration-loop sections + `agents/conductor.md` envelope-handling + state.json schema delta + marker-file mechanism documented + `templates/critic-review.md`, `templates/design-review.md` envelope at section-top + `templates/smoke-report.md`, `templates/security-audit.md` (NEW) + 10 scaffold-source mirrors verified `diff -q` empty. Architect adversarial review (recused-Critic) GREEN-LAND-WITH-MINOR-FOLLOWUPS, 0 BLOCKING / 0 WARNING / 4 FYI. Verbatim review at `workspace/_global/architect-review-bl025-phase1-impl.md`.

**Phase 2 status:** GATED on agent-dashboard's next `handed-off` cycle creating `workspace/<slug>/.outcome-grading-active` marker. MANUAL-ITERATE mode — Conductor surfaces `needs_revision` to user via EA Decision Packet; user manually dispatches Tier 2 with cross-reviewer brief. Per `protocols/outcome-grading.md §4.2`.

**Phase 3 status:** GATED on Phase 2 dogfood validation + `templates/stacks/_baseline/agents/tier2-conductor.md` updated with "Outcome-grading revision-brief acceptance" (separate OD proposal authors at Phase 3 entry).

**Estimated effort:** M (Phase 1 complete; Phase 2 dogfood + Phase 3 promotion remain)

---

## Doc — TapAgents ↔ Claude Managed Agents primitive map (BL-026)

**Source:** Conversation 2026-05-06 — comparative analysis post-Anthropic May 2026 Managed Agents announcement (dreaming, outcomes, multiagent orchestration, webhooks).
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** done (2026-05-06)
**Description:** Capture the architectural primitive map between TapAgents (local Conductor + roles + state machine + file-based session coordination) and Claude Managed Agents (hosted runtime). Pre-empts the recurring "should we use Managed Agents for X?" evaluation question by codifying: rubric ↔ outcomes (BL-025 lifts the pattern), Conductor ↔ multiagent coordinator (with caveats: 1-level depth, 20-agent roster, LLM-driven routing, no phase gating), `consolidate-memory` ↔ dreaming pipeline. Document the explicit boundaries where Managed Agents primitives can be lifted, where hybrid hosting could make sense, and where Managed Agents falls short of TapAgents replacement.
**Acceptance:** `.claude/docs/managed-agents-comparison.md` exists, covering: (i) primitive map table; (ii) where Managed Agents patterns could be lifted into TapAgents (rubric, dream-pass); (iii) where hybrid hosting could make sense (e.g., long-running QE smoke runs); (iv) what Managed Agents lacks for TapAgents replacement (phase gating, deterministic routing, file-based coordination); (v) cited primary sources from claude.com/docs.
**Closing reference (2026-05-06):** Doc landed at `.claude/docs/managed-agents-comparison.md` (215 lines after Critic-revision pass). All five acceptance criteria met (AC-1 primitive map §1; AC-2 lifts §2; AC-3 hybrid §3; AC-4 replacement gaps §4; AC-5 six primary-source URLs §7). Critic adversarial review verdict: **LAND-WITH-FOLLOWUPS** (0 P0 / 0 P1 / 1 P2 / 4 Notes; verbatim review at `workspace/_global/critic-review-bl026-managed-agents-comparison.md`). All actionable findings addressed inline before close (P2 citation-shallowness on +8.4-10.1pt delta → `[assumption: announcement-level summary]` qualifier added; Note 3.2 → activation-gate caveat added; Note 4.6 → terminology assumption flagged for OD verification; Note 6 → cadence-number softened to "monthly pattern-mining cadence" + Devil's Advocate framing surfaced for OD's continuous team-shape evaluation lane). Critic Devil's Advocate Note (doc implicitly frames adversarially against Managed Agents adoption) explicitly cross-referenced in §6 for OD's Cadence 4 attention.
**Estimated effort:** S (closed)

---

## Process — Codify "iterate on user's behalf" principle in EA + Conductor + Org Designer contracts (BL-029)

**Source:** BL-025 proposal §7 "Backlog impact" (`workspace/_global/org-designer-proposals/20260506T2146-bl-025-rubric-outcome-grading.md` §7) — user founding-principle directive 2026-05-06 chat (also captured at `memory/feedback_iterate_on_users_behalf.md`).
**Tier:** Tier 1 framework
**Priority:** P3
**Status:** open
**Description:** The principle "iterate on user's behalf most of the time" is broader than BL-025 (which is rubric-specific). It's a meta-principle for how Conductor + Org Designer + EA route work — already implicitly encoded in `protocols/checkpoint-protocol.md`'s 5-hard-checkpoint discipline + `protocols/autonomous-ops-permissions.md`'s Tier-A/B/C/D classification + EA's contract codifying the Decision Packet as the primary user-touch surface. Codifying it explicitly makes it forensically auditable when calibration drifts.
**Acceptance:** (a) New `protocols/iterate-on-users-behalf.md` (or amendment to `protocols/ea-protocol.md` if scope warrants inline) codifying: when to autonomously iterate vs. when to surface via Decision Packet; the producer-Critic internal-iteration rule; cross-reference to the 5-hard-checkpoint discipline + Tier-A/B/C/D classification + BL-025's bounded-iteration loop as concrete realizations of the meta-principle. (b) `agents/conductor.md`, `agents/executive-assistant.md`, `agents/org-designer.md` cite the protocol from their Read-list. (c) Org Designer monitors deviation patterns at quarterly cadence per `protocols/framework-contract-discipline.md §4`.
**Estimated effort:** S

---

## Process — Build dream-pass capability for TapAgents memory curation (BL-031)

**Source:** Conversation 2026-05-06 — Anthropic May 2026 Managed Agents announcement (Dreams pattern). Item #2 of 3-item shortlist alongside BL-025 + BL-026. OD proposal: `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md`.
**Tier:** Tier 1 framework
**Priority:** P2
**Status:** in-progress (Phase 1 LANDED 2026-05-07; Phase 2 dogfood gate pending)
**Description:** Lift Anthropic's Dreams pattern (immutable input → new output memory store; optional review-mode) into TapAgents memory curation. Three user-facing forks per OD proposal: (1) default cadence (weekly Sunday + relax-trigger), (2) default ingest tier (default-tier 350KB / stretch-tier with transcripts), (3) default mode for `/consolidate-memory` (legacy + `--dream-pass` opt-in vs flip). The pattern transforms the existing `consolidate-memory` skill from a single-context rewrite into a two-context pipeline: a read-only "dreaming" context synthesizes new insights from immutable source memory, producing a proposed-output artifact; an optional review-mode surfaces the artifact for user approval before committing to the memory store.
**Acceptance:** (a) User approves OD proposal via EA Decision Packet — DONE (2026-05-07 with fork-defaults: weekly Sun 19:00 EDT = 23:00 UTC + 3-no-op relax to bi-weekly; default-tier @ 350KB; legacy mode default per Fork 3); (b) Phase 1 skill body lands per proposal §3.1 — DONE (`commands/consolidate-memory.md` ~265 lines extending Anthropic skill with `--dream-pass` mode); (c) first dream-pass run produces a proposed-output artifact for user review — PENDING (first scheduled fire next Sunday 19:00 EDT); (d) integration with existing `consolidate-memory` skill resolved per fork 3 default — DONE (legacy in-place stays default; `--dream-pass` opt-in flag).

**Phase 1 status (2026-05-07T03:50):** LANDED — `protocols/dream-pass.md` (NEW canonical, ~280 lines) + `commands/consolidate-memory.md` (NEW skill body extending Anthropic `consolidate-memory` skill; legacy mode preserved with TapAgents-shape Phase 3 no-op handling per Critic Pass 1 fix B2; dream-pass mode adds immutable-input pipeline) + `agents/org-designer.md` diff (Authority adds dream-pass cadence + review; Read-list adds `memory.next/` artifacts; Quarterly Review adds acceptance-rate tracking) + `agents/executive-assistant.md` diff (Read-list adds `memory.next/` artifacts; new "Memory health" briefing section + new "Dream-pass Decision Packet" surface format) + scheduled-task `weekly-dream-pass` registered via `mcp__scheduled-tasks__create_scheduled_task` (cron `0 19 * * 0` Sunday 19:00 EDT = 23:00 UTC; small deterministic dispatch delay per MCP convention) + `.gitignore` additions (`memory.next/`, `memory.prev.*/`) + `memory/README.md` "Dream-pass cadence" section + scaffold-source mirrors (`agent-dashboard/scaffold-source/protocols/dream-pass.md` + `agents/org-designer.md` + `agents/executive-assistant.md`; `diff -q` empty parity verified). Critic adversarial review at `workspace/_global/critic-review-bl031-phase1-impl.md`.

**Phase 2 status:** GATED on first scheduled cycle firing Sunday 2026-05-10 19:00 EDT. 4-week dogfood observation window minimum (extends to 8 weeks if 20-30% acceptance triggers extended observation per OD proposal §4 Phase-2-fail recovery path). User runs `/grow-team` after week 4 to evaluate OD's recommendation calibration (Devil's-Advocate addition). Phase 2 success criteria: (a) 4 weekly cycles complete; (b) acceptance rate ≥30%; (c) zero accepted dream-passes that subsequently surfaced as bad-curation incidents; (d) at least one cycle exercised `--instructions` field.

**Phase 3 status:** GATED on Phase 2 success. Aggressive-tier ingest opens; event-driven trigger evaluation. Separate OD proposal at Phase 3 entry.

**Phase 4 status:** GATED on Phase 3 settlement. Promotion to `templates/stacks/_baseline/` as framework-default.

**Estimated effort:** M (Phase 1 complete; Phase 2 dogfood + Phase 3 promotion + Phase 4 framework-default remain)

---

## Archived

_(Stale or superseded items moved here by Org Designer during grooming. Never deleted — audit trail preserved.)_
