# Lessons Learned — Example

Post-mortems with lessons. Critic + Org Designer write at retro phase. Read by all agents (filtered by relevance).

> **Format:** Per-project block with what happened, what we learned, what to do differently.

---

## example-podcast-app — failed at distribution (2025-08)

**Outcome:** Built and shipped MVP in 6 weeks. 0 users at 90 days. Killed the project.

**What worked:**
- Tech execution was clean
- Onboarding flow was smooth (small cohort tested)

**What failed:**
- We never validated distribution before MVP
- "Music fans on TikTok" turned out to mean "no specific channel reach"
- We assumed virality; got nothing

**Lesson:**
- Distribution-channel proof required before MVP scope-lock. "Word of mouth" and "TikTok" are not specific enough channels.
- If user can't name 10 people they'd send the launch link to, the idea isn't ready.

**Applied in:** Future Intake question bank update — added "first 10 users by name" as required Problem-Clarity item. Strategist now requires distribution sketch before PRD finalize.

---

## example-tools-cli — succeeded by ruthless scope (2025-09)

**Outcome:** Shipped in 2 weeks. Found product-market fit with 50 paying users in 60 days.

**What worked:**
- We cut to ONE feature (file conversion). Resisted urge to add bulk operations, presets, history, settings.
- Distribution was named day one (Hacker News + Twitter network of ~3000 devs)
- Pricing validated with 5 friend interviews before building

**What failed:**
- We added a settings panel in week 6 that nobody used. Wasted 3 days.

**Lesson:**
- Timeline-first scoping > feature-first scoping. "What can we ship in 2 weeks" produces sharper products.
- Validation interviews even with friends > guessing.

**Applied in:** Architect's MVP cut now defaults aggressive. Critic flags >5 features in v1 as scope-creep warning.

---

## example-onboarding-rebuild — wrong abstraction in v1 (2025-11)

**Outcome:** Shipped, but had to rewrite the auth/role layer in week 4 due to wrong abstraction picked at scoping.

**What worked:**
- Migration didn't break users (good migration discipline)
- Caught the issue before scaling

**What failed:**
- Architect picked a multi-tenant auth pattern based on "future SaaS plans" that weren't actually in PRD
- Single-tenant would have been correct for v1

**Lesson:**
- YAGNI. Don't build for hypothetical future plans not in PRD.
- "We might want X later" is not justification for building X now.
- Architect's stack picks should match PRD's actual scope, not user's daydreams.

**Applied in:** Architect's tech-strategy now must cite PRD section for any architectural style picked. Critic flags speculative-future architecture as warning.

---

## (Add real lessons as projects complete)

When a project hits `retro`, Critic + Org Designer write the entry. Provenance is implicit in the project header.
