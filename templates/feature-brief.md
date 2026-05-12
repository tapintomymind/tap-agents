# Feature Brief — <project-slug> / <feature-slug>

**Date:** <ISO timestamp>
**Intake interviewer:** <agent invocation reference>
**Mode:** feature
**Project:** `workspace/<project-slug>/`
**Conversation log:** `workspace/<project-slug>/features/<feature-slug>/conversation-log.md`
**Seed:** `workspace/<project-slug>/features/<feature-slug>/seed.md` (verbatim user prompt)

---

## Anchor Artifacts Read

*(Feature mode requires anchoring against existing project state. List the artifacts read and the revision/date stamp. If any are missing, fall through to project mode.)*

- `workspace/<project-slug>/prd.md` — rev. <N>, dated <YYYY-MM-DD>
- `workspace/<project-slug>/scope.md` — rev. <N>, dated <YYYY-MM-DD>
- `workspace/<project-slug>/tech-strategy.md` — rev. <N>, dated <YYYY-MM-DD>
- `workspace/<project-slug>/decision-packets/` — last 3: <packet ids>
- `workspace/<project-slug>/dissent-log.md` — <last entry date> | <not present>

---

## Tag Legend

- `[clear]` — Seed or anchor artifacts already covered this; no question asked
- `[clarified]` — Asked, user answered concretely, accepted
- `[assumed]` — Asked, user answer was inferential or based on educated guess
- `[open]` — Asked, user couldn't or wouldn't pin down despite pushback (max 2 rounds)

Critical dimensions are F-A, F-B, F-C, F-D. They MUST NOT be `[open]` to clear contract.

---

## F-A. Existing-State Anchoring *(critical)*

| Item | Tag | Content |
|---|---|---|
| Which user story this serves | `[]` | <PRD §5 story by number; or "new persona" with explicit naming> |
| OUT-of-v1 conflicts | `[]` | <Quote PRD §4 bullet being walked back, or "no conflict, confirmed against §4"> |
| Artifacts revised by this feature | `[]` | <PRD §X / scope.md milestone Y / design-spec component Z / new file at path> |
| Whose pain | `[]` | <Primary persona / secondary persona / new persona — name it> |

**Critical dimension — must NOT be `[open]` to clear contract.**

---

## F-B. Pain & Moat Fit *(critical)*

| Item | Tag | Content |
|---|---|---|
| Today's workflow this replaces | `[]` | <Step-by-step what user does TODAY without this feature> |
| Generic-tool substitutability | `[]` | <Could Linear/Notion/Github do this — yes/no, with reason> |
| Moat-deepener vs polish | `[]` | <Which one, with rationale> |
| Cost of not building it | `[]` | <What happens if this never ships> |

**Critical dimension — must NOT be `[open]` to clear contract.**

---

## F-C. Scale Headroom *(critical)*

| Item | Tag | Content |
|---|---|---|
| v2 sketch | `[]` | <What does v2 of this feature look like; additive or rewrite from v1?> |
| What this paints us OUT of | `[]` | <Future direction(s) this makes harder> |
| 10x scale check | `[]` | <Does data model / UX scale to 10x users x 10x projects; where it breaks> |
| Composition with roadmap | `[]` | <Three other roadmap features: composes / conflicts / neutral with each> |

**Critical dimension — must NOT be `[open]` to clear contract.**

---

## F-D. Bundle Framing *(critical)*

| Item | Tag | Content |
|---|---|---|
| Stand-alone or bundle | `[]` | <Stands alone / part of bundle of N> |
| Bundle members | `[]` | <If bundle: list each feature; mark which are in/out of this brief> |
| One-sentence pitch | `[]` | <The bundle name, e.g. "executive review session"> |
| Smallest coherent slice | `[]` | <The minimum that proves value — N features> |

**Critical dimension — must NOT be `[open]` to clear contract.**

---

## Reused Dimensions (Feature-Scoped)

### Scope Discipline (feature-level)

| Item | Tag | Content |
|---|---|---|
| Feature MVP | `[]` | <Smallest version of THIS feature that proves value> |
| Explicit cuts | `[]` | <What's NOT in v1 of this feature> |
| 2-week test | `[]` | <If hard 2-week deadline on the feature, what survives> |

### Success Definition (PRD KPI moved)

| Item | Tag | Content |
|---|---|---|
| PRD §7 KPI moved | `[]` | <Which existing KPI — return-rate, first-session completion, time-to-first-X — does this feature move> |
| Leading indicator for THIS feature | `[]` | <Earliest signal it's working> |
| Threshold for "ship vs cut" | `[]` | <Number that decides whether this feature stays in v1.5 or gets cut> |

### Constraints Compatibility (PRD §9)

| Item | Tag | Content |
|---|---|---|
| Privacy / data-handling | `[]` | <Compatible with PRD privacy posture? If not, surface explicitly> |
| Server-execution boundary | `[]` | <Stays within "no server-side execution" constraint? If not, propose alternative> |
| Budget | `[]` | <Within $-monthly cap from PRD §9 constraints?> |
| Platform / browser support | `[]` | <Within all-browsers / responsive constraint?> |

---

## Dependencies & Sequencing

*(Optional but recommended — captures what must be true upstream for this feature to be buildable.)*

| Dependency | Type | Status |
|---|---|---|
| <e.g. "Decision Packets must enumerate post-approval changes"> | Framework | <known yes / unknown / needs framework work> |
| <e.g. "DB schema needs `phase_history` column"> | Tech | <present / needs migration> |
| <e.g. "Feature X must ship first"> | Sequencing | <feature X status> |

---

## Risks Specific to This Feature

*(Beyond PRD-level risks, what does this feature uniquely introduce or amplify?)*

- <e.g. auto-approve rules dilute the calm-control brand>
- <e.g. live agent re-prompt requires server-side execution — kills it on PRD §4>

---

## Open Questions / Pushback Notes

<List any items where Intake hit pushback budget; where user couldn't pin down despite asking; where Intake noted a flag for downstream agents>

Example:
- F-C scaling answer stayed at "I think it'll be fine" after 2 rounds — Strategist may want to revisit during PRD-revision before committing to a data-model shape.
- Bundle framing landed but bundle name is provisional ("executive review session") — Strategist can rename for PRD-revision.

---

## Intake's Self-Assessment

- Critical feature dimensions clear: <yes/no — F-A, F-B, F-C, F-D>
- Reused dimensions clear/clarified: <X>/3
- Recommended next step: <ready for Strategist PRD-revision | ready for Strategist mini-PRD | needs more intake | escalate to user>
- Hand-off framing: <PRD revision | mini-PRD>

---

## Sign-off

User confirmed feature brief is correct: <yes/no, timestamp, verbatim approval>
