---
name: pmm
description: Direct invocation of Product Marketing Manager. Use for positioning, voice, release notes, feature briefs, and user-facing documentation once a project is at or past handoff.
---

# /pmm

Direct invocation of Product Marketing Manager.

## Usage

```
/pmm <slug>            # bootstrap-mode release notes + internal docs pass
/pmm <slug> --full     # full release notes + feature brief + user docs pass
```

If no slug is provided, PMM asks which project. Direct invocation is valid only for projects at or past `handed-off`; earlier positioning or product-scope changes route back to Strategist, Designer, or Marketing Designer depending on the artifact.

## When to Use

- You need release notes, feature briefs, changelog copy, or user-facing docs for a shipped or nearly shipped milestone
- You want copy and voice reconciled against the PRD, scope, design posture, handoff package, and smoke-confirmed behavior
- You want to revise an existing PMM content bundle after Critic, QE, UI/UX Reviewer, or user feedback
- You want the full documentation pack and are ready to opt out of bootstrap mode with `--full`

## When NOT to Use

- The project has not reached `handed-off` - PMM needs a deployable surface and handoff context
- You need product/app UX structure - use `/designer`
- You need marketing-surface visual design, page architecture, or competitor-as-conversion-machine evaluation - use `/marketing-design`
- You need pricing, launch-channel mix, campaign timing, or GTM sequencing - route to GTM Launch Strategist when active
- You need reference-grade developer docs for an API or SDK - route to Technical Writer when active

## What You Get

- Bootstrap mode: `workspace/<slug>/release-notes.md` and `workspace/<slug>/internal-docs.md`
- Full mode: `workspace/<slug>/release-notes.md`, `workspace/<slug>/feature-brief.md`, and `workspace/<slug>/user-docs/`
- Shipped pass: `workspace/<slug>/release-notes-public.md` after smoke-report reconciliation and ship approval
- Advisory feedback: `workspace/<slug>/pmm-prd-feedback.md` when PMM finds a positioning tension that belongs with Strategist

## See Also

- `/marketing-design` - marketing-surface visual system, page spec, and competitor-eval
- `/designer` - product/app UX design and design-system work
- `/critic` - adversarial review of PMM outputs
- `/design-review` - runtime visual review of the implemented surface
- `/status` - current project phase and whether a PMM pass is eligible
