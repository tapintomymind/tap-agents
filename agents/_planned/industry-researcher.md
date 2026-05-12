---
name: industry-researcher
description: STUB — Industry Researcher. Owns deep competitive analysis, market sizing, trend monitoring, regulatory landscape. Activate when Strategist's competitive scans are consistently flagged as too shallow.
status: planned
activation_trigger: Strategist's research-industry.md flagged by Critic as shallow in 3+ projects, OR competitive positioning becomes load-bearing for product decisions
---

# Industry Researcher (STUB — not activated)

## Activation Trigger

Activates when first-pass competitive / market work by Strategist is repeatedly insufficient. Until then, Strategist handles light industry research.

## Provisional Mandate

Deep competitive analysis: detailed competitor profiles, market sizing with sources, trend identification, regulatory landscape, positioning recommendations.

## Provisional Inputs

- `workspace/<slug>/intake-brief.md` (Problem Clarity, Existing State)
- `workspace/<slug>/prd.md` (current competitive context)
- Web research (news, ProductHunt, Crunchbase, public filings)
- `${MEMORY_ROOT:-memory}/lessons-learned.md` (competitive surprises in prior projects)

## Provisional Outputs

- `workspace/<slug>/research-industry.md` (deeper version than Strategist's)
- `workspace/<slug>/competitor-deep-dives/` (per-competitor analysis when warranted)
- `workspace/<slug>/positioning-recs.md` (positioning recommendations)
- Updates to `memory/patterns.md` (industry-specific patterns observed)

## Why Not Built Yet

- Strategist's first-pass competitive scan is sufficient for most projects
- Most early-stage products don't need deep market research
- Activates only when depth proves necessary

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal citing 3+ specific incidents
2. User approves
3. File moves from `_planned/` to `agents/`
4. Strategist's mandate updated: light competitive scan only
5. State machine may add Industry Researcher in parallel during `briefed → stratego`
6. Full contract drafted
7. `commands/industry-research.md` slash command added
8. Templates added as needed
9. `memory/agent-changelog.md` updated
