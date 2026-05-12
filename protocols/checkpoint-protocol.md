# Checkpoint Protocol

Defines when work pauses for user decisions vs. when it auto-advances. Calibrated for "CEO-style" reporting — minimal friction, maximum visibility on what matters.

## Two Types of Checkpoints

| Type | Behavior | Trigger | Output |
|---|---|---|---|
| **Hard** | Work stops; awaits user decision | 5 fixed phase transitions + retro | Decision Packet (EA) |
| **Soft** | System advances; logs notification | All other transitions | One-line entry (in next briefing) |

## The 5 Hard Checkpoints (Pipeline)

| # | Transition | Why hard |
|---|---|---|
| 1 | `intaking → briefed` | Brief is the contract for everything downstream — must be right |
| 2 | `stratego → prd-ok` | PRD is the product definition — top-priority approval |
| 3 | `scoping → planned` | Stack pick + MVP cuts feel irreversible — explicit go-ahead |
| 4 | `planned → scaffold` | Generates files in real project repo — needs explicit "go" |
| 5 | `handed-off → shipped` | Confirms MVP is live — not just claimed |

Plus #6 (user-triggered): `measured → retro`.

## Decision Packet (Every Hard Checkpoint)

EA delivers a Decision Packet using `templates/decision-packet.md`. Standardized 7-section format:

1. **Summary** — 3 bullets, what this checkpoint is approving
2. **Key decisions baked in** — specific decisions in the artifact
3. **Critic flags** — listed by severity (`blocking | warning | fyi`)
4. **Open questions** — unresolved items, marked deferral target
5. **Artifact references** — paths to the files involved
6. **Recommended action** — EA's default recommendation, ranked first
7. **Your options** — `[approve]` `[request changes]` `[discuss]` `[reject and revise]`

**Hard limit: 400 words.** If a Decision Packet would exceed, the artifact isn't ready — the producer needs to tighten before EA delivers.

## What is NOT a Checkpoint

These do not trigger Decision Packets:

- **Critic `warning` and `fyi` concerns** — included in next briefing or next Decision Packet, never their own interrupt
- **Org Designer proposals** — surfaced under "TEAM HEALTH" in briefings or via `/grow-team`; never mid-project
- **Soft transitions** — logged, summarized in next briefing
- **Routine Tier 2 reportbacks** — included in briefings unless they signal a problem

## User Response Recognition

EA recognizes these natural-language responses:

| Response intent | Sample words | Action |
|---|---|---|
| Approve | `approve`, `yes`, `lgtm`, `ship it`, `green light`, `go` | Conductor advances; logs approval verbatim in transition-log |
| Request changes | `change <X>`, `revise`, `tweak`, `but...` | Producer agent re-runs with feedback as input |
| Discuss | `discuss`, `let's talk`, `question:`, `why <X>` | Opens conversation; no advance until subsequent approval |
| Reject | `no`, `reject`, `back to drawing board`, `start over` | Producer agent re-runs from scratch with reset context |

Ambiguous responses trigger a clarifying question from EA before advancing. EA never assumes approval from silence or unrelated chat.

## Approval Logging

When user approves, EA records the **verbatim approval** in `state.json.history` and `transition-log.md`:

```json
"history": [
  ...,
  {
    "phase": "stratego",
    "exited": "2026-05-04T15:00:00Z",
    "approval_text": "looks great, ship it",
    "approver": "user"
  }
]
```

This protects against ambiguity later. "Did I approve this?" is always answerable from the log.

## Override Logging

If user overrides a Critic blocking concern as part of approval, the override is logged in `dissent-log.md`:

```
─────────────────────────────────────────────
2026-05-04 15:00
Type: critic-override-at-checkpoint
Project: music-discovery-2026
Checkpoint: stratego → prd-ok
Critic concern: "PRD lacks distribution plan beyond 'TikTok'"
User decision: Approve PRD anyway
User reasoning: "I'll figure out distribution after MVP"
Critic agreed? No (concern stands)
Will revisit at: shipped → measured (auto)
─────────────────────────────────────────────
```

This makes the trade-off visible to future-self and to Org Designer.

## Snoozing a Checkpoint

User can defer a Decision Packet:

> User: "snooze this until tomorrow morning"

EA:
1. Logs to `ea-state.json.deferred_items`
2. Confirms: "Snoozed. Will surface again at <timestamp>."
3. Project state remains in pre-checkpoint phase (e.g., `stratego` still, not `prd-ok`)
4. Other projects continue normally
5. Surfaces again at deferred-until timestamp via standard briefing or immediate alert

## What Happens If User Doesn't Respond

EA's stale-detection (see `ea-protocol.md`) fires:
- 48h after a hard checkpoint Decision Packet → re-surfacing in next briefing
- 7 days → escalation in briefing ("project paused on user decision for 7 days")

No auto-advance ever happens past a hard checkpoint, regardless of duration. The project sits where it sits until you decide.

## Multi-Project Checkpoint Handling

When multiple projects have pending hard-checkpoint decisions, EA presents them in a prioritized queue (see `ea-feed.md`). User can address them in any order. Queue priority is set by:

1. Project priority (`state.json.priority`)
2. Age (older first)
3. Dependency (a project blocking another goes first)

EA does not bundle multiple Decision Packets into one message — each gets its own to preserve focus.

## POST-APPROVAL CHANGES — author obligation `[prd rev-4 §11 Risk 9]` `[scope rev-3 §2 M5.3.b]`

Every Decision Packet MUST include a populated `▸ POST-APPROVAL CHANGES` section. The packet author — EA at hard checkpoints; any agent writing a packet outside a hard checkpoint — is responsible for enumerating the files the approval will write or modify in the user's repo.

**If the decision produces no file-level changes** (purely a state-machine advance with no commits), the section must read `(no file-level changes)`. Omitting the section entirely is a Critic **warning** (not a hard block). C1 (packet diff preview) fails open: it renders "No file-level diff preview for this packet" and logs an anomaly entry. Approval is never blocked by a missing or empty section `[tech-strategy rev-3 Risk 9 mitigation]` `[scope rev-3 §2 M5.3.a]`.

Full line-format spec and file-volume display rules are in `templates/decision-packet.md` §"Rules — POST-APPROVAL CHANGES section."

---

## Approval Logging — Bulk Approval (`BulkApprovalSession`, Pattern B) `[tech-strategy rev-3 Risk 10]` `[scope rev-3 §2 M5.3.c]`

When a user bulk-approves N packets in one verbatim "approve" action (via the C2 bulk-approve modal), the approval is recorded as a **`BulkApprovalSession`**, not as N independent approvals. This is Pattern B per Architect's decision `[tech-strategy rev-3 §3 Risk 10]`.

**Schema shape (from tech-strategy rev-3 §4):**
```
BulkApprovalSession
  - id (uuid, pk)
  - user_id (fk → User)
  - approval_text (text)   — the verbatim phrase typed once (e.g., "approve")
  - packet_ids (uuid[])    — list of N packet IDs in the session
  - created_at (timestamptz)
  - completed_at (timestamptz, nullable)
  - status (text)          — "in_progress" / "completed" / "partial_failure"
```

**Per-packet `transition-log.md` entry — extended shape for bulk sessions:**
```json
{
  "phase": "<phase>",
  "exited": "<ISO-ts>",
  "approval_text": "bulk_approval:<session_id>",
  "approver": "user",
  "bulk_approval_session_id": "<uuid>"
}
```
The `approval_text` field references the session by ID — the verbatim phrase is NOT duplicated to each packet row; it lives once in the `BulkApprovalSession` row `[tech-strategy rev-3 §3 Risk 10, Pattern B]`.

**Audit-trail invariant:** a user viewing a packet's history sees "approved as part of bulk session `<id>`" with a link to the session row, which shows: (a) the verbatim phrase typed, (b) `approved_at` timestamp, (c) all sibling packet IDs in the session. "Show me everything I bulk-approved on date X" is answerable from the session table without scanning individual transition rows `[tech-strategy rev-3 §3 Risk 10, audit-grouping argument]`.

**Backwards compatibility:** pre-v1.5 transitions all have `bulk_approval_session_id = NULL` (treated as single-packet approvals — correct). No data migration required. `BulkApprovalSession` table is empty until M5.5 ships `[tech-strategy rev-3 §3 Risk 10]`.

**Calm-brand rationale:** Pattern B records what actually happened — one typed approval covering N decisions. Pattern A (N copies of the same string) is mechanically inaccurate about the UX event. The verbatim-approval gate is TapHQ's most distinctive primitive; its audit trail must match its UX `[tech-strategy rev-3 §3 Risk 10, calm-brand argument]` `[prd rev-4 §3 brand posture]`.

**Partial-failure handling:** `BulkApprovalSession` rows where `status = 'partial_failure'` are an actionable error state — the UI must surface which packet commits failed and offer per-packet retry. Retry uses the existing idempotency key infrastructure per `[prd rev-4 §11 Risk 8]`.

---

## A4 Briefing — `last_reviewed_at` drives "since you last reviewed" `[tech-strategy rev-3 Risk 11]` `[scope rev-3 §2 M5.2]`

The "while you were away" briefing (A4) reads from the per-user server-stored `last_reviewed_at` field, **not** from the per-device `last_opened_at` cookie.

**Copy locked:** the briefing section header reads **"Since you last reviewed:"** — not "Since you last visited." The verb anchors on an intentional review action (opening the inbox or approving a packet), which is honest across multi-device users. "Since you last visited" is mechanically wrong for a user who opened the app on another device `[tech-strategy rev-3 §3 Risk 11]` `[prd §2 — Devon across multiple machines]`.

**Field semantics:**
- `User.last_reviewed_at` (timestamptz, nullable, server-stored) — set when the user takes an intentional review action: opens the decisions inbox OR approves or declines a packet (single or bulk). This is the canonical "since" timestamp used by the briefing.
- `last_opened_at` cookie (per-device, HTTP-only, SameSite=Lax) — set on every dashboard render. Used as a fallback only: if `last_reviewed_at` is NULL (fresh user who has never taken an inbox action), the briefing falls back to the per-device cookie. If both are NULL, the briefing renders "Welcome to TapHQ" `[tech-strategy rev-3 §3 Risk 11]`.

**The `last_opened_at` cookie is for analytics only** and does NOT drive briefing content in any state where `last_reviewed_at` is non-NULL `[tech-strategy rev-3 §3 Risk 11]`.

**Schema note:** `User.last_reviewed_at` column is added at M1 schema lock (preemptive per scope rev-3 §7 item 10); it remains NULL until M5.2 ships and a user takes their first inbox action.

---

## Critic Coordination — atomic cascade pass `[prd rev-4 §11 Risk 9]` `[tech-strategy rev-3 §3 Risk 9]`

Per-file Critic passes are **insufficient** for the C1 framework cascade. The cascade (`templates/decision-packet.md` + `protocols/checkpoint-protocol.md` + `design-spec.md` §3.11/§5.4 + `handoff-package.md` re-emit) must clear Critic **as a unit** (scope rev-3 §2 M5.3.f).

**Why per-file passes are insufficient:** Risk 9 explicitly calls out that staleness in any one artifact corrupts the whole — the C1 Diff tab has wrong or missing data if template and design-spec are out of step, even if each individually "passes" a file-by-file review. Silent inconsistency is the failure mode `[prd rev-4 §11 Risk 9]` `[tech-strategy rev-3 §3 Risk 9, Failure D]`.

**Critic atomic-pass checklist (M5.3.f):**
- [ ] `templates/decision-packet.md` `▸ POST-APPROVAL CHANGES` section present with correct line format and empty-section semantics.
- [ ] `protocols/checkpoint-protocol.md` §"POST-APPROVAL CHANGES — author obligation" present and consistent with template spec.
- [ ] `protocols/checkpoint-protocol.md` §"Approval Logging — Bulk Approval" present with `BulkApprovalSession` shape matching tech-strategy rev-3 §4.
- [ ] `protocols/checkpoint-protocol.md` §"A4 Briefing" present with `last_reviewed_at` / `last_opened_at` semantics matching tech-strategy rev-3 §3 Risk 11.
- [ ] `design-spec.md` §3.11 anatomy updated to include the Diff tab rendering `▸ POST-APPROVAL CHANGES`; §5.4 modal screen sketch updated to show Diff tab (Designer's artifact — not authored here).
- [ ] `workspace/<slug>/handoff-package.md` re-embeds rev-4 of all upstream artifacts; timestamp matches the latest cascade commit.
- [ ] No `[WIP]` markers anywhere in the cascade.

**If any checklist item fails, the entire cascade rolls back.** M5.4 (C1 implementation) cannot start while any sub-task is `[WIP]` or Critic-flagged `[scope rev-3 §2 M5.3 acceptance gate]` `[tech-strategy rev-3 §3 Risk 9 mitigation step 1]`.

---

## Forbidden Behaviors

- ❌ Conductor advancing a hard transition without explicit user approval
- ❌ EA suppressing a hard checkpoint to "smooth the flow"
- ❌ Inferring approval from silence
- ❌ Bundling unrelated decisions into one packet
- ❌ Decision Packets >400 words
- ❌ Auto-advancing past a stale checkpoint after any duration
- ❌ Omitting `▸ POST-APPROVAL CHANGES` from a packet without writing `(no file-level changes)` — Critic flags this as a warning; C1 logs an anomaly `[prd rev-4 §11 Risk 9]`
- ❌ Recording N copies of the verbatim approval phrase for a bulk-approve action (Pattern A) — protocol requires Pattern B (`BulkApprovalSession`) `[tech-strategy rev-3 Risk 10]`
- ❌ Driving the A4 briefing from `last_opened_at` when `last_reviewed_at` is non-NULL — cookie is analytics-only in that state `[tech-strategy rev-3 Risk 11]`
- ❌ Running per-file Critic passes on the cascade artifacts instead of the atomic cascade pass `[prd rev-4 §11 Risk 9]`
