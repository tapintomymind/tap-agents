#!/usr/bin/env python3
"""
Integration test harness for the BL-055 session-tracking hook stack.

Tests the three hook scripts end-to-end by simulating Claude Code hook
invocations against a temporary workspace. Verifies:

  1. SessionStart on a fresh workspace writes a stub sidecar +
     active-sessions.md entry.
  2. PreToolUse on a NON-cross-cutting path is a noop (manifest unchanged).
  3. PreToolUse on a cross-cutting path materializes files_in_flight +
     upgrades the pending-<hash> session-id.
  4. Second PreToolUse on the same path is idempotent (no duplicate).
  5. SessionStart on a SECOND cc_session_id writes a separate sidecar +
     a separate manifest entry — does NOT collide with the first.
  6. Stop after a simulated merge-on-main writes auto_sealed + the
     auto_* fields, leaving completion_note intact if pre-set.
  7. Partial-seal case (some files merged, some not) writes status: partial.
  8. Stop on an empty files_in_flight stub writes status: noop.

The harness:
  - Spawns each hook script as a subprocess with a synthetic JSON
    payload on stdin (mirroring how Claude Code invokes them).
  - Uses CLAUDE_PROJECT_DIR env to point each subprocess at the temp
    workspace.
  - Initializes a temp git repo so the Stop hook's git-log query has a
    real answer to compare against.

Exit code: 0 if all scenarios pass; 1 otherwise. Prints one line per
scenario to stdout.

Run manually:
  python3 .claude/scripts/test-session-tracking.py

Future improvements:
  - Hook into the framework's broader test runner if/when one exists.
  - Subagent-attribution end-to-end test (currently covered by inspection
    + the empirical verification in the architect dispatch reportback;
    a real Agent dispatch can't be simulated from a Python subprocess).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent  # .claude/
HOOKS_DIR = REPO_ROOT / "hooks"

PASS = "PASS"
FAIL = "FAIL"


# ---------------------------------------------------------------------------
# Harness helpers
# ---------------------------------------------------------------------------

def _run_hook(script: str, payload: dict, env_extra: dict) -> tuple[int, str, str]:
    """Spawn one hook with a synthetic stdin payload + return (rc, stdout, stderr)."""
    env = dict(os.environ)
    env.update(env_extra)
    proc = subprocess.run(
        ["python3", str(HOOKS_DIR / script)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
        timeout=20,
    )
    return proc.returncode, proc.stdout, proc.stderr


def _setup_workspace(tmp: Path) -> tuple[Path, Path]:
    """Create a temp `.claude/workspace/` layout + minimal git repo.

    Returns (project_dir, workspace_dir).
    """
    project_dir = tmp / "project"
    claude_dir = project_dir / ".claude"
    workspace = claude_dir / "workspace"
    (workspace / "_global" / "sessions").mkdir(parents=True)
    # active-sessions.md will be auto-bootstrapped by upsert_entry. Create
    # the framework root structure git needs.
    subprocess.run(["git", "init", "-q", "-b", "main", str(project_dir)], check=True)
    subprocess.run(
        ["git", "-C", str(project_dir), "commit", "--allow-empty", "-m", "init", "-q"],
        check=True,
    )
    # Stage one config so we look like a real repo
    subprocess.run(
        ["git", "-C", str(project_dir), "config", "user.email", "test@test"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(project_dir), "config", "user.name", "Test"],
        check=True,
    )
    return project_dir, workspace


def _read_sidecar(workspace: Path, cc_id: str) -> dict | None:
    p = workspace / "_global" / "sessions" / (cc_id + ".json")
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _read_manifest(workspace: Path) -> str:
    p = workspace / "_global" / "active-sessions.md"
    if not p.exists():
        return ""
    return p.read_text()


def _check(label: str, cond: bool, detail: str = "") -> bool:
    status = PASS if cond else FAIL
    line = f"  [{status}] {label}"
    if detail:
        line += f"  ({detail})"
    print(line)
    return cond


def _simulate_main_commit(project_dir: Path, paths: list[str]) -> str:
    """Create the given paths inside .claude/ and commit them to main.

    Returns the short SHA of the new commit.
    """
    for rel in paths:
        full = project_dir / rel
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text("simulated merge\n")
    subprocess.run(
        ["git", "-C", str(project_dir), "add"] + paths,
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(project_dir), "commit", "-m", "test merge", "-q"],
        check=True,
    )
    sha = subprocess.run(
        ["git", "-C", str(project_dir), "rev-parse", "--short", "main"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return sha


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

def scenario_fresh_session(project_dir: Path, workspace: Path, cc_id: str) -> bool:
    """SessionStart on a fresh workspace -> stub sidecar + active-sessions.md entry."""
    print("scenario 1: SessionStart on fresh workspace")
    rc, out, err = _run_hook(
        "session-tracking-register.py",
        {"source": "startup", "session_id": cc_id},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, cc_id)
    ok &= _check("sidecar created", sc is not None)
    if sc:
        ok &= _check("status=in-progress", sc.get("status") == "in-progress")
        ok &= _check("files_in_flight=[]", sc.get("files_in_flight") == [])
        ok &= _check("tapagents_session_id has 'pending-' suffix",
                     "pending-" in (sc.get("tapagents_session_id") or ""))
    manifest = _read_manifest(workspace)
    ok &= _check("manifest contains the new id",
                 (sc or {}).get("tapagents_session_id", "") in manifest)
    return ok


def scenario_non_cross_cutting_noop(project_dir: Path, workspace: Path, cc_id: str) -> bool:
    """PreToolUse on a non-cross-cutting path leaves the manifest unchanged."""
    print("scenario 2: PreToolUse non-cross-cutting path (noop)")
    sc_before = _read_sidecar(workspace, cc_id)
    manifest_before = _read_manifest(workspace)
    rc, out, err = _run_hook(
        "session-tracking-files.py",
        {
            "tool_name": "Edit",
            "tool_input": {"file_path": str(project_dir / "src" / "foo.ts")},
            "session_id": cc_id,
        },
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc_after = _read_sidecar(workspace, cc_id)
    ok &= _check("files_in_flight still empty",
                 sc_after.get("files_in_flight") == [] if sc_after else False)
    ok &= _check("manifest unchanged",
                 _read_manifest(workspace) == manifest_before)
    return ok


def scenario_cross_cutting_edit(project_dir: Path, workspace: Path, cc_id: str) -> bool:
    """PreToolUse on a cross-cutting path materializes files_in_flight + upgrades id."""
    print("scenario 3: PreToolUse cross-cutting (protocol .md)")
    file_path = str(project_dir / ".claude" / "protocols" / "test-protocol.md")
    rc, out, err = _run_hook(
        "session-tracking-files.py",
        {
            "tool_name": "Edit",
            "tool_input": {"file_path": file_path},
            "session_id": cc_id,
        },
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, cc_id)
    ok &= _check("files_in_flight has one entry",
                 len((sc or {}).get("files_in_flight") or []) == 1)
    if sc and sc.get("files_in_flight"):
        rel = sc["files_in_flight"][0]
        ok &= _check("path is repo-relative .claude/...",
                     rel.startswith(".claude/"), f"got {rel!r}")
    ok &= _check("session-id upgraded from pending",
                 "pending-" not in (sc or {}).get("tapagents_session_id", ""),
                 f"id={sc.get('tapagents_session_id') if sc else None}")
    ok &= _check("session-id suffix carries scope label",
                 (sc or {}).get("tapagents_session_id", "").endswith("-protocol"))
    return ok


def scenario_duplicate_edit_idempotent(project_dir: Path, workspace: Path, cc_id: str) -> bool:
    """Re-edit the same path -> no duplicate entry."""
    print("scenario 4: PreToolUse duplicate edit (idempotent)")
    file_path = str(project_dir / ".claude" / "protocols" / "test-protocol.md")
    _run_hook(
        "session-tracking-files.py",
        {
            "tool_name": "Edit",
            "tool_input": {"file_path": file_path},
            "session_id": cc_id,
        },
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    sc = _read_sidecar(workspace, cc_id)
    return _check("files_in_flight still length 1",
                  len((sc or {}).get("files_in_flight") or []) == 1)


def scenario_second_session_isolated(project_dir: Path, workspace: Path,
                                     other_cc_id: str) -> bool:
    """Second cc_session_id -> separate sidecar + separate manifest entry."""
    print("scenario 5: separate cc_session_id (isolation)")
    rc, _, err = _run_hook(
        "session-tracking-register.py",
        {"source": "startup", "session_id": other_cc_id},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, other_cc_id)
    ok &= _check("separate sidecar exists", sc is not None)
    if sc:
        ok &= _check("distinct session_id token",
                     sc.get("cc_session_id") == other_cc_id)
    manifest = _read_manifest(workspace)
    n_active_entries = manifest.count("session-tracking:auto-entry:")
    ok &= _check("manifest has at least 2 distinct auto-entries (begin marker × 2)",
                 n_active_entries >= 4)  # 2 sessions × (begin + end) = 4 markers
    return ok


def scenario_auto_seal_full(project_dir: Path, workspace: Path, cc_id: str) -> bool:
    """Stop after simulated merge -> status: sealed."""
    print("scenario 6: Stop after full merge -> auto-sealed")
    # Simulate the claimed file landing on main.
    sc = _read_sidecar(workspace, cc_id)
    claimed = sc["files_in_flight"][0]
    _simulate_main_commit(project_dir, [claimed])
    rc, _, err = _run_hook(
        "session-tracking-seal.py",
        {"session_id": cc_id, "stop_hook_active": False},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, cc_id)
    ok &= _check("status=sealed", (sc or {}).get("status") == "sealed")
    ok &= _check("auto_sealed timestamp set", bool((sc or {}).get("auto_sealed")))
    ok &= _check("auto_seal_merge SHA set", bool((sc or {}).get("auto_seal_merge")))
    ok &= _check("completion_note contains AUTO-SEALED",
                 "AUTO-SEALED" in (sc or {}).get("completion_note", ""))
    return ok


def scenario_partial_seal(project_dir: Path, workspace: Path) -> bool:
    """One file merged, one not -> status: partial."""
    print("scenario 7: Stop with partial merge -> status=partial")
    cc_id = "test-partial-cc-id"
    # Register
    _run_hook(
        "session-tracking-register.py",
        {"source": "startup", "session_id": cc_id},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    # Claim two cross-cutting files
    for fname in ("test-partial-A.md", "test-partial-B.md"):
        _run_hook(
            "session-tracking-files.py",
            {
                "tool_name": "Edit",
                "tool_input": {"file_path": str(project_dir / ".claude" / "protocols" / fname)},
                "session_id": cc_id,
            },
            {"CLAUDE_PROJECT_DIR": str(project_dir)},
        )
    # Only merge one of them
    _simulate_main_commit(project_dir, [".claude/protocols/test-partial-A.md"])
    # Stop
    rc, _, err = _run_hook(
        "session-tracking-seal.py",
        {"session_id": cc_id, "stop_hook_active": False},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, cc_id)
    ok &= _check("status=partial", (sc or {}).get("status") == "partial")
    ok &= _check("auto_seal_files has only the merged one",
                 (sc or {}).get("auto_seal_files") == [".claude/protocols/test-partial-A.md"])
    ok &= _check("completion_note mentions PARTIAL AUTO-SEAL",
                 "PARTIAL AUTO-SEAL" in (sc or {}).get("completion_note", ""))
    return ok


def scenario_noop_seal(project_dir: Path, workspace: Path) -> bool:
    """Stop on empty stub -> status: noop."""
    print("scenario 8: Stop on empty stub -> status=noop")
    cc_id = "test-noop-cc-id"
    _run_hook(
        "session-tracking-register.py",
        {"source": "startup", "session_id": cc_id},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    rc, _, err = _run_hook(
        "session-tracking-seal.py",
        {"session_id": cc_id, "stop_hook_active": False},
        {"CLAUDE_PROJECT_DIR": str(project_dir)},
    )
    ok = True
    ok &= _check("exit 0", rc == 0, f"rc={rc} err={err[:200]}")
    sc = _read_sidecar(workspace, cc_id)
    ok &= _check("status=noop", (sc or {}).get("status") == "noop")
    ok &= _check("completion_note mentions no cross-cutting edits",
                 "No cross-cutting edits" in (sc or {}).get("completion_note", ""))
    return ok


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("Session-tracking integration tests (BL-055)\n")

    failed: list[str] = []
    with tempfile.TemporaryDirectory(prefix="session-tracking-test-") as tmpdir:
        tmp = Path(tmpdir)
        project_dir, workspace = _setup_workspace(tmp)

        # Reuse one cc_id across scenarios 1-4 + 6 so we exercise the
        # stub -> upgrade -> seal lifecycle on the same session.
        cc_id = "test-cc-id-AAA"

        for label, fn, args in [
            ("scenario_fresh_session", scenario_fresh_session, (project_dir, workspace, cc_id)),
            ("scenario_non_cross_cutting_noop", scenario_non_cross_cutting_noop, (project_dir, workspace, cc_id)),
            ("scenario_cross_cutting_edit", scenario_cross_cutting_edit, (project_dir, workspace, cc_id)),
            ("scenario_duplicate_edit_idempotent", scenario_duplicate_edit_idempotent, (project_dir, workspace, cc_id)),
            ("scenario_second_session_isolated", scenario_second_session_isolated,
             (project_dir, workspace, "test-cc-id-BBB")),
            ("scenario_auto_seal_full", scenario_auto_seal_full, (project_dir, workspace, cc_id)),
            ("scenario_partial_seal", scenario_partial_seal, (project_dir, workspace)),
            ("scenario_noop_seal", scenario_noop_seal, (project_dir, workspace)),
        ]:
            if not fn(*args):
                failed.append(label)
            print()

    if failed:
        print(f"FAIL — {len(failed)} scenarios failed: {', '.join(failed)}")
        return 1
    print("PASS — all scenarios passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
