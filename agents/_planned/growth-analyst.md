---
name: growth-analyst
description: STUB — Growth Analyst. Reads post-launch metrics, identifies funnel/retention issues, proposes growth experiments. Activate when first project transitions to `measured` phase with real user data.
department: Product
role_title: Growth Analyst
status: planned
tags: post-launch-metrics, funnel, experiments
tier: 2
voice_signature: What's working, what's failing, why.
activation_trigger: First project transitions to `measured` (shipped → measured completes with at least one PRD-defined metric having data)
---

# Growth Analyst (STUB — not activated)

## Activation Trigger

This agent activates when first project has measurable usage data flowing in. Until then, post-launch is "shipped, waiting for signal."

## Provisional Mandate

Read post-launch metrics. Identify what's working, what's failing. Propose growth experiments with hypotheses and success criteria.

## Provisional Inputs

- `workspace/<slug>/prd.md` (success criteria, baseline metrics)
- `workspace/<slug>/gtm.md` (when GTM is also activated)
- Tier 2 reportback (deployment URL, dashboard refs)
- Live metrics (via integration to be specified at activation time)
- `${MEMORY_ROOT:-memory}/lessons-learned.md` (what growth bets have worked / failed)

## Provisional Outputs

- `workspace/<slug>/growth-analysis.md` — what's working, what's failing, why
- `workspace/<slug>/growth-experiments.md` — proposed experiments with hypotheses
- Possibly: feeds back to Strategist as PRD update proposals (new features driven by data)

## Why Not Built Yet

- No project has reached `measured` — no real data to analyze
- Building before there's data risks creating a generic dashboard reader
- Better to specialize once we know what kinds of metrics user cares about

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves
3. File moves from `_planned/` to `agents/`
4. Full contract drafted
5. `commands/growth.md` slash command added
6. `templates/growth-analysis.md` template added
7. State machine `measured` phase eligibility includes Growth Analyst
8. Specify metrics integration approach (manual entry, dashboard URL parsing, API integration)
9. `memory/agent-changelog.md` updated
