#!/usr/bin/env python3
"""
test-credential-resolution.py
=============================

Behavior tests for ``_resolve_credentials()`` in ``hooks/_telemetry.py`` —
the Slice A0 credential-file read path. Mirrors the runner pattern of
``scripts/test-emit-event-http.py`` (stdlib-only ``unittest`` + monkey-patched
``urllib.request.urlopen`` / ``Path.home`` / ``os.environ``) so we keep zero
new devDeps and run via ``python3 scripts/test-credential-resolution.py``.

Covers the A0 precedence chain + fail-open contract:
    token: TAPAGENTS_LIVE_TOKEN env → credentials.json#token → None
    url:   TAPAGENTS_LIVE_INGEST_URL env → credentials.json#ingest_url
           → _DEFAULT_INGEST_URL

Plus an end-to-end check that a flush picks up a file-only credential (no env
var) and POSTs with the file's token + ingest_url — i.e. the "no export, no
restart" guarantee a fresh hook subprocess relies on.

Run from the package root:

    python3 scripts/test-credential-resolution.py

Exits non-zero on any assertion failure (so CI can wire it as a gate).
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make the hooks/ directory importable. The package root is two levels up
# from this file (scripts/test-credential-resolution.py → <root>/).
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


class CredentialResolutionTests(unittest.TestCase):
    """Direct unit tests of the pure resolver. Each test isolates the config
    home to a tmp dir so the operator's real ~/.config/tapagents/ is NEVER
    read (hermetic regardless of demo state on the dev machine)."""

    def setUp(self) -> None:
        _reset_module_state()
        # Per-test isolated XDG config home → no chance of reading the real
        # credential file the demo may have written on this machine.
        self._tmp = tempfile.TemporaryDirectory()
        self.cfg_home = Path(self._tmp.name)
        self.creds_dir = self.cfg_home / "tapagents"
        self.creds_dir.mkdir(parents=True, exist_ok=True)
        self.creds_path = self.creds_dir / "credentials.json"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_creds(self, obj) -> None:
        self.creds_path.write_text(
            json.dumps(obj) if not isinstance(obj, str) else obj,
            encoding="utf-8",
        )

    def _isolated_env(self, **overrides):
        """A clean env dict that points XDG_CONFIG_HOME at the tmp dir and
        starts with NO live env vars; tests add token/url via overrides."""
        base = {"XDG_CONFIG_HOME": str(self.cfg_home)}
        base.update(overrides)
        return mock.patch.dict(os.environ, base, clear=True)

    # ------------------------------------------------------------------
    # Precedence — token
    # ------------------------------------------------------------------

    def test_env_token_wins_over_file(self) -> None:
        """When the env var is set, the file token is ignored (backward-compat:
        existing operator/CI env overrides stay byte-identical)."""
        self._write_creds({"token": "tap_local_FROM_FILE", "ingest_url": "https://file.invalid/ingest"})
        with self._isolated_env(
            TAPAGENTS_LIVE_TOKEN="tap_local_FROM_ENV",
            TAPAGENTS_LIVE_INGEST_URL="https://env.invalid/ingest",
        ):
            token, url = _telemetry._resolve_credentials()
        self.assertEqual(token, "tap_local_FROM_ENV")
        self.assertEqual(url, "https://env.invalid/ingest")

    def test_file_token_used_when_no_env(self) -> None:
        """No env var → the file's token + ingest_url are used. This is the
        core A0 behavior (no export needed)."""
        self._write_creds({"token": "tap_local_FILEONLY", "ingest_url": "http://localhost:3000/api/account/tapagents-live/ingest"})
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertEqual(token, "tap_local_FILEONLY")
        self.assertEqual(url, "http://localhost:3000/api/account/tapagents-live/ingest")

    def test_env_token_with_file_url(self) -> None:
        """Mixed precedence: env token + file ingest_url both resolve from
        their respective tiers (env token wins, url falls through to file)."""
        self._write_creds({"token": "tap_local_IGNORED", "ingest_url": "https://file.invalid/ingest"})
        with self._isolated_env(TAPAGENTS_LIVE_TOKEN="tap_local_ENV"):
            token, url = _telemetry._resolve_credentials()
        self.assertEqual(token, "tap_local_ENV")
        self.assertEqual(url, "https://file.invalid/ingest")

    # ------------------------------------------------------------------
    # Precedence — ingest URL
    # ------------------------------------------------------------------

    def test_env_url_wins_over_file(self) -> None:
        self._write_creds({"token": "tap_local_X", "ingest_url": "https://file.invalid/ingest"})
        with self._isolated_env(TAPAGENTS_LIVE_INGEST_URL="https://env.invalid/ingest"):
            token, url = _telemetry._resolve_credentials()
        # token comes from the file (no env token); url from env.
        self.assertEqual(token, "tap_local_X")
        self.assertEqual(url, "https://env.invalid/ingest")

    def test_default_url_when_file_has_token_but_no_url(self) -> None:
        """File supplies a token but omits ingest_url → default URL is used."""
        self._write_creds({"token": "tap_local_NOURL"})
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertEqual(token, "tap_local_NOURL")
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)

    def test_default_url_when_no_token_no_url_anywhere(self) -> None:
        """No env, no file → (None, default URL). The None token is what makes
        the flush fail-open into a no-op."""
        # No file written.
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertIsNone(token)
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)

    # ------------------------------------------------------------------
    # Fail-open — malformed / unreadable / wrong-shape file
    # ------------------------------------------------------------------

    def test_malformed_json_is_failopen(self) -> None:
        """Garbage in credentials.json → swallowed; (None, default)."""
        self._write_creds("{ this is not json ,,,")
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertIsNone(token)
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)

    def test_non_object_json_is_failopen(self) -> None:
        """A JSON array (not an object) → ignored; (None, default)."""
        self._write_creds(["tap_local_oops"])
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertIsNone(token)
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)

    def test_non_string_token_field_is_ignored(self) -> None:
        """token is the wrong type (int) → treated as absent, fail-open."""
        self._write_creds({"token": 12345, "ingest_url": ["nope"]})
        with self._isolated_env():
            token, url = _telemetry._resolve_credentials()
        self.assertIsNone(token)
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)

    def test_missing_file_is_failopen(self) -> None:
        """Pointing XDG at a dir with no credentials.json → (None, default)."""
        empty = tempfile.TemporaryDirectory()
        try:
            with mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": empty.name}, clear=True):
                token, url = _telemetry._resolve_credentials()
            self.assertIsNone(token)
            self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)
        finally:
            empty.cleanup()

    def test_resolve_never_raises_even_if_home_explodes(self) -> None:
        """If Path.home() itself raises (no HOME, no pwd entry), the resolver
        still returns cleanly — never propagates."""
        with mock.patch.dict(os.environ, {}, clear=True), \
             mock.patch.object(_telemetry.Path, "home", side_effect=RuntimeError("no home")):
            try:
                token, url = _telemetry._resolve_credentials()
            except Exception as e:  # pragma: no cover — would be a bug
                self.fail(f"_resolve_credentials raised: {e!r}")
        self.assertIsNone(token)
        self.assertEqual(url, _telemetry._DEFAULT_INGEST_URL)


class CredentialFileFlushIntegrationTests(unittest.TestCase):
    """End-to-end: a flush with ONLY a credential file (no env var) POSTs to
    the file's ingest_url with the file's token. This is the 'no export, no
    restart' guarantee — a fresh subprocess reads the file directly."""

    def setUp(self) -> None:
        _reset_module_state()
        self._tmp = tempfile.TemporaryDirectory()
        self.cfg_home = Path(self._tmp.name)
        creds_dir = self.cfg_home / "tapagents"
        creds_dir.mkdir(parents=True, exist_ok=True)
        self.creds_path = creds_dir / "credentials.json"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_flush_uses_file_credentials_when_env_absent(self) -> None:
        captured: list[dict] = []

        def fake_urlopen(req, timeout=None):
            captured.append({
                "url": req.full_url,
                "headers": dict(req.headers),
                "body": req.data.decode("utf-8") if req.data else None,
            })
            return _FakeResp()

        self.creds_path.write_text(json.dumps({
            "token": "tap_local_filecred",
            "ingest_url": "http://localhost:3000/api/account/tapagents-live/ingest",
        }), encoding="utf-8")

        # NO TAPAGENTS_LIVE_* env vars — only the file + XDG pointer.
        with mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.cfg_home)}, clear=True), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            _telemetry.emit_event_http(source="t-filecred", event_type="probe", payload={"i": 1})
            _telemetry.flush_pending()

        self.assertEqual(len(captured), 1, "Expected exactly one POST from the file credential")
        self.assertEqual(captured[0]["url"], "http://localhost:3000/api/account/tapagents-live/ingest")
        joined = " ".join(f"{k}: {v}" for k, v in captured[0]["headers"].items())
        self.assertIn("Bearer tap_local_filecred", joined,
                      f"Auth header should carry the FILE token; saw: {joined}")
        body = json.loads(captured[0]["body"])
        self.assertEqual(len(body["events"]), 1)

    def test_flush_noop_when_no_env_and_no_file(self) -> None:
        """No env + no file → no HTTP, one warn line max, never raises."""
        captured: list = []

        def fake_urlopen(req, timeout=None):
            captured.append(req)
            return _FakeResp()

        with mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.cfg_home)}, clear=True), \
             mock.patch.object(_telemetry.urllib.request, "urlopen", side_effect=fake_urlopen):
            buf = io.StringIO()
            with mock.patch("sys.stderr", buf):
                for _ in range(25):  # past the size threshold
                    _telemetry.emit_event_http(source="t-noop", event_type="probe")
                _telemetry.flush_pending()
            self.assertEqual(len(captured), 0, "No HTTP when neither env nor file yields a token")
            # Warn-once: the A0 message mentions credentials.json.
            self.assertLessEqual(buf.getvalue().count("credentials.json"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
