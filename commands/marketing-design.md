---
name: marketing-design
description: Direct invocation of Marketing Designer. Author or revise a marketing-design-spec for a project's public marketing surface. Marketing-designer runs the competitor-as-conversion-machine evaluation, synthesizes patterns, and writes marketing-design-spec.md + competitor-eval.md.
---

# /marketing-design

Direct invocation of Marketing Designer.

## Usage

```
/marketing-design <slug>            # full marketing-design-spec authoring or revision pass
/marketing-design <slug> <page>     # focused revision of a single page's design
```

- **Slug only** → Marketing Designer reads the project's PRD + intake brief + Designer's design-spec (for primitives to cite) + feature brief (if marketing-scoped feature exists), runs the 8-axis competitor-as-conversion-machine evaluation against the open-core reference set (Supabase / PostHog / Cal.com / Inngest / Trigger.dev as primary business-model analogs; Linear / Vercel for visual polish; Anthropic for brand aesthetic), synthesizes top patterns adopted + rejected, authors `workspace/<slug>/marketing-design-spec.md` and `workspace/<slug>/competitor-eval.md`.
- **Slug + page** → focused revision of just that page's section in `marketing-design-spec.md`. Output appends a "Focused pass: <timestamp>" section.

If no slug, Marketing Designer asks which project. If only one project is at `briefed` or `scoping` phase with a marketing-surface feature, Marketing Designer picks it.

## When to Use

- A project has a public marketing surface feature (homepage, /how-it-works, /products, /solutions, /pricing, /customers, /blog, /docs) and you want the marketing-design-spec authored directly
- You want a fresh competitor-as-conversion-machine evaluation pass against the open-core reference set
- You're revising marketing-design-spec after post-launch conversion data (hero rework, social-proof refresh, CTA hierarchy iteration)
- You want a focused pass on a single marketing page

## When NOT to Use

- Project has no public marketing surface (product-only, internal-tools-only, CLI tools) — marketing-designer has nothing to design
- Project needs product/app UX design (dashboard, /admin/*, /queue, /settings) — that's Designer's lane via `/designer`
- Project needs positioning/copy/voice work (release notes, feature briefs, user-facing docs) — that's PMM's lane via `/pmm`
- Project needs runtime visual review of an already-rendered marketing surface — that's UI/UX Reviewer's lane via `/design-review`
- Project needs pricing strategy, channel mix, campaign timing — that's gtm-launch-strategist's lane (planned stub)

## What You Get

- `workspace/<slug>/competitor-eval.md` — 8-axis rubric against the open-core reference set, 30-minute time-box, 5-10 pattern observations, top 3 adopted + top 3 rejected
- `workspace/<slug>/marketing-design-spec.md` — ten-section spec covering brand posture, tokens (Architecture A default), components-extensions, page specs per marketing route, conversion-optimization decisions, SEO + indexing posture, accessibility, default-coverage block for UI/UX Reviewer, competitor-eval reference (shape-only — no external names), open questions
- `memory/ui-references.md` — appended marketing-class entries with provenance when cross-project patterns crystallize

## Brand-integrity rule (load-bearing)

External product names (Supabase, PostHog, Linear, Vercel, Anthropic, etc.) appear in `competitor-eval.md` **for audit purposes only**. The shipping artifacts (`marketing-design-spec.md`, the actual marketing surface code) **NEVER** carry external product names. Critic enforces at plan-axis review.

## See Also

- `/designer` — product/app UX design (dashboard surfaces; marketing-designer's sibling lane)
- `/design-review` — UI/UX Reviewer's runtime visual review (reads both `design-spec.md` and `marketing-design-spec.md` depending on route)
- `/pmm` — Product Marketing Manager (positioning, voice, copy, release notes, feature briefs)
- `/critic` — review the marketing-design-spec text directly
- `/strategist` — produce or revise PRD first (marketing-designer's primary input)
- `/architect` — tech-strategy revision for route scaffolding + SEO infra (marketing-designer hands off to architect for implementation routing)
