"""
Shared telemetry helper — append structured events to per-workspace events.jsonl.

This is the foundation of the telemetry layer (BL-035). Every hook that wants
to record an event imports `emit_event()` from here. Schema is frozen for the
v0.10.0 release; future event types land in the SAME file without schema
changes.

Schema (frozen):
  {
    "ts": "2026-05-12T03:14:00Z",        # UTC ISO-8601 with trailing Z
    "session_id": "<from-hook-payload>", # or "unknown" if absent
    "source": "<hook-name>",             # e.g. "orchestrator-dispatch-gate"
    "type": "<event-class>",             # block | pass | fire | classify | rollup | nudge_ignored | misfire
    "subtype": "<qualifier>",            # e.g. edit | write | bash-mutate
    "agent_context": "orchestrator"|"subagent",
    "agent_type": "<name>"|null,
    "agent_id":   "<id>"|null,
    "payload":    { "tool_name": "...", "summary": "<short string>" }
  }

Storage location:
  - Tier 2 project:       <project>/.claude/workspace/_global/events.jsonl
  - Tier 1 framework:     <framework-root>/.claude/workspace/_global/events.jsonl
  - Tier 2 (no .claude):  <project>/workspace/_global/events.jsonl

Misfires (v0.11.0+) land in a sibling `misfires.jsonl` — same directory, same
top-level schema with one additional `error` field. The separation keeps
events.jsonl readable for dashboard rollups without forcing every consumer to
filter on `type=misfire`.

The `_global/` directory is auto-created if missing. In Tier 2 projects the
`_global/` concept is a Tier 1 convention (cross-project artifacts) — we use
it here as a stable per-workspace bucket so single-project shapes don't have
to invent a different layout.

Fail-open contract: every function in this module catches all exceptions and
returns silently. Telemetry is best-effort; the calling hook's primary
behavior (block / pass) must never be affected by an emit failure.

Design notes:
  - No third-party deps — stdlib only. `json.dumps(...) + "\n"` is the only
    serialization path; no jsonlines library, no pyarrow, no msgspec.
  - `payload.summary` is truncated to 200 chars. Don't dump full commands or
    file contents into telemetry — the events.jsonl is for shape, not state.
  - Workspace discovery mirrors `session-start-brief.py`'s `find_workspace()`
    function. If the two diverge, fix both.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

# Truncation cap for payload.summary. Bound for safety; raise via constant if
# downstream consumers genuinely need more (don't pass --override flags in calls).
SUMMARY_MAX_CHARS = 200


def _find_workspace() -> Path | None:
    """Locate the active workspace/ directory across both layouts.

    Mirrors session-start-brief.py's find_workspace(). Strategy:
      1. $CLAUDE_PROJECT_DIR/.claude/workspace   (tier-2 with .claude/)
      2. $CLAUDE_PROJECT_DIR/workspace           (tier-2 with hooks/ at root)
      3. <this-file>/../../workspace             (framework: .claude/workspace)
      4. <this-file>/../../.claude/workspace     (alternate tier-2 from file dir)

    Returns the first existing dir, or None.
    """
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


def _events_path() -> Path | None:
    """Resolve the events.jsonl path; create the _global/ dir if missing.

    Returns None on any failure — caller is fail-open.
    """
    return _resolve_global_file("events.jsonl")


def _misfires_path() -> Path | None:
    """Resolve the misfires.jsonl path; create the _global/ dir if missing.

    Sibling of events.jsonl. Same per-workspace bucket; separated so that
    consumers reading events.jsonl don't have to filter `type=misfire` to
    ignore hook-internal failures. Returns None on any failure — caller is
    fail-open.
    """
    return _resolve_global_file("misfires.jsonl")


def _resolve_global_file(filename: str) -> Path | None:
    """Shared resolver for any file under `<workspace>/_global/`.

    Used by `_events_path()` (events.jsonl) and `_misfires_path()` (misfires.jsonl).
    Both files live in the same per-workspace bucket; only the basename differs.
    Returns None on any failure — caller is fail-open.
    """
    workspace = _find_workspace()
    if workspace is None:
        # If the workspace itself doesn't exist (rare; pre-bootstrap session),
        # still emit to a sensible location: prefer $CLAUDE_PROJECT_DIR-derived
        # workspace, otherwise skip silently.
        env = os.environ.get("CLAUDE_PROJECT_DIR")
        if not env:
            return None
        # Pick the first parent-existing candidate path and create under it.
        for candidate_root in (Path(env) / ".claude", Path(env)):
            if candidate_root.is_dir():
                workspace = candidate_root / "workspace"
                try:
                    workspace.mkdir(parents=True, exist_ok=True)
                except OSError:
                    return None
                break
        else:
            return None

    global_dir = workspace / "_global"
    try:
        global_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None
    return global_dir / filename


def _truncate(text: str, limit: int = SUMMARY_MAX_CHARS) -> str:
    if not isinstance(text, str):
        try:
            text = str(text)
        except Exception:
            return ""
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"  # single ellipsis char keeps byte count


def _now_iso() -> str:
    """UTC ISO-8601 timestamp with a Z suffix (not +00:00). Stable across hosts."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def emit_event(
    *,
    source: str,
    type: str,
    subtype: str,
    agent_context: str,
    agent_type: str | None,
    agent_id: str | None,
    payload: dict,
    session_id: str | None,
) -> None:
    """Append one structured event to the per-workspace events.jsonl.

    All-keyword args — order is unstable across releases. Any exception is
    swallowed; the calling hook keeps running.

    Args:
        source: Hook / emitter name (e.g. "orchestrator-dispatch-gate"). Becomes
            the natural index for filtering / counting events by emitter.
        type: High-level event class. Today: "block". Tomorrow: pass, fire,
            classify, misfire. Free-string for forward compat — consumers
            should pattern-match defensively.
        subtype: Qualifier within type. For dispatch-gate: edit | write |
            notebook-edit | bash-mutate.
        agent_context: "orchestrator" or "subagent" — derived by the calling
            hook from the PreToolUse `agent_id`/`agent_type` payload fields.
        agent_type: Subagent type name if agent_context == "subagent"; None
            for orchestrator-thread events.
        agent_id: Subagent id if available; None otherwise.
        payload: Free-shape dict. Keys may include `tool_name`, `summary`,
            and emitter-specific extras. The `summary` field, if present, is
            truncated to SUMMARY_MAX_CHARS.
        session_id: From the hook payload's `session_id` field if present;
            "unknown" otherwise. Used by stop-dispatch-monitor to threshold
            within a single session.
    """
    try:
        path = _events_path()
        if path is None:
            return

        safe_payload = dict(payload) if isinstance(payload, dict) else {}
        if "summary" in safe_payload:
            safe_payload["summary"] = _truncate(safe_payload["summary"])

        event = {
            "ts": _now_iso(),
            "session_id": session_id or "unknown",
            "source": source,
            "type": type,
            "subtype": subtype,
            "agent_context": agent_context,
            "agent_type": agent_type,
            "agent_id": agent_id,
            "payload": safe_payload,
        }
        line = json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"

        # Append-only. Open in 'a' so concurrent writes from parallel hooks
        # don't truncate each other. POSIX append on small writes (< PIPE_BUF)
        # is atomic at the kernel level; one JSON-line per call stays well
        # under that bound, so we don't need a lock for the levels we expect.
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception:
        # Fail-open: telemetry must never break the hook chain.
        return


def emit_misfire(
    *,
    source: str,
    error: str,
    payload: dict | None = None,
    session_id: str | None = None,
) -> None:
    """Append one misfire record to the per-workspace misfires.jsonl.

    A misfire is any uncaught exception inside a hook's `main()` body — the
    hook reached an unexpected branch and crashed. Producers call this from a
    top-level `try/except` around `main()` and then re-raise so Claude Code
    still sees the failure exit code; the misfire is the persistent breadcrumb.

    Shape (mirrors emit_event so the JSONL can be parsed by the same readers,
    with one extra `error` field):

        {
          "ts":           "<iso8601-z>",
          "session_id":   "<from-payload-or-unknown>",
          "source":       "<hook-name>",
          "type":         "misfire",
          "subtype":      "<exception-class-name>",
          "agent_context": "orchestrator",
          "agent_type":   null,
          "agent_id":     null,
          "error":        "<traceback first line, truncated>",
          "payload":      { ... }
        }

    Args:
        source: Hook name. Must match the producer hook's `source=` in normal
            `emit_event` calls so the misfires.jsonl filterable by source.
        error: Short error string (typically `type(e).__name__ + ": " + str(e)[:200]`).
            Stored as the top-level `error` field and reused in `subtype` for
            quick grouping (the exception class name).
        payload: Optional free-shape dict. Same truncation rules as `emit_event`.
        session_id: From the hook payload if available; "unknown" otherwise.

    Fail-open on every code path — even the misfire emit must not raise.
    """
    try:
        path = _misfires_path()
        if path is None:
            return

        safe_payload = dict(payload) if isinstance(payload, dict) else {}
        if "summary" in safe_payload:
            safe_payload["summary"] = _truncate(safe_payload["summary"])

        # Derive a stable subtype from the exception class name (everything
        # before the first `:` in the standard "ClassName: message" shape).
        # If error is malformed, fall back to "unknown".
        subtype = "unknown"
        if isinstance(error, str) and error:
            head = error.split(":", 1)[0].strip()
            if head:
                subtype = head[:64]

        record = {
            "ts": _now_iso(),
            "session_id": session_id or "unknown",
            "source": source,
            "type": "misfire",
            "subtype": subtype,
            "agent_context": "orchestrator",
            "agent_type": None,
            "agent_id": None,
            "error": _truncate(error if isinstance(error, str) else str(error)),
            "payload": safe_payload,
        }
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"

        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception:
        # Fail-open: even the misfire writer must not raise. If the misfire
        # writer itself misfires, that signal is permanently lost — accepted
        # tradeoff vs. recursion / second-order error storms.
        return


# ---------------------------------------------------------------------------
# emit_event_http — cloud-mirror sibling helper to emit_event()
# ---------------------------------------------------------------------------
#
# Added in v0.24.0. Composes alongside emit_event() (does NOT replace).
# When TAPAGENTS_LIVE_TOKEN is set in the environment, the helper batches
# events in-process and POSTs them to a configurable ingest URL. Fails open
# on every error path — never raises, never blocks the calling hook.

import atexit
import threading
import urllib.error
import urllib.request

# In-process batching state. Module-level so a single process accumulates
# across many hook invocations; threadsafe via _BATCH_LOCK.
_BATCH: list[dict] = []
_BATCH_LOCK = threading.Lock()
_BATCH_TIMER: threading.Timer | None = None

# Flush thresholds — flush whichever fires first.
_BATCH_SIZE_THRESHOLD = 20         # events
_BATCH_TIME_THRESHOLD_SECONDS = 5  # seconds since first event in current batch

# Default ingest URL. Operators override via TAPAGENTS_LIVE_INGEST_URL env var
# for self-hosted or preview-environment targeting.
_DEFAULT_INGEST_URL = "https://tapagents.ai/api/account/tapagents-live/ingest"

# One-time-per-process warn flags so a missing env var or recurring HTTP
# failure does not spam stderr on every call.
_WARNED_MISSING_TOKEN = False
_WARNED_MISSING_URL = False
_ATEXIT_REGISTERED = False


def _http_post_json(url: str, body: dict, *, token: str, timeout: float = 5.0) -> None:
    """Best-effort JSON POST. Raises on any HTTP error; caller must catch.

    Pure stdlib (urllib). Keeps the helper dependency-free so it works inside
    every framework consumer regardless of their installed packages.
    """
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "tap-agents/emit_event_http",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        # Drain response body so the connection can be released cleanly.
        # We do NOT inspect or surface the body — fail-open contract.
        resp.read()


def _flush_batch_locked() -> None:
    """Flush the current batch via one HTTP POST. Caller holds _BATCH_LOCK.

    Reads env vars at flush time (not import time) so operators can set them
    after the process starts. On missing env vars or HTTP failure, the batch
    is silently dropped — fail-open per the existing emit_event() contract.
    Local emit_event() writes are the source of truth; this is a cloud mirror.
    """
    global _BATCH, _BATCH_TIMER, _WARNED_MISSING_TOKEN, _WARNED_MISSING_URL

    # Cancel any pending timer — we are flushing now.
    if _BATCH_TIMER is not None:
        _BATCH_TIMER.cancel()
        _BATCH_TIMER = None

    if not _BATCH:
        return

    pending = _BATCH
    _BATCH = []

    token = os.environ.get("TAPAGENTS_LIVE_TOKEN")
    if not token:
        if not _WARNED_MISSING_TOKEN:
            _WARNED_MISSING_TOKEN = True
            # Stderr-only, one time per process. Never raises.
            try:
                import sys
                print(
                    "[tap-agents-live-emit] TAPAGENTS_LIVE_TOKEN not set; "
                    "cloud mirror disabled (local emit_event continues normally).",
                    file=sys.stderr,
                )
            except Exception:
                pass
        return

    url = os.environ.get("TAPAGENTS_LIVE_INGEST_URL", _DEFAULT_INGEST_URL)
    if not url:
        if not _WARNED_MISSING_URL:
            _WARNED_MISSING_URL = True
            try:
                import sys
                print(
                    "[tap-agents-live-emit] TAPAGENTS_LIVE_INGEST_URL empty; "
                    "cloud mirror disabled.",
                    file=sys.stderr,
                )
            except Exception:
                pass
        return

    body = {"events": pending}
    try:
        _http_post_json(url, body, token=token)
    except Exception:
        # Fail-open. The batch is permanently lost (no retry) by design —
        # local emit_event() already wrote the rows to events.jsonl, so the
        # local copy is the source of truth and a dropped cloud mirror does
        # not lose data, just one cloud-side replica.
        return


def _schedule_time_flush_locked() -> None:
    """If no flush timer is running, start one. Caller holds _BATCH_LOCK."""
    global _BATCH_TIMER
    if _BATCH_TIMER is not None:
        return

    def _timer_callback() -> None:
        try:
            with _BATCH_LOCK:
                _flush_batch_locked()
        except Exception:
            return

    t = threading.Timer(_BATCH_TIME_THRESHOLD_SECONDS, _timer_callback)
    t.daemon = True  # do not block process exit
    try:
        t.start()
        _BATCH_TIMER = t
    except Exception:
        # If Timer creation/start fails (rare; resource limits), skip — the
        # next emit_event_http call will retry, and atexit will drain at end.
        return


def _atexit_flush() -> None:
    """Drain any pending batch on process exit. Registered once per process."""
    try:
        with _BATCH_LOCK:
            _flush_batch_locked()
    except Exception:
        return


def flush_pending() -> None:
    """Explicit drain of any pending batch. Public — usable by test harnesses
    and graceful-shutdown paths that want a synchronous flush.

    Fail-open: any exception is swallowed.
    """
    try:
        with _BATCH_LOCK:
            _flush_batch_locked()
    except Exception:
        return


def emit_event_http(
    *,
    source: str,
    event_type: str,
    event_subtype: str | None = None,
    session_id: str | None = None,
    project_slug: str | None = None,
    agent_context: str | None = None,
    agent_type: str | None = None,
    agent_id: str | None = None,
    payload: dict | None = None,
    ts: str | None = None,
) -> None:
    """Fire-and-forget cloud-mirror of one telemetry event.

    Sibling to ``emit_event()``. Adds the event to an in-process batch;
    when the batch reaches 20 events or 5 seconds elapse since the first
    event in the batch, the batch is POSTed once to
    ``TAPAGENTS_LIVE_INGEST_URL`` with ``Authorization: Bearer
    $TAPAGENTS_LIVE_TOKEN``. On process exit an atexit hook drains any
    remaining batch.

    Fails OPEN on every error path:
      - missing env var → no-op (warn once to stderr per process)
      - network error / 4xx / 5xx / timeout → batch silently dropped
      - any internal exception → swallowed

    The local ``emit_event()`` call is the source of truth for telemetry;
    ``emit_event_http()`` is a best-effort cloud mirror. Hooks that need
    both should call both — local first, then HTTP — so a cloud-side
    failure never affects the local audit trail.

    Args (mirror ``emit_event()`` keyword surface, with two additions):
        source: Hook / emitter name (e.g. ``"orchestrator-dispatch-gate"``).
        event_type: High-level event class. Same vocabulary as
            ``emit_event(type=...)``: ``block | pass | fire | classify |
            rollup | nudge_ignored``.
        event_subtype: Qualifier within ``event_type``. Optional.
        session_id: From the hook payload's ``session_id`` field if present.
            "unknown" if absent. Used by the cloud aggregator to thread events
            into a single Tap Agents Live session view.
        project_slug: Project slug if the emitting hook is Tier 2 inside a
            workspace; ``None`` for Tier 1 / framework-level emits. Optional;
            additive surface beyond ``emit_event()``.
        agent_context: "orchestrator" or "subagent" — derived by the calling
            hook from the PreToolUse ``agent_id``/``agent_type`` payload fields.
        agent_type: Subagent type name if ``agent_context == "subagent"``.
        agent_id: Subagent id if available.
        payload: Free-shape dict. The ``summary`` field, if present, is
            truncated to ``SUMMARY_MAX_CHARS`` (200) for parity with
            ``emit_event()``.
        ts: ISO 8601 UTC timestamp with trailing Z. Defaults to now() if
            absent — same formatting as ``emit_event()`` events.

    Env vars (read at flush time, NOT import time):
        TAPAGENTS_LIVE_TOKEN: Per-machine bearer token (required; absent →
            no-op).
        TAPAGENTS_LIVE_INGEST_URL: Override the default ingest URL. Defaults
            to ``https://tapagents.ai/api/account/tapagents-live/ingest``.

    Returns: ``None``. Never raises.
    """
    global _ATEXIT_REGISTERED
    try:
        safe_payload = dict(payload) if isinstance(payload, dict) else {}
        if "summary" in safe_payload:
            safe_payload["summary"] = _truncate(safe_payload["summary"])

        event: dict = {
            "ts": ts or _now_iso(),
            "session_id": session_id or "unknown",
            "source": source,
            "event_type": event_type,
        }
        if event_subtype is not None:
            event["event_subtype"] = event_subtype
        if project_slug is not None:
            event["project_slug"] = project_slug
        if agent_context is not None:
            event["agent_context"] = agent_context
        if agent_type is not None:
            event["agent_type"] = agent_type
        if agent_id is not None:
            event["agent_id"] = agent_id
        if safe_payload:
            event["payload"] = safe_payload

        with _BATCH_LOCK:
            if not _ATEXIT_REGISTERED:
                # Register the drain hook lazily on first use so importing
                # the module is side-effect-free for consumers who never
                # call emit_event_http().
                try:
                    atexit.register(_atexit_flush)
                    _ATEXIT_REGISTERED = True
                except Exception:
                    pass

            _BATCH.append(event)
            if len(_BATCH) >= _BATCH_SIZE_THRESHOLD:
                _flush_batch_locked()
            else:
                _schedule_time_flush_locked()
    except Exception:
        # Fail-open: telemetry must never break the hook chain.
        return
