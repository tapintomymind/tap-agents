# Scope — <project-name>

**Date:** <ISO timestamp>
**Author:** Architect (agent invocation reference)
**Source PRD:** `workspace/<slug>/prd.md`
**Status:** `[WIP]` | draft | approved
**Approved at:** <timestamp + verbatim approval, or blank>

---

## 1. MVP Cut

### Features IN MVP (from PRD §4)

1. <Feature> — <complexity estimate>
2. <Feature> — <complexity estimate>
3. <Feature> — <complexity estimate>

### Features CUT from MVP (with reason)

1. <Feature> — <reason: typically "deferred to v2 to ship in N weeks">
2. <Feature> — <reason>

**Note:** Cuts beyond what PRD already deferred MUST cite reasoning (timeline, complexity, risk). Critic flags scope creep where unjustified cuts appear.

**Cited inputs:** `[prd §4]`

---

## 2. Milestones

Sequential, each independently shippable.

### Milestone 1: <Name>
**Goal:** <Single sentence — what this proves>
**Includes:**
- <Component>
- <Component>
**Excludes:** <Things explicitly NOT in this milestone>
**Estimated effort:** <days/weeks>
**Validates:** <Which PRD acceptance criteria>
**Dependencies:** <None | Milestone X>

### Milestone 2: <Name>
**Goal:** <Single sentence>
**Includes:**
- <Component>
- <Component>
**Excludes:** <>
**Estimated effort:** <>
**Validates:** <Which PRD acceptance criteria>
**Dependencies:** <Milestone 1>

### Milestone 3 (MVP launch-ready): <Name>
**Goal:** Ship to first 10 named users
**Includes:**
- <Final integration>
- <Initial monitoring>
- <Deploy>
**Estimated effort:** <>
**Validates:** All PRD acceptance criteria
**Dependencies:** Milestones 1, 2

---

## 3. Sequencing Rationale

<Why these milestones are ordered this way — typically: dependency, risk-first, validation-first>

**Cited inputs:** `[prd §6 acceptance criteria]` `[inference]`

---

## 4. Riskiest Technical Bets (cross-ref tech-strategy.md)

Pulled forward from `tech-strategy.md` for visibility. Each bet has a milestone where it's first exercised.

| Bet | First exercised | Mitigation |
|---|---|---|
| <Risk> | Milestone X | <strategy> |
| <Risk> | Milestone X | <strategy> |

---

## 5. Open Questions for Tier 2

<Items deferred to implementation team — typically details that don't affect the plan but need decision during build>

- <Question>: <context, options>
- <Question>: <context, options>

---

## 6. Out of Scope for THIS Document

- Specific stack and library choices (`tech-strategy.md`)
- Implementation details within milestones (Tier 2)
- Test strategy (Tier 2)
- Deployment specifics (Tier 2)

---

## Sign-off

- Architect self-check complete: <yes>
- Critic review pass complete: <yes/no, see critic-notes.md>
- Citations verified: <yes/no>
- Cross-checked vs PRD §4 for scope creep: <yes/no>
- User approved: <yes/no, timestamp, verbatim approval>
