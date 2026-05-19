# Decision Packet

**Format used by EA at every hard checkpoint.** Word budget: 250-400. If a packet would exceed, the artifact isn't ready — producer must tighten before EA delivers.

---

```
─────────────────────────────────────────────
DECISION PACKET — <project-slug>
Checkpoint: <from-phase> → <to-phase>
Prepared: <YYYY-MM-DD HH:MM>

▸ SUMMARY (3 bullets)
  - <Top-line decision baked in>
  - <Top-line decision baked in>
  - <Top-line decision baked in>

▸ KEY DECISIONS BAKED IN
  - <Specific decision 1, e.g., "Cut social sharing from MVP — deferred to v2">
  - <Specific decision 2, e.g., "Picked Next.js over native iOS — PRD requires browser">
  - <Specific decision 3>

▸ CRITIC FLAGS (<count>)
  ⚠ blocking: "<concern>" → <how addressed in artifact OR "not addressed; user decision required">
  ⚠ warning: "<concern>" → <addressed | deferred | not addressed>
  ⓘ fyi: "<concern>" → noted

▸ OPEN QUESTIONS (operator-blocking, <count>)
  OQ-<id> (operational | strategic): <one-line question>  → recommendation: <one-line>
  OQ-<id> (operational | strategic): <one-line question>  → recommendation: <one-line>

▸ ESCALATED OQs (NOT operator-blocking; engineering proceeds with workaround, <count>)
  OQ-<id> (commercial | clinical | legal): <one-line question>
    Resolver: <C-level | Clinical advisor | Legal>
    Workaround for engineering: <one-line — what dispatch does today>
    Status: ESCALATED — awaiting <resolver>
  (omit entire section if no ESCALATED OQs — cardinal-zero rule per protocols/decision-class-taxonomy.md §5)

▸ ARTIFACTS
  - <path/to/artifact-1.md> — <status>
  - <path/to/artifact-2.md> — <status>
  - critic-notes.md — current

▸ POST-APPROVAL CHANGES
  - <repo-relative-path> [CREATE|MODIFY|DELETE]
  - <repo-relative-path> [CREATE|MODIFY|DELETE] — <one-line rationale>

▸ RECOMMENDED ACTION
  <EA's recommendation in one sentence — typically "approve" with reasoning or "request changes" with specific item>

▸ YOUR OPTIONS
  [approve]      — Conductor advances; producer hands to next agent
  [request changes] — Specify what to change; producer re-runs
  [discuss]      — Open conversation; no advance until subsequent decision
  [reject]       — Producer re-runs from scratch
─────────────────────────────────────────────
```

---

## Variants by Checkpoint

### `intaking → briefed`
Recommended action emphasis: "approve brief OR request follow-up interview on dimensions <X>"

### `stratego → prd-ok`
Critic flags emphasis: distribution plan completeness, success metric specificity, persona concreteness

### `scoping → planned`
Critic flags emphasis: scope creep vs PRD, MVP cut justification quality, sequencing logic

### `planned → scaffold`
Recommended action emphasis: emphasizes "this writes files to <target repo>"; user must confirm target path

### `handed-off → shipped`
Critic flags emphasis: PRD acceptance criteria coverage, deviations from scope, live URL access verification

---

## Rules

- ONE recommended action, ranked first
- ALL Critic flags above `fyi` must be listed (blocking, warning)
- Word budget enforced — overflow means tighten artifact, not pad packet
- Never include raw artifacts in packet — link references only
- Never include speculation or "what if" branches — present what is, not what might be

## Rules — OPEN QUESTIONS vs ESCALATED OQs section split `[protocols/decision-class-taxonomy.md §5]`

**Purpose:** every OQ in any Strategist or Architect artifact carries a `decision_class` field (`operational | strategic | commercial | clinical | legal`) per `protocols/decision-class-taxonomy.md` §4. The packet renders OQs into TWO sections, never one:

- **`▸ OPEN QUESTIONS (operator-blocking)`** — OQs with `decision_class ∈ {operational, strategic}`. User decides; engineering dispatch is blocked on response. Conductor sets `state.json.blocked_on` per the existing flow.
- **`▸ ESCALATED OQs (NOT operator-blocking; engineering proceeds with workaround)`** — OQs with `decision_class ∈ {commercial, clinical, legal}`. Resolver is NOT operator (C-level, Clinical advisor, Legal). Each entry MUST name the engineering workaround that lets dispatch continue without the resolver's input. Status line reads `ESCALATED — awaiting <resolver>`. Conductor does NOT set `state.json.blocked_on` for ESCALATED OQs.

**Line format for OPEN QUESTIONS (operator-blocking):**
```
OQ-<id> (operational | strategic): <one-line question>  → recommendation: <one-line>
```

**Line format for ESCALATED OQs:**
```
OQ-<id> (commercial | clinical | legal): <one-line question>
  Resolver: <C-level | Clinical advisor | Legal>
  Workaround for engineering: <one-line — what dispatch does today>
  Status: ESCALATED — awaiting <resolver>
```

**Cardinal-zero rule:** if no ESCALATED OQs exist for this packet, omit the entire `▸ ESCALATED OQs` section. Do NOT render a "0 ESCALATED" line; omission is the convention per `agents/executive-assistant.md` rendering rules. The operator-blocking `▸ OPEN QUESTIONS` section is rendered even when count is 0 (the section is structurally required; the count line uses `(operator-blocking, 0)`).

**Forbidden:** rendering ESCALATED OQs in the same section as operator-blocking OQs. The split exists because the engineering-flow consequence is different — operator-blocking OQs gate `state.json.blocked_on`, ESCALATED OQs do not. EA's `/briefing`, `/queue`, `/inbox` surfaces apply the same split per `protocols/decision-class-taxonomy.md` §5.

**Forbidden:** ESCALATED OQ without a `Workaround for engineering:` line. If the engineering work genuinely cannot proceed without the commercial/clinical/legal answer, the slice is mis-scoped — split off the dependent surface and proceed with the independent portion. ESCALATED status without a workaround is a Critic blocking concern per the protocol §12 forbidden behaviors.

---

## Rules — POST-APPROVAL CHANGES section `[prd rev-4 §11 Risk 9]` `[scope rev-3 §2 M5.3.a]`

**Purpose:** enumerates every file the approval will write or modify in the user's repo. C1 (packet diff preview) renders this section verbatim in the Diff tab `[feature-brief F-D, bundle members]`. This section is **structured data, not prose** — it does NOT count against the 250–400 word budget `[scope rev-3 §2 M5.3.a]`.

**Line format:**
```
- <repo-relative-path> [CREATE|MODIFY|DELETE]
- <repo-relative-path> [CREATE|MODIFY|DELETE] — <one-line rationale>
```
The one-line rationale is optional; include it only when the change is non-obvious to the user (e.g., a cascade write the user might not anticipate). Keep rationale to one clause — no trailing prose `[scope rev-3 §2 M5.3.a]`.

**File-volume display rule:** if more than ~20 files, group by directory rather than listing individually:
```
- src/components/cockpit/ — 12 files [CREATE]
- src/lib/api/ — 4 files [MODIFY]
```
This prevents the alarming 100-files-listed UX risk flagged during cascade planning `[tech-strategy rev-3 Risk 9 mitigation]` `[scope rev-3 §2 M5.3.a]`.

**Empty-section semantics — fail-open (Risk 12):** if a packet describes a decision with no file-level changes (purely a state-machine advance, no commits), write:
```
▸ POST-APPROVAL CHANGES
  (no file-level changes)
```
Do NOT omit the section entirely. Omission is a Critic flag (warning severity, not blocking) and causes C1 to render "No file-level diff preview" with an anomaly log entry — approval is never blocked by a missing section `[tech-strategy rev-3 Risk 9 mitigation]` `[prd rev-4 §11 Risk 9]`.

**Author responsibility:** the packet author (EA at hard checkpoints; any agent writing a packet outside a hard checkpoint) is responsible for enumerating file changes. Enumeration is based on the artifact produced — list what the approval will actually commit, not a guess. If uncertain, list the files you know and note `(additional files possible — see <artifact>)` `[scope rev-3 §2 M5.3.b]`.
