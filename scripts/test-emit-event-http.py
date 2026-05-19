#!/usr/bin/env python3
"""
test-emit-event-http.py
=======================

Behavior tests for ``emit_event_http`` in ``hooks/_telemetry.py``. Mirrors
the runner pattern of ``scripts/test-permission-denial-telemetry.py`` and
``scripts/sync-src/sync.test.ts``: stdlib-only (``unittest`` + monkey-patched
``urllib.request.urlopen``) so we keep zero new devDeps and run via
``tsx``-less ``python3 scripts/test-emit-event-http.py``.

Covers AC-M-D0-9 (fail-open) plus the batching + auth contract specified
in the dispatch directive.

Run from the package root:

    python3 scripts/test-emit-event-http.py

Exits non-zero on any assertion failure (so CI can wire it as a gate).
"""
from __future__ import annotations

import io
import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

# Make the hooks/ directory importable. The package root is two levels up
# from this file (scripts/test-emit-event-http.py → tap-agents/).
HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "hooks"))

import _telemetry  # noqa: E402 — path-injected above


class _FakeResp:
    """Minimal urllib response double — supports the ``read()`` + context-mgr
    shape ``_http_post_json`` uses."""

    def __init__(self, body: bytes = b"") -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _reset_module_state() -> None:
    """Wipe in-process batching + warn flags between tests so each case starts
    from a clean module-level state."""
    with _telemetry._BATCH_LOCK:
        _telemetry._BATCH = []
        if _telemetry._BATCH_TIMER is not None:
            _telemetry._BATCH_TIMER.cancel()
            _telemetry._BATCH_TIMER = None
    _telemetry._WARNED_MISSING_TOKEN = False
    _telemetry._WARNED_MISSING_URL = False


class EmitEventHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        _reset_module_state()

    # ------------------------------------------------------------------
    # Batch + flush behavior
    # ------------------------------------------------------------------

    def test_batches_until_size_threshold(self) -> None:
        """Twenty events trigger an automatic flush; nineteen do not."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append({
                "url": req.full_url,
                "headers": dict(req.headers),
                "body": req.data.decode("utf-8") if req.data else None,
            })
            return _FakeResp()

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_test123",
            "TAPAGENTS_LIVE_INGEST_URL": "https://example.invalid/ingest",
        }
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            # 19 events — batched but no flush.
            for i in range(19):
                _telemetry.emit_event_http(
                    source="t-batch-size",
                    event_type="probe",
                    payload={"i": i},
                )
            self.assertEqual(len(captured), 0,
                             "Expected NO HTTP POST before size threshold")

            # 20th event triggers flush.
            _telemetry.emit_event_http(
                source="t-batch-size",
                event_type="probe",
                payload={"i": 19},
            )
            self.assertEqual(len(captured), 1,
                             "Expected exactly one HTTP POST at size threshold")

            import json as _json
            body = _json.loads(captured[0]["body"])
            self.assertIn("events", body)
            self.assertEqual(len(body["events"]), 20,
                             "Expected batch body to contain all 20 events")

    def test_flush_pending_drains_immediately(self) -> None:
        """``flush_pending()`` POSTs whatever is queued even below threshold."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append(req.data.decode("utf-8") if req.data else "")
            return _FakeResp()

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_abc",
            "TAPAGENTS_LIVE_INGEST_URL": "https://example.invalid/ingest",
        }
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            for i in range(3):
                _telemetry.emit_event_http(
                    source="t-flush",
                    event_type="probe",
                    payload={"i": i},
                )
            self.assertEqual(len(captured), 0)
            _telemetry.flush_pending()
            self.assertEqual(len(captured), 1,
                             "flush_pending should issue exactly one POST")

    def test_time_threshold_triggers_flush(self) -> None:
        """A timer flush fires within the 5s window when fewer than 20 events
        are batched. We accelerate the timer for the test by patching the
        constant to a small value."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append(req.data.decode("utf-8") if req.data else "")
            return _FakeResp()

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_abc",
            "TAPAGENTS_LIVE_INGEST_URL": "https://example.invalid/ingest",
        }
        with mock.patch.object(_telemetry, "_BATCH_TIME_THRESHOLD_SECONDS", 0.1), \
             mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            _telemetry.emit_event_http(
                source="t-timer",
                event_type="probe",
                payload={"summary": "tick"},
            )
            # Wait long enough for the timer to fire.
            time.sleep(0.5)
            self.assertEqual(len(captured), 1,
                             "Timer flush should fire after threshold elapses")

    # ------------------------------------------------------------------
    # Auth + URL contract
    # ------------------------------------------------------------------

    def test_auth_header_set_from_env(self) -> None:
        """Authorization header carries the env-var token verbatim."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append(dict(req.headers))
            return _FakeResp()

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_specifictoken",
            "TAPAGENTS_LIVE_INGEST_URL": "https://example.invalid/ingest",
        }
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            _telemetry.emit_event_http(source="t-auth", event_type="probe")
            _telemetry.flush_pending()

        self.assertEqual(len(captured), 1)
        # urllib normalizes header names; check for the bearer token presence
        # under any case.
        joined = " ".join(f"{k}: {v}" for k, v in captured[0].items())
        self.assertIn("Bearer tap_local_specifictoken", joined,
                      f"Auth header missing token; saw: {joined}")

    def test_default_url_used_when_only_token_set(self) -> None:
        """When ``TAPAGENTS_LIVE_INGEST_URL`` is unset, the default URL fires."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append(req.full_url)
            return _FakeResp()

        # Clear any inherited URL var, set only the token.
        env_unset = ["TAPAGENTS_LIVE_INGEST_URL"]
        with mock.patch.dict(os.environ, {"TAPAGENTS_LIVE_TOKEN": "tap_local_x"}, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            for k in env_unset:
                os.environ.pop(k, None)
            _telemetry.emit_event_http(source="t-default-url", event_type="probe")
            _telemetry.flush_pending()

        self.assertEqual(captured, [_telemetry._DEFAULT_INGEST_URL])

    # ------------------------------------------------------------------
    # Fail-open contract (AC-M-D0-9)
    # ------------------------------------------------------------------

    def test_no_token_is_silent_noop(self) -> None:
        """Missing env var → no HTTP, no raise; one stderr warn line max."""
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append(req)
            return _FakeResp()

        # Strip token + url so we hit the missing-token branch deterministically.
        with mock.patch.dict(os.environ, {}, clear=True), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            # Capture stderr so we can confirm "warn once" semantics.
            buf = io.StringIO()
            with mock.patch("sys.stderr", buf):
                for _ in range(25):  # past the size threshold
                    _telemetry.emit_event_http(source="t-no-token", event_type="probe")
                _telemetry.flush_pending()

            self.assertEqual(len(captured), 0,
                             "HTTP should not fire when token missing")
            # Should have warned exactly once, not 25× — count "TAPAGENTS_LIVE_TOKEN"
            # mentions in stderr.
            warn_count = buf.getvalue().count("TAPAGENTS_LIVE_TOKEN not set")
            self.assertLessEqual(warn_count, 1,
                                 f"Expected ≤1 warn for missing token; saw {warn_count}")

    def test_http_failure_does_not_raise(self) -> None:
        """500 / network error → swallowed silently; calling code continues."""
        def fake_urlopen_500(req, timeout=None):
            raise _telemetry.urllib.error.HTTPError(
                req.full_url, 500, "Internal Server Error", {}, io.BytesIO(b"")
            )

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_test",
            "TAPAGENTS_LIVE_INGEST_URL": "https://example.invalid/ingest",
        }
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen_500):
            try:
                _telemetry.emit_event_http(source="t-500", event_type="probe")
                _telemetry.flush_pending()
            except Exception as e:  # pragma: no cover — failure is a bug
                self.fail(f"emit_event_http raised on HTTP 500: {e!r}")

    def test_unreachable_host_does_not_raise(self) -> None:
        """Network unreachable (URLError) → swallowed; AC-M-D0-9 explicit case."""
        def fake_urlopen_dns(req, timeout=None):
            raise _telemetry.urllib.error.URLError("Name or service not known")

        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_test",
            "TAPAGENTS_LIVE_INGEST_URL": "https://invalid.example.invalid/ingest",
        }
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen_dns):
            try:
                _telemetry.emit_event_http(
                    source="t-dns",
                    event_type="probe",
                    payload={"summary": "should not raise"},
                )
                _telemetry.flush_pending()
            except Exception as e:  # pragma: no cover
                self.fail(f"emit_event_http raised on URLError: {e!r}")

    def test_local_emit_event_unaffected_by_http_failure(self) -> None:
        """When the HTTP mirror fails, the local emit_event() write path is
        untouched — local file remains the source of truth."""
        env = {
            "TAPAGENTS_LIVE_TOKEN": "tap_local_test",
            "TAPAGENTS_LIVE_INGEST_URL": "https://invalid.example.invalid/ingest",
            "CLAUDE_PROJECT_DIR": str(ROOT),
        }
        local_writes: list[str] = []

        original_events_path = _telemetry._events_path
        events_file = ROOT / "tmp_test_events.jsonl"
        # Use a sandbox events.jsonl so the test doesn't pollute the real one.
        if events_file.exists():
            events_file.unlink()

        def sandbox_events_path() -> Path:
            return events_file

        def fake_urlopen_fail(req, timeout=None):
            raise _telemetry.urllib.error.URLError("forced")

        try:
            with mock.patch.dict(os.environ, env, clear=False), \
                 mock.patch.object(_telemetry, "_events_path", side_effect=sandbox_events_path), \
                 mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen_fail):
                _telemetry.emit_event(
                    source="t-pair",
                    type="probe",
                    subtype="local-still-fires",
                    agent_context="orchestrator",
                    agent_type=None,
                    agent_id=None,
                    payload={"summary": "alive"},
                    session_id="t-pair-1",
                )
                _telemetry.emit_event_http(source="t-pair", event_type="probe")
                _telemetry.flush_pending()

            self.assertTrue(events_file.exists(),
                            "Local emit_event() must still write its row")
            content = events_file.read_text(encoding="utf-8")
            self.assertIn("local-still-fires", content)
        finally:
            if events_file.exists():
                try:
                    events_file.unlink()
                except OSError:
                    pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
