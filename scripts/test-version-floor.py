#!/usr/bin/env python3
"""
test-version-floor.py
=====================

Regression test for the SemVer severity-floor **active-agent-surface carve-out**
in ``hooks/version-gate.py`` (the ``_is_active_surface`` helper +
``_AGENT_SUBNAMESPACE_PREFIXES`` + the OLD-path-keyed floor in
``_classify_severity_floor``). Companion of ``scripts/build-src/version-check.ts``'s
``isActiveSurface`` — same algorithm, this exercises the Python (Gate 2) side.

The carve-out (specified in ``protocols/versioning-protocol.md §4.2`` invariant 3)
re-keyed the floor to the **consumer-visible active surface**: for ``agents/`` that
is the top-level dispatchable contracts (``agents/*.md``), NOT the ``_planned/`` and
``_archive/`` sub-namespaces. Removals/renames are keyed on the **OLD path** and
additions on the **NEW path**, so:

  - retiring/demoting a LIVE agent off the active surface stays MAJOR, but
  - a move confined to the non-active sub-namespaces does not floor (PATCH on its own).

This test was smoke-tested in a throwaway repo when the carve-out shipped but
carried no committed regression coverage; that gap is what this file closes.

Mirrors the runner pattern of ``test-phase-transition.py``: stdlib-only
(``unittest`` + ``tempfile`` sandbox + a real ``git init`` repo), zero new devDeps.
Each case builds an isolated temp git repo, stages exactly one change-shape, points
the REAL ``_staged_diff_files`` at it via ``CLAUDE_PROJECT_DIR``, and asserts the
severity floor the REAL ``_classify_severity_floor`` returns.

Run via:

    python3 .claude/scripts/test-version-floor.py
    # or, from .claude/:  npm run test:version-floor

Exits non-zero on any assertion failure (so CI / the npm script can gate on it).
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make hooks/ importable and load the hyphenated hook module by path.
# .claude/scripts/test-version-floor.py -> .claude/hooks/version-gate.py
HERE = Path(__file__).resolve()
CLAUDE_ROOT = HERE.parent.parent  # .claude/
HOOKS_DIR = CLAUDE_ROOT / "hooks"

_spec = importlib.util.spec_from_file_location(
    "version_gate", str(HOOKS_DIR / "version-gate.py")
)
assert _spec is not None and _spec.loader is not None
vg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vg)  # type: ignore[union-attr]


def _run(repo: Path, *args: str, fatal: bool = True) -> subprocess.CompletedProcess:
    """Run a git command in ``repo``. ``git mv`` (and every setup op) is fatal on
    failure — a broken sandbox must fail the test loudly, never silently pass."""
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
    )
    if fatal and proc.returncode != 0:
        raise AssertionError(
            f"git {' '.join(args)} failed (rc={proc.returncode}) in {repo}:\n"
            f"stdout={proc.stdout!r}\nstderr={proc.stderr!r}"
        )
    return proc


def _write(repo: Path, rel: str, content: str) -> None:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


class VersionFloorTests(unittest.TestCase):
    """The 8-case matrix from the carve-out spec, against the REAL hook helpers."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmpdir.name)
        # init -b main; deterministic identity + rename detection.
        _run(self.repo, "init", "-q", "-b", "main")
        _run(self.repo, "config", "user.email", "test@tapagents.local")
        _run(self.repo, "config", "user.name", "tapagents-test")
        # Rename detection ON so the R-branch of _classify_severity_floor (old-path
        # keying) is genuinely exercised, not just the D+A decomposition.
        _run(self.repo, "config", "diff.renames", "true")

        # Base tree — one live top-level agent, one planned stub, a tracked
        # _archive/.gitkeep so the dir survives the checkout, one command.
        # Distinct multi-line contents keep git's rename detection unambiguous.
        _write(self.repo, "agents/live.md",
               "# live agent\n\nThe live, top-level dispatchable contract.\n"
               "Consumers rely on this file existing.\nLine four.\n")
        _write(self.repo, "agents/_planned/stub.md",
               "# planned stub\n\nA not-yet-dispatchable planned stub.\n"
               "The registry never loads this.\nLine four.\n")
        _write(self.repo, "agents/_archive/.gitkeep", "")
        _write(self.repo, "commands/x.md",
               "# command x\n\nAn active-surface command.\nLine three.\nLine four.\n")
        _run(self.repo, "add", "-A")
        _run(self.repo, "commit", "-qm", "base tree")

    def tearDown(self) -> None:
        self._tmpdir.cleanup()

    # -- helpers ------------------------------------------------------------

    def _floor(self) -> tuple[list[tuple[str, str, str]], str]:
        """Point the REAL _staged_diff_files at the sandbox repo and classify."""
        with mock.patch.dict(os.environ, {"CLAUDE_PROJECT_DIR": str(self.repo)}, clear=False):
            files = vg._staged_diff_files()
            floor = vg._classify_severity_floor(files)
        return files, floor

    def _assert_has_rename(self, files: list[tuple[str, str, str]]) -> None:
        """Prove the sandbox actually staged a rename (R-status), so the
        old-path-keyed rename branch of the floor is under test — not merely the
        equivalent D+A decomposition."""
        self.assertTrue(
            any(status.startswith("R") for status, _o, _n in files),
            f"expected a staged rename (R-status) but got: {files}",
        )

    # -- the 8-case matrix --------------------------------------------------

    def test_a_live_agent_to_archive_is_major(self) -> None:
        """(a) rename agents/live.md -> agents/_archive/live-retired.md => MAJOR.
        OLD path is on the active surface, so retiring a live agent stays MAJOR."""
        _run(self.repo, "mv", "agents/live.md", "agents/_archive/live-retired.md")
        files, floor = self._floor()
        self._assert_has_rename(files)
        self.assertEqual(floor, "major")

    def test_b_planned_to_archive_is_not_major(self) -> None:
        """(b) rename agents/_planned/stub.md -> agents/_archive/stub-promoted-D.md
        => NOT MAJOR. Both paths are non-active sub-namespaces; a bare move floors
        at PATCH (non-breaking)."""
        _run(self.repo, "mv", "agents/_planned/stub.md",
             "agents/_archive/stub-promoted-D.md")
        files, floor = self._floor()
        self._assert_has_rename(files)
        self.assertNotEqual(floor, "major")
        self.assertEqual(floor, "patch")

    def test_c_delete_planned_stub_is_not_major(self) -> None:
        """(c) delete agents/_planned/stub.md => NOT MAJOR. OLD path is non-active,
        so the deletion is not a consumer-visible removal; floors at PATCH."""
        _run(self.repo, "rm", "-q", "agents/_planned/stub.md")
        _files, floor = self._floor()
        self.assertNotEqual(floor, "major")
        self.assertEqual(floor, "patch")

    def test_d_delete_live_agent_is_major(self) -> None:
        """(d) delete agents/live.md => MAJOR. A live top-level agent removal."""
        _run(self.repo, "rm", "-q", "agents/live.md")
        _files, floor = self._floor()
        self.assertEqual(floor, "major")

    def test_e_command_rename_is_major(self) -> None:
        """(e) rename commands/x.md -> commands/y.md => MAJOR. commands/ is
        active-surface in full; the OLD path is active, so a rename is MAJOR."""
        _run(self.repo, "mv", "commands/x.md", "commands/y.md")
        files, floor = self._floor()
        self._assert_has_rename(files)
        self.assertEqual(floor, "major")

    def test_f_add_top_level_agent_is_minor(self) -> None:
        """(f) add agents/new.md => MINOR floor. A new active-surface file, no
        active-surface removal/rename."""
        _write(self.repo, "agents/new.md", "# new agent\n\nBrand new contract.\n")
        _run(self.repo, "add", "agents/new.md")
        _files, floor = self._floor()
        self.assertEqual(floor, "minor")

    def test_g_paired_promotion_is_minor(self) -> None:
        """(g) paired promotion: (b)'s _planned->_archive move PLUS add
        agents/newagent.md => MINOR. The addition sets the MINOR floor; the
        sub-namespace move contributes no removal/addition on the active surface."""
        _run(self.repo, "mv", "agents/_planned/stub.md",
             "agents/_archive/stub-promoted-D.md")
        _write(self.repo, "agents/newagent.md",
               "# new agent\n\nThe promoted, now-live contract.\n")
        _run(self.repo, "add", "agents/newagent.md")
        files, floor = self._floor()
        self._assert_has_rename(files)
        self.assertNotEqual(floor, "major")
        self.assertEqual(floor, "minor")

    def test_h_demotion_live_to_planned_is_major(self) -> None:
        """(h) demotion agents/live.md -> agents/_planned/live.md => MAJOR. The OLD
        path is a live top-level agent; demoting it off the active surface is MAJOR
        even though the NEW path is a non-active sub-namespace."""
        _run(self.repo, "mv", "agents/live.md", "agents/_planned/live.md")
        files, floor = self._floor()
        self._assert_has_rename(files)
        self.assertEqual(floor, "major")


if __name__ == "__main__":
    unittest.main(verbosity=2)
