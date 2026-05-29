#!/usr/bin/env python3
"""
test-session-work-output.py
===========================

Behavior tests for the **session-work-output** telemetry stream (M-D track
slice B): the `session-work-output` / `summary` / `seal` event that
`hooks/session-tracking-seal.py` emits at session seal to capture what a
session actually *produced* — product files touched + committed lines-of-code.

Mirrors the runner pattern of `test-session-tracking-http.py` (the slice-A
test) and `test-phase-transition.py` (the S1 test): stdlib-only (`unittest` +
`tempfile` sandbox + monkey-patched emit hooks + stubbed git helpers), zero new
devDeps, run via:

    python3 .claude/scripts/test-session-work-output.py

Coverage (the four areas the slice-B dispatch named, plus idempotency + cap):

  1. LOC computation — `loc_landed_on_main_since()` parses `--numstat` into the
     per-file + aggregate shape, sums across commits, excludes binary files,
     and fails open to the unavailable/empty shape on any git failure.
  2. Committed-vs-provisional distinction — the seal event ALWAYS carries
     `loc_provisional: false` (the committed-to-main figure is authoritative;
     this subtype never emits a mid-session estimate).
  3. Dual-emit — every work-output emit fires BOTH the local `emit_event`
     (source of truth, type=/subtype=) and the cloud-mirror `emit_event_http`
     (event_type=/event_subtype=), with matching source + subtype + payload.
  4. No-emit-when-no-work — git/main unavailable → no emit; git ran but zero
     files landed → no emit; only ≥1 committed file → exactly one emit.

Plus: idempotency across resumes (re-emit only when the committed SHA changes),
top-N path truncation (files_count vs len(files_touched) + files_truncated),
and a guard that the existing lifecycle seal events are UNAFFECTED (slice B is
purely additive — it adds a separate event, it does not change the lifecycle
branches).

Exits non-zero on any assertion failure (so CI can wire it as a gate).
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make the hooks/ directory importable. The hooks live one level up + over:
# .claude/scripts/test-session-work-output.py -> .claude/hooks/<hook>.py
HERE = Path(__file__).resolve()
CLAUDE_ROOT = HERE.parent.parent  # .claude/
HOOKS_DIR = CLAUDE_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

import _session_tracking as st  # noqa: E402  (after sys.path insert)


def _load_hook(filename: str, alias: str):
    """Load a hyphenated hook file by path under a module alias (same trick the
    sibling tests use; hyphenated filenames can't be normal import targets)."""
    spec = importlib.util.spec_from_file_location(alias, str(HOOKS_DIR / filename))
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


seal = _load_hook("session-tracking-seal.py", "stk_seal_wo")


# ===========================================================================
# 1. LOC computation — loc_landed_on_main_since() parsing + fail-open
# ===========================================================================

class LocComputationTests(unittest.TestCase):
    """Drive `loc_landed_on_main_since()` by stubbing subprocess.run so the
    --numstat parsing is exercised deterministically (no real git needed)."""

    def _run_with_numstat(self, stdout: str, returncode: int = 0) -> dict:
        completed = subprocess.CompletedProcess(
            args=["git"], returncode=returncode, stdout=stdout, stderr="",
        )
        with mock.patch.object(st.subprocess, "run", return_value=completed):
            return st.loc_landed_on_main_since("2026-05-01")

    def test_sums_across_commits_and_files(self) -> None:
        """Multiple commits touching the same + different files sum correctly."""
        numstat = (
            "10\t2\tsrc/a.ts\n"
            "5\t1\tsrc/b.ts\n"
            "\n"                      # commit boundary (empty --pretty line)
            "3\t0\tsrc/a.ts\n"       # a.ts touched again → sums
        )
        r = self._run_with_numstat(numstat)
        self.assertTrue(r["available"])
        self.assertEqual(r["added"], 18)            # 10 + 5 + 3
        self.assertEqual(r["deleted"], 3)           # 2 + 1 + 0
        self.assertEqual(r["files_count"], 2)       # a.ts, b.ts
        self.assertEqual(r["files"]["src/a.ts"], {"added": 13, "deleted": 2})
        self.assertEqual(r["files"]["src/b.ts"], {"added": 5, "deleted": 1})

    def test_binary_files_excluded(self) -> None:
        """Binary files report '-\\t-\\t<path>' in --numstat and must NOT be
        counted (no honest line count exists for them)."""
        numstat = (
            "-\t-\tassets/logo.png\n"
            "12\t3\tsrc/a.ts\n"
            "-\t-\tassets/font.woff2\n"
        )
        r = self._run_with_numstat(numstat)
        self.assertTrue(r["available"])
        self.assertEqual(r["files_count"], 1)       # only the text file
        self.assertEqual(r["added"], 12)
        self.assertEqual(r["deleted"], 3)
        self.assertNotIn("assets/logo.png", r["files"])

    def test_git_nonzero_returns_unavailable(self) -> None:
        """A non-zero git exit (e.g. no `main` branch) → unavailable/empty."""
        r = self._run_with_numstat("whatever", returncode=128)
        self.assertFalse(r["available"])
        self.assertEqual(r["added"], 0)
        self.assertEqual(r["files_count"], 0)

    def test_git_missing_returns_unavailable(self) -> None:
        """git not installed / not a repo → FileNotFoundError → fail-open."""
        with mock.patch.object(st.subprocess, "run",
                               side_effect=FileNotFoundError("git")):
            r = st.loc_landed_on_main_since("2026-05-01")
        self.assertFalse(r["available"])
        self.assertEqual(r, {"added": 0, "deleted": 0, "files": {},
                             "files_count": 0, "available": False})

    def test_empty_window_is_available_but_zero(self) -> None:
        """git ran fine but nothing landed in the window → available True,
        files_count 0. This is the 'honest empty' case the emitter treats as
        no-work (distinct from 'unmeasurable')."""
        r = self._run_with_numstat("")
        self.assertTrue(r["available"])
        self.assertEqual(r["files_count"], 0)
        self.assertEqual(r["added"], 0)


# ===========================================================================
# Shared harness for the seal-hook work-output emit tests
# ===========================================================================

class _WorkOutputSealHarness(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        self.workspace = self.tmp / "workspace"
        (self.workspace / "_global").mkdir(parents=True, exist_ok=True)
        self.local: list[dict] = []
        self.http: list[dict] = []

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _seed_sidecar(self, *, session_id: str,
                      files_in_flight: list[str] | None = None) -> None:
        from _session_tracking import now_iso, write_sidecar  # type: ignore
        data = {
            "tapagents_session_id": "2026-05-29T00-00-feature-x",
            "cc_session_id": session_id,
            "started": "2026-05-29T00:00:00Z",
            "scope": "test",
            "files_in_flight": files_in_flight or [],
            "status": "in-progress",
            "last_updated": now_iso(),
        }
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False):
            ok = write_sidecar(self.workspace, session_id, data)
        self.assertTrue(ok, "sidecar seed write should succeed")

    def _read_sidecar(self, session_id: str) -> dict | None:
        from _session_tracking import read_sidecar  # type: ignore
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False):
            return read_sidecar(self.workspace, session_id)

    def _run(self, *, session_id: str, loc: dict, sha: str | None,
             landed: set[str] | None = None,
             stop_hook_active: bool = False) -> int:
        """Drive seal.main() with stubbed git helpers so both the work-output
        emit AND the lifecycle branch are deterministic.

        `loc`   → what loc_landed_on_main_since() returns.
        `sha`   → what latest_main_sha() returns.
        `landed`→ what files_landed_on_main_since() returns (lifecycle branch);
                  defaults to empty (left-in-progress) so the lifecycle path
                  doesn't interfere with work-output assertions unless a test
                  opts in.
        """
        payload = {"session_id": session_id, "stop_hook_active": stop_hook_active}
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(seal, "loc_landed_on_main_since",
                               side_effect=lambda _s: dict(loc)), \
             mock.patch.object(seal, "latest_main_sha",
                               side_effect=lambda: sha), \
             mock.patch.object(seal, "files_landed_on_main_since",
                               side_effect=lambda _s: set(landed or set())), \
             mock.patch.object(seal, "emit_event",
                               side_effect=lambda **kw: self.local.append(kw)), \
             mock.patch.object(seal, "emit_event_http",
                               side_effect=lambda **kw: self.http.append(kw)), \
             mock.patch.object(sys.stdin, "read",
                               return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            return seal.main()

    def _work_rows(self, rows: list[dict]) -> list[dict]:
        return [r for r in rows if r.get("source") == "session-work-output"]


# ===========================================================================
# 2 + 3. Dual-emit + committed-vs-provisional + payload shape
# ===========================================================================

class WorkOutputEmitTests(_WorkOutputSealHarness):
    LOC_WITH_WORK = {
        "added": 412, "deleted": 87,
        "files": {
            "src/lib/billing/stripe-webhook.ts": {"added": 300, "deleted": 50},
            "src/app/api/checkout/route.ts": {"added": 112, "deleted": 37},
        },
        "files_count": 2, "available": True,
    }

    def test_dual_emit_local_and_cloud(self) -> None:
        """A session with committed work emits BOTH local and cloud, with
        matching source/subtype/payload (the slice-A/S1 dual-emit contract)."""
        self._seed_sidecar(session_id="sess-wo")
        rc = self._run(session_id="sess-wo", loc=self.LOC_WITH_WORK, sha="abc1234")
        self.assertEqual(rc, 0)
        lw = self._work_rows(self.local)
        hw = self._work_rows(self.http)
        self.assertEqual(len(lw), 1, "exactly one local work-output emit")
        self.assertEqual(len(hw), 1, "exactly one cloud work-output emit")
        le, he = lw[0], hw[0]
        # Local uses type=/subtype=; cloud uses event_type=/event_subtype=.
        self.assertEqual(le["type"], "summary")
        self.assertEqual(le["subtype"], "seal")
        self.assertEqual(he["event_type"], "summary")
        self.assertEqual(he["event_subtype"], "seal")
        self.assertEqual(he["source"], "session-work-output")
        # Same payload object both sides (faithful cloud mirror).
        self.assertEqual(le["payload"], he["payload"])
        self.assertEqual(le["session_id"], "sess-wo")
        self.assertEqual(he["session_id"], "sess-wo")

    def test_payload_carries_honest_counts(self) -> None:
        self._seed_sidecar(session_id="sess-counts")
        self._run(session_id="sess-counts", loc=self.LOC_WITH_WORK, sha="abc1234")
        p = self._work_rows(self.local)[0]["payload"]
        self.assertEqual(p["files_count"], 2)
        self.assertEqual(p["loc_added"], 412)
        self.assertEqual(p["loc_deleted"], 87)
        self.assertEqual(p["committed_sha"], "abc1234")
        self.assertEqual(p["files_truncated"], False)
        self.assertCountEqual(
            p["files_touched"],
            ["src/lib/billing/stripe-webhook.ts", "src/app/api/checkout/route.ts"],
        )

    def test_loc_provisional_always_false_for_seal(self) -> None:
        """Committed-vs-provisional distinction: the seal event's figure is the
        authoritative committed-to-main number — loc_provisional is False."""
        self._seed_sidecar(session_id="sess-prov")
        self._run(session_id="sess-prov", loc=self.LOC_WITH_WORK, sha="abc1234")
        p = self._work_rows(self.local)[0]["payload"]
        self.assertIn("loc_provisional", p)
        self.assertIs(p["loc_provisional"], False)

    def test_local_emit_uses_local_keyword_shape(self) -> None:
        """Guard: local emit uses type=/subtype= (NOT the http names) — we ADDED
        a mirror, we didn't rewrite the local call into http shape."""
        self._seed_sidecar(session_id="sess-shape")
        self._run(session_id="sess-shape", loc=self.LOC_WITH_WORK, sha="abc1234")
        le = self._work_rows(self.local)[0]
        self.assertIn("type", le)
        self.assertIn("subtype", le)
        self.assertNotIn("event_type", le)
        self.assertNotIn("event_subtype", le)


# ===========================================================================
# 4. No-emit-when-no-work
# ===========================================================================

class NoEmitWhenNoWorkTests(_WorkOutputSealHarness):
    def test_unavailable_git_emits_no_work_output(self) -> None:
        """git/main unavailable → NO work-output event (the figure is
        unmeasurable; a zero would falsely read as 'changed nothing'). This is
        the framework-HQ orchestrator path."""
        self._seed_sidecar(session_id="sess-unavail")
        loc = {"added": 0, "deleted": 0, "files": {}, "files_count": 0,
               "available": False}
        rc = self._run(session_id="sess-unavail", loc=loc, sha=None)
        self.assertEqual(rc, 0)
        self.assertEqual(self._work_rows(self.local), [],
                         "no work-output local emit when git unavailable")
        self.assertEqual(self._work_rows(self.http), [],
                         "no work-output cloud emit when git unavailable")

    def test_available_but_zero_files_emits_no_work_output(self) -> None:
        """git ran but nothing committed in the window → NO work-output event
        (honest empty)."""
        self._seed_sidecar(session_id="sess-zero")
        loc = {"added": 0, "deleted": 0, "files": {}, "files_count": 0,
               "available": True}
        rc = self._run(session_id="sess-zero", loc=loc, sha="abc1234")
        self.assertEqual(rc, 0)
        self.assertEqual(self._work_rows(self.local), [])
        self.assertEqual(self._work_rows(self.http), [])

    def test_no_sidecar_emits_nothing(self) -> None:
        """No sidecar for the session → main() early-returns; no work-output."""
        loc = {"added": 10, "deleted": 1, "files": {"src/a.ts": {"added": 10, "deleted": 1}},
               "files_count": 1, "available": True}
        rc = self._run(session_id="sess-none", loc=loc, sha="abc1234")
        self.assertEqual(rc, 0)
        self.assertEqual(self._work_rows(self.local), [])


# ===========================================================================
# Idempotency across resumes + top-N truncation + lifecycle-unaffected guard
# ===========================================================================

class IdempotencyAndCapTests(_WorkOutputSealHarness):
    LOC = {"added": 10, "deleted": 1,
           "files": {"src/a.ts": {"added": 10, "deleted": 1}},
           "files_count": 1, "available": True}

    def test_no_reemit_when_sha_unchanged(self) -> None:
        """Two Stop passes with the SAME committed SHA → work-output emits ONCE
        (idempotency: re-emit only on genuinely-new commits)."""
        self._seed_sidecar(session_id="sess-idem")
        self._run(session_id="sess-idem", loc=self.LOC, sha="sha-001")
        self.assertEqual(len(self._work_rows(self.local)), 1)
        # Marker persisted on the sidecar.
        side = self._read_sidecar("sess-idem")
        self.assertEqual(side.get("work_output_emitted_sha"), "sha-001")
        # Second Stop, same SHA → no new work-output emit.
        self.local.clear(); self.http.clear()
        self._run(session_id="sess-idem", loc=self.LOC, sha="sha-001")
        self.assertEqual(self._work_rows(self.local), [],
                         "same SHA must not re-emit work-output")

    def test_reemit_when_sha_changes(self) -> None:
        """A later Stop after NEW commits (different SHA) DOES re-emit."""
        self._seed_sidecar(session_id="sess-newwork")
        self._run(session_id="sess-newwork", loc=self.LOC, sha="sha-001")
        self.local.clear(); self.http.clear()
        loc2 = {"added": 25, "deleted": 4,
                "files": {"src/a.ts": {"added": 10, "deleted": 1},
                          "src/b.ts": {"added": 15, "deleted": 3}},
                "files_count": 2, "available": True}
        self._run(session_id="sess-newwork", loc=loc2, sha="sha-002")
        rows = self._work_rows(self.local)
        self.assertEqual(len(rows), 1, "new SHA must re-emit work-output")
        self.assertEqual(rows[0]["payload"]["files_count"], 2)
        self.assertEqual(rows[0]["payload"]["committed_sha"], "sha-002")

    def test_top_n_truncation(self) -> None:
        """A session touching > top-N files rolls up to counts + a top-N
        (by-churn) path subset, with files_truncated True and the true total
        in files_count."""
        n = seal.WORK_OUTPUT_TOP_N_FILES
        files = {}
        for i in range(n + 10):
            # Churn increases with i so the highest-churn files are the high i.
            files[f"src/f{i:03d}.ts"] = {"added": i + 1, "deleted": 0}
        loc = {"added": sum(v["added"] for v in files.values()), "deleted": 0,
               "files": files, "files_count": len(files), "available": True}
        self._seed_sidecar(session_id="sess-trunc")
        self._run(session_id="sess-trunc", loc=loc, sha="abc1234")
        p = self._work_rows(self.local)[0]["payload"]
        self.assertEqual(p["files_count"], n + 10)
        self.assertEqual(len(p["files_touched"]), n)
        self.assertTrue(p["files_truncated"])
        # The highest-churn file (largest i) must be retained.
        self.assertIn(f"src/f{(n + 10 - 1):03d}.ts", p["files_touched"])
        # A lowest-churn file must be dropped.
        self.assertNotIn("src/f000.ts", p["files_touched"])

    def test_lifecycle_seal_events_unaffected(self) -> None:
        """Slice B is additive: a session whose cross-cutting files merged still
        produces its lifecycle 'auto-sealed' event UNCHANGED, alongside (not
        instead of) the work-output event."""
        self._seed_sidecar(session_id="sess-both",
                           files_in_flight=[".claude/protocols/p.md"])
        # The cross-cutting file landed (lifecycle → auto-sealed) AND there is
        # committed product work (work-output emits).
        self._run(session_id="sess-both", loc=self.LOC, sha="abc1234",
                  landed={".claude/protocols/p.md"})
        sources = [r["source"] for r in self.local]
        self.assertIn("session-tracking-seal", sources,
                      "lifecycle seal event must still fire")
        self.assertIn("session-work-output", sources,
                      "work-output event fires alongside the lifecycle event")
        # The lifecycle auto-sealed row is intact.
        lifecycle = [r for r in self.local if r["source"] == "session-tracking-seal"]
        self.assertEqual(lifecycle[0]["subtype"], "auto-sealed")


if __name__ == "__main__":
    unittest.main(verbosity=2)
