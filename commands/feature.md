---
name: feature
description: Direct invocation of Intake in feature mode — ideate a feature for an existing project, anchored to its live PRD/scope/decisions. Produces a feature-brief that Strategist turns into a PRD-revision (or mini-PRD).
---

# /feature

Engage Intake in **feature mode**. Use this when you have an existing project and want to ideate a feature for it — not start a new project.

## Usage

```
/feature [optional: feature seed]
/feature <project-slug> [optional: feature seed]
```

If you don't pass a project-slug, Intake reads recent activity / state to infer the project. If multiple projects are active, Intake will ask you to pick.

## What Happens

Intake activates in feature mode and:

1. **Reads anchor artifacts** for the project — `prd.md`, `scope.md`, `tech-strategy.md`, last 3 decision packets, `dissent-log.md`. Feature mode does NOT improvise; it anchors against existing state.
2. **Asks hard-hitting feature-specific questions** along 4 critical dimensions:
   - **F-A. Existing-state anchoring** — which user story does this serve, what conflicts with PRD §4 OUT-of-v1
   - **F-B. Pain & moat fit** — what does today's workflow look like without it, moat-deepener vs polish
   - **F-C. Scale headroom** — v2 path, what does this paint us out of, 10x scale check, composition with roadmap
   - **F-D. Bundle framing** — stands alone or part of a coherent slice, one-sentence pitch
3. **Plus 3 reused dimensions** (feature-scoped) — scope discipline, success definition, constraints compatibility
4. **Writes** `workspace/<project-slug>/features/<feature-slug>/feature-brief.md`
5. **Hands off to Strategist** for PRD-revision (or mini-PRD if the feature is large)

## When to Use

- You're brainstorming features for an existing project
- You want to add a feature without re-running full project intake
- You want the feature to be anchored to current PRD persona, MVP, OUT-of-v1, win metric — not improvised
- You're considering a bundle of features and want them framed as one coherent slice

## When NOT to Use

- New project with no existing artifacts — use `/intake` or `/team` instead
- Project-level scope-shift (changing the persona, the win metric, the MVP definition) — use `/intake` instead
- You just want to talk through an idea without producing an artifact — that's inline conversation, not feature mode

## See Also

- `/intake` — project-level intake (new product, scope shift, paused-resume)
- `/team` — same as `/intake` but with the seed in the command
- `/strategist` — invoke Strategist directly (only after a feature-brief exists and is approved)
