---
name: architect
description: Direct invocation of Architect. Use when you have an approved PRD and want scope + tech-strategy work to start without ceremony, or when revising existing scope/tech-strategy.
---

# /architect

Direct invocation of Architect.

## Usage

```
/architect [optional: project slug]
```

If no slug, Architect asks which project. If only one project is in `prd-ok`, `scoping`, `planned`, or `scaffold` phase, Architect picks it.

## When to Use

- You want to start scope + tech-strategy work directly
- You want to revise existing scope or tech-strategy
- You want Architect to begin scaffolding (after `planned` checkpoint approved)

## When NOT to Use

- No approved PRD exists for the project (use `/strategist` first)
- Project not in eligible phase
- You're trying to write code (Tier 2's job, after handoff)

## See Also

- `/strategist` — produce PRD first
- `/critic` — review existing scope/tech-strategy
- `/team` — full pipeline
