#!/usr/bin/env python3
"""
Stop hook — auto-seal a session's active-sessions.md entry (BL-055).

Fires at the end of every session, alongside the existing
`stop-critic-check.py` (which blocks Stop on unresolved BLOCKING concerns)
and `stop-dispatch-monitor.py` (which writes pattern notes on threshold).
Stop hooks run as a chain; their effects are independent.

Behavior:
  1. Read the sidecar for this Claude Code session_id.
  2. If no sidecar or status is already sealed → exit silently.
  3. If `files_in_flight` is empty → skip sealing entirely (do nothing) so
     the no-cross-cutting-work case doesn't pollute the manifest with
     auto-sealed-empty entries. (The stub remains visible if SessionStart
     wrote one — Stop ALSO marks such stubs as `status: noop` so the next
     Stop sweep or human reader sees them as harmless.)
  4. Otherwise, compare `files_in_flight` against `git log main` since
     `started`:
       - All listed files merged → `status: sealed`, fill auto_* fields,
         write `completion_note: AUTO-SEALED via Stop hook — shipped via
         <SHA> at <ts>; N of N claimed files merged.`
       - Some merged, some not → `status: partial`, the auto_seal_files
         list shows ONLY the merged subset, completion_note carries the
         unmerged subset.
       - None merged → leave `status: in-progress` and do nothing. The
         session might resume; auto-seal again later. (Quarterly cleanup +
         the EA stale-session sweep are the long-tail handlers.)

Two important non-behaviors:
  - We NEVER overwrite a `completion_note` set manually by a human (auto-
    seal merges into existing data; mirrors the promote-to-prod.sh
    "manual seal wins" contract).
  - We NEVER block Stop. Even on misfire, exit 0 (stop-critic-check.py is
    the gate that decides whether the session is safe to end; we're
    bookkeeping).

Wired in: `.claude/settings.json` -> hooks.Stop chain.

Stdin payload (Claude Code Stop hook):
    { "session_id": "<uuid>",
      "stop_hook_active": <bool>,
      ... }

Output: empty stdout (no blocking message). Exit 0 always. Telemetry:
`session.tracking.auto_sealed` or `session.tracking.partial_seal`.
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
        files_landed_on_main_since,
        find_workspace,
        latest_main_sha,
        now_iso,
        read_sidecar,
        upsert_entry,
        write_sidecar,
    )
except Exception:  # noqa: BLE001
    def files_landed_on_main_since(_s):  # type: ignore[no-redef]
        return set()

    def find_workspace():  # type: ignore[no-redef]
        return None

    def latest_main_sha():  # type: ignore[no-redef]
        return None

    def now_iso():  # type: ignore[no-redef]
        return ""

    def read_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return None

    def upsert_entry(*_a, **_kw):  # type: ignore[no-redef]
        return False

    def write_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return False


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _seal(data: dict, *, status: str, sha: str | None, merged: list[str],
          unmerged: list[str]) -> dict:
    """Build the sealed sidecar dict. Preserves a manual `completion_note`
    if one is already set (auto-fields land alongside, not overwriting)."""
    ts = now_iso()
    data["status"] = status
    data["auto_sealed"] = ts
    data["auto_seal_merge"] = sha or "(no main SHA reachable)"
    data["auto_seal_outcome"] = "success" if status == "sealed" else f"partial — {len(unmerged)} unmerged"
    data["auto_seal_files"] = merged
    if not data.get("completion_note"):
        n_total = len(merged) + len(unmerged)
        if status == "sealed":
            data["completion_note"] = (
                f"AUTO-SEALED via Stop hook — shipped via {sha or '(unknown)'} "
                f"at {ts}; {len(merged)} of {n_total} claimed files merged."
            )
        else:
            unmerged_short = ", ".join(unmerged[:3]) + ("..." if len(unmerged) > 3 else "")
            data["completion_note"] = (
                f"PARTIAL AUTO-SEAL via Stop hook — {len(merged)} of {n_total} "
                f"claimed files merged via {sha or '(unknown)'}; remaining unmerged: "
                f"{unmerged_short}. Re-resolve manually or on next session."
            )
    data["last_updated"] = ts
    return data


def main() -> int:
    payload = read_payload()
    cc_session_id = payload.get("session_id") or ""
    if not cc_session_id:
        return 0
    # Anti-loop: Stop hooks chain with stop_hook_active=True on re-entry.
    # We're not blocking, so this guard isn't strictly needed — but skip
    # mutation on the second pass to avoid double-emitting telemetry.
    if payload.get("stop_hook_active"):
        return 0

    workspace = find_workspace()
    if workspace is None:
        return 0
    data = read_sidecar(workspace, cc_session_id)
    if data is None:
        return 0

    # Already sealed? Nothing to do.
    if data.get("status") in {"sealed", "noop"}:
        return 0

    files_claimed = list(data.get("files_in_flight") or [])

    # No cross-cutting work happened. Mark as noop so the next sweep sees
    # the stub as resolved. Don't bother writing an auto_sealed timestamp;
    # noop entries are intentionally unaudited (low-value).
    if not files_claimed:
        data["status"] = "noop"
        data["last_updated"] = now_iso()
        data["completion_note"] = "No cross-cutting edits during session; stub closed without seal."
        write_sidecar(workspace, cc_session_id, data)
        upsert_entry(workspace, data)
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="noop",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={"summary": f"noop-closed {data.get('tapagents_session_id')}"},
            session_id=cc_session_id,
        )
        return 0

    # Compare against git log.
    started = data.get("started") or ""
    landed = files_landed_on_main_since(started)
    merged: list[str] = [f for f in files_claimed if f in landed]
    unmerged: list[str] = [f for f in files_claimed if f not in landed]

    sha = latest_main_sha()

    if merged and not unmerged:
        # Full match — clean seal.
        data = _seal(data, status="sealed", sha=sha, merged=merged, unmerged=unmerged)
        write_sidecar(workspace, cc_session_id, data)
        upsert_entry(workspace, data)
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="auto-sealed",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={
                "summary": f"sealed {data.get('tapagents_session_id')} ({len(merged)} files via {sha})",
                "files_merged": len(merged),
            },
            session_id=cc_session_id,
        )
        return 0

    if merged and unmerged:
        # Partial seal — some shipped, some still in-flight.
        data = _seal(data, status="partial", sha=sha, merged=merged, unmerged=unmerged)
        write_sidecar(workspace, cc_session_id, data)
        upsert_entry(workspace, data)
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="partial-seal",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={
                "summary": f"partial {data.get('tapagents_session_id')} ({len(merged)} merged, {len(unmerged)} unmerged)",
                "files_merged": len(merged),
                "files_unmerged": len(unmerged),
            },
            session_id=cc_session_id,
        )
        return 0

    # No files merged yet. Leave status alone — session may resume.
    # Bump last_updated so the entry isn't flagged "stale" instantly by
    # EA's drift sweep next time around.
    data["last_updated"] = now_iso()
    write_sidecar(workspace, cc_session_id, data)
    upsert_entry(workspace, data)
    emit_event(
        source="session-tracking-seal",
        type="fire",
        subtype="left-in-progress",
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload={
            "summary": f"left in-progress {data.get('tapagents_session_id')} ({len(unmerged)} unmerged)",
            "files_unmerged": len(unmerged),
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
            source="session-tracking-seal",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        # NEVER block Stop. Exit 0 even on misfire — stop-critic-check.py
        # is the gate that decides whether the session may end; we're
        # bookkeeping.
        sys.exit(0)
