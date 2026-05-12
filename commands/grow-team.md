---
name: grow-team
description: Invoke Org Designer to specifically evaluate whether the team needs a new role, a split, or activation of a planned agent.
---

# /grow-team

Ask Org Designer to evaluate team-shape changes.

## Usage

```
/grow-team [optional: specific question]
```

Examples:
```
/grow-team
/grow-team should we activate GTM Strategist?
/grow-team Strategist's prompt feels bloated
/grow-team we need a Designer agent
```

## What You Get

Org Designer reviews the team and produces one or more proposals:
- Activate a `_planned/` agent
- Split an existing agent
- Add a new role
- Tighten an agent's prompt
- Add a question dimension to Intake's bank

Each proposal lives at `workspace/_global/org-designer-proposals/`. EA surfaces with recommendation.

## When to Use

- You sense a missing role
- You want to consider activating a planned agent
- You feel the team is too small for current workload
- You feel an agent is doing too many things

## See Also

- `/org-designer` — broader review without role-shape focus
- `agents/_planned/README.md` — list of stubs and activation triggers
