#!/usr/bin/env python3
"""
Stop hook — pattern detector for orchestrator-dispatch-gate blocks.

Reads the per-workspace events.jsonl, filters for the current session_id
+ orchestrator-source `block` events, and if the count ≥ 3, writes a
structured memory note + appends an index line to MEMORY.md.

Why: 3+ same-session dispatch-gate blocks means the orchestrator hit the
dispatch wall repeatedly. That's a signal worth capturing — either the
orchestrator was driving against the rail and needed to be redirected,
or a new specialist agent is warranted (`feedback_orchestrator_session_discipline.md`).

Behavior:
  - Reads stdin JSON payload from Claude Code Stop hook.
  - Anti-loop guard: if `stop_hook_active` is true in the payload, returns 0
    without acting. Same guard pattern as stop-critic-check.py / stop-tier2-check.py.
  - Discovers workspace via the same logic as session-start-brief.py /
    _telemetry.py. Reads `<workspace>/_global/events.jsonl` if present.
  - Counts events matching:
      session_id == payload.session_id
      AND source == "orchestrator-dispatch-gate"
      AND type == "block"
      AND agent_context == "orchestrator"
  - If count >= 3, writes:
      <USER_MEMORY_DIR>/runtime_dispatch_gate_pattern_<YYYYMMDD>_<short-session-id>.md
    with frontmatter (name / description / type: runtime) + body listing
    the events, then appends a one-line pointer to MEMORY.md.

This hook NEVER blocks Stop. Exit 0 always (the threshold case writes a
note, doesn't keep the session alive). Pattern detection is observational,
not enforcing.

Wired in: settings.json -> hooks.Stop, after stop-critic-check.py /
stop-tier2-check.py. The existing stop-* checks own blocking; this one
owns telemetry rollup.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Shared telemetry helper — fail-open import. Stop hook is observational,
# never blocks Stop; telemetry emit failure is irrelevant to its primary signal.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return

# Resolved at user level — pattern notes are framework-wide memory, not
# workspace-scoped. Same path the user's MEMORY.md is rooted at.
USER_MEMORY_DIR = Path(
    "/Users/tapandesai/.claude/projects/-Users-tapandesai-App-Development/memory"
)
MEMORY_INDEX = USER_MEMORY_DIR / "MEMORY.md"

# Threshold: 3+ orchestrator-source blocks in one session triggers a note.
DISPATCH_BLOCK_THRESHOLD = 3


def _read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _find_workspace() -> Path | None:
    """Mirror of _telemetry._find_workspace() — keep in sync if either moves."""
    candidates: list[Path] = []
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        candidates.append(Path(env) / ".claude" / "workspace")
        candidates.append(Path(env) / "workspace")
    here = Path(__file__).resolve()
    hooks_dir = here.parent
    candidates.append(hooks_dir.parent / "workspace")
    candidates.append(hooks_dir.parent / ".claude" / "workspace")
    for c in candidates:
        try:
            if c.is_dir():
                return c
        except OSError:
            continue
    return None


def _read_events(events_path: Path) -> list[dict]:
    """Parse events.jsonl into a list of dicts. Bad lines are skipped silently."""
    out: list[dict] = []
    try:
        with open(events_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return out


def _matches(ev: dict, session_id: str) -> bool:
    return (
        ev.get("session_id") == session_id
        and ev.get("source") == "orchestrator-dispatch-gate"
        and ev.get("type") == "block"
        and ev.get("agent_context") == "orchestrator"
    )


def _short_session_id(session_id: str) -> str:
    """First 8 chars, alphanumeric-safe. UUIDs land at e.g. `a1b2c3d4`."""
    safe = "".join(ch for ch in session_id if ch.isalnum() or ch in "-_")
    return safe[:8] or "unknown"


def _write_pattern_note(events: list[dict], session_id: str) -> Path | None:
    """Write the memory note; return the path on success, None on failure."""
    try:
        USER_MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None

    yyyymmdd = datetime.now(timezone.utc).strftime("%Y%m%d")
    sid_short = _short_session_id(session_id)
    note_name = f"runtime_dispatch_gate_pattern_{yyyymmdd}_{sid_short}.md"
    note_path = USER_MEMORY_DIR / note_name

    count = len(events)
    first_ts = events[0].get("ts", "") if events else ""
    last_ts = events[-1].get("ts", "") if events else ""

    body_lines: list[str] = [
        "---",
        f'name: "Dispatch-gate pattern — {yyyymmdd} session {sid_short}"',
        f'description: "{count} orchestrator dispatch-gate blocks in one session ({first_ts} → {last_ts}). '
        "Indicates the orchestrator hit the dispatch rail repeatedly — review whether a new "
        'specialist agent is warranted or the routing nudge needs to fire earlier."',
        "type: runtime",
        "---",
        "",
        f"# Dispatch-gate pattern — session `{sid_short}` on {yyyymmdd}",
        "",
        f"**Session ID:** `{session_id}`",
        f"**Block count:** {count} (threshold {DISPATCH_BLOCK_THRESHOLD})",
        f"**Window:** {first_ts} → {last_ts}",
        "",
        "## What it means",
        "",
        f"The orchestrator-dispatch-gate hard-blocked {count} mutating tool calls on the main "
        "thread in this session. The gate is wired correctly — these blocks are the intended "
        "discipline, not bugs. But 3+ blocks in one session is a signal worth surfacing:",
        "",
        "- The orchestrator may have been pushed against the rail by a user prompt that should "
        "  have routed straight to a subagent — review `prompt-router.py` triggers.",
        "- The right specialist agent may not exist yet — review whether `org-designer` should "
        "  propose a new role (`/grow-team`).",
        "- The orchestrator may be drifting into implementer mode despite the briefing — review "
        "  `session-start-brief.py` and any in-session compaction.",
        "",
        "## Events",
        "",
    ]
    for i, ev in enumerate(events, 1):
        ts = ev.get("ts", "?")
        subtype = ev.get("subtype", "?")
        payload = ev.get("payload") or {}
        tool_name = payload.get("tool_name", "?")
        summary = payload.get("summary", "")
        body_lines.append(f"{i}. `{ts}` — **{subtype}** via `{tool_name}` — {summary}")
    body_lines.append("")
    body_lines.append("## Source")
    body_lines.append("")
    body_lines.append(
        "Auto-written by `hooks/stop-dispatch-monitor.py` (BL-035). Events captured by "
        "`hooks/orchestrator-dispatch-gate.py` → `.claude/workspace/_global/events.jsonl`. "
        "Schema: `protocols/telemetry-events.md`."
    )
    body_lines.append("")

    try:
        note_path.write_text("\n".join(body_lines), encoding="utf-8")
    except OSError:
        return None
    return note_path


def _append_to_memory_index(note_path: Path, count: int, session_id: str) -> None:
    """Prepend a one-line pointer to MEMORY.md (newest at top, matching house style)."""
    sid_short = _short_session_id(session_id)
    note_basename = note_path.name
    pointer = (
        f"- [Dispatch-gate pattern — session `{sid_short}`]({note_basename}) — "
        f"{count} orchestrator-thread blocks in one session. "
        "Auto-captured by `stop-dispatch-monitor.py`; review for routing-nudge tightening or "
        "new specialist agent.\n"
    )
    try:
        MEMORY_INDEX.parent.mkdir(parents=True, exist_ok=True)
        existing = MEMORY_INDEX.read_text(encoding="utf-8") if MEMORY_INDEX.exists() else ""
        MEMORY_INDEX.write_text(pointer + existing, encoding="utf-8")
    except OSError:
        return


def _emit_rollup(*, session_id: str, block_count: int, tripped: bool,
                 memory_note_written: bool) -> None:
    """Emit one rollup event per Stop-hook firing.

    Subtype is below-threshold | threshold-tripped per protocols/telemetry-events.md.
    Closes the loop on whether the threshold trips in practice — every Stop
    that runs this hook becomes a data point.
    """
    subtype = "threshold-tripped" if tripped else "below-threshold"
    emit_event(
        source="stop-dispatch-monitor",
        type="rollup",
        subtype=subtype,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload={
            "summary": f"{block_count} orchestrator-blocks in session",
            "block_count": block_count,
            "threshold": DISPATCH_BLOCK_THRESHOLD,
            "memory_note_written": memory_note_written,
        },
        session_id=session_id,
    )


def main() -> int:
    payload = _read_payload()

    # Anti-loop guard: this Stop hook should fire once per session-end attempt,
    # and crucially, must not retrigger if a sibling Stop hook keeps Stop alive.
    if payload.get("stop_hook_active"):
        return 0

    session_id = payload.get("session_id") or ""
    if not session_id:
        # Without a session_id we can't threshold; nothing to do.
        return 0

    workspace = _find_workspace()
    if workspace is None:
        return 0
    events_path = workspace / "_global" / "events.jsonl"
    if not events_path.exists():
        # No events at all — emit a below-threshold rollup so the dashboard
        # can render "Stop fired, no blocks recorded" rather than seeing nothing.
        _emit_rollup(
            session_id=session_id,
            block_count=0,
            tripped=False,
            memory_note_written=False,
        )
        return 0

    events = _read_events(events_path)
    matching = [ev for ev in events if _matches(ev, session_id)]

    if len(matching) < DISPATCH_BLOCK_THRESHOLD:
        _emit_rollup(
            session_id=session_id,
            block_count=len(matching),
            tripped=False,
            memory_note_written=False,
        )
        return 0

    note_path = _write_pattern_note(matching, session_id)
    memory_note_written = note_path is not None
    if note_path is not None:
        _append_to_memory_index(note_path, len(matching), session_id)
        # Surface to the agent's stderr-context (stop-hook stderr is shown but
        # does NOT block stop unless we exit 2). Single line, no trailing newline
        # noise — keeps the session-end log tidy.
        sys.stderr.write(
            f"[telemetry] Dispatch-gate pattern note written: {note_path.name} "
            f"({len(matching)} blocks).\n"
        )

    _emit_rollup(
        session_id=session_id,
        block_count=len(matching),
        tripped=True,
        memory_note_written=memory_note_written,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="stop-dispatch-monitor",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
