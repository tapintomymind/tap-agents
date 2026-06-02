#!/usr/bin/env python3
"""
test-session-tracking-http.py
=============================

Behavior tests for the **cloud-mirror** (``emit_event_http``) additions to the
three session-tracking hooks (M-D track slice A — the telemetry cloud-mirror
slice that follows S1's ``stop-phase-transition.py``):

  - ``session-tracking-register.py`` (SessionStart) — 3 emit sites:
        no-workspace / resume / fresh-stub
  - ``session-tracking-files.py``    (PreToolUse)   — 1 emit site:
        cross-cutting file-touch
  - ``session-tracking-seal.py``     (Stop)         — 4 emit sites:
        noop / auto-sealed / partial-seal / left-in-progress

Mirrors the runner pattern of ``test-phase-transition.py`` (the S1 test):
stdlib-only (``unittest`` + ``tempfile`` sandbox + monkey-patched emit hooks),
zero new devDeps, run via:

    python3 .claude/scripts/test-session-tracking-http.py

The contract under test is the same one S1 established in
``stop-phase-transition.py``: the local ``emit_event()`` is the source of truth
and is UNCHANGED; ``emit_event_http()`` is a best-effort cloud mirror added
ALONGSIDE each local emit. So for EVERY site, both fire, with matching
``source`` + subtype, and the HTTP variant uses the ``event_type`` /
``event_subtype`` keyword names (per ``_telemetry.emit_event_http``'s surface).
These are existing ``fire``-type events, newly mirrored — no new schema
(``telemetry-events.md §6``).

Each test builds an isolated temp workspace (``<tmp>/workspace/_global/...``),
points the hook at it via ``CLAUDE_PROJECT_DIR`` (candidate #2 of the shared
``find_workspace()`` is ``$CLAUDE_PROJECT_DIR/workspace``), and stubs the hook's
``emit_event`` / ``emit_event_http`` so we capture calls WITHOUT touching the
real ``_global/events.jsonl`` or doing any network I/O. The real
``_session_tracking`` lib functions run against the sandbox; for the Stop hook
the git-backed seal helpers are stubbed to drive each branch deterministically.

Exits non-zero on any assertion failure (so CI can wire it as a gate).
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make the hooks/ directory importable. The hooks live one level up + over:
# .claude/scripts/test-session-tracking-http.py -> .claude/hooks/<hook>.py
HERE = Path(__file__).resolve()
CLAUDE_ROOT = HERE.parent.parent  # .claude/
HOOKS_DIR = CLAUDE_ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))


def _load_hook(filename: str, alias: str):
    """Load a hyphenated hook file by path under a module alias.

    Hook filenames have hyphens, so they can't be normal ``import`` targets;
    load by path (the same trick ``test-phase-transition.py`` uses)."""
    spec = importlib.util.spec_from_file_location(alias, str(HOOKS_DIR / filename))
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


register = _load_hook("session-tracking-register.py", "stk_register")
files_hook = _load_hook("session-tracking-files.py", "stk_files")
seal = _load_hook("session-tracking-seal.py", "stk_seal")


def _assert_local_http_parity(testcase: unittest.TestCase,
                              local: list[dict], http: list[dict],
                              *, expected_source: str,
                              expected_subtypes: list[str]) -> None:
    """Shared assertion: each captured local emit has a paired cloud-mirror
    emit, with matching source + subtype, and the HTTP variant carries the
    ``event_type`` / ``event_subtype`` keyword names + ``type``/``event_type``
    both equal to ``"fire"``."""
    testcase.assertEqual(
        len(local), len(http),
        f"local emit_event count ({len(local)}) must equal cloud-mirror "
        f"emit_event_http count ({len(http)})",
    )
    testcase.assertEqual(
        [e["subtype"] for e in local], expected_subtypes,
        "local emit subtypes",
    )
    for le, he in zip(local, http):
        # local uses type=/subtype=; http uses event_type=/event_subtype=.
        testcase.assertEqual(le["source"], expected_source)
        testcase.assertEqual(he["source"], expected_source)
        testcase.assertEqual(le["type"], "fire")
        testcase.assertEqual(he["event_type"], "fire")
        testcase.assertEqual(he["event_subtype"], le["subtype"],
                             "cloud-mirror event_subtype must equal the local subtype")
        # Same agent-attribution fields cross-mirror (so the cloud feed is
        # faithful to the local row).
        testcase.assertEqual(he.get("agent_context"), le.get("agent_context"))
        testcase.assertEqual(he.get("agent_type"), le.get("agent_type"))
        testcase.assertEqual(he.get("agent_id"), le.get("agent_id"))
        testcase.assertEqual(he.get("session_id"), le.get("session_id"))
        # Same payload object cross-mirror.
        testcase.assertEqual(he.get("payload"), le.get("payload"))


# ===========================================================================
# session-tracking-register.py — 3 emit sites
# ===========================================================================

class RegisterCloudMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        # Real workspace for the resume / fresh-stub paths.
        (self.tmp / "workspace" / "_global").mkdir(parents=True, exist_ok=True)
        self.local: list[dict] = []
        self.http: list[dict] = []

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _run(self, *, source: str, session_id: str,
             project_dir: Path | None = None) -> int:
        payload = {"source": source, "session_id": session_id}
        env = {"CLAUDE_PROJECT_DIR": str(project_dir or self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(register, "emit_event",
                               side_effect=lambda **kw: self.local.append(kw)), \
             mock.patch.object(register, "emit_event_http",
                               side_effect=lambda **kw: self.http.append(kw)), \
             mock.patch.object(sys.stdin, "read",
                               return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            return register.main()

    def test_fresh_stub_mirrors_to_cloud(self) -> None:
        """A fresh session registration emits one local + one cloud event,
        subtype = the SessionStart source ('startup')."""
        rc = self._run(source="startup", session_id="sess-fresh")
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-register",
            expected_subtypes=["startup"],
        )
        # Payload carries the stub id (and is the SAME object both sides).
        self.assertIn("tapagents_session_id", self.local[0]["payload"])

    def test_resume_mirrors_to_cloud(self) -> None:
        """Resume of an existing sidecar emits one local + one cloud event,
        subtype = the resume source ('resume')."""
        # First call materializes the sidecar (fresh stub).
        self._run(source="startup", session_id="sess-resume")
        self.local.clear()
        self.http.clear()
        # Second call with same session_id → resume branch.
        rc = self._run(source="resume", session_id="sess-resume")
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-register",
            expected_subtypes=["resume"],
        )
        self.assertIn("resume_count", self.local[0]["payload"])

    def test_no_workspace_mirrors_to_cloud(self) -> None:
        """When no workspace exists, the no-workspace fire event is mirrored
        to the cloud too.

        We stub ``find_workspace`` → None rather than relying on an empty
        CLAUDE_PROJECT_DIR: the shared ``find_workspace()`` has a fallback
        candidate (``<hooks_dir>/../workspace``) that resolves to the REAL
        framework workspace, so pointing at an empty dir would NOT exercise
        the no-workspace branch. Stubbing the resolver is the hermetic way."""
        payload = {"source": "startup", "session_id": "sess-nows"}
        with mock.patch.object(register, "find_workspace", return_value=None), \
             mock.patch.object(register, "emit_event",
                               side_effect=lambda **kw: self.local.append(kw)), \
             mock.patch.object(register, "emit_event_http",
                               side_effect=lambda **kw: self.http.append(kw)), \
             mock.patch.object(sys.stdin, "read",
                               return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            rc = register.main()
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-register",
            expected_subtypes=["no-workspace"],
        )

    def test_unknown_source_subtype_mirrors_consistently(self) -> None:
        """A non-standard source string maps to subtype 'unknown' on BOTH the
        local and cloud emit (the inline computation is shared)."""
        rc = self._run(source="weird-source", session_id="sess-weird")
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-register",
            expected_subtypes=["unknown"],
        )

    def test_local_emit_is_unchanged_shape(self) -> None:
        """Guard: the local emit_event still uses type=/subtype= (NOT the http
        event_type=/event_subtype= names) — i.e. we ADDED the mirror, we did
        not rewrite the local call."""
        self._run(source="startup", session_id="sess-shape")
        self.assertEqual(len(self.local), 1)
        le = self.local[0]
        self.assertIn("type", le)
        self.assertIn("subtype", le)
        self.assertNotIn("event_type", le)
        self.assertNotIn("event_subtype", le)


# ===========================================================================
# session-tracking-files.py — 1 emit site
# ===========================================================================

class FilesCloudMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        (self.tmp / "workspace" / "_global").mkdir(parents=True, exist_ok=True)
        self.local: list[dict] = []
        self.http: list[dict] = []

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _run(self, *, file_path: str, session_id: str,
             agent_id: str | None = None, agent_type: str | None = None) -> int:
        payload: dict = {
            "tool_name": "Edit",
            "tool_input": {"file_path": file_path},
            "session_id": session_id,
        }
        if agent_id is not None:
            payload["agent_id"] = agent_id
        if agent_type is not None:
            payload["agent_type"] = agent_type
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(files_hook, "emit_event",
                               side_effect=lambda **kw: self.local.append(kw)), \
             mock.patch.object(files_hook, "emit_event_http",
                               side_effect=lambda **kw: self.http.append(kw)), \
             mock.patch.object(sys.stdin, "read",
                               return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            return files_hook.main()

    def test_cross_cutting_edit_mirrors_to_cloud(self) -> None:
        """A cross-cutting edit (a protocol file) emits one local + one cloud
        event, subtype = the scope label ('protocol')."""
        rc = self._run(
            file_path="/x/App Development/.claude/protocols/some-protocol.md",
            session_id="sess-files",
        )
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-files",
            expected_subtypes=["protocol"],
        )

    def test_subagent_attribution_crosses_to_cloud(self) -> None:
        """The subagent agent_context/agent_type/agent_id from the payload are
        carried IDENTICALLY into the cloud mirror (parity helper checks the
        cross-mirror); here we also assert the values are the subagent ones."""
        rc = self._run(
            file_path="/x/.claude/agents/architect.md",
            session_id="sess-files-sub",
            agent_id="agent-123",
            agent_type="architect",
        )
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-files",
            expected_subtypes=["agent-contract"],
        )
        self.assertEqual(self.local[0]["agent_context"], "subagent")
        self.assertEqual(self.http[0]["agent_context"], "subagent")
        self.assertEqual(self.http[0]["agent_type"], "architect")
        self.assertEqual(self.http[0]["agent_id"], "agent-123")

    def test_non_cross_cutting_edit_emits_nothing(self) -> None:
        """A non-cross-cutting edit (project src/) returns early — no local
        emit and (therefore) no cloud mirror."""
        rc = self._run(
            file_path="/x/some-project/src/index.ts",
            session_id="sess-noncc",
        )
        self.assertEqual(rc, 0)
        self.assertEqual(self.local, [], "non-cross-cutting edit must not emit locally")
        self.assertEqual(self.http, [], "non-cross-cutting edit must not cloud-mirror")


# ===========================================================================
# session-tracking-seal.py — 4 emit sites
# ===========================================================================

class SealCloudMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        self.workspace = self.tmp / "workspace"
        (self.workspace / "_global").mkdir(parents=True, exist_ok=True)
        self.local: list[dict] = []
        self.http: list[dict] = []

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def _seed_sidecar(self, *, session_id: str, files_in_flight: list[str]) -> None:
        """Write a sidecar in-progress entry so the Stop hook has something to
        seal. Uses the real lib writer so schema_version is correct."""
        from _session_tracking import now_iso, write_sidecar  # type: ignore
        data = {
            "tapagents_session_id": "2026-05-29T00-00-protocol",
            "cc_session_id": session_id,
            "started": now_iso(),
            "scope": "test",
            "files_in_flight": files_in_flight,
            "status": "in-progress",
            "last_updated": now_iso(),
        }
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False):
            ok = write_sidecar(self.workspace, session_id, data)
        self.assertTrue(ok, "sidecar seed write should succeed")

    def _run(self, *, session_id: str,
             landed: set[str], sha: str | None) -> int:
        """Drive seal.main() with stubbed git helpers so the seal branch is
        deterministic."""
        payload = {"session_id": session_id}
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(seal, "files_landed_on_main_since",
                               side_effect=lambda _started: set(landed)), \
             mock.patch.object(seal, "latest_main_sha",
                               side_effect=lambda: sha), \
             mock.patch.object(seal, "emit_event",
                               side_effect=lambda **kw: self.local.append(kw)), \
             mock.patch.object(seal, "emit_event_http",
                               side_effect=lambda **kw: self.http.append(kw)), \
             mock.patch.object(sys.stdin, "read",
                               return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            return seal.main()

    def test_noop_mirrors_to_cloud(self) -> None:
        """A sidecar with empty files_in_flight → noop branch → mirrored."""
        self._seed_sidecar(session_id="sess-noop", files_in_flight=[])
        rc = self._run(session_id="sess-noop", landed=set(), sha=None)
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-seal",
            expected_subtypes=["noop"],
        )

    def test_auto_sealed_mirrors_to_cloud(self) -> None:
        """All claimed files merged → auto-sealed branch → mirrored."""
        self._seed_sidecar(session_id="sess-sealed",
                           files_in_flight=[".claude/protocols/p.md"])
        rc = self._run(session_id="sess-sealed",
                       landed={".claude/protocols/p.md"}, sha="abc1234")
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-seal",
            expected_subtypes=["auto-sealed"],
        )
        self.assertEqual(self.local[0]["payload"]["files_merged"], 1)

    def test_partial_seal_mirrors_to_cloud(self) -> None:
        """Some merged, some not → partial-seal branch → mirrored."""
        self._seed_sidecar(
            session_id="sess-partial",
            files_in_flight=[".claude/protocols/p.md", ".claude/protocols/q.md"],
        )
        rc = self._run(session_id="sess-partial",
                       landed={".claude/protocols/p.md"}, sha="def5678")
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-seal",
            expected_subtypes=["partial-seal"],
        )
        self.assertEqual(self.local[0]["payload"]["files_merged"], 1)
        self.assertEqual(self.local[0]["payload"]["files_unmerged"], 1)

    def test_left_in_progress_mirrors_to_cloud(self) -> None:
        """No claimed file merged → left-in-progress branch → mirrored."""
        self._seed_sidecar(session_id="sess-inprog",
                           files_in_flight=[".claude/protocols/p.md"])
        rc = self._run(session_id="sess-inprog", landed=set(), sha=None)
        self.assertEqual(rc, 0)
        _assert_local_http_parity(
            self, self.local, self.http,
            expected_source="session-tracking-seal",
            expected_subtypes=["left-in-progress"],
        )
        self.assertEqual(self.local[0]["payload"]["files_unmerged"], 1)


# ===========================================================================
# End-to-end real-emit-path test (unmocked emit_event + emit_event_http)
# ===========================================================================

class RealEmitPathTests(unittest.TestCase):
    """Exercise the live wiring with the REAL (unmocked) emit_event +
    emit_event_http, fully sandboxed. emit_event_http is a no-op here because
    no TAPAGENTS_LIVE_TOKEN is set, so no network call occurs — but importing
    and calling it through the production code path must not raise, and the
    LOCAL row must still land in the sandbox events.jsonl (source of truth)."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmpdir.name)
        (self.tmp / "workspace" / "_global").mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    def test_register_real_emit_writes_local_and_no_token_no_network(self) -> None:
        payload = {"source": "startup", "session_id": "sess-real"}
        env = {"CLAUDE_PROJECT_DIR": str(self.tmp)}
        # Ensure no token is set so the cloud mirror is a guaranteed no-op.
        env["TAPAGENTS_LIVE_TOKEN"] = ""
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(sys.stdin, "read", return_value=json.dumps(payload)), \
             mock.patch.object(sys, "stderr"):
            rc = register.main()
        self.assertEqual(rc, 0)
        events_file = self.tmp / "workspace" / "_global" / "events.jsonl"
        self.assertTrue(events_file.exists(),
                        "real emit_event should write the sandbox events.jsonl")
        rows = [json.loads(ln) for ln in
                events_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
        reg_rows = [r for r in rows if r.get("source") == "session-tracking-register"]
        self.assertEqual(len(reg_rows), 1, "exactly one local register row expected")
        self.assertEqual(reg_rows[0]["type"], "fire")
        self.assertEqual(reg_rows[0]["subtype"], "startup")


if __name__ == "__main__":
    unittest.main(verbosity=2)
