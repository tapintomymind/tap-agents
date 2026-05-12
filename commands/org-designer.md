---
name: org-designer
description: Direct invocation of Org Designer. Cross-project review of team shape — what's working, what's not, what should split or merge.
---

# /org-designer

Manually invoke Org Designer for a cross-project team-shape review.

## Usage

```
/org-designer [optional: focus area]
```

Optional focus area: `prompts`, `routing`, `agents`, `templates`, `intake-bank`, or specific agent name.

## What You Get

Org Designer scans all projects' artifacts, dissent logs, routing logs, etc. Writes one or more proposals to `workspace/_global/org-designer-proposals/`. EA surfaces under TEAM HEALTH in next briefing.

## When to Use

- You sense friction (agents misrouting, prompts feeling bloated, missed coverage)
- After a project completes and you want a deliberate retro
- Quarterly review (until automated cadence is built)
- You think a `_planned/` agent should be activated

## See Also

- `/grow-team` — same as `/org-designer` but optimized for "should we add a role?" questions
- `/status` — TEAM HEALTH section shows pending Org Designer signals
