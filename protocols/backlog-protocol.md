# Backlog Protocol

How ideas, required features, and tech debt flow into the team, get groomed, and become active work. Read by Conductor and Org Designer on every invocation.

> **One-line rule:** Every item that isn't being worked right now should be in a backlog file — never in a chat message that will be lost.

---

## 1. Two-Tier Separation

| Tier | File | Scope | Owner |
|---|---|---|---|
| **Tier 1** | `memory/backlog.md` + `workspace/_global/backlog.json` | Framework-wide: protocols, templates, agent contracts, cross-project patterns | Org Designer (with Conductor reading on dispatch) |
| **Tier 2** | `workspace/<slug>/backlog.md` | Project-specific: features, tech debt, mock-data swaps, Playwright tests, UI hookups | Conductor + Tier 2 team |

Create `workspace/<slug>/backlog.md` when a project's workspace is created. If it doesn't exist yet, create it before appending the first item.

---

## 2. How Items Enter

Any agent CAN add an item. No approval required to add — approval is required to work or close.

| Source | Mechanism |
|---|---|
| User (chat) | User says "add to backlog" or "track this for later" → Conductor appends to the appropriate file and confirms inline |
| User (slash command) | `/backlog <description>` → EA parses tier + priority, appends, confirms |
| Any agent | Append directly to the relevant tier file at the end of the agent's output phase |
| Incident | When `incidents.md` gains a new entry, the agent writing it checks: does the root cause require a backlog item? If yes, append with category `Audit-Gap` or `Pattern-Candidate` |
| Org Designer | Pattern-mining run (see §5) generates new items |

Entry format: see `memory/backlog.md §Entry Format`. All fields required. If priority is unknown, default to P2.

### 2.1 ID Allocation (load-bearing — codified 2026-05-06 after BL-017/BL-018 collision)

**Single shared monotonic namespace.** Tier 1 and Tier 2 items share one `BL-NNN` ID space, disambiguated by the `tier` field in `backlog.json`. There is no `BL-T1-NNN` or `BL-T2-NNN` namespace.

**Allocator algorithm (every agent appending an item MUST follow):**

1. Read `workspace/_global/backlog.json` items[] for max numeric `id` suffix.
2. Read `memory/backlog.md` for any IDs not yet mirrored to JSON.
3. Read `workspace/<slug>/backlog.md` for **every active project** in `workspace/_global/portfolio.json` for any IDs not yet mirrored to JSON.
4. Pick the next ID = `max(all observed BL-N suffixes) + 1`.
5. Append entry to the correct tier file AND mirror to `backlog.json` as the **same atomic unit** — never one without the other (per §8 anti-pattern "Skipping the JSON update").

**Why monotonic-shared:** an earlier collision pattern (orchestrator session allocated framework BL-017/BL-018 from JSON's then-max=16; project sessions had already allocated BL-017..BL-023 in `workspace/<slug>/backlog.md` but those Tier 2 items were never mirrored to JSON) demonstrates that any allocator that scans only one source-of-truth will collide whenever a Tier 2 session writes to MD without the same-atomic-unit JSON mirror update. Splitting namespaces does not fix the underlying staleness; it just makes the collision detection two-stage. Single namespace + mandatory full-scan + atomic JSON-MD pairing is the simplest correct rule.

**Collision recovery:** when a collision is detected (e.g., BL-017 used in two files), the LATER allocator MUST renumber. "Later" is determined by `added` date in the entry, then by file mtime as tiebreak. Update all references (other backlog files, agent contracts, workspace artifacts, CHANGELOG entries) to the new ID via `git grep -r "BL-NNN"`.

**Reference closing case:** the founding 2026-05-06T23-30 reconciliation pass renumbered framework BL-017 → BL-024 ("Session-tracking auto-seal P2-cluster") and framework BL-018 → BL-025 ("Claude Code hooks") because the project-MD allocation (BL-017..BL-023) had earlier `added` timestamps. See `workspace/_global/org-designer-proposals/20260506T2330-backlog-reconciliation.md` for the full status-drift + reconciliation log.

---

## 3. How Items Get Groomed

**Who:** Org Designer (primary). Backlog Curator when activated (see `agents/_planned/backlog-curator.md`).

**Cadence:** Weekly, coinciding with any project retro or `/grow-team` invocation. EA surfaces a backlog count in every briefing (counts from `workspace/_global/backlog.json`) — if P0 or P1 items are open and unassigned, they appear in DECISIONS NEEDED.

**Status vocabulary:** `open | in-progress | awaiting-acceptance | done | wontfix`. See §3a for the `awaiting-acceptance` sub-state semantics.

**Grooming actions:**
- **Re-prioritize:** if an item's context has changed (new incident, new user directive), update `priority` field.
- **Archive stale:** Tier 2 P3 items older than 90 days with no update → move to `## Archived` section in the relevant backlog.md. Never delete — audit trail preserved.
- **Propose activation:** if P0/P1 items keep being pushed session after session, Org Designer proposes a plan or stub-activation via `workspace/_global/org-designer-proposals/`.
- **Deduplicate:** if two items describe the same work, merge into the higher-priority one and note the merge in the entry's description.

Anti-pattern: never let the backlog become an undeleted dumping ground. If an item is clearly stale and wontfix, mark it `wontfix` with a one-sentence reason rather than leaving it `open`.

---

## 3a. Acceptance-gate sub-state

Items with explicit acceptance criteria (e.g., prod smoke gates, dogfood cycles, Phase 2 validation) sit in `awaiting-acceptance` after impl lands and before user sign-off. This separates "engineer is coding" from "queue is waiting on user" in BACKLOG SUMMARY counts.

**Transition rules:**

| From | To | Trigger |
|---|---|---|
| `open` | `in-progress` | Implementer agent dispatched and begins work (existing rule, unchanged) |
| `in-progress` | `awaiting-acceptance` | Implementation commits land on tier-2 integration branch (dev/QA) AND impl agent signals "ready for acceptance" via reportback OR commit message |
| `awaiting-acceptance` | `done` | User signs off on the item's explicit acceptance criterion (user-attended only — curator cannot autonomously transition here) |
| `awaiting-acceptance` | `in-progress` | Acceptance gate fails and rework is needed |
| `awaiting-acceptance` | `wontfix` | User decides not to validate (rare) |

Note: Items without acceptance criteria transition `in-progress → done` directly (existing pattern for chore/XS items, unchanged). Curator detects: if the item's `acceptance_criteria` field is set OR the impl agent's reportback signals "acceptance gate pending", use `awaiting-acceptance`; else skip.

---

## 4. How Items Get Worked

**Conductor's responsibility on every new agent dispatch:**

1. Read `memory/backlog.md` (Tier 1) and `workspace/<slug>/backlog.md` (Tier 2 for the active project).
2. Find items with `Status: open` that are relevant to the current transition phase and agent.
3. Include relevant items in the agent's brief as "Related backlog items — address if in scope."
4. When an item moves to `in-progress`, update the `Status` field in both the `.md` file and `backlog.json`.
5. When impl commits land on the tier-2 integration branch AND the item has an explicit acceptance criterion, transition `Status: awaiting-acceptance` in both files (curator can auto-detect this; see §3a). The item stays in this state until the user signs off on the acceptance criterion — Conductor surfaces it to the user via EA but does not advance autonomously.
6. When the user signs off on the acceptance criterion (or when no acceptance criterion was attached and the impl agent marks the work done), update `Status: done` in both files. Append a one-liner to `memory/agent-changelog.md` if the item was Tier 1.

**Moving Tier 2 items to active work:**
When Conductor decides a backlog item should be actively scheduled (not just "address if in scope"), it moves the item's status to `in-progress` and references it in the project's `state.json.current_work` field.

---

## 5. Org Designer Pattern-Mining Pass

During every retro and weekly grooming:

1. Scan `memory/incidents.md` for entries without a corresponding backlog item. Add `Audit-Gap` or `Pattern-Candidate` items for any that are missing.
2. Scan Tier 2 backlog files for items that have appeared in 3+ projects — those are candidates for Tier 1 framework changes.
3. Check: are any P0/P1 items 14+ days old with no progress? If yes, surface to EA for user decision (either work it or mark wontfix).
4. Update `workspace/_global/backlog.json` item_counts after any batch changes.

---

## 6. EA Briefing Integration

EA includes a **BACKLOG SUMMARY** section in every Executive Briefing and Session-Close Summary:

```
BACKLOG SUMMARY
  Tier 1: <N> open (P0: N, P1: N, P2: N, P3: N) · awaiting-acceptance: N
  Tier 2 (tapagents-app): <N> open (P0: N, P1: N, P2: N, P3: N) · awaiting-acceptance: N
  Needs your input: [list 1-3 items in `awaiting-acceptance`, each citing the acceptance_criteria verbatim]
  Needs input (blocked): [list 1-3 P0/P1 items the team cannot unblock alone — DNS, external account, etc.]
```

The status vocabulary for counts is `open | in-progress | awaiting-acceptance | done | wontfix`. The `awaiting-acceptance` count is surfaced distinctly from `in-progress` so the user can see at-a-glance which items are queue-blocked-on-user vs. queue-blocked-on-engineering. Cardinal-zero rule applies: omit the `· awaiting-acceptance: N` segment when N == 0, and omit the "Needs your input" line entirely when no items are in that state.

EA reads counts from `workspace/_global/backlog.json` (not by parsing markdown). "Needs your input" items are those in `awaiting-acceptance` where user sign-off is the only remaining unblock. "Needs input (blocked)" items are those where the team's path forward requires a user decision (e.g., "configure custom domain" needs DNS access; "demo video" needs user recording).

---

## 7. Backlog Curator Stub

`agents/_planned/backlog-curator.md` holds the provisional contract for a dedicated hygiene role.

**Until activation:** Org Designer covers this responsibility (one bullet in OD's contract: "Backlog grooming — weekly review of memory/backlog.md; archive stale, propose re-prioritization, propose stub-activation if P0/P1 items keep getting pushed").

**Activation trigger:** 20+ unactioned backlog items accumulate for 2+ weeks OR Org Designer flags backlog management as consuming >10% of OD's invocation time.

---

## 8. Anti-Patterns

- **Dumping without closing:** Adding items without ever marking done/wontfix. Org Designer watches for items older than 90 days at P3 with no update → archive.
- **Duplicate capture:** Same item in both chat and backlog.md. If it's in chat it's lost. Always write to the file.
- **Skipping the JSON update:** Updating backlog.md without updating backlog.json breaks EA's count-surfacing AND breaks the §2.1 ID allocator (next-ID determined by JSON max collides with un-mirrored Tier 2 IDs). Both files must stay in sync as one atomic unit.
- **Single-source ID allocation:** Picking the next ID by scanning only `backlog.json` (or only one backlog.md) without checking every active project's `workspace/<slug>/backlog.md`. Codified as collision-prone after the 2026-05-06 BL-017/BL-018 incident; see §2.1 for the canonical multi-file allocator.
- **Status drift:** Item ships in code (commit lands, prod merge confirmed) but `status` field in JSON/MD never updates. EA briefings then misreport "open" counts. Per §4: when impl commits land on the integration branch AND the item carries an acceptance criterion, the status moves to `awaiting-acceptance` (not silently to `done`); when the user signs off (or when no acceptance criterion was attached), then `done`. BOTH the markdown file AND `backlog.json` get updated in the same commit as the shipping work or the immediate follow-up — not "I'll get to it later." Auto-seal of `active-sessions.md` (per `protocols/session-coordination-protocol.md` Rule 1) does NOT auto-update backlog status — that remains the closing agent's responsibility.
- **Tier confusion:** A framework-wide pattern landing in a project's Tier 2 backlog (or vice versa). Conductor and Org Designer should re-tier during grooming.
- **Priority inflation:** Everything at P1. P0 means actively blocking a project today. P1 means it will be done in the next working session. If every item is P1, the signal is lost.

---

## 9. References

- `memory/backlog.md` — Tier 1 human-readable backlog
- `workspace/_global/backlog.json` — machine-readable mirror (EA reads for counts)
- `workspace/<slug>/backlog.md` — Tier 2 per-project backlog
- `agents/_planned/backlog-curator.md` — stub for dedicated hygiene role
- `agents/org-designer.md` — owns Tier 1 grooming
- `agents/conductor.md` — reads backlog before every dispatch
- `agents/executive-assistant.md` — surfaces BACKLOG SUMMARY in briefings
- `protocols/dispatch-efficiency.md` — briefing format reference
- `protocols/incident-protocol.md` — incident → backlog-item linkage
