# Telemetry Events Protocol

**Owner:** Org Designer (schema). Critic enforces additive-only changes at every release review.
**Status:** Active 2026-05-12 — v0.10.0 (BL-035); extended 2026-05-12 in v0.11.0 to cover all seven hooks + classifier-feedback loop.
**Storage:** `<workspace>/_global/events.jsonl` — single per-workspace append-only log. Sibling `<workspace>/_global/misfires.jsonl` for hook-internal exceptions (v0.11.0).

---

## §1 Why this exists

Hooks know things about the session that the orchestrator can't easily see — every dispatch-gate block, every prompt-router classification, every hook misfire. Without a structured trail, those signals stay invisible: the only way to know the orchestrator hit the dispatch wall five times today is to read every hook's stderr in order.

The telemetry layer is the structured trail. Hooks emit JSON-line events to a shared per-workspace file. Other surfaces (Stop hooks, EA briefings, dashboards, the upstream `tapagents-app` product, formerly `agent-dashboard` pre-2026-05-14 BL-059) read the file. The schema is intentionally minimal and frozen — additive-only changes — so consumers written today still parse events written tomorrow.

This is the **shape** layer. State (which milestone we're on, which agent is blocked, etc.) lives in `state.json`. Telemetry captures the events that move state forward, not state itself.

## §2 Schema (frozen for v0.10.0)

Every event is one JSON object per line:

```json
{
  "ts": "2026-05-12T03:14:00Z",
  "session_id": "<from-hook-payload-or-unknown>",
  "source": "orchestrator-dispatch-gate",
  "type": "block",
  "subtype": "edit",
  "agent_context": "orchestrator",
  "agent_type": null,
  "agent_id": null,
  "payload": {
    "tool_name": "Edit",
    "summary": "Edit on /path/to/file.ts"
  }
}
```

### §2.1 Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `ts` | string | yes | UTC ISO-8601 with `Z` suffix (e.g. `2026-05-12T03:14:00Z`). Not `+00:00`. |
| `session_id` | string | yes | From Claude Code hook payload's `session_id` field. `"unknown"` if absent. |
| `source` | string | yes | Hook / emitter name. Today: `"orchestrator-dispatch-gate"`. Future emitters add their own names; don't reuse. |
| `type` | string | yes | High-level event class. Today: `"block"`. Reserved future values: `"pass"`, `"fire"`, `"classify"`, `"misfire"`. Consumers should pattern-match defensively. |
| `subtype` | string | yes | Qualifier within type. For dispatch-gate blocks: `"edit"`, `"write"`, `"notebook-edit"`, `"bash-mutate"`. |
| `agent_context` | string | yes | `"orchestrator"` if the call came from the main thread; `"subagent"` if from within a subagent (Task tool). Derived from PreToolUse payload's `agent_id` / `agent_type` per the [Claude Code hooks spec](https://code.claude.com/docs/en/hooks.md). |
| `agent_type` | string \| null | yes | Subagent type name when `agent_context == "subagent"`; `null` otherwise. |
| `agent_id` | string \| null | yes | Subagent id when available; `null` otherwise. |
| `payload` | object | yes | Free-shape dict. Keys vary by emitter. See §2.2. |

### §2.2 Reserved payload keys

`payload.summary` is reserved across all event types. Format: a short human-readable string (≤ 200 chars; truncated with `…` if longer). Don't dump full commands, file contents, or stack traces — telemetry is for shape, not state.

`payload.tool_name` is reserved when the event references a specific Claude Code tool (Edit, Write, Bash, etc.).

Emitter-specific extras are allowed in `payload.*`. Consumers should ignore unknown keys.

### §2.3 What we emit today (v0.11.0)

v0.11.0 extends v0.10.0 from one emitter to seven — every hook in the framework now writes to events.jsonl plus one new hook (`prompt-router-feedback`). Misfires (uncaught exceptions inside hook `main()` bodies) land in `misfires.jsonl` per §3.4.

| `source` | `type` | `subtype` values | Emitted by | Cadence |
|---|---|---|---|---|
| `orchestrator-dispatch-gate` | `block` | `edit`, `write`, `notebook-edit`, `bash-mutate` | `hooks/orchestrator-dispatch-gate.py` | every `return 2` |
| `pre-tool-gate` | `block` | `env-edit`, `force-push`, `rm-rf`, `sudo-rm`, `chmod-777`, `contested-artifact`, `seed-immutable`, `file-protection` (fallback), `bash-dangerous` (fallback) | `hooks/pre-tool-gate.py` | every block |
| `version-gate` | `block` | `atomicity`, `sequence`, `severity-floor`, `matchup` | `hooks/version-gate.py` | every block |
| `stop-critic-check` | `block` | `blocked-on`, `contested`, `critic-blocking` | `hooks/stop-critic-check.py` | one event per distinct issue when Stop is blocked |
| `session-start-brief` | `fire` | `startup`, `resume`, `clear`, `compact` | `hooks/session-start-brief.py` | every SessionStart |
| `prompt-router` | `classify` | `implement`, `side`, `status`, `slash`, `ack`, `silent` | `hooks/prompt-router.py` | every UserPromptSubmit |
| `prompt-router-feedback` | `nudge_ignored` | `side-not-parked`, `implement-not-dispatched` | `hooks/prompt-router-feedback.py` | only when previous-turn nudge was clearly ignored |
| `stop-dispatch-monitor` | `rollup` | `below-threshold`, `threshold-tripped` | `hooks/stop-dispatch-monitor.py` | every Stop |
| `<any>` | `misfire` | `<ExceptionClassName>` | top-level wrap in every hook | every uncaught exception in `main()` (writes to `misfires.jsonl`) |

We do **not** emit on pass-through where it would be uninteresting:
- `pre-tool-gate`, `version-gate`, `orchestrator-dispatch-gate` — silent on pass (only `block` is emitted).
- `stop-critic-check`, `stop-critic-check`'s anti-loop short-circuit — silent.
- `prompt-router` and `session-start-brief` — emit on EVERY fire (one classify per turn, one fire per session-start); these are high-signal-per-row and dashboard wants the full distribution.
- `stop-dispatch-monitor` — emits on every fire (including below-threshold); this is the only way to know whether the threshold trips in practice.

### §2.4 Reserved next-slice names

Categories reserved for the broader telemetry layer. Status per triple:

- `subagent-dispatch` / `outcome` / `<verdict>` — Task tool outcome per dispatch (success / blocked / declined). **RESERVED — not live.** Deferred to slice S1b: a Stop hook has no reliable, non-heuristic signal for per-dispatch verdicts (the Stop payload does not enumerate Task tool calls or their return shapes), so emitting it would require transcript-scraping guesswork. Producers MUST NOT emit until the S1b implementation lands.
- `slash-command` / `fire` / `<command-name>` — every slash-command invocation. **RESERVED — not live.**
- `state-machine` / `transition` / `<from>-<to>` — state.json phase changes captured by a Stop hook. **LIVE since v0.25.0** (M-D track slice S1). Producer: `hooks/stop-phase-transition.py`, wired into the Stop chain. Emits one event per genuine `current_phase` change (diffed against the `<workspace>/_global/.phase-snapshot.json` sidecar); silent on first-seen bootstrap and no-change. `payload` carries `project_slug`, `from_phase`, `to_phase`, `phase_status`. Consumers MAY parse these defensively per §5.
- `session-work-output` / `summary` / `seal` — what a session actually *produced* (product files touched + committed lines-of-code) captured at session seal. **LIVE since v0.26.0** (M-D track slice B). Producer: `hooks/session-tracking-seal.py` (`_emit_work_output`), the same Stop hook that emits the lifecycle `fire` events. This is a DELIBERATELY SEPARATE stream from the cross-cutting collision manifest (`active-sessions.md` / `is_cross_cutting_path()`), which stays framework-files-only; product `src/` work-output rides here, not there. Full schema in §2.6. Consumers MAY parse defensively per §5.

When a next-slice author lands a reserved triple, flip its status here; this section is the canonical list of source-type-subtype triples in use.

### §2.5 Reserved next-slice: `docs-research-call` (SPEC ONLY — added 2026-05-18)

**Status.** Schema reserved here; hook implementation is a separate dispatch and not live in any current release. Consumers MAY parse `docs-research-call` events defensively per §5 once they begin appearing; producers MUST NOT emit them until the implementation dispatch lands.

**Purpose.** Feeds the measurement follow-up in `protocols/docs-research-protocol.md §5` — replaces the `[inference]` order-of-magnitude token estimates with measured medians once N≥5 calls have been logged. Critic's docs-research review uses §5 token rationale checks once measured figures land.

**Triple.** `source` / `type` / `subtype`:

- `source: "docs-research"` — agent-emitter for any tool call in scope of `protocols/docs-research-protocol.md §2` routing
- `type: "call"` — single successful research call
- `subtype: "context7" | "websearch" | "webfetch"` — which transport answered

**Event shape (within the §2 schema):**

```json
{
  "ts": "2026-05-19T14:22:00Z",
  "session_id": "<from-hook-payload-or-unknown>",
  "source": "docs-research",
  "type": "call",
  "subtype": "context7",
  "agent_context": "subagent",
  "agent_type": "architect",
  "agent_id": "<from-payload>",
  "payload": {
    "summary": "context7 query-docs: Next.js App Router middleware runtime",
    "query_subject": "Next.js App Router middleware runtime",
    "library_id": "/vercel/next.js",
    "tokens_response_estimated": 1842,
    "project_slug": "tapagents-football-gm"
  }
}
```

**Reserved `payload.*` keys for this event type:**

| Key | Type | Required | Notes |
|---|---|---|---|
| `payload.query_subject` | string | yes | Short string describing the question asked (e.g., "Next.js App Router middleware runtime"). Truncate to ≤ 200 chars per §2.2. |
| `payload.library_id` | string \| null | yes | Context7 library ID (e.g., `/vercel/next.js`) when `subtype == "context7"`; `null` for `websearch` / `webfetch`. |
| `payload.tokens_response_estimated` | number | yes | Approximate token count of returned content. Basis depends on transport: Context7 reports chunk sizes directly; WebSearch/WebFetch use a `len(content) / 4` heuristic until a tokenizer-backed estimate lands. Field is the same name across all subtypes so rollup math is one expression. |
| `payload.project_slug` | string \| null | yes | Workspace slug when dispatched in project context; `null` at framework-level dispatches (e.g., Architect working on Tier 1 itself). |

The standard `payload.summary` reserved key (per §2.2) is set to a short human-readable string combining transport + query_subject so dashboard rows are scannable without parsing extras.

**Emission rule.** The calling agent (Architect, Strategist, future Tier 2 implementers) emits one `docs-research-call` event per successful research call in scope of `protocols/docs-research-protocol.md §2` routing — i.e., one event per Context7 `query-docs` / WebSearch / WebFetch invocation made under the protocol. Failed calls (network errors, MCP unavailable) are NOT emitted; the protocol's "log the gap once per session" rule (§6) handles those.

**Consumer.** `scripts/telemetry-rollup.py` will gain a `docs-research-rollup` mode in a follow-up dispatch — aggregates measured tokens-per-call by `subtype` and computes the median for `protocols/docs-research-protocol.md §5` substitution. The 5-call threshold for §5 substitution (per `protocols/docs-research-protocol.md §8`) is the gate; before N≥5, the rollup mode emits a "insufficient sample" verdict and Critic does NOT yet flag §5's `[inference]` estimates as stale.

**Provenance.** This spec exists to ground `protocols/docs-research-protocol.md §5` and §8 in a measurement source rather than perpetual `[inference]`. See `memory/runtime_tapagents_telemetry_events.md` for the existing events.jsonl conventions this event slots into. Schema is additive-only per §6 — adding `docs-research` as a new `source` value is a MINOR per §6 once the hook implementation ships.

### §2.6 Live: `session-work-output` (LIVE since v0.26.0 — M-D track slice B)

**Status.** LIVE. Producer: `hooks/session-tracking-seal.py` (`_emit_work_output`). Flipped from reserved → live in §2.4 by the M-D slice-B dispatch (2026-05-29). Consumers MAY parse defensively per §5.

**Purpose.** Captures what a session actually *produced* — product files touched + committed lines-of-code — so the dashboard's per-session view (Slice C) can render "files done / LOC done" per the operator's live-session-tracking vision (`workspace/_global/m-d-track-scope-sequencing-2026-05-28.md` Addendum Rev 2). This is the third telemetry producer family on the shared emit → ingest → `live_events` → render rail, after `state-machine` (S1) and the `session-tracking-*` lifecycle mirror (slice A).

**Why a SEPARATE stream (load-bearing design call).** The cross-cutting collision manifest (`active-sessions.md`, driven by `is_cross_cutting_path()` / `files_in_flight`) exists for ONE purpose: session-collision avoidance across concurrent sessions touching shared *framework* files. Its deliberate blindness to product `src/` keeps the manifest scannable. "What did this session produce" is a different question with a different consumer (the dashboard user, not a sibling session), so it gets its own stream. The slice-B implementation does NOT widen the collision matcher; the two never mix.

**Triple.** `source` / `type` / `subtype`:

- `source: "session-work-output"` — distinct from the `session-tracking-*` lifecycle sources (slice A) and from `state-machine` (S1), so the cloud feed can filter work-output independently.
- `type: "summary"` — an at-seal rollup (not a per-edit event).
- `subtype: "seal"` — emitted once per genuine seal pass with new committed work (see emission rule).

**Event shape (within the §2 schema):**

```json
{
  "ts": "2026-05-29T18:22:00Z",
  "session_id": "<from-hook-payload-or-unknown>",
  "source": "session-work-output",
  "type": "summary",
  "subtype": "seal",
  "agent_context": "orchestrator",
  "agent_type": null,
  "agent_id": null,
  "payload": {
    "summary": "work-output 2026-05-29T17-40-feature-x: 7 file(s), +412/-87 LOC committed to main via abc1234",
    "files_touched": ["src/lib/billing/stripe-webhook.ts", "src/app/api/checkout/route.ts"],
    "files_count": 7,
    "files_truncated": false,
    "loc_added": 412,
    "loc_deleted": 87,
    "loc_provisional": false,
    "committed_sha": "abc1234",
    "tapagents_session_id": "2026-05-29T17-40-feature-x"
  }
}
```

**Reserved `payload.*` keys for this event type:**

| Key | Type | Required | Notes |
|---|---|---|---|
| `payload.files_touched` | string[] | yes | Repo-relative paths of files committed to `main` in the session window. Capped to a representative **top-N (N=50, by total churn)** to respect the ingest per-event ~4 KB cap. NEVER carries file CONTENTS — paths + counts only. When the session touched more than N files, this is the highest-churn subset; `files_count` reports the true total. |
| `payload.files_count` | number | yes | True count of distinct (text) files committed to `main` in the window. `files_count > len(files_touched)` ⇔ the list was truncated (see `files_truncated`). |
| `payload.files_truncated` | bool | yes | `true` iff `files_touched` is a truncated top-N subset of `files_count`. Lets a consumer render "and N more" without re-deriving. |
| `payload.loc_added` | number | yes | Lines added, SUMMED across all commits on `main` in the window. The honest committed figure (see "LOC honesty" below). |
| `payload.loc_deleted` | number | yes | Lines deleted, summed across the window. |
| `payload.loc_provisional` | bool | yes | Always `false` for this `seal` subtype — the figure is the committed-to-main (authoritative) number, never a mid-session estimate. Reserved so a FUTURE provisional per-edit enhancement (a distinct emit carrying `loc_provisional: true`) is schema-compatible without a break. |
| `payload.committed_sha` | string \| null | yes | Short `main` HEAD SHA the figure was computed against (`latest_main_sha()`); `null` if unreachable. The attribution anchor — same "the SHA the seal saw" semantics the lifecycle `auto_seal_merge` uses. |
| `payload.tapagents_session_id` | string \| null | yes | The TapAgents session id (`<YYYY-MM-DDTHH-MM>-<scope>`) for cross-referencing the lifecycle/seal events of the same session. |

The standard `payload.summary` reserved key (§2.2) is a one-line human-readable rollup (counts + LOC + SHA), truncated to ≤ 200 chars per the helper.

**Ingest field-length caveat (load-bearing).** Per the shipped ingest endpoint's caps (`event_subtype` ≤ 80, `project_slug` ≤ 100, `session_id` ≤ 200; per-event ~4 KB; `payload.summary` truncated to 200), ALL file paths and the `files_touched[]` array ride in the free-shape `jsonb` `payload`, NEVER in a top-level field. The top-N=50 cap keeps the payload well under 4 KB even with long paths. A long path placed in `event_subtype` would be rejected `invalid_event`.

**LOC honesty — what is reliable vs what is NOT (per the slice-B dispatch directive).**

| Capture point | Method | Reliable? |
|---|---|---|
| **Committed work, at seal** | `git log --since=<started> --numstat ... main` summed across the window (`loc_landed_on_main_since()`) | ✅ **RELIABLE** — the ONE LOC number the framework emits. |
| **Uncommitted / feature-branch / mid-session** | per-edit byte/line delta from the tool payload | ⚠️ **PROVISIONAL** — NOT emitted by this `seal` event (roadmap OD-B3: "ship final-only first"). Reserved via `loc_provisional` for a later enhancement. |
| **A single authoritative "total LOC" mid-session** | — | ❌ **NOT computable** — only the committed figure (at seal) is authoritative. |

**"This session's work" definition (chosen + flagged).** = files **committed to `main` since the sidecar's `started` timestamp**, in the `CLAUDE_PROJECT_DIR` git repo. This is identical to the committed-to-main definition the existing auto-seal contract uses (`files_landed_on_main_since()`); the LOC stream is the `--numstat` line-delta view of that same set. The choice is deliberate: it is reliable exactly where the existing seal logic is (a Tier-2 product repo whose `CLAUDE_PROJECT_DIR` is a git work-tree with a `main`), and a clean no-op where it is not (the framework-HQ orchestrator context, whose root is NOT a git repo — so the dogfood orchestrator session emits no work-output, which is correct).

**Emission rule (no-emit-when-no-work).** The producer emits **at most one** `session-work-output/summary/seal` event per genuine seal pass, and only when there is measured committed work:

- git/`main` unavailable (`loc_landed_on_main_since().available == False`) → **emit NOTHING** (the figure is unmeasurable; a zero would falsely read as "changed nothing").
- git ran but zero files landed on `main` in the window → **emit NOTHING** (honest empty).
- git ran and ≥1 file landed → emit ONE event with the honest counts.
- **Idempotency across resumes:** the producer records the committed-SHA it last emitted against on the sidecar (`work_output_emitted_sha`, the hook's own bookkeeping — NOT part of this schema) and re-emits only when the SHA changes (genuinely-new commits since the last seal). No new commits → no re-emit.

**Billing.** Pool A. Pure git + file-stat + the existing `emit_event_http()` app-to-app HTTP. No `claude` invocation, no Anthropic SDK, no `api.anthropic.com`.

**Dashboard-render contract for Slice C (DEFINE, not build — for a follow-on C extension).** Slice C's `/dashboard/live` per-session detail consumes this stream as follows; this contract is recorded so C can be extended later without re-deriving shapes:

- **Query.** Read `live_events` filtered to `source = 'session-work-output'`, grouped by `session_id` (and optionally `project_slug`). The existing `live_events_user_source_idx` and `live_events_user_project_ts_idx` indexes cover this; query the table directly (no `live_activity_unified` VIEW dependency — OD-4 defer stands).
- **Per-session "work done" panel fields (read straight from `payload`):**
  - `filesCount` ← `payload.files_count` — render as "N files".
  - `locAdded` / `locDeleted` ← `payload.loc_added` / `payload.loc_deleted` — render as "+X / −Y LOC".
  - `locFinal` ← `payload.loc_provisional === false` — render the figure with a "final / committed" affordance (NOT "live"). The dashboard MUST NOT present this number as live/provisional; it is the committed total.
  - `filesTouched` ← `payload.files_touched` (string[]) — render the list; if `payload.files_truncated === true`, append "+ (files_count − files_touched.length) more".
  - `committedSha` ← `payload.committed_sha` — optional commit-link affordance.
  - `tapagentsSessionId` ← `payload.tapagents_session_id` — join key to the same session's lifecycle (`session-tracking-*`) and phase (`state-machine`) rows for one unified session card.
- **Liveness composition.** A "live session" row is one with a recent `session-tracking-register`/`-files` event and no terminal `session-tracking-seal`; the work-output `summary/seal` event (when present) supplies that row's files/LOC figures. Absence of a work-output event for a session = "no committed work yet" (render 0 / "—"), distinct from a session that committed work (render the figures).
- **What C must NOT assume:** that every session has a work-output event (HQ/orchestrator sessions and zero-commit sessions have none — see emission rule); that the figure is provisional (it never is for this subtype); that `files_touched` is complete (check `files_truncated`).

**Provenance.** M-D track Addendum Rev 2 §"Slice B" + OD-B1 (triple grammar) + OD-B3 (final-only first). Schema additive-only per §6 — a new `source` value + new `type`/`subtype` is MINOR; the `payload.*` keys are PATCH-grade additive. No existing triple mutated.

## §3 Storage

### §3.1 File location

| Workspace shape | Path |
|---|---|
| Tier 2 (`.claude/workspace/`) | `<project>/.claude/workspace/_global/events.jsonl` |
| Tier 2 (`workspace/` at root) | `<project>/workspace/_global/events.jsonl` |
| Tier 1 framework | `<framework-root>/.claude/workspace/_global/events.jsonl` |

The `_global/` directory is auto-created by the first emit call. In Tier 2 projects, `_global/` is normally a Tier 1 cross-project convention — we use it here as a stable per-workspace bucket so the file path stays consistent across layouts. Reading code should not assume any other content lives in `_global/`.

### §3.2 Append-only, line-delimited

Each event is one JSON object on one line, terminated by a single `\n`. No outer array, no commas between entries. This is JSON-Lines (JSONL) per [jsonlines.org](https://jsonlines.org/) — every line stands alone and is independently parseable.

Append-only. No event is ever rewritten. Consumers tail or seek; they do not need to lock.

POSIX append on small writes (each line is well under `PIPE_BUF`) is atomic at the kernel level. The shared helper does not need cross-process locking for the volume v0.10.0 is expected to produce.

### §3.3 Rotation

Not in v0.10.0/v0.11.0. The file grows append-only. When it crosses a maintenance threshold (estimate: ~10 MB or ~100k events, whichever comes first), a future slice introduces a rolloff strategy — likely date-rotated (`events.YYYYMMDD.jsonl`) so historical events stay browsable.

### §3.4 misfires.jsonl (added v0.11.0)

Hook-internal exceptions land in a sibling file `<workspace>/_global/misfires.jsonl` — same directory, same append-only / JSONL conventions, same top-level schema with one additional field:

| Field | Type | Notes |
|---|---|---|
| `error` | string | The exception class + message, truncated to ≤ 200 chars. Source string for the `subtype` derivation. |

`subtype` for misfires is derived from the exception class name (everything before the first `:` in the standard "ClassName: message" shape), so `nudge_ignored` consumers don't have to parse the error string to group by failure mode.

Misfire emit is captured by a top-level `try/except` around each hook's `main()` body. The exception is re-raised after the misfire is written, so Claude Code still sees the hook's failure exit code — the misfire is the persistent breadcrumb, not a replacement for the visible failure.

Why a separate file: events.jsonl is dashboard input; consumers iterate it as "this is what happened in the session." Misfires are operator-debug input; they break the assumption that every line is a successful semantic signal. Separating them keeps every events.jsonl consumer's contract intact.

## §4 Producer contract (hooks)

Every hook that wants to emit an event imports `emit_event` from `hooks/_telemetry.py`:

```python
import sys
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event
except Exception:
    def emit_event(**_kwargs):
        return  # fail-open stub

emit_event(
    source="my-hook-name",
    type="fire",
    subtype="some-class",
    agent_context="orchestrator",
    agent_type=None,
    agent_id=None,
    payload={"tool_name": "Edit", "summary": "short description"},
    session_id=hook_payload.get("session_id"),
)
```

Contract:
1. **Fail-open.** Any failure inside `emit_event` is swallowed. The calling hook's primary behavior (block / pass / signal) must never be affected by a telemetry emit failure.
2. **No third-party deps.** Stdlib `json.dumps()` + `"\n"` is the only path. Don't introduce `jsonlines` or `msgspec`; this protocol is the floor.
3. **All-keyword args.** Don't rely on positional order — future fields will land at the end of the signature.
4. **Truncate summaries.** `emit_event` truncates `payload.summary` to 200 chars. Don't pre-truncate; let the helper do it consistently.
5. **Don't emit on pass.** v0.10.0 emits only on the high-signal cases (block, fire, misfire). Emit-on-every-pass is reserved for a later observability tier.

## §5 Consumer contract

Consumers (Stop hooks, EA briefings, the upstream `tapagents-app` Vercel build) read `events.jsonl` defensively:

1. **Unknown fields ignored.** If a future event has a new top-level key, parse the known fields and skip the rest.
2. **Unknown values tolerated.** Pattern-match on `type` and `subtype` — never assume the full vocabulary is the v0.10.0 list.
3. **Bad lines skipped.** A malformed JSON line is not fatal; skip it and keep parsing the next.
4. **Filter by `session_id`** for in-session pattern detection (e.g. `stop-dispatch-monitor.py`).
5. **Filter by `source`** for emitter-specific consumers.

## §6 Versioning

The schema in §2 is **additive-only** at the v0.10.x line:

- Adding a new top-level field is MINOR.
- Adding a new `type` value is MINOR.
- Adding a new `subtype` value is MINOR.
- Adding a new `payload.*` key is PATCH (consumers should already ignore unknown keys).
- Removing a field, renaming a field, or changing a field's type is MAJOR — schema-break, downstream consumers refuse to parse.

If a MAJOR is unavoidable, write the new format to `events.v2.jsonl` alongside the v1 file and keep both for one MINOR cycle; consumers migrate during that window.

## §7 Provenance

- Seed brief: BL-035 (2026-05-12) — "auto-log orchestrator-dispatch-gate blocks to a structured events log + write a memory note when blocks ≥ 3 in one session."
- v0.11.0 extension brief (2026-05-12): "Extend the v0.10.0 telemetry foundation to cover ALL remaining hooks + add a classifier-feedback loop. Schema additive-only." Coverage expanded from one emitter (`orchestrator-dispatch-gate`) to seven emitters + a misfire capture pattern across all hooks.
- Motivating signal: `memory/feedback_orchestrator_session_discipline.md` — "on 3+ fixes of the same class in one session, dispatch the matching reviewer agent OR append to anti-patterns log."
- Producers (v0.11.0): `hooks/orchestrator-dispatch-gate.py`, `hooks/pre-tool-gate.py`, `hooks/version-gate.py`, `hooks/stop-critic-check.py`, `hooks/session-start-brief.py`, `hooks/prompt-router.py`, `hooks/prompt-router-feedback.py`, `hooks/stop-dispatch-monitor.py`.
- Consumers (v0.11.0): `hooks/stop-dispatch-monitor.py` (in-session threshold detection), `hooks/prompt-router-feedback.py` (cross-turn retro-action detection), `scripts/telemetry-rollup.py` (offline aggregation).
- Schema designed to absorb the broader telemetry layer without re-architecture — see §2.4 for the next-slice reserved triples (subagent-dispatch outcomes, slash-command fires, state-machine transitions).

## §8 Rollup script (added v0.11.0)

`scripts/telemetry-rollup.py` aggregates events.jsonl + misfires.jsonl into `<workspace>/_global/metrics-rollup.json`. Stdlib-only, no external deps. NOT wired as a hook — run explicitly:

```bash
# Roll up the current workspace:
python3 .claude/scripts/telemetry-rollup.py

# Or with custom paths (testing / cross-workspace rollup):
python3 .claude/scripts/telemetry-rollup.py \
    --events /path/to/events.jsonl \
    --misfires /path/to/misfires.jsonl \
    --out /path/to/metrics-rollup.json

# Print to stdout instead of writing:
python3 .claude/scripts/telemetry-rollup.py --stdout
```

Output JSON shape:
- `meta`: `generated_at`, `events_total`, `misfires_total`, `sessions_count`
- `by_source`: count by `source`
- `by_type`: count by `type`
- `by_source_type`: count by `"<source>/<type>"`
- `classifier_distribution`: count by subtype for `source=prompt-router && type=classify`
- `nudge_ignored`: count by subtype for `source=prompt-router-feedback && type=nudge_ignored`
- `dispatch_gate_trips`: total orchestrator-dispatch-gate blocks
- `misfires_by_source`: count of misfires by hook source

A future cron / scheduled-task slice can wire this to run periodically. For now it's operator-on-demand.
