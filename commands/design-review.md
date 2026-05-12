---
name: design-review
description: Direct invocation of UI/UX Reviewer. Run a default-coverage visual review on a project, or a focused review on a single page. Reviewer screenshots the running UI, compares against design-spec + reference dashboards, and writes design-review.md.
---

# /design-review

Direct invocation of UI/UX Reviewer.

## Usage

```
/design-review <slug>            # full default-coverage pass against the project
/design-review <slug> <page>     # focused review of a single page (route or label)
```

- **Slug only** → UI/UX Reviewer screenshots the canonical page-list for the project type (landing, post-auth, list states N=0/1/3+, detail, admin gate, error, 404, responsive sweep), reviews each, writes a fresh dated pass into `workspace/<slug>/design-review.md`.
- **Slug + page** → focused review of just that route. Output appends a "Focused pass: <timestamp>" section to `design-review.md`. Useful after a Tier 2 fix targeting one surface.

If no slug, UI/UX Reviewer asks which project. If only one project is at `handed-off` or `shipped` phase, Reviewer picks it.

## When to Use

- A user-visible regression has shipped and you want a structured visual review before the next deploy
- You want a fresh pass before approving a `handed-off → shipped` checkpoint (Reviewer also fires automatically at this gate alongside QE and Ops/Security — direct invocation is for ad-hoc passes outside the gate)
- You're auditing a specific page after a fix
- You want a market-calibration pass against a new project type's `design-spec.md`

## When NOT to Use

- Project has no user-facing UI (CLI tools, backend-only services) — UI Reviewer has nothing to screenshot
- No PRD or design-spec exists yet — Reviewer needs the spec as the comparison baseline
- Mid-Tier-2 commit churn — Reviewer fires on milestone gates, not every PR

## What You Get

- Screenshots saved to `test-results/visual/<timestamp>/`
- `workspace/<slug>/design-review.md` with P0 (blocking) / P1 (backlog) / P2 (polish) findings
- New `BL-NNN` entries filed in `workspace/<slug>/backlog.md` for P1 findings
- `memory/ui-references.md` / `ui-patterns.md` / `ui-anti-patterns.md` updated when cross-project patterns surface

## See Also

- `/quality` — QE's runtime functional review (parallel axis at the same gate)
- `/ops-security` — adversarial runtime review (third axis at the same gate)
- `/critic` — text/artifact review (`design-spec.md` review goes here, not to UI Reviewer)
- `/designer` — when the spec itself needs revision (UI Reviewer files `WRONG_AGENT: → Designer` for spec drift; you can invoke directly)
