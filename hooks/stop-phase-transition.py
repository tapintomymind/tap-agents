#!/usr/bin/env python3
"""
Stop hook — state-machine phase-transition emitter.

Implements the `state-machine` / `transition` / `<from>-<to>` triple reserved
in `protocols/telemetry-events.md §2.4`. This is the live feed the dashboard's
12-step PhaseIndicatorTrack consumes (M-D track slice S1, per
`workspace/_global/m-d-track-scope-sequencing-2026-05-28.md`).

WHY a Stop hook + snapshot diff:
  A Stop hook fires at turn-end and can see each project's CURRENT
  `state.json.current_phase`, but the reserved subtype needs `<from>-<to>` —
  i.e. it must know the PREVIOUS phase too. `state.json` itself carries a
  `history[]`, but that is Conductor-authored prose with heterogeneous shapes
  (some entries use `phase`, some `event`); parsing it for "the prior phase"
  is brittle. Instead we persist a small sidecar snapshot of last-seen phase
  per project under `_global/.phase-snapshot.json` and diff the live
  `current_phase` against it on every Stop. The snapshot is the hook's own
  private bookkeeping — it is NOT part of the telemetry schema and NOT read by
  any events.jsonl consumer (per §3.1, readers must not assume other `_global/`
  content).

DETECTION CONTRACT:
  - First time a project slug is seen → record its phase in the snapshot, emit
    NOTHING. We have no trustworthy "from" on first sight; emitting
    `unknown-<to>` would pollute the feed. Bootstrap is silent.
  - `current_phase` unchanged vs snapshot → emit NOTHING (no-change is silent,
    matching the §2.3 "don't emit on uninteresting pass-through" discipline).
  - `current_phase` changed vs snapshot → emit one
    `state-machine`/`transition`/`<from>-<to>` event (local emit_event +
    cloud-mirror emit_event_http) and update the snapshot. Reversions
    (e.g. a revision bouncing `planned`→`scoping`) are legitimate transitions
    and ARE emitted; the subtype simply reads `planned-scoping`.
  - Multi-project: every project under `workspace/<slug>/state.json` (skipping
    `_`-prefixed buckets) is diffed independently in one pass.

DISPATCH-OUTCOME (subagent-dispatch/outcome/<verdict>) is deliberately NOT in
this hook. A Stop hook has no reliable, non-heuristic signal for per-dispatch
verdicts (the Stop payload does not enumerate Task tool calls or their return
shapes), so emitting it here would require transcript-scraping guesswork. Per
the S1 dispatch directive ("honesty over completeness — do NOT ship a guessing
emitter"), dispatch-outcome is scoped OUT of S1 and flagged as follow-up slice
S1b. See the M-D roadmap and the S1 reportback.

This hook NEVER blocks Stop. Exit 0 always — phase-transition capture is
observational, like `stop-dispatch-monitor.py`. The existing `stop-critic-check.py`
owns Stop-blocking; this one owns transition telemetry.

Wired in: settings.json -> hooks.Stop, after stop-critic-check.py /
stop-dispatch-monitor.py / session-tracking-seal.py. Mirrors their registration
and anti-loop guard.

Schema note: additive-only per `telemetry-events.md §6`. This hook IMPLEMENTS
the already-reserved §2.4 triple; it does not invent new schema surface. Adding
a wired hook that emits a reserved triple is a framework MINOR per
`protocols/versioning-protocol.md §3.2`.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

# Shared telemetry helper — fail-open import. This Stop hook is observational
# and never blocks Stop; a telemetry import/emit failure must not change its
# (no-op) exit behavior. emit_event_http is the cloud-mirror sibling (v0.24.0);
# it fails open when TAPAGENTS_LIVE_TOKEN is unset, so calling it is always safe.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import (  # type: ignore[import-not-found]
        emit_event,
        emit_event_http,
        emit_misfire,
    )
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_event_http(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


# Sidecar snapshot filename under <workspace>/_global/. Dot-prefixed so it
# reads as private hook bookkeeping, clearly distinct from events.jsonl /
# misfires.jsonl. NOT part of the telemetry schema.
SNAPSHOT_FILENAME = ".phase-snapshot.json"


def _read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _find_workspace() -> Path | None:
    """Locate the active workspace/ directory across both layouts.

    Mirror of `_telemetry._find_workspace()` (and `stop-dispatch-monitor.py`'s
    copy). Strategy, in order:
      1. $CLAUDE_PROJECT_DIR/.claude/workspace   (tier-2 with .claude/)
      2. $CLAUDE_PROJECT_DIR/workspace           (tier-2 with hooks/ at root)
      3. <this-file>/../../workspace             (framework: .claude/workspace)
      4. <this-file>/../../.claude/workspace     (alternate tier-2 from file dir)

    The framework-HQ case resolves via candidate (3): this file lives at
    `.claude/hooks/stop-phase-transition.py`, so `hooks_dir.parent / "workspace"`
    is `.claude/workspace` — the correct location. (Note: the naive
    `$CLAUDE_PROJECT_DIR/workspace` used by stop-critic-check.py does NOT
    resolve at HQ, which is why we mirror the smarter _telemetry resolution.)

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


def _load_snapshot(snapshot_path: Path) -> dict:
    """Read the last-seen-phase sidecar. Returns {} on any failure / first run.

    Shape: { "<slug>": {"phase": "<phase>", "phase_status": "<status|None>",
                          "ts": "<iso8601-z when last recorded>"} }
    Tolerant of a malformed file: a corrupt snapshot degrades to "treat every
    project as first-seen" (silent bootstrap), never raises.
    """
    try:
        if not snapshot_path.exists():
            return {}
        data = json.loads(snapshot_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        # Defensive: keep only well-shaped entries.
        clean: dict = {}
        for slug, rec in data.items():
            if isinstance(slug, str) and isinstance(rec, dict) and "phase" in rec:
                clean[slug] = rec
        return clean
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def _write_snapshot(snapshot_path: Path, snapshot: dict) -> None:
    """Atomically persist the snapshot (temp file + os.replace). Fail-open.

    Atomic replace avoids a torn snapshot if the process is killed mid-write,
    which would otherwise re-bootstrap (drop a real transition) or corrupt the
    diff baseline on the next Stop.
    """
    try:
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            dir=str(snapshot_path.parent),
            prefix=".phase-snapshot.",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(snapshot, fh, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp_name, snapshot_path)
        except Exception:
            # Clean up the temp file on any write/replace failure.
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
            raise
    except Exception:
        # Fail-open: a snapshot-write failure must not break the Stop chain.
        # Worst case the same transition re-emits next Stop (idempotency is the
        # consumer's concern; the dashboard dedups on (ts, subtype) shape).
        return


def _iter_project_states(workspace: Path):
    """Yield (slug, current_phase, phase_status) for each real project.

    Skips `_`-prefixed buckets (_global, _archived, _examples, _inbox, ...).
    Skips state.json files that don't parse or lack current_phase. The slug
    falls back to the directory name if the file omits `slug`.
    """
    for state_file in sorted(workspace.glob("*/state.json")):
        parent = state_file.parent.name
        if parent.startswith("_"):
            continue
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            continue
        if not isinstance(state, dict):
            continue
        current_phase = state.get("current_phase")
        if not isinstance(current_phase, str) or not current_phase:
            # No phase to track (e.g. a pre-bootstrap or non-standard state.json).
            continue
        slug = state.get("slug")
        if not isinstance(slug, str) or not slug:
            slug = parent
        phase_status = state.get("phase_status")
        if not isinstance(phase_status, str):
            phase_status = None
        yield slug, current_phase, phase_status


def _emit_transition(
    *,
    slug: str,
    from_phase: str,
    to_phase: str,
    phase_status: str | None,
    session_id: str | None,
) -> None:
    """Emit one transition event to both the local log and the cloud mirror.

    Local emit_event() is the source of truth (per §4 producer contract);
    emit_event_http() is the best-effort cloud mirror (no-op without
    TAPAGENTS_LIVE_TOKEN). Local first, then HTTP, so a cloud failure never
    affects the local audit trail.
    """
    subtype = f"{from_phase}-{to_phase}"
    summary = f"{slug}: phase {from_phase} → {to_phase}"
    payload = {
        "summary": summary,
        "project_slug": slug,
        "from_phase": from_phase,
        "to_phase": to_phase,
        "phase_status": phase_status,
    }

    # Local write (source of truth).
    emit_event(
        source="state-machine",
        type="transition",
        subtype=subtype,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=payload,
        session_id=session_id,
    )

    # Cloud mirror (fail-open; no-op without the live token). The HTTP helper
    # uses event_type / event_subtype keyword names and carries project_slug as
    # a first-class field in addition to the payload copy.
    emit_event_http(
        source="state-machine",
        event_type="transition",
        event_subtype=subtype,
        session_id=session_id,
        project_slug=slug,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload=payload,
    )


def main() -> int:
    payload = _read_payload()

    # Anti-loop guard: if a sibling Stop hook is keeping Stop alive, do not
    # re-diff and re-emit. One transition pass per genuine session-end attempt.
    if payload.get("stop_hook_active"):
        return 0

    session_id = payload.get("session_id")

    workspace = _find_workspace()
    if workspace is None:
        return 0

    snapshot_path = workspace / "_global" / SNAPSHOT_FILENAME
    snapshot = _load_snapshot(snapshot_path)

    now_seen: dict = {}
    emitted_any = False
    snapshot_changed = False

    for slug, current_phase, phase_status in _iter_project_states(workspace):
        prior = snapshot.get(slug)
        new_record = {"phase": current_phase, "phase_status": phase_status}
        now_seen[slug] = new_record

        if prior is None:
            # First sight of this project — bootstrap silently. No trustworthy
            # "from" phase exists yet.
            snapshot_changed = True
            continue

        prior_phase = prior.get("phase")
        if prior_phase == current_phase:
            # No phase change. Refresh phase_status bookkeeping if it drifted,
            # but emit nothing (phase_status alone is not a transition).
            if prior.get("phase_status") != phase_status:
                snapshot_changed = True
            continue

        # Genuine phase transition.
        _emit_transition(
            slug=slug,
            from_phase=str(prior_phase) if prior_phase is not None else "unknown",
            to_phase=current_phase,
            phase_status=phase_status,
            session_id=session_id,
        )
        emitted_any = True
        snapshot_changed = True

    # Detect projects that vanished from the workspace (archived / pivoted dir
    # removed). We don't emit on disappearance — a vacated project is not a
    # phase transition — but we drop it from the snapshot so a future project
    # reusing the slug bootstraps cleanly rather than diffing against a stale
    # phase.
    if set(snapshot.keys()) != set(now_seen.keys()):
        snapshot_changed = True

    if snapshot_changed:
        _write_snapshot(snapshot_path, now_seen)

    if emitted_any:
        # Surface to the session-end log (does not block Stop; informational).
        sys.stderr.write("[telemetry] state-machine phase transition(s) recorded.\n")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="state-machine",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
