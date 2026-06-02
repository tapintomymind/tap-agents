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

Work-output capture (M-D track slice B, added v0.26.0)
------------------------------------------------------
In ADDITION to the lifecycle `fire`/seal events above, this hook emits a
SEPARATE `session-work-output` / `summary` / `seal` event that captures what
the session actually *produced* — product `src/` files + lines-of-code —
independent of the cross-cutting collision manifest. This is a DISTINCT
telemetry stream by deliberate design (see
`protocols/telemetry-events.md §2.6` and the M-D roadmap Addendum Rev 2):
`files_in_flight` / `is_cross_cutting_path()` exist for session-collision
avoidance across concurrent sessions and are intentionally framework-files-
only; "what did this session produce" is a different question with a
different consumer (the dashboard user), so it rides its own stream and does
NOT widen the collision matcher.

The work-output figure is computed at seal from `loc_landed_on_main_since()`
— `git diff --numstat` of work *committed to `main`* in the session's window.
This is the only LOC number the framework can stand behind (committed-to-main
= the same definition the auto-seal contract uses); a mid-session/uncommitted
figure is provisional and is NOT emitted here (see schema §2.6 and roadmap
OD-B3 — "ship final-only first"). When git/main is unavailable (e.g. the
framework-HQ orchestrator context, whose root is not a git repo) the figure
is unmeasurable and NO work-output event is emitted (no-emit-when-no-work).
The work-output emit is fail-open and never blocks Stop.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Telemetry — fail-open. emit_event_http is the cloud-mirror sibling (v0.24.0);
# it fails open when TAPAGENTS_LIVE_TOKEN is unset, so calling it is always safe.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import (  # type: ignore[import-not-found]
        emit_event,
        emit_event_http,
        emit_misfire,
    )
except Exception:  # noqa: BLE001
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_event_http(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return

# Shared lib — fail-open.
try:
    from _session_tracking import (
        files_landed_on_main_since,
        find_workspace,
        latest_main_sha,
        loc_landed_on_main_since,
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

    def loc_landed_on_main_since(_s):  # type: ignore[no-redef]
        return {"added": 0, "deleted": 0, "files": {}, "files_count": 0,
                "available": False}

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


# Cap on how many file paths ride in the work-output event payload. The
# shipped ingest endpoint enforces a per-event ~4 KB cap (verified, M-D
# roadmap Addendum Rev 2 §"Slice B" ingest caveat). A session that touches
# hundreds of files must roll up to COUNTS + a representative top-N path list
# rather than dump every path. The full per-file map stays available locally
# in the events.jsonl row (the local emit carries the same payload, and the
# local log has no field-length cap beyond the summary truncation). Top-N is
# selected by largest total churn (added+deleted) so the most substantial
# files are the ones that survive truncation.
WORK_OUTPUT_TOP_N_FILES = 50


def _emit_work_output(
    *,
    data: dict,
    session_id: str | None,
) -> bool:
    """Emit the `session-work-output` / `summary` / `seal` event (slice B).

    Computes the session's product-file work-output + committed LOC from
    `loc_landed_on_main_since(started)` and dual-emits (local emit_event
    source-of-truth, then emit_event_http cloud mirror — exact S1/slice-A
    pattern). This is a SEPARATE stream from the lifecycle/seal events; it is
    emitted regardless of whether `files_in_flight` was non-empty, because a
    session that touched only product `src/` (never a cross-cutting framework
    file) still produced work worth surfacing on the dashboard.

    No-emit-when-no-work contract:
      - git/main unavailable (loc.available is False) → emit NOTHING. The LOC
        is unmeasurable here; emitting a zero figure would be a lie (it would
        read as "this session changed nothing" when the truth is "couldn't
        measure"). The framework-HQ orchestrator context hits this path (root
        is not a git repo), so the dogfood orchestrator session is silent —
        correct: the work-output stream is for sessions running inside a
        product git repo.
      - git ran but zero files landed on main in the window
        (loc.available True, files_count == 0) → emit NOTHING. Honest empty;
        nothing was committed, so there is no work-output to report.
      - git ran and >=1 file landed → emit ONE event with the honest counts.

    Returns True iff an event was emitted (for the caller's stderr surface).
    """
    started = data.get("started") or ""
    loc = loc_landed_on_main_since(started)

    # No-emit-when-no-work: unmeasurable OR nothing committed in window.
    if not loc.get("available"):
        return False
    files_map: dict = loc.get("files") or {}
    files_count = int(loc.get("files_count") or 0)
    if files_count <= 0 or not files_map:
        return False

    sha = latest_main_sha()
    loc_added = int(loc.get("added") or 0)
    loc_deleted = int(loc.get("deleted") or 0)

    # Roll up to a representative top-N path list (by total churn) to respect
    # the ingest per-event cap. The full files_count is always reported so a
    # truncated list is unambiguous (files_count > len(files_touched) signals
    # truncation to the consumer).
    ranked = sorted(
        files_map.items(),
        key=lambda kv: (kv[1].get("added", 0) + kv[1].get("deleted", 0)),
        reverse=True,
    )
    files_touched = [path for path, _delta in ranked[:WORK_OUTPUT_TOP_N_FILES]]
    files_truncated = files_count > len(files_touched)

    summary = (
        f"work-output {data.get('tapagents_session_id')}: "
        f"{files_count} file(s), +{loc_added}/-{loc_deleted} LOC "
        f"committed to main via {sha or '(unknown)'}"
    )
    work_payload = {
        "summary": summary,
        "files_touched": files_touched,
        "files_count": files_count,
        "files_truncated": files_truncated,
        "loc_added": loc_added,
        "loc_deleted": loc_deleted,
        # The committed-to-main figure is the authoritative one; this stream
        # never emits a provisional mid-session number (roadmap OD-B3). The
        # flag is carried explicitly = False so consumers can render
        # "final / committed" unambiguously and so a future provisional
        # per-edit enhancement (a separate emit with loc_provisional: true)
        # is schema-compatible.
        "loc_provisional": False,
        "committed_sha": sha,
        "tapagents_session_id": data.get("tapagents_session_id"),
    }

    # Local emit (source of truth per §4 producer contract) then cloud mirror
    # (fail-open; no-op without TAPAGENTS_LIVE_TOKEN). Local first, then HTTP,
    # so a cloud failure never affects the local audit trail.
    emit_event(
        source="session-work-output",
        type="summary",
        subtype="seal",
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=work_payload,
        session_id=session_id,
    )
    emit_event_http(
        source="session-work-output",
        event_type="summary",
        event_subtype="seal",
        session_id=session_id,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=work_payload,
    )
    return True


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

    # Work-output capture (slice B) runs on every genuine seal pass that has a
    # sidecar — BEFORE the lifecycle branch logic and BEFORE the already-sealed
    # early-return, so it fires regardless of cross-cutting files_in_flight and
    # even for sessions that touched ONLY product src/ (no framework file). It
    # is its own separate stream; the lifecycle branches below are unchanged.
    #
    # Idempotency: a session may end (Stop) multiple times across resumes. We
    # record the committed-SHA the work-output was last emitted against on the
    # sidecar (`work_output_emitted_sha`) and re-emit only when the SHA changes
    # (i.e. genuinely-new commits landed since the last seal). No new commits →
    # no re-emit. This keeps the work-output stream one-event-per-new-work
    # rather than one-per-Stop, and the marker is the hook's own bookkeeping
    # (not part of the telemetry schema). Fail-open: a marker-write failure at
    # worst re-emits an identical row next Stop (the dashboard dedups on shape).
    last_emitted_sha = data.get("work_output_emitted_sha")
    current_main_sha = latest_main_sha()
    if current_main_sha is not None and current_main_sha != last_emitted_sha:
        if _emit_work_output(data=data, session_id=cc_session_id):
            data["work_output_emitted_sha"] = current_main_sha
            # Persist the marker. We do NOT upsert_entry() here — work-output
            # is not an active-sessions.md concern; only the sidecar carries
            # the marker. The lifecycle branches below own the manifest writes.
            write_sidecar(workspace, cc_session_id, data)

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
        noop_payload = {"summary": f"noop-closed {data.get('tapagents_session_id')}"}
        # Local emit (source of truth) then cloud mirror (fail-open; no-op
        # without TAPAGENTS_LIVE_TOKEN). Local first, then HTTP.
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="noop",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=noop_payload,
            session_id=cc_session_id,
        )
        emit_event_http(
            source="session-tracking-seal",
            event_type="fire",
            event_subtype="noop",
            session_id=cc_session_id,
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=noop_payload,
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
        sealed_payload = {
            "summary": f"sealed {data.get('tapagents_session_id')} ({len(merged)} files via {sha})",
            "files_merged": len(merged),
        }
        # Local emit (source of truth) then cloud mirror (fail-open; no-op
        # without TAPAGENTS_LIVE_TOKEN). Local first, then HTTP.
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="auto-sealed",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=sealed_payload,
            session_id=cc_session_id,
        )
        emit_event_http(
            source="session-tracking-seal",
            event_type="fire",
            event_subtype="auto-sealed",
            session_id=cc_session_id,
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=sealed_payload,
        )
        return 0

    if merged and unmerged:
        # Partial seal — some shipped, some still in-flight.
        data = _seal(data, status="partial", sha=sha, merged=merged, unmerged=unmerged)
        write_sidecar(workspace, cc_session_id, data)
        upsert_entry(workspace, data)
        partial_payload = {
            "summary": f"partial {data.get('tapagents_session_id')} ({len(merged)} merged, {len(unmerged)} unmerged)",
            "files_merged": len(merged),
            "files_unmerged": len(unmerged),
        }
        # Local emit (source of truth) then cloud mirror (fail-open; no-op
        # without TAPAGENTS_LIVE_TOKEN). Local first, then HTTP.
        emit_event(
            source="session-tracking-seal",
            type="fire",
            subtype="partial-seal",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=partial_payload,
            session_id=cc_session_id,
        )
        emit_event_http(
            source="session-tracking-seal",
            event_type="fire",
            event_subtype="partial-seal",
            session_id=cc_session_id,
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload=partial_payload,
        )
        return 0

    # No files merged yet. Leave status alone — session may resume.
    # Bump last_updated so the entry isn't flagged "stale" instantly by
    # EA's drift sweep next time around.
    data["last_updated"] = now_iso()
    write_sidecar(workspace, cc_session_id, data)
    upsert_entry(workspace, data)
    in_progress_payload = {
        "summary": f"left in-progress {data.get('tapagents_session_id')} ({len(unmerged)} unmerged)",
        "files_unmerged": len(unmerged),
    }
    # Local emit (source of truth) then cloud mirror (fail-open; no-op without
    # TAPAGENTS_LIVE_TOKEN). Local first, then HTTP.
    emit_event(
        source="session-tracking-seal",
        type="fire",
        subtype="left-in-progress",
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=in_progress_payload,
        session_id=cc_session_id,
    )
    emit_event_http(
        source="session-tracking-seal",
        event_type="fire",
        event_subtype="left-in-progress",
        session_id=cc_session_id,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=in_progress_payload,
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
