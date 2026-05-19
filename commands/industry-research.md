---
name: industry-research
description: Direct invocation of Industry Researcher. Use when you want deep competitive profiles started without ceremony, or when revising existing competitor-deep-dives outputs.
---

# /industry-research

Direct invocation of Industry Researcher (`agents/industry-researcher.md`). Skips the normal Conductor routing.

## Usage

```
/industry-research [optional: project slug] [optional: --deep-dive=<competitor>]
```

If no slug, Industry Researcher asks which project. If a `--deep-dive=<competitor>` arg is supplied, the agent scopes the run to that single competitor; otherwise the agent profiles every competitor named-but-not-profiled in the triggering Strategist artifact.

## When to Use

- You have a Strategist artifact (PRD, scope, addendum, competitive-positioning) and want deep competitive profiles for the named competitors
- You want to update existing `workspace/<slug>/competitor-deep-dives/` outputs against new public-roadmap signals
- You want a `research-industry.md` synthesis across already-profiled competitors
- You're running the monthly watch-list pass against `R-*` competitive risks

## When NOT to Use

- First-pass competitive scan inside Strategist's PRD authoring (Strategist handles light research per `agents/strategist.md` Operating Principle 8 — invoke `/strategist` first, then `/industry-research` for the deep pass)
- Customer-research / persona / JTBD work (route to customer-researcher when activated; currently stub at `agents/_planned/customer-researcher.md`)
- Architecture-level decisions on competitive moat (route to `/architect` with industry-researcher output as input)
- Pricing decisions (route to biz-finance when activated; `commercial` decision class per `protocols/decision-class-taxonomy.md`)

## What You Get

Industry Researcher reads:
- The triggering Strategist artifact + the parent PRD + relevant addenda
- `agents/industry-researcher.md` contract (Operating Principles + Inputs/Outputs/Authority)
- `protocols/decision-class-taxonomy.md`, `protocols/workstream-index.md`, `protocols/prd-addendum-pattern.md`
- Existing `workspace/<slug>/competitor-deep-dives/` if any

Industry Researcher produces:
- `workspace/<slug>/competitor-deep-dives/<competitor>.md` per profiled competitor (one file each, using `templates/competitor-deep-dive.md`)
- `workspace/<slug>/research-industry.md` synthesis when ≥2 competitors are profiled
- Updates to `workspace/<slug>/workstream-index.md` per `protocols/workstream-index.md` (reading-order entries for new deep-dives)
- Updates to relevant `state.json` blocks (e.g., `competitive_positioning_workstream` block) when the project has one

## Backgroundable

Yes. Dispatcher monitors output artifact paths (`workspace/<slug>/competitor-deep-dives/<competitor>.md` last-modified timestamps + state.json completion fields), NOT the agent's transcript file. See `agents/industry-researcher.md` `background_safety` section for the canonical dispatcher contract.

## See Also

- `/strategist` — first-pass competitive scan + PRD-addendum authoring per `protocols/prd-addendum-pattern.md`
- `/critic` — adversarial review of competitor-deep-dives outputs (depth_assessment axis when Phase B Critic axis-add lands)
- `/grow-team` — Org Designer evaluation of researcher activation if industry-researcher is still in `_planned/` for your project class
- `agents/industry-researcher.md` — the full agent contract
- `templates/competitor-deep-dive.md` — the per-competitor profile template
