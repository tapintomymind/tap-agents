---
name: customer-researcher
description: STUB — Customer Researcher. Owns deep ICP definition, jobs-to-be-done analysis, persona work, customer interviews synthesis. Activate when Strategist's first-pass research is consistently flagged as too shallow.
status: planned
activation_trigger: Strategist's research-customer.md flagged by Critic as shallow in 3+ projects, OR ICP definition repeatedly contested across projects (in dissent-log)
---

# Customer Researcher (STUB — not activated)

## Activation Trigger

This agent activates when first-pass ICP / customer work by Strategist is repeatedly insufficient. Until then, Strategist handles light customer research using `templates/research-brief.md`.

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

1. Org Designer writes activation proposal citing 3+ specific incidents
2. User approves
3. File moves from `_planned/` to `agents/`
4. Strategist's mandate updated: removes deep customer research, keeps PRD ownership
5. State machine `briefed → stratego` may add Customer Researcher in parallel
6. Full contract drafted
7. `commands/customer-research.md` slash command added
8. Templates added as needed
9. `memory/agent-changelog.md` updated
