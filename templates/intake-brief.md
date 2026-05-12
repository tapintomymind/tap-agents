# Intake Brief — <project-slug>

**Date:** <ISO timestamp>
**Intake interviewer:** <agent invocation reference>
**Conversation log:** `workspace/<slug>/conversation-log.md`
**Seed:** `workspace/<slug>/seed.md` (verbatim user prompt)

---

## Tag Legend

- `[clear]` — User's seed already covered this; no question asked
- `[clarified]` — Asked, user answered concretely, accepted
- `[assumed]` — Asked, user answer was inferential or based on educated guess
- `[open]` — Asked, user couldn't or wouldn't pin down despite pushback (max 2 rounds)

---

## 1. Problem Clarity

| Item | Tag | Content |
|---|---|---|
| Specific problem | `[]` | <Who has it, what is it, why it persists> |
| Current solutions | `[]` | <How they're solving it today> |
| Cost of not solving | `[]` | <What happens if this never gets built> |
| Why now | `[]` | <Why this hasn't already been built / why now is the moment> |

**Critical dimension — must NOT be `[open]` to clear contract for `briefed` phase.**

---

## 2. Scope Discipline

| Item | Tag | Content |
|---|---|---|
| Smallest viable version | `[]` | <The MVP — what proves the idea> |
| Explicit cuts (NOT in v1) | `[]` | <What user is willing to defer> |
| 2-week test | `[]` | <If hard 2-week deadline, what survives> |
| Must-haves vs nice-to-haves | `[]` | <Concrete delineation> |

**Critical dimension — must NOT be `[open]` to clear contract for `briefed` phase.**

---

## 3. Success Definition

| Item | Tag | Content |
|---|---|---|
| Concrete success metric | `[]` | <The one number that defines win> |
| Leading indicator | `[]` | <Earliest signal of working> |
| Lagging indicator | `[]` | <Confirmation of working at scale> |
| Threshold for "continue vs kill" | `[]` | <The number that decides v2 investment> |

**Critical dimension — must NOT be `[open]` to clear contract for `briefed` phase.**

---

## 4. Users and Distribution

| Item | Tag | Content |
|---|---|---|
| First 10 users (named) | `[]` | <By name or by specific channel> |
| Discovery mechanism | `[]` | <How they find out it exists> |
| Try-once trigger | `[]` | <What makes them try it> |
| Return trigger | `[]` | <What makes them come back> |

---

## 5. Technical Assumptions

| Item | Tag | Content |
|---|---|---|
| Riskiest technical bet | `[]` | <If this doesn't work, project dies> |
| Hidden complexity | `[]` | <What user assumes is easy that may not be> |
| Required data access | `[]` | <APIs, datasets, third-party deps; access guaranteed?> |
| In/out scope (auth, payments, etc.) | `[]` | <Standard infra in or out of v1> |

---

## 6. Constraints

| Item | Tag | Content |
|---|---|---|
| Time budget | `[]` | <Days / weeks / months> |
| Money budget | `[]` | <If any> |
| Team | `[]` | <Solo, with help, with team> |
| Platform | `[]` | <Must work on iOS / web / cross-platform> |
| Compliance / licensing | `[]` | <ToS, GDPR, music licensing, etc.> |

---

## 7. Existing State

| Item | Tag | Content |
|---|---|---|
| Existing assets | `[]` | <Code, designs, mockups, customers> |
| Replacing prior work? | `[]` | <If yes, what and why> |
| Prior attempt lessons | `[]` | <Anything user has tried before> |

---

## 8. Decision Rights

| Item | Tag | Content |
|---|---|---|
| Final approver | `[]` | <Just user, stakeholders, etc.> |
| Reversible vs one-way doors | `[]` | <Decisions where mistake is recoverable vs not> |
| Non-negotiables | `[]` | <What user will not compromise on> |

---

## 9. Compliance and Legal *(optional dimension — populate if relevant)*

| Item | Tag | Content |
|---|---|---|
| Regulatory considerations | `[]` | <If any> |
| Third-party ToS implications | `[]` | <APIs, scraping, redistribution> |
| Data privacy | `[]` | <PII handling, retention> |

---

## Open Questions / Pushback Notes

<List any items where Intake hit pushback budget; where user couldn't pin down despite asking; where Intake noted a flag for downstream agents>

Example:
- Target user definition stayed vague after 2 rounds of pushback. User says "music fans" — Strategist may need to revisit ICP definition before PRD.
- Tech stack constraint unstated; Architect should confirm with user before stack pick.

---

## Intake's Self-Assessment

- Critical dimensions clear: <yes/no — Problem Clarity, Scope Discipline, Success Definition>
- Total dimensions clear/clarified: <X>/8
- Recommended next step: <ready for Strategist | needs more intake | escalate to user>

---

## Sign-off

User confirmed brief is correct: <yes/no, timestamp, verbatim approval>
