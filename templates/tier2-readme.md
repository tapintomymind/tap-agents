# Tier 2 README Template

Used by Architect to generate `<target-repo>/.claude/README.md` at scaffold time. Substitutes `{{PLACEHOLDERS}}` with project values.

---

# {{PROJECT_NAME}} — Tier 2 Team

**Project slug:** {{PROJECT_SLUG}}
**Stack:** {{STACK}}
**Generated:** {{GENERATION_TIMESTAMP}} (by Tier 1 HQ Architect)
**Tier 1 HQ:** {{TIER1_HQ_PATH}}

This is the **project execution team** for {{PROJECT_NAME}}. Tier 1 HQ planned the product, picked the stack, generated this team. We build.

## Roster

{{AGENT_LIST}}

(Each agent's full contract is in `agents/`. Models per-agent: see frontmatter.)

## How We Work

1. **Read:** `handoff-package.md` is the contract. PRD + scope + tech-strategy + decision context all embedded.
2. **State:** `workspace/state.json` tracks current milestone and progress.
3. **Build:** Implementer agents work per scope.md milestones, sequenced.
4. **Review:** Tier 2 Critic reviews each milestone before advance.
5. **Deploy:** Deployment agent ships per tech-strategy hosting pick.
6. **Report:** Significant events → `reportback.md` → Tier 1 monitors.

## Reportback Triggers (when to signal Tier 1)

Report to {{TIER1_REPORTBACK_PATH}}:
- Milestone completed (FYI)
- Scope deviation needed (REQUIRED — block until response)
- Blocked >24h (REQUIRED)
- Risk realized (REQUIRED)
- Decision needed from Tier 1 (REQUIRED)
- Capability missing — need agent that doesn't exist (REQUIRED)
- MVP shipped (REQUIRED — Tier 1 confirms before status changes)

Format per protocol embedded in handoff-package.md §3.

## What We CAN Do Unilaterally

- All implementation decisions within scope
- Library / pattern / file structure choices
- Refactoring within boundaries
- Test strategy
- Local dev workflow

## What We CAN'T Do

- Change top-level stack (escalate)
- Add features beyond scope (escalate)
- Drop features from scope (escalate)
- Mark MVP shipped without Tier 1 confirmation
- Edit Tier 1 artifacts (read-only on `{{TIER1_WORKSPACE_PATH}}`)

## Memory Access

Tier 2 has **READ-ONLY** access to Tier 1 memory at `{{TIER1_HQ_PATH}}/memory/`. Useful files:
- `memory/stack-preferences.md` — defaults Architect drew from
- `memory/lessons-learned.md` — relevant past projects
- `memory/patterns.md` — cross-project conventions

Do NOT write to Tier 1 memory.

## Promotion Path (Mid-Build Pivot)

If you discover the original Tier 1 plan needs significant revision:
1. Write a `promotion-request` reportback
2. Tier 1 Conductor pauses Tier 2 (sets state to `paused` or `pivoted`)
3. Intake re-engages user
4. Strategist + Architect produce updated plan
5. New handoff package issued
6. Tier 2 receives updated package and resumes

## State Machine (Tier 2)

Different from Tier 1's. Tier 2 phases:
```
tier2-initialization → milestone-X-active → milestone-X-review → milestone-X-shipped → ... → mvp-shipped
```

Each milestone has the same review pattern (implementer → critic → conductor confirms) before advancing.

## See Also

- `handoff-package.md` — your charter
- `reportback.md` — channel back to Tier 1
- Tier 1 HQ at `{{TIER1_HQ_PATH}}`
