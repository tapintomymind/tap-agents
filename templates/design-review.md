# Design Review — <project-slug>

**Pass:** <YYYY-MM-DD HH:MM> — <full default-coverage | focused: /route | delta | market-calibration>
**Reviewer:** UI/UX Reviewer
**Deployed URL reviewed:** <https://...>
**Design spec referenced:** `workspace/<slug>/design-spec.md` (sections cited inline)

---

## 0. Result envelope (per `protocols/outcome-grading.md`)

This block MUST appear at the top of each pass's section in `design-review.md`. Conductor parses the LAST yaml-fenced block in the file (last-pass-wins semantics for multi-pass append-only files).

````yaml
result: satisfied  # one of: satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/design-spec.md§7
criteria_evaluated:
  - id: DC-1
    description: /dashboard @ 375px / loaded
    status: pass  # one of: pass | fail | partial | not_tested
    evidence: test-results/visual/<ts>/01-dashboard-375px.png — matches design-spec §5.2 mobile layout
    severity: not_applicable  # one of: P0 | P1 | P2 | not_applicable
  - id: DC-2
    description: /dashboard @ 1440px / loaded
    status: fail
    evidence: test-results/visual/<ts>/02-dashboard-1440px.png — list stretches edge-to-edge; spec §5.4 calls for ~1200px content cap
    severity: P1
findings_summary:
  P0: 0
  P1: 1
  P2: 0
  notes: 0
verdict: LAND-WITH-FOLLOWUPS
followup_items_filed:
  - BL-NNN  # actual ID allocated by Backlog Curator at filing
````

If `result == unable_to_grade`, add `reason_class:` and `reason_detail:` fields and `criteria_evaluated:` may be empty. See `protocols/outcome-grading.md §2` for full schema + per-criterion semantics.

---

## 1. Project context

- **Project type:** <e.g., dashboard / marketing site / dev-tool console>
- **Stack:** <from tech-strategy.md — e.g., Next.js 15 + React 19 + Tailwind v3>
- **Audience / IA frame:** <one line on who this is for and what mental model the IA has to honor — pulled from PRD persona + design-spec §1>
- **Reference dashboards consulted:** <citations to memory/ui-references.md entries — e.g., "Vercel, Linear, Stripe Dashboard">

## 2. Pages reviewed

Enumerated. One row per page, with screenshot file path. If a planned page was not reviewable (auth flow could not complete in headless, route 404'd, etc.), list under §6 "What couldn't be reviewed."

| # | Route | State | Screenshot | Result |
|---|---|---|---|---|
| 1 | `/` | pre-auth landing | `test-results/visual/<ts>/01-landing.png` | reviewed |
| 2 | `/auth/success` | post-auth landing | `test-results/visual/<ts>/02-auth-success.png` | reviewed |
| 3 | `/dashboard` | N=0 (empty) | `test-results/visual/<ts>/03-dashboard-empty.png` | reviewed |
| 4 | `/dashboard` | N=1 | `test-results/visual/<ts>/04-dashboard-one.png` | reviewed |
| 5 | `/dashboard` | N≥3 | `test-results/visual/<ts>/05-dashboard-list.png` | reviewed |
| 6 | `/projects/<sample>` | detail | `test-results/visual/<ts>/06-project-detail.png` | reviewed |
| 7 | `/admin/<route>` | admin gate | `test-results/visual/<ts>/07-admin.png` | reviewed |
| 8 | error boundary | thrown route | `test-results/visual/<ts>/08-error.png` | reviewed |
| 9 | 404 | not-found | `test-results/visual/<ts>/09-404.png` | reviewed |
| 10 | `/dashboard` | 375px / 768px / 1024px / 1440px | `test-results/visual/<ts>/10-responsive-*.png` | reviewed |

## 3. Blocking findings (P0)

P0 = blocks `handed-off → shipped`. Broken layouts, blocking IA mismatches, accessibility regressions visible only at runtime, fundamental drift from spec on a primary surface.

If none, write: **None.**

For each finding:

```
### P0-1 — <one-line title>

- **Route / file:** `<route or file:line range>`
- **Surface evidence:** <screenshot reference + what's visible>
- **Spec drift:** <cite design-spec.md section + what spec says vs. what renders>
- **Why blocking:** <one sentence on user-visible impact>
- **Recommended path:** <implementation hint — Tier 2 fixes; reviewer does NOT edit code>
```

## 4. Notable findings (P1)

P1 = file as backlog entry. Notable drift from spec, IA mismatch, modern-stack lag, accessibility issue not severe enough to block but user-fixable in next session.

For each finding, file as new `BL-NNN` entry in `workspace/<slug>/backlog.md` and update `workspace/_global/backlog.json`. Cross-reference here:

```
### P1-1 — <one-line title> (filed as <BL-NNN>)

- **Route / file:** `<route or file:line range>`
- **Surface evidence:** <screenshot reference + what's visible>
- **Reference comparison:** <cite memory/ui-references.md if Tier-A reference solves this differently>
- **Recommended path:** <implementation hint>
- **Backlog entry:** `workspace/<slug>/backlog.md §BL-NNN`
```

## 5. Polish backlog (P2)

P2 = polish opportunities. Not auto-promoted to backlog. User reads this section and chooses what to promote.

Bullet list, one line each, with route/file and one-line description. Example:

- `src/components/ui/empty-state.tsx`: empty-state copy is generic ("No projects yet") — Tier-A references (Vercel, Linear) use action-oriented copy ("Create your first project to start syncing")
- `/dashboard` at 1440px: list stretches edge-to-edge instead of capping at ~1200px content width — modern reference dashboards cap (Vercel: 1200px, Linear: 1180px, Stripe: 1280px)

## 6. References cited

- **`memory/ui-references.md`:** <names of entries cited above — e.g., "Vercel (entry 1), Linear (entry 2)">
- **`design-spec.md`:** <sections cited — e.g., "§3 Components, §5 Screens">
- **Fresh `[research]` URLs (this pass only — not yet in memory):** <list with date-checked>

## 7. What couldn't be reviewed

Enumerated. Surfaces that would have been part of default-coverage but couldn't be screenshot in this pass.

- <surface> — <reason: auth flow blocked in headless, third-party iframe, etc.>

## 8. Anti-sycophancy log

Required when §3 Blocking + §4 Notable are both empty. Document:
- **Second-pass framing used:** "What's the single weakest pattern on this surface? What does Vercel/Linear/Stripe do here that we don't?"
- **What surfaced (or didn't):** <findings from the second pass>
- **If second pass also clean:** "Two-pass clean review — coverage list at [list]; flag for Org Designer if pattern repeats."

Omit this section if any P0 or P1 finding exists.

## 9. Sign-off

- **Pass result:** <ship-eligible | blocked on P0 | partial — see §7 for what couldn't be reviewed>
- **Coverage:** <N pages reviewed / N planned>
- **Recommended next action:** <one sentence — e.g., "Approve ship; P1 findings filed as BL-NNN/BL-NNN for next session">
- **Signal:** Conductor + EA notified.

---

_Append-only across passes. New passes add a new top-level header with timestamp; do not rewrite prior sections._
