# Incident Protocol

Defines the bug-to-incident learning loop — how a runtime error captured in tapagents-app (formerly agent-dashboard pre-2026-05-14 BL-059) (Tier 2) becomes institutional memory in the Tier 1 framework.

> **One-line rule:** Bugs flow down (Tier 1 controls the learning record). Tier 2 captures; Tier 1 learns. Auto-write from Tier 2 to Tier 1 never happens — promotion is manual paste.

---

## 1. Trigger — Bug Detected

A runtime error is written to the `bug_reports` table via one of three paths:

- **Server-side:** `withErrorCapture(handler)` wraps an API route. On thrown error or 5xx response, a sanitized row is inserted automatically. Every API route should be wrapped — the sweep at commit `fdc3b3f` covers all 9 current routes.
- **Client-side:** `src/app/error.tsx` (Next.js global error boundary) fires on unhandled client JS errors and POSTs to `POST /api/bugs/report`.
- **Synthetic ping:** `GET /api/admin/test-error?type=throw` (admin-only, returns 404 to non-admins). Lets the admin verify post-deploy that the capture pipeline still works end-to-end. Standard pattern — every observability stack has one.

No manual step required. Errors appear in the table immediately.

### 1.1 Sanitization Contract (load-bearing)

Per `tapagents-app/src/lib/error-capture.ts §"SANITIZATION CONTRACT"` (path reflects post-2026-05-14 BL-059 cascade-rename; was `agent-dashboard/`). Treat this as a security boundary, not a hint.

| Surface | Rule |
|---|---|
| Headers | Strip `Authorization`, `Cookie`, and every `x-*` header before storage. |
| Body | Redact any top-level key matching `/(SECRET\|TOKEN\|KEY\|PASSWORD)/i` to `***REDACTED***`. (Top-level only — we don't deep-traverse jsonb.) |
| Query params | Not logged. Only `URL.pathname` is stored in `bug_reports.route` — query string is dropped at capture time. |
| Sanitization failure | Store `null` in `request_payload`. Capture must never silently swallow the original error. |

If a new route handles secrets in a way these rules don't cover (form-data uploads, headers without the `x-*` prefix, deeply nested jsonb), update the sanitizer **before** wrapping the route. Capture-then-patch leaks; patch-then-capture is correct.

---

## 2. Triage — Admin Reviews in /admin/bugs

**Actor:** User (admin).
**Tool:** `https://<your-domain>/admin/bugs` (gated to `ADMIN_GITHUB_USER`).

1. Filter by status = **open** (default).
2. Scan list: timestamp, route, error_message (truncated), status badge.
3. Click a row to open the detail view: full stack trace, sanitized payload, user agent, environment, deployment ID.
4. Decide on action:
   - Clearly noise or duplicate → **Mark WontFix** (removes from active queue).
   - Needs investigation → **Mark Triaging** (signals in-progress).
   - Fix applied → **Mark Resolved** (after code fix is deployed).
   - Warrants institutional learning → continue to Step 3.

---

## 3. Promotion — Admin Clicks "Promote to Incident"

**Actor:** User (admin), from the detail view.
**Trigger:** Bug has learning value beyond the specific fix — root cause reveals a process gap, architectural assumption failure, or audit checklist gap.

1. Click **Promote to Incident** button in the detail view.
2. The endpoint (`POST /api/bugs/[id]/promote`) sets `promoted_to_incident = true` and returns a formatted markdown block:

   ```
   ## YYYY-MM-DD — <route>: <error_message>
   **What broke:** <error_message>
   **Root cause:** [fill in]
   **Fix:** [fill in — commit hash + brief description, or "outstanding"]
   **Lesson:** [fill in]
   **Pattern candidate:** Y/N — [if Y, brief proposed pattern name]
   ```

3. The markdown block appears inline in the admin UI.
4. **User fills in Root cause, Fix, Lesson, and Pattern candidate** (the fields the server cannot know).

---

## 4. Manual Paste — User Writes to incidents.md

**Actor:** User.
**File:** `memory/incidents.md` (Tier 1 framework — user-controlled, append-only).

1. Copy the filled-in markdown block from the admin UI.
2. Open `App Development/.claude/memory/incidents.md`.
3. Append the entry at the bottom. Never edit prior entries.
4. Commit to the `.claude` git repo.

**Why manual?** Tier 1 is the institutional memory of the engineering framework. Auto-writes from Tier 2 (a running web app) to Tier 1 (the team's source of truth) would make the framework dependent on the app's availability and auth context. The manual paste keeps Tier 1 user-controlled and auditable.

---

## 4.5 Conductor Auto-Triggers (parallel path — bypasses manual paste)

Not every incident enters via the user paste from `/admin/bugs`. Process-layer failures detected inside the framework are appended directly to `memory/incidents.md` by Conductor — the auto-write rule from §4 does not apply because these originate inside Tier 1, not in a Tier 2 runtime fault.

Per `agents/conductor.md` §"Incident Logging":

| Auto-trigger event | Fires when |
|---|---|
| `consistency_check_failed_blocking` | A consistency check produced a blocking contradiction that halted a project. |
| `wrong_agent_return` | An agent returned WRONG_AGENT on a task that should have been clearly in-scope. |
| `hard_checkpoint_blocked_unexpected` | A hard checkpoint was blocked by a contract failure that wasn't anticipated. |
| `tier2_reportback_blocked_24h_or_more` | A Tier 2 agent has been blocked for 24h+ with no resolution. |
| `user_dissent_fired` | User explicitly overrode a Conductor or Architect decision. |
| `audit_gap_caught_later` | A post-deploy bug whose root cause traces to an item a pre-launch audit should have caught. |

Conductor uses the same entry shape as user-pasted entries (§4) — same `What broke / Root cause / Fix / Lesson / Pattern candidate` structure. Conductor entries should be **filled completely** at append time (no `[fill in]` slots) since Conductor has full context. After appending, Conductor signals EA so the entry surfaces in the next briefing's RECENT INCIDENTS section (per `executive-assistant.md:59-61`).

This means `incidents.md` interleaves two sources: bug-promoted entries (user-pasted from /admin/bugs) and Conductor-appended entries (process failures inside the framework). Both follow the same shape so Org Designer can mine across both uniformly.

---

## 5. Pattern Detection — Org Designer Reviews incidents.md

**Trigger:** Org Designer fires at retro, `/grow-team`, or on EA-flagged team-health concern.

1. Org Designer reads `memory/incidents.md` as part of its standard "Read on Every Invocation" list.
2. Scans for recurring root-cause shapes:
   - Same process layer (e.g., "audit checklist didn't cover X" in 3+ incidents)
   - Same architectural assumption (e.g., "code assumed filesystem access" in 3+ incidents)
   - Same agent failure mode (e.g., "consistency_check_failed_blocking" on the same check 3+ times)
3. If 3+ incidents share a root-cause shape:
   - Proposes a new `memory/patterns.md` entry, OR
   - Proposes an audit-template update (e.g., add "filesystem dependency check" to the production-readiness checklist).
4. Proposal written to `workspace/_global/org-designer-proposals/<timestamp>-<topic>.md`.
5. EA surfaces proposal in next Decision Packet.

**Threshold rules:**

- **3 incidents = pattern proposal.** Proposes new entry to `memory/patterns.md` or audit-template update. Standard cadence.
- **1 incident = one-shot lesson allowed.** When the diagnosis is structurally complete from a single high-signal incident (e.g., 2026-05-05 scaffold path → Architect runtime-deps audit-checklist patch), Org Designer may propose an individual contract patch without waiting for N=3. Reserve for cases where the lesson is unambiguous; default to N=3 when in doubt.
- **2 incidents = watch.** Log, observe, do not propose yet. Pattern may or may not crystallize.

### 5.1 Quality Engineer (when activated)

Per `agents/_planned/quality-engineer.md`, the Quality Engineer stub will eventually own:

- **Bug reproduction** — for each incident entry, reproduce the bug from a fresh checkout when feasible and verify the fix actually closes the failure mode (not just suppresses the symptom).
- **Smoke-test pattern accumulation** — abstracts recurring runtime gotchas into reusable smoke-test recipes in `memory/test-patterns.md` and `memory/runtime-gotchas.md`.
- **Pre-ship gating** — once activated, the `handed-off → shipped` checkpoint will require a clean smoke-report against the deployed artifact.

Until QE activates (trigger conditions in `_planned/quality-engineer.md`), bug-reproduction sits with the user or with the Tier 2 implementer who fixed the bug. The protocol still works without QE; QE just makes the verification step formal and consistent.

---

## 6. Pattern Applied — User Approves Proposal

**Actor:** User, responding to EA Decision Packet.

1. Review Org Designer's proposal (pattern entry + affected files).
2. Approve OR reject via EA response.
3. If approved:
   - Org Designer appends entry to `memory/patterns.md`.
   - All subsequent agents inherit the pattern on next invocation (they read patterns.md).
   - Org Designer appends summary to `memory/agent-changelog.md`.

---

## Quick Reference — Roles per Step

| Step | Actor | Tool | Output |
|---|---|---|---|
| 1. Bug detected | withErrorCapture / error.tsx | Auto | `bug_reports` row |
| 2. Triage | User (admin) | /admin/bugs | Status update |
| 3. Promote | User (admin) | /admin/bugs | Markdown block |
| 4. Paste | User | Text editor + git | incidents.md entry |
| 5. Pattern detection | Org Designer | memory/incidents.md | Proposal file |
| 6. Pattern applied | User | EA Decision Packet | patterns.md entry |

---

## Anti-Patterns (the shapes that quietly break the loop)

### A1. Auto-writing to `memory/incidents.md` from Tier 2

**Don't.** The dashboard does not have write access to the Tier 1 framework. Every promotion goes through the user. The friction is a feature — it preserves the user's authority over what counts as institutional memory and prevents a runaway capture pipeline from flooding `incidents.md` with noise.

### A2. Promoting every bug

`/admin/bugs` will accumulate hundreds of entries over time. **Most should never be promoted.** Promote only bugs with a structural lesson — a checklist gap, a contract gap, a recurring shape. If you promote everything, signal-to-noise on `incidents.md` collapses and Org Designer's pattern-mining stops working.

### A3. Empty `[fill in]` slots in pasted entries

The promote markdown returns slots for Root Cause, Fix, Lesson, Pattern Candidate. These are **mandatory** — pasting a half-filled entry is worse than no entry. If you don't yet know the root cause, write `[under investigation, see commit X for triage notes]` rather than leaving it empty. The audit trail must be parseable by Org Designer's pattern-miner, not by humans only.

### A4. Editing prior entries

`incidents.md` is append-only. If a prior entry was wrong or has a follow-up, append a *new entry* referencing the old one. Editing past entries silently rewrites history and breaks the breadcrumb trail.

### A5. Promoting without a triage status update

If you promote a bug, also set its status to `triaging` or `resolved` — leaving it at `open` after promotion creates ghost entries (open bugs whose follow-up is in incidents.md but the dashboard still shows them as untouched). Status + promotion travel together.

### A6. Treating `wontfix` as a moral judgment

`wontfix` is a triage decision — "this bug exists, we know about it, we're not fixing it now." It does not mean the bug is unimportant. Wontfix bugs with structural lessons should still be promoted to incidents (e.g., "Scope decision: ship without retry. Lesson: …"). Status is orthogonal to whether the lesson is institutionally valuable.

### A7. Adding a new route without wrapping it

Every API route in the dashboard should be wrapped with `withErrorCapture` from day one. If you add a new route, add the wrapper in the same commit. Bolting on observability later means bugs in the unwrapped window vanish silently — and they're often the first bugs in a new feature, exactly when you most need the data.

---

## Non-Goals (what this protocol does NOT do)

- No auto-write from Tier 2 to Tier 1.
- No Sentry or third-party error platform — DB-backed only.
- No PagerDuty or alerting — bugs are reviewed asynchronously by admin.
- No automated escalation thresholds — user decides what to promote.
- Pattern mining is not real-time — fires at Org Designer cadence (retro / `/grow-team`).
- No deep-traversal sanitization on jsonb body. Top-level redaction only; nested secrets must be handled by the route author before the call site.

---

## References

- `memory/incidents.md` — the append-only incident log (Tier 1)
- `agents/conductor.md §Incident Logging` — Conductor's trigger events
- `agents/org-designer.md §Authority` — pattern-mining responsibility
- `agents/executive-assistant.md §Executive Briefing` — Recent Incidents section
- `agents/_planned/quality-engineer.md` — future bug-reproduction + smoke-test owner (stub-form, not yet activated)
- `protocols/dispatch-efficiency.md` — format reference for this document
- `src/lib/error-capture.ts` — server-side capture implementation (Tier 2)
- `src/app/error.tsx` — client error boundary (Tier 2)
- `src/app/api/bugs/[id]/promote/route.ts` — promote endpoint (Tier 2)
- `src/app/api/admin/test-error/route.ts` — synthetic capture ping (Tier 2)
- `drizzle/0002_mixed_red_hulk.sql` — bug_reports schema migration (Tier 2)
- **First incident under this protocol:** `memory/incidents.md` 2026-05-05 — Scaffold path fails on Vercel serverless
