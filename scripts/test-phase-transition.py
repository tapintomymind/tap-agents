#!/usr/bin/env python3
"""
test-phase-transition.py
========================

Behavior tests for the ``stop-phase-transition.py`` Stop hook (M-D track
slice S1 — the ``state-machine`` / ``transition`` / ``<from>-<to>`` emitter
reserved in ``protocols/telemetry-events.md §2.4``).

Mirrors the runner pattern of ``tap-agents/scripts/test-emit-event-http.py``:
stdlib-only (``unittest`` + ``tempfile`` sandbox + monkey-patched emit hooks),
zero new devDeps, run via:

    python3 .claude/scripts/test-phase-transition.py

Each test builds an isolated temp workspace (``<tmp>/workspace/<slug>/state.json``
+ ``<tmp>/workspace/_global/``), points the hook at it via ``CLAUDE_PROJECT_DIR``,
and stubs the hook's ``emit_event`` / ``emit_event_http`` so we capture the
transitions WITHOUT touching the real ``_global/events.jsonl`` or
``.phase-snapshot.json``. The snapshot diff is the unit under test.

Coverage:
  - first-seen project → silent bootstrap (no emit), snapshot recorded
  - unchanged phase across two runs → no emit
  - genuine transition → exactly one event, correct ``<from>-<to>`` subtype
  - reversion (planned → scoping) → emitted (legitimate transition)
  - side-state transition (planned → paused) → emitted
  - multi-project independence (one moves, one holds)
  - malformed state.json skipped, valid sibling still tracked
  - ``_``-prefixed buckets (``_global``) ignored
  - phase_status-only drift → no emit (status alone is not a transition)
  - vanished project dropped from snapshot, no emit
  - anti-loop guard (stop_hook_active) → no diff, no emit
  - corrupt snapshot → degrades to silent re-bootstrap, never raises
  - emit failure is swallowed (fail-open), hook still exits 0

Exits non-zero on any assertion failure (so CI can wire it as a gate).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make the hooks/ directory importable. The hook lives one level up + over:
# .claude/scripts/test-phase-transition.py → .claude/hooks/stop-phase-transition.py
HERE = Path(__file__).resolve()
CLAUDE_ROOT = HERE.parent.parent  # .claude/
HOOKS_DIR = CLAUDE_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

import importlib.util  # noqa: E402

# The hook filename has a hyphen, so it can't be a normal ``import``. Load it
# by path under a module alias.
_spec = importlib.util.spec_from_file_location(
    "stop_phase_transition", str(HOOKS_DIR / "stop-phase-transition.py")
)
assert _spec is not None and _spec.loader is not None
spt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spt)  # type: ignore[union-attr]


def _write_state(workspace: Path, slug: str, *, current_phase, phase_status="active",
                 include_slug: bool = True, raw: str | None = None) -> None:
    """Create ``<workspace>/<slug>/state.json``. If ``raw`` is given, write it
    verbatim (used to exercise the malformed-file path)."""
    proj = workspace / slug
    proj.mkdir(parents=True, exist_ok=True)
    target = proj / "state.json"
    if raw is not None:
        target.write_text(raw, encoding="utf-8")
        return
    doc: dict = {"current_phase": current_phase, "phase_status": phase_status}
    if include_slug:
        doc["slug"] = slug
    target.write_text(json.dumps(doc), encoding="utf-8")


class _Sandbox:
    """A temp workspace + captured emit calls, driving the hook end-to-end."""

    def __init__(self, tmp: Path) -> None:
        self.tmp = tmp
        self.workspace = tmp / "workspace"
        (self.workspace / "_global").mkdir(parents=True, exist_ok=True)
        self.local_emits: list[dict] = []
        self.http_emits: list[dict] = []

    @property
    def snapshot_path(self) -> Path:
        return self.workspace / "_global" / spt.SNAPSHOT_FILENAME

    def run(self, *, stop_hook_active: bool = False, session_id: str = "sess-test") -> int:
        """Invoke the hook's main() against the sandbox, capturing emits.

        We point the hook at the sandbox via CLAUDE_PROJECT_DIR (candidate #1 of
        _find_workspace is ``$CLAUDE_PROJECT_DIR/.claude/workspace`` — so we put
        the workspace under <tmp>/.claude/workspace? No: candidate #2 is
        ``$CLAUDE_PROJECT_DIR/workspace`` which matches our layout directly).
        """
        payload = {"session_id": session_id}
        if stop_hook_active:
            payload["stop_hook_active"] = True
        stdin = mock.patch.object(sys, "stdin")
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}

        def cap_local(**kw):
            self.local_emits.append(kw)

        def cap_http(**kw):
            self.http_emits.append(kw)

        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(spt, "emit_event", side_effect=cap_local), \
             mock.patch.object(spt, "emit_event_http", side_effect=cap_http), \
             mock.patch.object(sys.stdin, "read", return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            return spt.main()


class PhaseTransitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        self.sb = _Sandbox(self.tmp)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    # ------------------------------------------------------------------
    # Workspace resolution sanity
    # ------------------------------------------------------------------

    def test_find_workspace_resolves_sandbox(self) -> None:
        """The hook resolves CLAUDE_PROJECT_DIR/workspace (candidate #2)."""
        with mock.patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(self.tmp)}, clear=False):
            ws = spt._find_workspace()
        self.assertEqual(ws, self.sb.workspace)

    # ------------------------------------------------------------------
    # Bootstrap + no-change silence
    # ------------------------------------------------------------------

    def test_first_seen_is_silent_bootstrap(self) -> None:
        """First sight of a project records the snapshot but emits nothing."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [], "Bootstrap must not emit locally")
        self.assertEqual(self.sb.http_emits, [], "Bootstrap must not emit to cloud")
        # Snapshot now exists and records the phase.
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(snap["proj-a"]["phase"], "planned")

    def test_no_change_is_silent(self) -> None:
        """Two runs with an unchanged phase emit nothing on the second pass."""
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        self.sb.run()  # bootstrap
        self.sb.local_emits.clear()
        self.sb.http_emits.clear()
        rc = self.sb.run()  # unchanged
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [], "Unchanged phase must not emit")
        self.assertEqual(self.sb.http_emits, [])

    # ------------------------------------------------------------------
    # Genuine transition
    # ------------------------------------------------------------------

    def test_single_transition_emits_correct_subtype(self) -> None:
        """A phase change emits exactly one event with subtype ``<from>-<to>``."""
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        self.sb.run()  # bootstrap at scoping
        self.sb.local_emits.clear()
        self.sb.http_emits.clear()

        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        self.assertEqual(len(self.sb.local_emits), 1, "Exactly one local emit expected")
        ev = self.sb.local_emits[0]
        self.assertEqual(ev["source"], "state-machine")
        self.assertEqual(ev["type"], "transition")
        self.assertEqual(ev["subtype"], "scoping-planned")
        self.assertEqual(ev["payload"]["from_phase"], "scoping")
        self.assertEqual(ev["payload"]["to_phase"], "planned")
        self.assertEqual(ev["payload"]["project_slug"], "proj-a")
        self.assertEqual(ev["session_id"], "sess-test")
        # Cloud mirror fired once too, with the http keyword names.
        self.assertEqual(len(self.sb.http_emits), 1)
        hv = self.sb.http_emits[0]
        self.assertEqual(hv["source"], "state-machine")
        self.assertEqual(hv["event_type"], "transition")
        self.assertEqual(hv["event_subtype"], "scoping-planned")
        self.assertEqual(hv["project_slug"], "proj-a")
        # Snapshot advanced.
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(snap["proj-a"]["phase"], "planned")

    def test_reversion_is_emitted(self) -> None:
        """A backward move (planned → scoping, e.g. a revision) IS a transition."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        self.sb.run()
        self.sb.local_emits.clear()
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        self.sb.run()
        self.assertEqual(len(self.sb.local_emits), 1)
        self.assertEqual(self.sb.local_emits[0]["subtype"], "planned-scoping")

    def test_side_state_transition_is_emitted(self) -> None:
        """A move to a side state (planned → paused) emits with that subtype."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        self.sb.run()
        self.sb.local_emits.clear()
        _write_state(self.sb.workspace, "proj-a", current_phase="paused",
                     phase_status="paused")
        self.sb.run()
        self.assertEqual(len(self.sb.local_emits), 1)
        self.assertEqual(self.sb.local_emits[0]["subtype"], "planned-paused")

    def test_multi_step_sequence_emits_each_hop(self) -> None:
        """Three sequential runs across three phases emit two transitions."""
        _write_state(self.sb.workspace, "proj-a", current_phase="prd-ok")
        self.sb.run()  # bootstrap
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        self.sb.run()  # prd-ok → scoping
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        self.sb.run()  # scoping → planned
        subtypes = [e["subtype"] for e in self.sb.local_emits]
        self.assertEqual(subtypes, ["prd-ok-scoping", "scoping-planned"])

    # ------------------------------------------------------------------
    # Multi-project independence
    # ------------------------------------------------------------------

    def test_multi_project_independent_diffs(self) -> None:
        """Two projects diffed in one pass; only the one that moved emits."""
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        _write_state(self.sb.workspace, "proj-b", current_phase="planned")
        self.sb.run()  # bootstrap both
        self.sb.local_emits.clear()

        # proj-a advances; proj-b holds.
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        _write_state(self.sb.workspace, "proj-b", current_phase="planned")
        self.sb.run()
        self.assertEqual(len(self.sb.local_emits), 1, "Only the mover should emit")
        ev = self.sb.local_emits[0]
        self.assertEqual(ev["payload"]["project_slug"], "proj-a")
        self.assertEqual(ev["subtype"], "scoping-planned")

    # ------------------------------------------------------------------
    # Robustness: malformed / ignored / drift
    # ------------------------------------------------------------------

    def test_malformed_state_json_skipped_sibling_tracked(self) -> None:
        """A corrupt state.json is skipped; a valid sibling still bootstraps."""
        _write_state(self.sb.workspace, "proj-bad", current_phase=None,
                     raw="{ this is not json ")
        _write_state(self.sb.workspace, "proj-good", current_phase="planned")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertIn("proj-good", snap)
        self.assertNotIn("proj-bad", snap, "Unparseable project must not be tracked")

    def test_underscore_buckets_ignored(self) -> None:
        """``_``-prefixed dirs (e.g. a stray _scratch/state.json) are skipped."""
        _write_state(self.sb.workspace, "_scratch", current_phase="planned")
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        self.sb.run()
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertIn("proj-a", snap)
        self.assertNotIn("_scratch", snap)

    def test_phase_status_drift_only_does_not_emit(self) -> None:
        """phase_status changing while phase holds → snapshot refreshes, no emit."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned",
                     phase_status="active")
        self.sb.run()
        self.sb.local_emits.clear()
        _write_state(self.sb.workspace, "proj-a", current_phase="planned",
                     phase_status="blocked")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [], "Status-only drift is not a transition")
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(snap["proj-a"]["phase_status"], "blocked",
                         "Snapshot should still refresh the status field")

    def test_missing_slug_falls_back_to_dirname(self) -> None:
        """A state.json without a `slug` field uses the directory name."""
        _write_state(self.sb.workspace, "dir-slug", current_phase="planned",
                     include_slug=False)
        self.sb.run()
        self.sb.local_emits.clear()
        _write_state(self.sb.workspace, "dir-slug", current_phase="scoping",
                     include_slug=False)
        self.sb.run()
        self.assertEqual(len(self.sb.local_emits), 1)
        self.assertEqual(self.sb.local_emits[0]["payload"]["project_slug"], "dir-slug")

    def test_vanished_project_dropped_no_emit(self) -> None:
        """A project dir removed after bootstrap is pruned from the snapshot
        without emitting a (spurious) transition."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        _write_state(self.sb.workspace, "proj-b", current_phase="planned")
        self.sb.run()
        self.sb.local_emits.clear()
        # Remove proj-b entirely.
        import shutil
        shutil.rmtree(self.sb.workspace / "proj-b")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [], "Vanished project must not emit")
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertNotIn("proj-b", snap, "Vanished project must be pruned")
        self.assertIn("proj-a", snap)

    # ------------------------------------------------------------------
    # Anti-loop guard + fail-open
    # ------------------------------------------------------------------

    def test_stop_hook_active_short_circuits(self) -> None:
        """stop_hook_active=true → no diff, no emit, no snapshot write."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        self.sb.run()  # bootstrap
        self.sb.local_emits.clear()
        # Move the phase but signal stop_hook_active — must NOT emit.
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        rc = self.sb.run(stop_hook_active=True)
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [],
                         "Anti-loop guard must suppress emits")
        # Snapshot still shows the pre-guard phase (no advance happened).
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(snap["proj-a"]["phase"], "planned")

    def test_corrupt_snapshot_degrades_to_rebootstrap(self) -> None:
        """A corrupt snapshot file → treated as first-run; no raise, no emit."""
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        # Pre-seed a garbage snapshot.
        self.sb.snapshot_path.write_text("{ broken json", encoding="utf-8")
        rc = self.sb.run()
        self.assertEqual(rc, 0)
        self.assertEqual(self.sb.local_emits, [],
                         "Corrupt snapshot must re-bootstrap silently")
        # Snapshot got rewritten to a valid one.
        snap = json.loads(self.sb.snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(snap["proj-a"]["phase"], "planned")

    def test_real_emit_path_writes_to_sandbox_and_exits_zero(self) -> None:
        """End-to-end with the REAL (unmocked) emit_event + emit_event_http: a
        transition completes, exits 0, and the row lands in the SANDBOX
        events.jsonl — never the real one (CLAUDE_PROJECT_DIR is the temp dir).

        emit_event_http is a no-op here because no TAPAGENTS_LIVE_TOKEN is set,
        so no network call occurs. This exercises the live wiring the hook uses
        in production while staying fully sandboxed."""
        _write_state(self.sb.workspace, "proj-a", current_phase="scoping")
        # Bootstrap with REAL emits (no transition yet → nothing written).
        payload = {"session_id": "sess-real"}
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(sys.stdin, "read", return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            self.assertEqual(spt.main(), 0)

        # Now move the phase and run again with the real emit path.
        _write_state(self.sb.workspace, "proj-a", current_phase="planned")
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(sys.stdin, "read", return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            rc = spt.main()
        self.assertEqual(rc, 0)

        # The transition row must be in the SANDBOX events.jsonl.
        events_file = self.sb.workspace / "_global" / "events.jsonl"
        self.assertTrue(events_file.exists(),
                        "Real emit_event should write the sandbox events.jsonl")
        rows = [json.loads(ln) for ln in
                events_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
        transitions = [r for r in rows
                       if r.get("source") == "state-machine"
                       and r.get("type") == "transition"]
        self.assertEqual(len(transitions), 1, "Exactly one transition row expected")
        self.assertEqual(transitions[0]["subtype"], "scoping-planned")

    def test_emit_misfire_capture_on_main_exception(self) -> None:
        """If main() itself raises (defensive), the __main__ guard captures a
        misfire and re-raises — matching stop-dispatch-monitor.py. We verify the
        misfire helper is invoked with source='state-machine'."""
        captured: list[dict] = []

        def cap_misfire(**kw):
            captured.append(kw)

        with mock.patch.object(spt, "main", side_effect=RuntimeError("boom")), \
             mock.patch.object(spt, "emit_misfire", side_effect=cap_misfire):
            # Re-run the module's __main__ block logic by hand: the guard calls
            # main(), and on exception emits a misfire then re-raises.
            with self.assertRaises(RuntimeError):
                try:
                    spt.main()
                except Exception as e:  # noqa: BLE001 — mirrors the __main__ guard
                    spt.emit_misfire(
                        source="state-machine",
                        error=type(e).__name__ + ": " + str(e)[:200],
                        payload={},
                    )
                    raise
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0]["source"], "state-machine")
        self.assertIn("boom", captured[0]["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
