# Telemetry Events Protocol

**Owner:** Org Designer (schema). Critic enforces additive-only changes at every release review.
**Status:** Active 2026-05-12 — v0.10.0 (BL-035).
**Storage:** `<workspace>/_global/events.jsonl` — single per-workspace append-only log.

---

## §1 Why this exists

Hooks know things about the session that the orchestrator can't easily see — every dispatch-gate block, every prompt-router classification, every hook misfire. Without a structured trail, those signals stay invisible: the only way to know the orchestrator hit the dispatch wall five times today is to read every hook's stderr in order.

The telemetry layer is the structured trail. Hooks emit JSON-line events to a shared per-workspace file. Other surfaces (Stop hooks, EA briefings, dashboards, the upstream `agent-dashboard` product) read the file. The schema is intentionally minimal and frozen — additive-only changes — so consumers written today still parse events written tomorrow.

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

### §2.3 What we emit today (v0.10.0)

| `source` | `type` | `subtype` values | Emitted by |
|---|---|---|---|
| `orchestrator-dispatch-gate` | `block` | `edit`, `write`, `notebook-edit`, `bash-mutate` | `hooks/orchestrator-dispatch-gate.py` on every `return 2` |

We do **not** emit on pass-through (subagent calls, read-only tools, etc.) in v0.10.0. Keeping the file small is intentional — only the rail strikes matter for now.

### §2.4 What we'll emit next (scoped separately)

These are reserved names for the next-slice work; they are NOT live in v0.10.0:

- `prompt-router` / `classify` / `code-intent` | `side-thought` | `silent` — every UserPromptSubmit classification.
- `prompt-router` / `fire` / `routing-nudge` | `park-nudge` — every nudge written to additional-context.
- `slash-command` / `fire` / `<command-name>` — every slash-command invocation.
- `<any-hook>` / `misfire` / `<reason>` — hook reached an unexpected branch.

When the next-slice author lands these, this section becomes the canonical list of source-type-subtype triples in use.

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

Not in v0.10.0. The file grows append-only. When it crosses a maintenance threshold (estimate: ~10 MB or ~100k events, whichever comes first), the next-slice work introduces a rolloff strategy — likely date-rotated (`events.YYYYMMDD.jsonl`) so historical events stay browsable.

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

Consumers (Stop hooks, EA briefings, the upstream `agent-dashboard` Vercel build) read `events.jsonl` defensively:

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
- Motivating signal: `memory/feedback_orchestrator_session_discipline.md` — "on 3+ fixes of the same class in one session, dispatch the matching reviewer agent OR append to anti-patterns log."
- Single producer in v0.10.0: `hooks/orchestrator-dispatch-gate.py`.
- Single consumer in v0.10.0: `hooks/stop-dispatch-monitor.py`.
- Schema designed to absorb the broader telemetry layer (prompt-router classifications, slash-command invocations, hook misfires) without a re-architecture — see §2.4 for the reserved next-slice triples.
