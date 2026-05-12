#!/usr/bin/env python3
"""
UserPromptSubmit hook — classifier-feedback loop for prompt-router.

This is the SECOND UserPromptSubmit hook in the chain, registered AFTER
`prompt-router.py`. It fires on every user prompt but emits NOTHING in the
common case. It's purely retro-active: when this hook runs, it reads the
PREVIOUS turn's `prompt-router` classify event from events.jsonl and asks
"was that classification right?". If the orchestrator clearly ignored the
nudge, this hook emits a `nudge_ignored` event so the prompt-router can be
empirically tightened over time.

Detection logic:
  1. Read events.jsonl, filter to (source=prompt-router, type=classify,
     session_id=<this session>), sort by ts, take the last one.
  2. If that previous classify was subtype=side AND the CURRENT prompt does
     NOT start with /park → the user got the side-thought nudge but ignored
     it. Emit `nudge_ignored` / `side-not-parked`.
  3. If that previous classify was subtype=implement AND the CURRENT prompt
     reads like a continuation (does NOT mention dispatch / agent / continue)
     → the user got the implement-routing nudge but kept driving. Emit
     `nudge_ignored` / `implement-not-dispatched`.

This hook NEVER emits additionalContext — only telemetry. The user-visible
nudge from prompt-router.py is the only signal the user sees on the current
turn; this hook's signal is for the dashboard / future tightening, not the
live session.

Heuristics are intentionally loose. False-positives here are themselves a
signal (and would show up as the rate of nudge_ignored / valid retro-action
ratios). Tighten over time once we have data.

Self-instrumented: if the events.jsonl lookup itself raises, this hook calls
emit_misfire so we know when the heuristics are broken — the only way to
detect a permanently silent feedback layer.

Wired in: settings.json -> hooks.UserPromptSubmit[1] (after prompt-router.py).

Stdin payload schema (Claude Code UserPromptSubmit hook):
  { "prompt": "...", "session_id": "...", ... }
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# Shared telemetry helper — fail-open import. Feedback-detection is silent
# on every code path so import failure is invisible to the user; the
# misfire-emit stub is a no-op so even self-instrumentation stays silent.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


# Continuation heuristic — these phrases in the current prompt suggest the
# user is acknowledging dispatch or directing dispatch, NOT continuing inline
# work. Used to decide whether an implement-classify nudge was ignored.
DISPATCH_CONFIRM_RE = re.compile(
    r"\b(dispatch|dispatched|agent|continue with dispatch|"
    r"ok continue|run via|delegate to|hand (it )?off|via agent)\b",
    re.IGNORECASE,
)


def _find_workspace() -> Path | None:
    """Mirror of _telemetry._find_workspace() — keep in sync."""
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


def _read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _last_classify_for_session(events_path: Path, session_id: str) -> dict | None:
    """Read events.jsonl, return the most recent prompt-router classify event
    for the given session_id, or None if none exists.

    Bad lines are skipped silently — events.jsonl might have been partially
    written by a parallel hook crashing mid-line. Matches dispatch-monitor's
    defensive parse loop.
    """
    if not events_path.exists():
        return None
    last: dict | None = None
    last_ts = ""
    try:
        with open(events_path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if ev.get("source") != "prompt-router":
                    continue
                if ev.get("type") != "classify":
                    continue
                if ev.get("session_id") != session_id:
                    continue
                ts = ev.get("ts", "")
                if isinstance(ts, str) and ts >= last_ts:
                    last_ts = ts
                    last = ev
    except OSError:
        return None
    return last


def _is_park_command(prompt: str) -> bool:
    return bool(re.match(r"^\s*/park\b", prompt or "", re.IGNORECASE))


def _looks_like_continuation(prompt: str) -> bool:
    """True if the current prompt seems to keep driving the same task vs.
    acknowledging that the previous nudge re-routed work to a subagent."""
    if not prompt:
        return False
    if DISPATCH_CONFIRM_RE.search(prompt):
        return False
    # If the user is asking a status / decision question, that's also not
    # a continuation of implement intent — silence on those.
    if re.search(r"\b(status|what'?s next|where are we|recap)\b", prompt, re.IGNORECASE):
        return False
    return True


def main() -> int:
    payload = _read_payload()
    prompt = payload.get("prompt") or ""
    session_id = payload.get("session_id") or ""

    # Slash-command invocations are intentional routing — never flag as
    # ignored. /park itself, /refocus, /status etc. all signal the user is
    # responding to (or routing around) the nudge, not ignoring it.
    if re.match(r"^\s*/[a-z]", prompt, re.IGNORECASE):
        return 0

    if not session_id:
        # Without session_id we can't find the previous classify; silent.
        return 0

    workspace = _find_workspace()
    if workspace is None:
        return 0

    events_path = workspace / "_global" / "events.jsonl"

    # Self-instrumented lookup — if events.jsonl is corrupt / missing
    # permissions / locked by another process, the misfire emit captures it.
    try:
        prev = _last_classify_for_session(events_path, session_id)
    except Exception as e:  # noqa: BLE001 — defensive
        emit_misfire(
            source="prompt-router-feedback",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={"phase": "last_classify_lookup"},
            session_id=session_id,
        )
        return 0

    if prev is None:
        return 0

    prev_subtype = prev.get("subtype")
    # The classify event only nudges on subtype `implement` or `side`; other
    # subtypes (status/slash/ack/silent) carry no nudge to ignore.
    prev_payload = prev.get("payload") or {}
    if not prev_payload.get("nudge_emitted"):
        return 0

    prev_ts = prev.get("ts", "")
    prev_summary = prev_payload.get("summary", "")
    truncated_prev = prev_summary[:80] if isinstance(prev_summary, str) else ""

    if prev_subtype == "side" and not _is_park_command(prompt):
        emit_event(
            source="prompt-router-feedback",
            type="nudge_ignored",
            subtype="side-not-parked",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={
                "summary": truncated_prev,
                "prev_event_ts": prev_ts,
            },
            session_id=session_id,
        )
        return 0

    if prev_subtype == "implement" and _looks_like_continuation(prompt):
        emit_event(
            source="prompt-router-feedback",
            type="nudge_ignored",
            subtype="implement-not-dispatched",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={
                "summary": truncated_prev,
                "prev_event_ts": prev_ts,
            },
            session_id=session_id,
        )
        return 0

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="prompt-router-feedback",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
