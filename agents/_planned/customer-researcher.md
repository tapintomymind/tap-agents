---
name: customer-researcher
description: STUB — Customer Researcher. Owns deep ICP definition, jobs-to-be-done analysis, persona work, customer interviews synthesis. Activate when ICP/persona work proves load-bearing per the three-lane trigger structure below.
status: planned
activation_trigger: Three-lane structure — Critic-signal lane (depth_assessment shallow + 3-project recurrence), Operator-driven lane (/grow-team + 3-of-4 checklist), Project-class lane (project_class default). See "Activation Trigger" section.
---

# Customer Researcher (STUB — not activated)

## Activation Trigger

Activation fires via the **three-lane trigger structure** introduced by `memory/framework-feedback-2026-05-18.md §1` and codified in `agents/org-designer.md` "Operator-driven stub activation" + "Project class enum" sections. ANY of the three lanes firing is sufficient. Org Designer authors the proposal in every case; user approves.

The three lanes are non-overlapping in semantics: lane (a) is portfolio-recurrence (slow, multi-project signal); lane (b) is single-project operator-driven (fast, in-session signal); lane (c) is project-class default (intake-time signal, applies before any artifact exists). Each is independently sufficient.

### Lane (a) — Critic-signal lane (portfolio-level)

Fires when **Critic's `depth_assessment` axis returns `verdict: shallow`** on `research-customer-*.md` artifacts (e.g., `research-customer.md`, `research-customer-icp.md`, `research-customer-personas.md`, or any artifact matching the `research-customer-*` naming convention) **AND the same root cause appears in 3+ projects**.

The `depth_assessment` axis lands in `agents/critic.md` via Phase B.1 of the `framework-feedback-2026-05-18` rollout. Until that axis lands, lane (a) is **dormant** — no Critic output to scan. Org Designer's weekly trigger sweep (per `protocols/framework-metrics.md` §5 / `agents/org-designer.md` "weekly trigger sweep") scans rolled-up metrics for `depth_assessment.verdict == shallow` events; threshold = ≥3 distinct projects in the trailing 90 days.

When threshold is met → Org Designer auto-proposes activation. Mirrors the existing `WRONG_AGENT` rate threshold + stuck-phase rate threshold patterns in `agents/org-designer.md` "Trigger Thresholds."

### Lane (b) — Operator-driven lane (single-project, immediate)

Fires when the operator invokes `/grow-team` **and explicitly cites a current customer-research-class artifact** (e.g., `workspace/<slug>/research-customer.md`, `workspace/<slug>/personas.md`, `workspace/<slug>/jtbd.md`, or any `prd.md §"Target user"` section being load-bearing in scope discussions).

On invocation, Org Designer runs the **4-question operator-driven activation checklist** (per `agents/org-designer.md` "Operator-driven stub activation"). The questions are customer-research-specific:

1. **Does the artifact drive scope decisions?** I.e., does the ICP / persona / JTBD work shape MVP-IN vs MVP-OUT cuts in `scope.md` or `prd.md §"In scope" / §"Out of scope"`?
2. **Does the artifact drive architecture decisions?** I.e., do persona constraints (single-tenant vs multi-tenant, accessibility floor, locale, low-bandwidth, regulated-vertical PHI/PII handling) lock anchors in `tech-strategy.md`?
3. **Does the artifact produce risks downstream agents will carry?** I.e., are there persona-shaped risks (e.g., R-ICP1..R-ICPn) cited in the Risk Register that Architect / Critic / QE will need to reference downstream?
4. **Are there ≥3 first-pass-only customer-persona mentions Strategist did not fully profile?** I.e., did `prd.md` or `research-customer.md` name three or more distinct personas / sub-segments / buyer-stakeholder roles without per-persona JTBD decomposition, validation evidence, or interview citations?

**Threshold:** 3-of-4 Y = trigger fires; Org Designer writes a proposal even though the project count is 1. 4-of-4 = strong propose. 2-of-4 = decline with rationale (proposal documents the gap; no activation). 1-of-4 or 0-of-4 = decline silently (Org Designer's `/grow-team` reply records the score; no proposal artifact).

The proposal lands in `workspace/_global/org-designer-proposals/<YYYYMMDD-HHMM>-customer-researcher-activation.md` per the standard Proposal Format in `agents/org-designer.md`. EA surfaces in next briefing under TEAM HEALTH.

**This is the recommended default first-deployment lane** per `framework-feedback-2026-05-18.md §1` — lane (a) requires the Critic `depth_assessment` axis (Phase B.1) and lane (c) requires the `project_class` state.json schema bump (deferred Phase C). Lane (b) is operable as of the Phase B.3 landing (this dispatch).

### Lane (c) — Project-class lane (intake-time defaults)

Fires at **intake time** based on a new optional `project_class` field on `workspace/<slug>/state.json`. The field is set by Org Designer at intake (during the `intake → briefed` transition) or by the operator (revisable via `/grow-team`). When `project_class` matches a customer-researcher activation enum, the stub activates **by default** — Strategist's research output becomes the first-pass that gets handed to a researcher, not the only pass.

**Customer-researcher activation enums** (per `agents/org-designer.md` "Project class enum"):

- `b2b-saas-multi-persona` — B2B SaaS products with multiple distinct buyer / user / stakeholder roles (e.g., admin + end-user + procurement + IT-buyer). Multi-stakeholder products carry per-persona JTBD divergence that Strategist's first-pass typically under-profiles.
- `consumer-utility-broad-persona` — consumer products spanning multiple distinct use cases or user types (e.g., a utility app where Persona A uses it for X and Persona B uses it for Y). Broad-persona consumer surfaces require per-segment JTBD work that a single PRD persona section under-serves.

When `state.json.project_class ∈ {"b2b-saas-multi-persona", "consumer-utility-broad-persona"}` and customer-researcher is not yet activated, Conductor's warmup (or Org Designer's intake-time pass) surfaces an activation proposal automatically. Operator can override via `/grow-team` decline (records the override rationale; the project proceeds with Strategist as canonical ICP/persona owner).

The `project_class` field is a **single-value field; most specific enum wins** when multiple enums plausibly apply. Documented in `agents/org-designer.md` "Project class enum"; orthogonal to `decision_class` (per `protocols/decision-class-taxonomy.md`) — the two fields exist in the framework's vocabulary but **NEVER share values** (`decision_class` is per-OQ; `project_class` is per-project).

### Lane priority — defaults & deployment readiness

- **Lane (b) ships first (this dispatch).** Operator-driven activation is operable immediately; the 4-question checklist + 3-of-4 threshold are codified in `agents/org-designer.md` and consumable on next `/grow-team` invocation.
- **Lane (a) ships after Phase B.1** (Critic's `depth_assessment` axis lands). Until then, no portfolio-recurrence signal exists; Org Designer's weekly sweep scans for the axis name and silently no-ops when the axis is absent.
- **Lane (c) ships after the state.json schema bump** (Phase C — deferred). The schema enforcement (JSON schema file + Conductor warmup validation) lands in a separate dispatch; this stub documents the field shape only.

Each lane fires independently; no lane gates another.

## Provisional Mandate

Deep ICP work: persona development, jobs-to-be-done framing, customer interview synthesis (when interviews exist), validation of behavioral assumptions in PRD.

## Provisional Inputs

- `workspace/<slug>/intake-brief.md` (Users and Distribution, Existing State)
- `workspace/<slug>/prd.md` (current persona definition)
- User-provided customer interviews (transcripts, notes)
- `${MEMORY_ROOT:-memory}/audience-knowledge.md`
- Web research (competitive UX, community signals)

## Provisional Outputs

- `workspace/<slug>/research-customer.md` (deeper version than Strategist's)
- `workspace/<slug>/personas.md` (canonical personas)
- `workspace/<slug>/jtbd.md` (jobs-to-be-done framing)
- Updates to `memory/audience-knowledge.md` (with provenance)

## Why Not Built Yet

- Strategist's first-pass research is sufficient for most projects
- Only worth specializing when depth is repeatedly demanded
- Premature specialization fragments responsibility

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal citing specific incidents (per the firing lane: lane-(a) cites the 3+ project depth_assessment events; lane-(b) cites the 4-question checklist score + the specific artifact; lane-(c) cites the project_class assignment + intake-time signal)
2. User approves
3. File moves from `_planned/` to `agents/`
4. Strategist's mandate updated: removes deep customer research, keeps PRD ownership
5. State machine `briefed → stratego` may add Customer Researcher in parallel
6. Full contract drafted
7. `commands/customer-research.md` slash command added
8. Templates added as needed
9. `memory/agent-changelog.md` updated
