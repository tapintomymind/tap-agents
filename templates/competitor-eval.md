# Competitor Evaluation — <project-name> / <feature-name>

**Date:** <ISO timestamp>
**Author:** Marketing Designer (agent invocation reference)
**Time-box:** 30 minutes (hard limit per `agents/marketing-designer.md` Operating Principle 6)
**Pass:** <ISO timestamp — for append-only revision tracking>

---

## Brand-integrity rule (read before authoring)

External product names appear in this file **for audit purposes only**. The shipping artifacts (`marketing-design-spec.md`, the actual marketing surface code) **NEVER** carry external product names. Per `feedback_tapagents_brand_integrity.md` — adopt techniques but never carry external product names, command names, or anti-pattern labels into shipping artifacts. Shape-only adoption.

Critic enforces at plan-axis review. Any external name surfacing in `marketing-design-spec.md` or rendered code = `blocking`.

---

## Reference-set priority (open-core business-model analogs first)

TapAgents' positioning challenge: **open-source dev tool + paid hosted SaaS**. Reference selection prioritizes business-model analogs over visual-polish-only references.

### Tier-A — Open-core business-model analogs (PRIMARY)

These products solve the same go-to-market challenge — converting developer-as-cold-visitor into self-hosted-trial or paid-cloud-signup. Marketing surfaces already A/B'd against the audience TapAgents targets.

- **Supabase** — `supabase.com` — open-core (PostgreSQL + auth + storage) + paid hosted
- **PostHog** — `posthog.com` — open-core (product analytics) + paid hosted
- **Cal.com** — `cal.com` — open-core (scheduling) + paid hosted
- **Inngest** — `inngest.com` — open-core (workflow engine) + paid hosted
- **Trigger.dev** — `trigger.dev` — open-core (background jobs / cron / workflows) + paid hosted

### Tier-B — Visual polish, business-model less aligned (DE-PRIORITIZE for business-model decisions)

Useful for hero composition, scroll narrative, modern visual register — but business model (closed-SaaS-with-free-tier) doesn't map cleanly to open-core. Use for visual reference only.

- **Linear** — `linear.app` — closed-source SaaS
- **Vercel** — `vercel.com` — closed-source SaaS with generous free tier

### Tier-C — Brand aesthetic (when target persona is technically sophisticated)

- **Anthropic** — `anthropic.com` — brand-aesthetic reference for sophisticated technical audiences

### Tier-D — Project-specific tertiary references

- <Add any project-specific references the brief calls out — e.g., Bridgemind.ai>

---

## 8-axis rubric (per reference site)

For each reference site evaluated, produce observations on these 8 axes. Target 5-10 pattern observations per pass total (not per reference). Time-box 30 minutes total.

### Axis 1 — Hero composition

- **Hero type:** typography-led / photography-led / video-led / animation-led
- **Value-prop phrasing structure:** subject-verb-object / problem-solution / before-after / benefit-feature
- **Primary CTA placement:** in-hero right / in-hero center / below-hero
- **Secondary CTA presence/absence:** if present, position and copy
- **Social-proof slot in hero:** yes/no; if yes, format (logo-strip / customer-count / testimonial-quote)

### Axis 2 — Value-prop phrasing structure

- **One-sentence pitch shape:** subject-verb-object / problem-solution / before-after / benefit-feature
- **Voice register:** direct / technical / aspirational / playful

### Axis 3 — Social-proof placement

- **Logo wall position:** in-hero / post-hero / mid-scroll / pre-footer
- **Testimonial format:** quote-card / video-card / case-study-link / none
- **Customer-count or revenue metric callouts:** yes/no; if yes, format

### Axis 4 — CTA hierarchy

- **Single primary CTA or multi-CTA:** single / multi
- **Repeat-CTA frequency:** every section / every 3 sections / only header + footer / sticky-on-scroll
- **CTA copy:** verbatim copy (e.g., "Get started" / "Start free" / "Try X free" / "Sign up")

### Axis 5 — Feature-block density

- **N feature blocks:** count
- **Block format:** icon + heading + 1-line / full image + heading + paragraph / video + caption
- **Layout:** alternating left/right / grid / single column

### Axis 6 — Scroll narrative shape

- **Narrative type:** story (problem → product → features → social-proof → CTA) / directory (nav-anchored sections) / hybrid
- **Transitions:** animated / static / scroll-triggered reveals

### Axis 7 — Footer pattern

- **Link categories:** product / company / resources / legal — count + composition
- **Social links:** yes/no; if yes, position
- **Newsletter signup:** yes/no; if yes, format
- **Logo placement:** top-left / center / bottom
- **Footer-CTA repeat:** yes/no; if yes, copy

### Axis 8 — Mobile collapse behavior

- **Hero text size shrink:** ratio (e.g., 64px → 40px)
- **CTA placement on mobile:** sticky / inline / footer-only
- **Feature-block layout on narrow widths:** single column / two-up
- **Nav drawer pattern:** hamburger / inline / hidden

---

## Observations (5-10 patterns per pass — append-only)

Each observation cites: reference + axis + observation date.

### Observation 1

- **Reference:** <product name + URL + section>
- **Axis:** <1-8>
- **Observation:** <one sentence pattern>
- **Observation date:** <ISO timestamp>
- **Significance:** <why this pattern matters for the TapAgents marketing surface>

### Observation 2

<Same shape>

### Observation 3

<Same shape>

### ... (continue to 5-10 observations total)

---

## Synthesis — top patterns to adopt + reject

This synthesis flows into `marketing-design-spec.md §9 Competitor-Eval Reference` (shape-only — no external names in the spec).

### Top 3 patterns to adopt

1. **Pattern shape:** <e.g., "Logo-wall positioned post-hero, 6-8 logos in grayscale grid">
   - **Adoption rationale:** <e.g., "X of Y open-core business-model refs use this pattern; converts cold-visitor skepticism into credibility in <1 scroll">
   - **Refs supporting:** <list reference names — internal audit use only>

2. **Pattern shape:** <e.g., "Typography-led hero with secondary 'Watch demo' CTA">
   - **Adoption rationale:** <rationale>
   - **Refs supporting:** <list>

3. **Pattern shape:** <e.g., "Pricing transparency with public per-tier rate cards">
   - **Adoption rationale:** <rationale>
   - **Refs supporting:** <list>

### Top 3 patterns to reject

1. **Pattern shape:** <e.g., "Modal lead-capture forms on scroll">
   - **Rejection rationale:** <e.g., "interrupts cold-visitor read; refs that don't use this convert at higher rates for self-serve audiences">
   - **Refs avoiding:** <list>

2. **Pattern shape:** <e.g., "Multi-CTA in hero (3+ primary buttons)">
   - **Rejection rationale:** <rationale>
   - **Refs avoiding:** <list>

3. **Pattern shape:** <e.g., "Carousel-based feature blocks">
   - **Rejection rationale:** <rationale>
   - **Refs avoiding:** <list>

---

## Memory append candidates

If any observations crystallize into reusable cross-project patterns, append to `memory/ui-references.md` (marketing-class entries) with provenance per the Memory File Authority section in `agents/marketing-designer.md`. Each entry: name + URL + why-on-list + what-pattern-to-borrow + `<project-slug> YYYY-MM-DD — <competitor-eval pass>`.

Candidates flagged this pass:

- <Reference name + URL + one-line why-pattern-is-canon-worthy>

---

## Sign-off

- Marketing Designer self-check: <yes>
- Time-box adherence: <minutes used / 30-min limit>
- Brand-integrity scan: <verified no external names will surface in marketing-design-spec.md or rendered code>
- Critic review pass: <yes/no, see critic-notes.md>
- Pattern observations count: <N> (target 5-10)
- Refs evaluated: <N> (target 3-5 from Tier-A, optional Tier-B/C if visual-polish reference needed)
