#!/usr/bin/env python3
"""
PreToolUse hook — auto-fill `files_in_flight` on cross-cutting edits (BL-055).

Fires on every Edit / Write / NotebookEdit call. Reads the target path and,
if it matches the cross-cutting scope list in
`protocols/session-coordination-protocol.md §31-46`, mutates the active
session's manifest entry:

  - First cross-cutting edit upgrades the stub (`pending-<hash>` suffix)
    into a properly-scoped `tapagents_session_id` (e.g.
    `2026-05-12T15-22-protocol`).
  - Subsequent edits append the file to `files_in_flight` with set-semantics
    (no duplicates) and bump `last_updated`.

**Subagent attribution (the hardest design question).**

Empirical finding (verified during architect dispatch, 2026-05-12): env-
inheritance through Agent dispatches is structurally impossible — hook
scripts are subprocesses; their os.environ mutations die when the
subprocess exits and don't propagate to Claude Code's main process, let
alone to a forked subagent context. Path (a) "set TAPAGENTS_SESSION_ID env"
therefore CANNOT work.

Path (b) chosen: **persist the binding to disk, keyed by
`payload.session_id`** — Claude Code's own session identifier, present in
every PreToolUse stdin payload. Orchestrator and subagent dispatches inside
the same Claude Code instance share `payload.session_id` (the existing
`stop-dispatch-monitor.py` already relies on this — it counts orchestrator
+ subagent dispatch-gate events that share session_id within a single
session, and the pattern works in practice across the v0.10.0-v0.14.0
range). So when this PreToolUse hook fires in a subagent context, it reads
`<workspace>/_global/sessions/<cc_session_id>.json` and finds the SAME
sidecar SessionStart wrote at the parent's startup — automatic correct
attribution.

Caveat: if Claude Code ever changes its semantics such that subagents get
distinct session_ids, this attribution breaks silently — sub-sessions would
materialize their own stub. Mitigation built in: the auto_emitted entry is
marked with a sentinel HTML comment carrying the session_id, so a forensic
sweep can detect the malformed shape. Tracked as a known limitation in
`protocols/session-coordination-protocol.md §247`.

Scope-matching: `_session_tracking.is_cross_cutting_path()` matches the
target path against the protocol's scope list:

  - .claude/memory/*.md
  - .claude/memory/backlog.md, .claude/workspace/_global/backlog.json
  - .claude/agents/**.md (including _planned/)
  - .claude/protocols/*.md
  - .claude/templates/*.md
  - .claude/CHANGELOG.md
  - .claude/docs/*.md (cross-cutting plans)
  - .claude/workspace/<scope>/decision-packet-*.md

Non-cross-cutting edits (project src/, single-project workspace artifacts)
return early — keeps the manifest signal-to-noise high.

Wired in: `.claude/settings.json` -> hooks.PreToolUse (added AFTER the
existing three gates pre-tool-gate / version-gate / dispatch-gate, so a
gate-blocked edit doesn't pollute the manifest). The chain is purely
observational at this stage — this hook ALWAYS exits 0; it never blocks.

Stdin payload (Claude Code PreToolUse hook):
    { "tool_name": "Edit"|"Write"|"NotebookEdit"|...,
      "tool_input": { "file_path": "<path>", ... },
      "session_id": "<uuid>",
      "agent_id": "<id-or-absent>",
      "agent_type": "<type-or-absent>",
      ... }

Exit 0 always. Telemetry: `session.tracking.files_in_flight_updated`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Telemetry — fail-open.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return

# Shared lib — fail-open.
try:
    from _session_tracking import (
        find_workspace,
        is_cross_cutting_path,
        normalize_for_manifest,
        now_iso,
        now_session_id_token,
        read_sidecar,
        upsert_entry,
        write_sidecar,
    )
except Exception:  # noqa: BLE001
    def find_workspace():  # type: ignore[no-redef]
        return None

    def is_cross_cutting_path(_p):  # type: ignore[no-redef]
        return (False, None)

    def normalize_for_manifest(p, _w):  # type: ignore[no-redef]
        return p

    def now_iso():  # type: ignore[no-redef]
        return ""

    def now_session_id_token():  # type: ignore[no-redef]
        return ""

    def read_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return None

    def upsert_entry(*_a, **_kw):  # type: ignore[no-redef]
        return False

    def write_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return False


FILE_MUTATING_TOOLS = {"Edit", "Write", "NotebookEdit"}


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _is_subagent(payload: dict) -> bool:
    """Mirror dispatch-gate's detection. Used only for telemetry agent_context."""
    return bool(payload.get("agent_id") or payload.get("agent_type"))


_PENDING_SUFFIX_RE = __import__("re").compile(r"-pending-[a-f0-9]{4,}$")


def _upgrade_session_id(current_id: str, scope_label: str) -> str:
    """Replace a `-pending-<hash>` suffix with the matched scope label.

    Idempotent: if the id is already non-pending, return as-is. Format kept
    consistent with `now_session_id_token()` shape from the lib.

    Regex-based to avoid positional-indexing bugs from `.split('-')` against
    the date token `<YYYY-MM-DDTHH-MM>` (which itself contains hyphens).
    """
    if not current_id:
        return f"{now_session_id_token()}-{scope_label}"
    if _PENDING_SUFFIX_RE.search(current_id):
        return _PENDING_SUFFIX_RE.sub(f"-{scope_label}", current_id)
    # Suffix already meaningful (e.g. session did a protocol edit; a
    # later CHANGELOG edit doesn't rewrite it).
    return current_id


def main() -> int:
    payload = read_payload()
    tool_name = payload.get("tool_name") or ""

    # Fast bail-out: not a file-mutating tool we care about.
    if tool_name not in FILE_MUTATING_TOOLS:
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path") or ""
    if not file_path:
        return 0

    cc_session_id = payload.get("session_id") or ""
    if not cc_session_id:
        # Can't bind to a session without an id; bail silently.
        return 0

    # Cross-cutting? If not, nothing to record.
    is_cc, scope_label = is_cross_cutting_path(file_path)
    if not is_cc:
        return 0

    workspace = find_workspace()
    if workspace is None:
        return 0

    # Look up the sidecar. In the normal case SessionStart materialized one
    # already; defensive: materialize a stub here if it's missing (e.g.
    # SessionStart hook was disabled or misfired).
    data = read_sidecar(workspace, cc_session_id)
    materialized_now = False
    if data is None:
        token = now_session_id_token()
        started = now_iso()
        data = {
            "tapagents_session_id": f"{token}-{scope_label}",
            "cc_session_id": cc_session_id,
            "started": started,
            "scope": f"<auto — first edit: {scope_label}>",
            "files_in_flight": [],
            "status": "in-progress",
            "last_updated": started,
            "resume_count": 0,
            "last_source": "first-edit-bootstrap",
        }
        materialized_now = True

    # Upgrade the session-id if still in `pending-<hash>` shape.
    new_id = _upgrade_session_id(data.get("tapagents_session_id") or "", scope_label)
    if new_id != data.get("tapagents_session_id"):
        data["tapagents_session_id"] = new_id
        # Also refresh the scope label since we now have a real one.
        if (data.get("scope") or "").startswith("<auto"):
            data["scope"] = f"<auto — first edit: {scope_label}>"

    # Append the file with set-semantics. Normalize to repo-relative shape.
    rel = normalize_for_manifest(file_path, workspace)
    files = list(data.get("files_in_flight") or [])
    if rel not in files:
        files.append(rel)
        data["files_in_flight"] = files
        appended = True
    else:
        appended = False

    data["last_updated"] = now_iso()
    write_sidecar(workspace, cc_session_id, data)
    upsert_entry(workspace, data)

    emit_event(
        source="session-tracking-files",
        type="fire",
        subtype=scope_label,
        agent_context="subagent" if _is_subagent(payload) else "orchestrator",
        agent_type=payload.get("agent_type"),
        agent_id=payload.get("agent_id"),
        payload={
            "tool_name": tool_name,
            "summary": ("materialized + " if materialized_now else "") +
                       ("appended " if appended else "noop-duplicate ") + rel,
            "tapagents_session_id": data["tapagents_session_id"],
        },
        session_id=cc_session_id,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        emit_misfire(
            source="session-tracking-files",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        # PreToolUse: must NEVER block on misfire. Exit 0 even on crash.
        sys.exit(0)
