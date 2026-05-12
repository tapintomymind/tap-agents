---
name: gtm-strategist
description: STUB — Go-to-Market Strategist. Owns positioning, pricing, launch plan, distribution channels for shipped products. Activate when first project reaches `shipped` phase.
status: planned
activation_trigger: First project transitions to `shipped` (handed-off → shipped completes)
---

# GTM Strategist (STUB — not activated)

## Activation Trigger

This agent activates when the first project reaches `shipped` state. Until then, light GTM work falls to Strategist's "Distribution sketch" PRD section.

## Provisional Mandate

Translate a shipped MVP into a launch plan: positioning, pricing tiers, primary distribution channels, launch timeline, post-launch growth experiments.

## Provisional Inputs

- `workspace/<slug>/prd.md` (success metrics, target user)
- `workspace/<slug>/scope.md` (what shipped)
- `workspace/<slug>/research-industry.md` (competitive context)
- `workspace/<slug>/research-customer.md` (ICP, JTBD)
- Tier 2 reportback (live URL, current state)
- `${MEMORY_ROOT:-memory}/audience-knowledge.md`
- `${MEMORY_ROOT:-memory}/lessons-learned.md` (what's worked / failed for distribution before)

## Provisional Outputs

- `workspace/<slug>/gtm.md` — positioning, pricing, launch plan
- `workspace/<slug>/launch-checklist.md` — pre-launch verification
- Possibly: `templates/gtm-plan.md` (created if approved as recurring artifact)

## Why Not Built Yet

- No project has shipped — no real GTM work to do
- Premature build = generic prompt that won't match user's actual launch style
- Better to wait for first launch, observe what user actually wants, then specialize

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves
3. File moves from `_planned/` to `agents/`
4. Full contract drafted using `intake.md` / `strategist.md` as structural reference
5. `commands/gtm.md` slash command added
6. `templates/gtm-plan.md` template added if needed
7. State machine updated: `shipped` phase eligibility now includes GTM Strategist
8. `memory/agent-changelog.md` updated
