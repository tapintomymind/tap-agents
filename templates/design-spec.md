# Design Spec — <project-name>

**Date:** <ISO timestamp>
**Author:** Designer (agent invocation reference)
**Source PRD:** `workspace/<slug>/prd.md`
**Source brief:** `workspace/<slug>/intake-brief.md`
**Status:** `[WIP]` | draft | approved
**Approved at:** <timestamp + verbatim approval, or blank>

---

## 1. Brand Posture

**Vibe:** <one line>
**Three adjectives:** <e.g., minimal / direct / playful>
**Anti-patterns:** <what we're explicitly NOT — e.g., "not enterprise corporate," "not crypto-bro," "not kid-friendly">

**Cited inputs:** `[brief: Decision Rights non-negotiables]` `[user]`

---

## 2. Tokens

### 2.1 Color

| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#FFFFFF` | App background |
| `bg-secondary` | `#F8F9FA` | Card / elevated surface |
| `fg-primary` | `#0F172A` | Primary text |
| `fg-secondary` | `#475569` | Secondary text |
| `fg-tertiary` | `#94A3B8` | Tertiary / placeholder text |
| `accent-primary` | `#3B82F6` | Primary action / brand |
| `accent-hover` | `#2563EB` | Hover state for primary action |
| `success` | `#10B981` | Success states |
| `warning` | `#F59E0B` | Warning states |
| `error` | `#EF4444` | Error states |
| `info` | `#06B6D4` | Info states |
| `border` | `#E2E8F0` | Default border |
| `border-strong` | `#CBD5E1` | Emphasized border |

### 2.2 Typography

- **Family:** <e.g., Inter for UI, JetBrains Mono for code>
- **Scale:** xs 12px, sm 14px, base 16px, lg 18px, xl 24px, 2xl 32px
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Line heights:** tight 1.2, normal 1.5, relaxed 1.75

### 2.3 Spacing (4px base)

`0`, `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`

### 2.4 Radius

`none` (0), `sm` (4px), `md` (8px), `lg` (12px), `full` (9999px)

### 2.5 Shadow

- `sm`: `0 1px 2px rgba(0,0,0,0.05)`
- `md`: `0 4px 6px rgba(0,0,0,0.1)`
- `lg`: `0 10px 15px rgba(0,0,0,0.1)`

### 2.6 Motion

- **Durations:** fast 150ms, base 250ms, slow 400ms
- **Easings:** `ease-out` (default), `ease-in-out` (transitions), `linear` (loaders)

---

## 3. Components

(For each: purpose, variants, states, accessibility notes)

### Button
- **Variants:** primary, secondary, ghost, danger
- **States:** default, hover, focus, active, disabled, loading
- **Accessibility:** focus-visible ring, disabled state has `aria-disabled`

### Input
- **Variants:** text, email, password, search
- **States:** default, focus, error, disabled
- **Accessibility:** label association, error message via `aria-describedby`, `aria-invalid`

### Card
- **Variants:** default, elevated, interactive (clickable)
- **Accessibility:** if interactive, behaves as button (keyboard, role)

### Modal / Dialog
- **States:** opening, open, closing
- **Accessibility:** focus trap, escape closes, backdrop click closes (configurable), `aria-modal=true`, focus restored to trigger

### Toast / Notification
- **Variants:** info, success, warning, error
- **States:** entering, present, exiting
- **Accessibility:** `role="status"` for non-critical, `role="alert"` for critical

### Empty State
- **Pattern:** icon + headline + description + primary action
- **Variants:** first-use, no-results, error

### Loading State
- **Patterns:** skeleton (preferred for content), spinner (for actions), progress (for known durations)

### Error Boundary
- **Pattern:** friendly message + retry action + technical details (collapsible)

---

## 4. Interaction Patterns

### Form validation
- Inline validation on blur; final validation on submit
- Error messages directly below the field
- Submit button disabled while form invalid AND user has interacted

### Async states
- Skeleton for >300ms expected load
- Spinner for action confirmation
- Optimistic UI for low-risk mutations; revert on failure

### Navigation
- Primary nav: persistent left sidebar OR top nav (project-specific)
- Breadcrumbs for nested pages
- Deep linking: every state should be URL-addressable

### Modals
- Focus trap; escape closes
- Backdrop click closes (UNLESS user has unsaved changes — confirm)
- Focus returns to trigger on close

### Empty / Loading / Error
- Always provide all three states for any data-driven view

---

## 5. Screens (per PRD user story)

(Sketch each story's screen in prose or ASCII; specify states)

### Story: <as a X I want to Y so that Z>

**Screen sketch:**
```
┌─────────────────────────────────┐
│ [Header]                        │
├─────────────────────────────────┤
│                                 │
│  [Primary content area]         │
│                                 │
│  [Secondary action]             │
└─────────────────────────────────┘
```

**States:**
- Default: <description>
- Loading: skeleton of primary content area
- Empty: empty-state component
- Error: error boundary

(Repeat per story)

---

## 6. Accessibility

- **Contrast:** WCAG AA — 4.5:1 for normal text, 3:1 for large text (>18pt or >14pt bold)
- **Focus indicators:** visible 2px ring on all interactive elements (`:focus-visible`)
- **Keyboard navigation:** tab order matches visual order; all actions reachable
- **Semantic HTML:** use native elements (button, a, input) before custom + ARIA
- **Screen reader:** landmark regions, heading hierarchy, ARIA when needed (modal, live regions)
- **Motion:** respect `prefers-reduced-motion`; disable non-essential animations

---

## 7. Default-Coverage (for UI/UX Reviewer)

This block exists because UI/UX Reviewer is industry-portable — it doesn't know whether the project is a dashboard, a marketing site, a mobile app, or something else. Designer is the per-project adapter. Without this block, Reviewer cannot fire its default-coverage pass and will return WRONG_AGENT → Designer.

### Routes to screenshot

(List each route + auth/admin gate. Source from PRD user stories.)

| Route | Gate | Notes |
|---|---|---|
| `/` | public | Landing / pre-auth |
| `/<route>` | auth | <description> |
| `/admin/<route>` | admin-only | Verify admin-visible vs. not-admin behavior |

### Responsive breakpoints to capture

- 375px (mobile)
- 768px (tablet)
- 1024px (laptop)
- 1440px (desktop)

(Drop any that don't apply — e.g., desktop-only admin tool.)

### Key states per route

For data-driven routes, capture all that apply:
- Empty (N=0)
- Loaded (representative N≥1)
- Loading (skeleton / spinner)
- Error (boundary)
- Success (post-action confirmation)

### Auth-state setup notes

- Test creds Reviewer needs: <e.g., `tests/.env.test` keys; or "use TEST_AUTH_BYPASS pattern from QE">
- Gate behavior to verify: <e.g., admin route returns 404 for non-admin>

---

## 8. Open Questions / Assumptions

- `[assumption]` <Item>: <reason no source>
- `[open from brief]` <Item flagged in intake-brief.md>

---

## Sign-off

- Designer self-check: <yes>
- Critic review pass: <yes/no, see critic-notes.md>
- Strategist confirmed design serves PRD goals: <yes/no>
- Architect confirmed design is implementable in chosen stack: <yes/no>
- User approved: <yes/no, timestamp, verbatim>
