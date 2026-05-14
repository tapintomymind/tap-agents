#!/usr/bin/env python3
"""
PreToolUse hook — enforces protocols/sync-tapagents-protocol.md at the mechanical layer.

Layer B of the five-layer enforcement chain. Detects framework-sync commits/pushes
targeting `dev` or `main` (instead of the canonical `sync-tapagents` branch) and
blocks them.

Fingerprint matching (per protocol §3):

  Signature A — package.json contains a @tapintomymind/tap-agents version change
  Signature B — scaffold-source/ has staged changes (any path)
  Signature C — .scaffold-meta.json staged

A staged diff matching ANY of A/B/C on the current branch `dev` or `main`
(per `.tapagents-manifest.json#syncBranch`, default `sync-tapagents`)
triggers BLOCK unless the commit message contains:

    [sync-protocol-override: <non-empty reason>]

Hook fires on:
  - Bash commands matching `git commit` (validates staged diff + commit message)
  - Bash commands matching `git push` (validates target ref vs current branch when
    framework-sync content is being pushed away from sync-tapagents)

Exit 0  = allow.
Exit 2  = block with stderr message naming the protocol + remediation.

Other exits print a warning and allow — the hook must never silently swallow a
tool call. If the hook itself is broken, that's a discipline issue to surface,
not a license to bypass enforcement.

Authenticity marker stderr lines (per protocols/hook-misdiagnosis-discipline.md
convention used by orchestrator-dispatch-gate.py):
    `Sync-discipline gate BLOCKED:`
    `TAPAGENTS_SYNC_GATE_FIRED_V1`
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Shared telemetry helper — fail-open import.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


_HOOK_PAYLOAD: dict = {}
_TOOL_NAME: str = ""


# --- helpers ------------------------------------------------------------------


def _project_dir() -> Path:
    raw = os.environ.get("CLAUDE_PROJECT_DIR")
    if not raw:
        return Path.cwd()
    return Path(raw)


def _run_git(*args: str, cwd: Path | None = None) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd or _project_dir(),
            capture_output=True,
            text=True,
            timeout=8,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def _current_branch() -> str:
    return _run_git("rev-parse", "--abbrev-ref", "HEAD")


def _sync_branch_name() -> str:
    """Read syncBranch from .tapagents-manifest.json; default 'sync-tapagents'."""
    manifest = _project_dir() / ".tapagents-manifest.json"
    if not manifest.exists():
        return "sync-tapagents"
    try:
        data = json.loads(manifest.read_text())
        v = data.get("syncBranch")
        if isinstance(v, str) and v.strip():
            return v.strip()
    except (json.JSONDecodeError, OSError):
        pass
    return "sync-tapagents"


def _staged_files() -> list[str]:
    """Return list of staged file paths. Robust to renames + NUL separators."""
    raw = _run_git("diff", "--cached", "--name-only", "-z")
    if not raw:
        return []
    return [p for p in raw.split("\x00") if p]


def _staged_package_json_has_framework_dep_change() -> bool:
    """True iff staged diff to package.json changes @tapintomymind/tap-agents."""
    if "package.json" not in _staged_files():
        return False
    diff = _run_git("diff", "--cached", "--", "package.json")
    if not diff:
        return False
    # Look for an added or removed line referencing @tapintomymind/tap-agents.
    # Standard package.json shape: `"@tapintomymind/tap-agents": "<version>"`
    pattern = re.compile(r'^[+-].*"@tapintomymind/tap-agents"\s*:')
    for line in diff.splitlines():
        if pattern.search(line):
            return True
    return False


def _staged_has_scaffold_source_change() -> bool:
    """True iff any staged path starts with scaffold-source/."""
    for f in _staged_files():
        if f.startswith("scaffold-source/"):
            return True
    return False


def _staged_has_scaffold_meta_change() -> bool:
    """True iff .scaffold-meta.json (anywhere) is staged."""
    for f in _staged_files():
        if f.endswith(".scaffold-meta.json"):
            return True
    return False


def _matches_framework_sync_fingerprint() -> tuple[bool, list[str]]:
    """Check all three signatures. Return (matched, list_of_matched_signatures)."""
    matches = []
    if _staged_package_json_has_framework_dep_change():
        matches.append("A: package.json @tapintomymind/tap-agents version change")
    if _staged_has_scaffold_source_change():
        matches.append("B: scaffold-source/ changes")
    if _staged_has_scaffold_meta_change():
        matches.append("C: .scaffold-meta.json change")
    return (len(matches) > 0, matches)


# Token format: [sync-protocol-override: <reason>]
OVERRIDE_PATTERN = re.compile(
    r"\[sync-protocol-override:\s*([^\]\n]+?)\]",
    re.IGNORECASE,
)


def _extract_override_reason(commit_message: str) -> str | None:
    """Return non-empty trimmed override reason, or None."""
    m = OVERRIDE_PATTERN.search(commit_message)
    if not m:
        return None
    reason = m.group(1).strip()
    return reason if reason else None


def _extract_commit_message_from_command(command: str) -> str:
    """
    Parse `-m "<message>"` or `-m '<message>'` from a `git commit` command line.

    Handles common shapes:
      git commit -m "message"
      git commit -m 'message'
      git commit --message="message"
      git commit -m "$(cat <<'EOF' ... EOF)"  ← heredoc form (returns full body)

    Returns the message body (joined if multiple -m flags), or '' if none found.
    """
    parts: list[str] = []

    # Match -m "..." (allow newlines inside the quotes for heredocs).
    for m in re.finditer(r'-m\s+"((?:[^"\\]|\\.)*)"', command, re.DOTALL):
        parts.append(m.group(1))
    for m in re.finditer(r"-m\s+'((?:[^'\\]|\\.)*)'", command, re.DOTALL):
        parts.append(m.group(1))
    for m in re.finditer(r'--message=(?:"([^"]*)"|\'([^\']*)\')', command):
        parts.append(m.group(1) or m.group(2) or "")

    return "\n\n".join(p for p in parts if p)


# --- gate logic ---------------------------------------------------------------


def _block(message: str, *, subtype: str) -> None:
    """Exit 2 with `message` on stderr. Includes authenticity markers."""
    sys.stderr.write("Sync-discipline gate BLOCKED:\n")
    sys.stderr.write(message + "\n")
    sys.stderr.write("TAPAGENTS_SYNC_GATE_FIRED_V1\n")
    emit_event(
        source="sync-discipline-gate",
        type="block",
        subtype=subtype,
        agent_context="subagent" if (_HOOK_PAYLOAD.get("agent_id") or _HOOK_PAYLOAD.get("agent_type")) else "orchestrator",
        agent_type=_HOOK_PAYLOAD.get("agent_type"),
        agent_id=_HOOK_PAYLOAD.get("agent_id"),
        payload={"tool_name": _TOOL_NAME, "summary": message[:300]},
        session_id=_HOOK_PAYLOAD.get("session_id"),
    )
    sys.exit(2)


def _check_commit(command: str) -> None:
    """The full-discipline check that fires on `git commit`."""
    matched, signatures = _matches_framework_sync_fingerprint()
    if not matched:
        # Not a framework-sync commit. Hook is silent.
        sys.exit(0)

    branch = _current_branch()
    sync_branch = _sync_branch_name()

    # If we're already on sync-tapagents (or whatever the manifest names),
    # the commit is correctly targeted — allow.
    if branch == sync_branch:
        sys.exit(0)

    # If we're on any branch that isn't dev or main, allow (could be a
    # feature branch doing legitimate dep work the protocol doesn't govern).
    if branch not in ("dev", "main"):
        sys.exit(0)

    # We're on dev or main with framework-sync content. Check for override.
    commit_message = _extract_commit_message_from_command(command)
    if commit_message:
        override_reason = _extract_override_reason(commit_message)
        if override_reason:
            # Override used. Log and allow.
            emit_event(
                source="sync-discipline-gate",
                type="override",
                subtype="explicit-token",
                agent_context="subagent" if (_HOOK_PAYLOAD.get("agent_id") or _HOOK_PAYLOAD.get("agent_type")) else "orchestrator",
                agent_type=_HOOK_PAYLOAD.get("agent_type"),
                agent_id=_HOOK_PAYLOAD.get("agent_id"),
                payload={
                    "branch": branch,
                    "sync_branch": sync_branch,
                    "signatures": signatures,
                    "reason": override_reason[:200],
                },
                session_id=_HOOK_PAYLOAD.get("session_id"),
            )
            sys.exit(0)

    # No override. Block.
    _block(
        f"Framework-sync commit detected on branch `{branch}`.\n"
        f"\n"
        f"Signatures matched ({len(signatures)}):\n"
        + "\n".join(f"  - {s}" for s in signatures)
        + f"\n\n"
        f"Per protocols/sync-tapagents-protocol.md §3-§4, framework-sync commits\n"
        f"MUST land on the `{sync_branch}` branch, not directly on `{branch}`.\n"
        f"\n"
        f"Remediation:\n"
        f"  git reset HEAD <staged framework-sync files>   # un-stage\n"
        f"  git stash                                       # park the changes\n"
        f"  git checkout {sync_branch}                      # switch to canonical branch\n"
        f"  git stash pop                                   # restore changes\n"
        f"  git add <files> && git commit -m \"sync: <message>\"\n"
        f"\n"
        f"Then promote: {sync_branch} → main (no-ff) → back-merge main → dev (no-ff).\n"
        f"\n"
        f"Exception clause (§6): if this is a genuine hotfix that MUST land via\n"
        f"`{branch}`, include the override token in your commit message:\n"
        f"  [sync-protocol-override: <non-empty reason>]\n"
        f"Override-tokened commits surface in the next /status flow for audit.",
        subtype="wrong-branch",
    )


def _check_push(command: str) -> None:
    """Light check on `git push` — only fires if framework-sync content is
    in the *most recent commit* on a non-sync branch (since pushes happen
    after commits, the staged diff is empty; we use HEAD~1..HEAD instead).
    Most catches happen at commit-time; this is the belt-and-suspenders for
    pushes that pull from history (e.g., the operator already committed
    locally on dev and is about to push)."""
    branch = _current_branch()
    sync_branch = _sync_branch_name()
    if branch not in ("dev", "main"):
        sys.exit(0)

    # Check HEAD's commit for framework-sync fingerprint.
    raw = _run_git("diff", "HEAD~1", "HEAD", "--name-only", "-z")
    if not raw:
        sys.exit(0)
    files = [p for p in raw.split("\x00") if p]

    # Inline signature checks against HEAD's diff (not staged).
    has_a = False
    if "package.json" in files:
        diff = _run_git("diff", "HEAD~1", "HEAD", "--", "package.json")
        if diff and re.search(r'^[+-].*"@tapintomymind/tap-agents"\s*:', diff, re.MULTILINE):
            has_a = True
    has_b = any(f.startswith("scaffold-source/") for f in files)
    has_c = any(f.endswith(".scaffold-meta.json") for f in files)
    if not (has_a or has_b or has_c):
        sys.exit(0)

    # Framework-sync content in last commit on dev/main. Check commit message
    # for override token.
    head_msg = _run_git("log", "-1", "--format=%B")
    if head_msg and _extract_override_reason(head_msg):
        sys.exit(0)

    signatures = []
    if has_a:
        signatures.append("A: package.json @tapintomymind/tap-agents version change (HEAD)")
    if has_b:
        signatures.append("B: scaffold-source/ changes (HEAD)")
    if has_c:
        signatures.append("C: .scaffold-meta.json change (HEAD)")

    _block(
        f"Push attempted from branch `{branch}` whose HEAD commit contains framework-sync content.\n"
        f"\n"
        f"Signatures matched on HEAD ({len(signatures)}):\n"
        + "\n".join(f"  - {s}" for s in signatures)
        + f"\n\n"
        f"Per protocols/sync-tapagents-protocol.md, framework-sync content must flow:\n"
        f"  {sync_branch} -> main (no-ff) -> back-merge main -> dev (no-ff)\n"
        f"\n"
        f"Remediation paths:\n"
        f"  1. If the commit is wrong-branch: reset, move to {sync_branch}, re-commit there.\n"
        f"  2. If the commit IS warranted on `{branch}` as a genuine hotfix:\n"
        f"     amend the commit message to include\n"
        f"     [sync-protocol-override: <non-empty reason>]\n"
        f"     and retry the push.\n",
        subtype="push-wrong-branch",
    )


# --- entry point --------------------------------------------------------------


def main() -> None:
    global _HOOK_PAYLOAD, _TOOL_NAME
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = payload.get("tool_name") or payload.get("tool") or ""
    tool_input = payload.get("tool_input") or {}
    _HOOK_PAYLOAD = payload
    _TOOL_NAME = tool_name

    if tool_name != "Bash":
        sys.exit(0)
        return

    command = tool_input.get("command", "")
    if not command:
        sys.exit(0)
        return

    if re.search(r"\bgit\s+commit\b", command):
        _check_commit(command)
        return
    if re.search(r"\bgit\s+push\b", command):
        _check_push(command)
        return

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="sync-discipline-gate",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
            session_id=_HOOK_PAYLOAD.get("session_id") if isinstance(_HOOK_PAYLOAD, dict) else None,
        )
        raise
