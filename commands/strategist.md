---
name: strategist
description: Direct invocation of Strategist. Use only when you have an approved intake-brief and want PRD work to start without ceremony, or when revising an existing PRD.
---

# /strategist

Direct invocation of Strategist. Skips the normal Conductor routing.

## Usage

```
/strategist [optional: project slug]
```

If no slug, Strategist asks which project. If only one project is in `briefed` or `stratego` phase, Strategist picks it.

## When to Use

- You want to start PRD work without going through Intake / Conductor flow
- You want to revise an existing PRD with specific feedback
- You're testing the agent in isolation

## When NOT to Use

- No intake brief exists for the project (use `/intake` first)
- Project not in eligible phase (Conductor will block)
- You need a status update (use `/status`)

## See Also

- `/team` — full pipeline starting from Intake
- `/intake` — gather requirements first
- `/critic` — invoke Critic to review existing artifacts
