# Marketing Design Spec — <project-name> / <feature-name>

**Date:** <ISO timestamp>
**Author:** Marketing Designer (agent invocation reference)
**Source PRD:** `workspace/<slug>/prd.md`
**Source feature brief:** `workspace/<slug>/features/<feature-slug>/feature-brief.md` (if feature-scoped)
**Source brief:** `workspace/<slug>/intake-brief.md`
**Source competitor-eval:** `workspace/<slug>/competitor-eval.md` (or feature-scoped path)
**Status:** `[WIP]` | draft | approved
**Approved at:** <timestamp + verbatim approval, or blank>
**Pass:** <ISO timestamp — for append-only revision tracking>

---

## 1. Brand Posture

**Vibe:** <one line>
**Three adjectives:** <e.g., confident / technical / friendly>
**Anti-patterns:** <what we're explicitly NOT — e.g., "not enterprise corporate," "not crypto-bro," "not aggressive growth-hack speak">
**Target visitor profile:** <1-line funnel-top persona — cold visitor, not in-product user>

**Cited inputs:** `[brief: Decision Rights non-negotiables]` `[prd §Personas]` `[user]`

---

## 2. Tokens (Architecture choice + spec)

### 2.1 Architecture choice

- **Architecture:** A (unified tokens with marketing-mode overrides) | B (parallel token systems)
- **Rationale:** <why this architecture for this project>

**Default Architecture A** unless explicitly argued otherwise. Architecture A reuses product tokens with marketing-mode overrides (typically: bolder headline scale, looser spacing rhythm, brighter accent palette) while preserving brand-coherence at the primitive level. Architecture B (two parallel token systems) is reserved for cases where post-launch conversion data warrants aesthetic differentiation.

### 2.2 Color (overrides from product, if Architecture A; full token set if Architecture B)

| Token | Hex | Usage | Source (A: cite product token; B: independent) |
|---|---|---|---|
| `marketing-bg-primary` | `#FFFFFF` | Marketing surface background | A: overrides product `bg-primary` |
| `marketing-fg-primary` | `#0F172A` | Hero / value-prop text | A: reuses product `fg-primary` |
| `marketing-accent` | `#3B82F6` | Primary CTA, hero accent | A: overrides product `accent-primary` (brighter) |
| `marketing-accent-hover` | `#2563EB` | Primary CTA hover | A: reuses product `accent-hover` |
| `marketing-social-proof-bg` | `#F8F9FA` | Logo-wall, testimonial-card background | A: reuses product `bg-secondary` |

### 2.3 Typography (marketing scale generally bolder than product)

- **Family:** <e.g., same as product Inter, OR explicit override>
- **Hero scale:** <e.g., 64px desktop / 48px mobile — bolder than product `2xl` 32px>
- **Headline scale:** <e.g., 48px / 36px>
- **Subheadline scale:** <e.g., 24px / 20px>
- **Body scale:** <e.g., 18px / 16px — looser than product `base` 16px for marketing readability>
- **Weights:** 400 (regular), 600 (semibold for headlines), 700 (bold for hero)
- **Line heights:** tight 1.1 (hero), normal 1.4 (headlines), relaxed 1.6 (body)

### 2.4 Spacing (marketing rhythm generally looser than product)

- **Section spacing:** <e.g., 96px / 64px mobile — looser than product `48px` for section breathing room>
- **Block spacing:** <e.g., 48px / 32px>
- **Inline spacing:** reuses product spacing rhythm

### 2.5 Radius

<Marketing-mode overrides if any; default reuses product radius scale>

### 2.6 Shadow

<Marketing-mode overrides if any; default reuses product shadow scale>

### 2.7 Motion (marketing generally more expressive than product)

- **Hero entrance:** <e.g., 800ms ease-out fade-up>
- **Scroll-triggered reveals:** <e.g., 600ms ease-out fade-up on viewport entry>
- **CTA hover:** reuses product `fast` 150ms
- **Reduced-motion:** disable scroll-triggered reveals; respect `prefers-reduced-motion`

---

## 3. Components-extensions

For each marketing-specific component or variant. Cross-references to product components reused (cite `design-spec.md §3 Components` entries).

### MarketingHero

- **Purpose:** Above-the-fold composition — first-3-seconds comprehension surface
- **Variants:** typography-led / video-led / animation-led
- **States:** default (loaded), reduced-motion (no animation), narrow-viewport (mobile collapse)
- **Accessibility:** heading hierarchy starts H1 in hero; primary CTA is `<button>` or `<a>` (semantic per destination); hero video has `<track>` captions
- **Cited primitives:** `design-spec.md §3 Button (variant: primary)` — extends to `marketing-cta-button` (larger scale per §2.3)

### FeatureBlock

- **Purpose:** Feature-list section block
- **Variants:** icon + heading + 1-line / full image + heading + paragraph / video + caption
- **Layout:** alternating left/right / grid / single column
- **Accessibility:** landmark `<section>` with `aria-labelledby` per block heading

### SocialProofWall

- **Purpose:** Logo-wall, testimonial-card, customer-count callout
- **Variants:** logo-wall (grayscale logos in grid) / testimonial-card (quote + author + role) / customer-count (metric callout)
- **Position:** in-hero (compact) / post-hero (full-width) / mid-scroll / pre-footer
- **Accessibility:** logo images have alt text describing customer name; testimonial author has visible role + company

### CTABanner

- **Purpose:** Repeat CTA section between feature blocks and pre-footer
- **Variants:** centered single-CTA / split (headline + CTA right-aligned)
- **Cited primitives:** `design-spec.md §3 Button (variant: primary)`

### MarketingFooter

- **Purpose:** Public-surface footer (distinct from product app footer if any)
- **Sections:** product links / company links / resources / legal / social / newsletter signup / logo
- **Accessibility:** `<footer>` landmark; newsletter input has visible label

---

## 4. Page Specs

For each marketing page in scope. Add or remove pages per project's marketing surface.

### 4.1 `/` (Homepage)

- **Page narrative shape:** <story (problem → product → features → social-proof → CTA) | directory (nav-anchored sections) | hybrid>
- **Section list:**
  1. Hero (MarketingHero, variant: <typography-led | video-led | animation-led>) — primary CTA + secondary CTA
  2. Social-proof slot (SocialProofWall, variant: logo-wall) — <position: in-hero | post-hero>
  3. Feature blocks (FeatureBlock × N) — <layout: alternating | grid | single column>
  4. Mid-scroll CTA (CTABanner)
  5. Testimonials / case studies (SocialProofWall, variant: testimonial-card)
  6. Pre-footer CTA (CTABanner)
  7. Footer (MarketingFooter)
- **Asset references:**
  - Hero image/video: <path or "to be produced">
  - 60-second explainer medium: <video | animation | none>
  - Feature-block visuals: <list>
- **Mobile collapse:** hero text scale shrinks per §2.3; feature blocks collapse to single column at <768px; CTA stays primary

### 4.2 `/how-it-works` (if in scope)

- **Page narrative shape:** story (step 1 → step 2 → step 3 → CTA)
- **Section list:** <enumerate sections>
- **Asset references:** <list>
- **Mobile collapse:** <describe>

### 4.3 `/products` or `/solutions` (if in scope)

<Section list, asset references, mobile collapse>

### 4.4 `/pricing` (if in scope; gated on paid tier existence — coordinate with gtm-launch-strategist when activated)

<Section list, asset references, mobile collapse>

### 4.5 `/customers` or `/case-studies` (if in scope)

<Section list, asset references, mobile collapse>

### 4.6 `/blog` or `/docs` (if in scope)

<Section list, asset references, mobile collapse>

---

## 5. Conversion-Optimization Decisions

- **Primary CTA wording:** <e.g., "Start free" — rationale: from competitor-eval, 60% of refs use "Start free" vs "Get started" or "Try X free">
- **Primary CTA placement:** <e.g., right-aligned in hero, repeated every 3 sections, fixed-position on mobile scroll>
- **Secondary CTA:** <e.g., "Watch demo" — when scoped; never competing with primary CTA above the fold>
- **Social-proof strategy:**
  - Logo-wall position: <in-hero | post-hero>
  - Logo count: <e.g., 6-8 logos>
  - Testimonial format: <quote-card | video-card | case-study-link>
  - Customer-count callout: <e.g., "10,000+ developers" | none>
- **Hero composition rationale:** <e.g., "typography-led + secondary CTA — refs uniformly use typography-led for technical-audience products; video-led adds production cost without conversion lift per refs">
- **Funnel-stage messaging map:**
  - Cold visitor (top of funnel): <hero value-prop + social-proof>
  - Curious visitor: <feature blocks explaining the "what">
  - Considering visitor: <case-studies + pricing transparency>
  - Ready-to-sign-in visitor: <pre-footer CTA + footer CTA>

**Cited inputs:** `[competitor-eval.md §<axis>]` `[memory/audience-knowledge.md]` `[prd §Success Metrics]`

---

## 6. SEO + Indexing Posture

- **Public-vs-gated boundary signaling:** all marketing routes return `200` for logged-out + logged-in (no auth redirect from `/`); product-app routes return `302 → /login` for logged-out
- **noindex/canonical posture:**
  - `/` `<meta name="robots" content="index,follow">`
  - `/blog/<slug>` canonical to itself
  - Stub pages (e.g., `/coming-soon`): `<meta name="robots" content="noindex">`
- **robots.txt expectations:** allow `/`, `/products`, `/solutions`, `/pricing`, `/customers`, `/blog`, `/docs`; disallow `/admin/*`, `/api/internal/*` (handoff to Architect for implementation)
- **OG/Twitter card metadata per page:**
  - `og:title`, `og:description`, `og:image`, `og:url` per page
  - `twitter:card content="summary_large_image"` for homepage + featured pages
  - Image dimensions: 1200×630 for og:image (handoff to Architect for image-generation pipeline)
- **Sitemap.xml:** include all marketing routes; exclude gated routes (handoff to Architect)

---

## 7. Accessibility

- **Contrast:** WCAG AA — 4.5:1 for body text, 3:1 for large text (hero scale qualifies as large)
- **Focus indicators:** visible 2px ring on all interactive elements (CTAs, nav links, newsletter input) — matches product `design-spec.md §6` discipline
- **Keyboard navigation:** tab order follows visual order; all CTAs reachable; skip-to-content link on every page
- **Semantic HTML:** native `<button>`, `<a>`, `<input>`, `<section>`, `<footer>` — landmark regions per page
- **Screen reader:** heading hierarchy (H1 → H2 → H3); hero video has captions track; SocialProofWall logo images have alt text describing customer
- **Motion:** respect `prefers-reduced-motion`; disable scroll-triggered reveals + hero animation

---

## 8. Default-Coverage (for UI/UX Reviewer)

This block drives UI/UX Reviewer's screenshot pass at `handed-off → shipped` for marketing routes. Parallel to Designer's `design-spec.md §7` block for product routes. Without this block, Reviewer cannot fire its default-coverage pass on the marketing surface and will return WRONG_AGENT → marketing-designer.

### Routes to screenshot

| Route | Gate | Notes |
|---|---|---|
| `/` | public (200 for logged-out + logged-in) | Homepage — primary marketing surface |
| `/how-it-works` | public | Story-shape narrative |
| `/products` | public | Feature breakdown |
| `/pricing` | public (if in scope) | Pricing transparency |
| `/customers` | public | Social proof |
| `/blog` | public (if in scope) | Content marketing |
| `/docs` | public (if in scope) | Self-serve onboarding |

(Drop any routes not in scope for this milestone.)

### Responsive breakpoints to capture

- 375px (mobile)
- 768px (tablet)
- 1024px (laptop)
- 1440px (desktop)

### Key states per route

For each route, capture:
- Default (above-the-fold, default scroll position)
- Scroll-deep (below the fold — feature blocks + social proof + CTA)
- Mobile-collapsed (responsive collapse at 375px)
- Auth-aware-redirect verification: confirm `/` returns 200 for both logged-out and logged-in (does NOT redirect logged-in users to dashboard from `/`)

### Auth-state setup notes

- All marketing routes capture in **logged-out state**
- Additionally capture `/` in **logged-in state** to verify auth-aware-redirect behavior (logged-in users should still see marketing surface, not be redirected to `/dashboard` from `/`)

---

## 9. Competitor-Eval Reference

**Citation to `competitor-eval.md`:** `workspace/<slug>/competitor-eval.md` (or feature-scoped path)

### Top 3 patterns adopted (shape-only — external names appear in eval doc for audit only, never in this section)

1. <Pattern shape, e.g., "Logo-wall positioned post-hero, 6-8 logos in grayscale grid"> — rationale: <e.g., "majority of open-core business-model refs use this pattern; converts cold-visitor skepticism into credibility in <1 scroll">
2. <Pattern shape, e.g., "Typography-led hero with secondary 'Watch demo' CTA"> — rationale: <e.g., "video-led heroes add production cost without conversion lift for technical audiences per eval">
3. <Pattern shape, e.g., "Pricing transparency with public per-tier rate cards"> — rationale: <e.g., "refs that hide pricing see longer consideration cycles; open-core audience expects upfront pricing">

### Top 3 patterns rejected

1. <Pattern shape, e.g., "Modal lead-capture forms on scroll"> — rationale: <e.g., "interrupts cold-visitor read; refs that don't use this convert at higher rates for self-serve audiences">
2. <Pattern shape, e.g., "Multi-CTA in hero (3+ primary buttons)"> — rationale: <e.g., "decision paralysis; refs uniformly use single primary CTA + optional secondary">
3. <Pattern shape, e.g., "Carousel-based feature blocks"> — rationale: <e.g., "carousel-blindness on cold-visitor scroll; static feature blocks scan faster">

---

## 10. Open Questions / Assumptions

- `[assumption]` <Item>: <reason no source>
- `[open from brief]` <Item flagged in feature-brief.md>
- `[research needed]` <Item that requires fresh competitor-eval or user-research input>

---

## Sign-off

- Marketing Designer self-check: <yes>
- Critic review pass: <yes/no, see critic-notes.md>
- Strategist confirmed design serves PRD goals: <yes/no>
- Architect confirmed design is implementable (route scaffolding + SEO infra): <yes/no>
- Designer confirmed lane-discipline (no overlap with product UX): <yes/no>
- PMM confirmed voice/positioning alignment: <yes/no>
- User approved: <yes/no, timestamp, verbatim>
