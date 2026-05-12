#!/usr/bin/env python3
"""
PreToolUse hook — deterministic gates that pattern-match dangerous or out-of-protocol actions.

Pattern from disler/claude-code-hooks-mastery, adapted for Claude Team architecture.

Behavior:
- Reads the PreToolUse event payload from stdin (JSON)
- Checks the tool input against gate rules
- Exits 0 to allow; exits 2 with a stderr message to BLOCK the tool call

Gates enforced:
- Block dangerous shell patterns (rm -rf, chmod 777, env exfiltration, etc.)
- Block edits to immutable seed.md files
- Block edits to artifacts marked [CONTESTED]
- Block git push without confirmation
- (Add more as patterns emerge)

Tune the rules below as the team evolves. This is intentionally minimal v1.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# Shared telemetry helper. Fail-open stubs cover the case where the helper
# module is missing — the gate's primary block semantics are unaffected.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


# Map a regex pattern label to the telemetry `subtype` value. Keep these
# stable — consumers group by subtype without parsing payload.summary.
_PATTERN_SUBTYPES: list[tuple[str, str]] = [
    (r"\brm\s+-rf?\s+/", "rm-rf"),
    (r"\bsudo\s+rm\b", "sudo-rm"),
    (r"\bchmod\s+777\b", "chmod-777"),
    (r"cat\s+\.env(\.|$|\s)", "env-edit"),
    (r">\s*\.env(\.|$|\s)", "env-edit"),
    (r"git\s+push\s+--force", "force-push"),
]


DANGEROUS_BASH_PATTERNS: list[tuple[str, str]] = [
    (r"\brm\s+-rf?\s+/", "rm -rf on root or absolute path is blocked. Use scoped paths."),
    (r"\bsudo\s+rm\b", "sudo rm is blocked."),
    (r"\bchmod\s+777\b", "chmod 777 is blocked. Use a more restrictive permission."),
    (r"cat\s+\.env(\.|$|\s)", "Reading .env files is blocked. Use environment variables programmatically."),
    (r">\s*\.env(\.|$|\s)", "Writing to .env files is blocked."),
    (r"git\s+push\s+--force", "git push --force is blocked. Use --force-with-lease if truly needed AND get user approval."),
]


def _bash_subtype(command: str) -> str:
    """Map a matched bash command to its telemetry subtype."""
    for pattern, subtype in _PATTERN_SUBTYPES:
        if re.search(pattern, command):
            return subtype
    return "bash-dangerous"


def check_bash(command: str) -> str | None:
    for pattern, message in DANGEROUS_BASH_PATTERNS:
        if re.search(pattern, command):
            return message
    return None


def check_file_protection(file_path: str) -> str | None:
    """Block writes/edits to files that should be immutable or contested."""
    path = Path(file_path)
    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))

    # Resolve to absolute for comparison
    try:
        abs_path = path.resolve()
        rel_to_project = abs_path.relative_to(project_dir.resolve())
    except (ValueError, OSError):
        return None  # outside project; skip gate

    # Rule: seed.md is immutable after creation
    if rel_to_project.name == "seed.md" and "workspace" in rel_to_project.parts:
        if abs_path.exists():
            return (
                f"seed.md is immutable after first capture (Intake's job). "
                f"To change project direction, side-state to 'pivoted' and create a new project."
            )

    # Rule: artifacts marked [CONTESTED] in state.json cannot be edited
    if "workspace" in rel_to_project.parts and rel_to_project.suffix == ".md":
        # Find the state.json for this project
        parts = list(rel_to_project.parts)
        try:
            ws_idx = parts.index("workspace")
            slug = parts[ws_idx + 1]
            if slug.startswith("_"):
                return None  # _examples/, _global/, _inbox/ — skip
            state_file = project_dir / "workspace" / slug / "state.json"
            if state_file.exists():
                state = json.loads(state_file.read_text())
                contested = state.get("contested_artifacts") or []
                contested_paths = [c.get("path") if isinstance(c, dict) else c for c in contested]
                if any(str(rel_to_project) in p or path.name in p for p in contested_paths if p):
                    return (
                        f"{path.name} is marked [CONTESTED] in state.json. "
                        f"Resolve via conflict-resolution.md before editing."
                    )
        except (ValueError, IndexError, json.JSONDecodeError, OSError):
            pass

    return None


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return 0  # fail open if we can't parse

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}

    block_message: str | None = None
    block_subtype: str = "unknown"

    if tool_name == "Bash":
        command = tool_input.get("command", "")
        block_message = check_bash(command)
        if block_message:
            block_subtype = _bash_subtype(command)
    elif tool_name in ("Write", "Edit"):
        file_path = tool_input.get("file_path", "")
        if file_path:
            block_message = check_file_protection(file_path)
            if block_message:
                # Two file-protection classes: seed-immutable + contested-artifact.
                # Discriminate on the message body since check_file_protection
                # returns the human-readable reason.
                if "seed.md" in block_message:
                    block_subtype = "seed-immutable"
                elif "CONTESTED" in block_message:
                    block_subtype = "contested-artifact"
                else:
                    block_subtype = "file-protection"

    if block_message:
        print(f"Blocked by Claude Team gate: {block_message}", file=sys.stderr)
        # Telemetry emit: fail-open inside _telemetry. Per-tool summary is the
        # block reason itself, truncated by the helper.
        emit_event(
            source="pre-tool-gate",
            type="block",
            subtype=block_subtype,
            agent_context="subagent" if (payload.get("agent_id") or payload.get("agent_type")) else "orchestrator",
            agent_type=payload.get("agent_type"),
            agent_id=payload.get("agent_id"),
            payload={"tool_name": tool_name, "summary": block_message},
            session_id=payload.get("session_id"),
        )
        return 2

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="pre-tool-gate",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
