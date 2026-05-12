---
name: designer
description: Direct invocation of Designer. Use when you want design system / UX work to start without ceremony, or when revising existing design spec.
---

# /designer

Direct invocation of Designer.

## Usage

```
/designer [optional: project slug]
```

If no slug, Designer asks which project. If only one project is in `briefed`, `stratego`, or `scoping` phase with UI scope, Designer picks it.

## When to Use

- You want design-system + UX work to start directly (Designer auto-fires when project has UI scope, but you can force it)
- You want to revise an existing design spec
- You want Designer to weigh in on a tech-strategy from a UI-feasibility angle

## When NOT to Use

- Project has no user-facing UI (CLI tools, backend-only services)
- No PRD exists yet (Designer needs PRD as input)

## What You Get

Designer writes `workspace/<slug>/design-spec.md` covering tokens, components, interaction patterns, screens, accessibility. Critic reviews. Strategist + Architect collaborate on integration.

## See Also

- `/strategist` — produce PRD first (Designer's primary input)
- `/architect` — tech-strategy after design system is informed
- `/critic` — review existing design spec
