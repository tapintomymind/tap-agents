#!/usr/bin/env python3
"""
Stop hook — auto-runs Critic-style validation before allowing the session to end.

Pattern from disler/claude-code-hooks-mastery, adapted for Claude Team architecture.

Behavior:
- Reads the Stop event payload from stdin (JSON)
- Checks for in-flight project state that should not be left mid-stream
- Checks for unresolved Critic blocking concerns
- Checks for unresolved consistency-check failures
- Exits 0 if OK to stop; exits 2 with a stderr message to FORCE the agent to keep working

Stop hooks ARE allowed to block stoppage. The agent receives the stderr message
and continues from where it was. Use stop_hook_active to prevent infinite loops
(if the loop has already fired, don't fire again).

Tune the checks below as the team evolves. This is intentionally minimal v1.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Shared telemetry helper — fail-open import. Block semantics unaffected.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


def _classify_issue(issue: str) -> str:
    """Map a Stop-block issue string to its telemetry subtype.

    Per protocols/telemetry-events.md, three subtypes: blocked-on | contested |
    critic-blocking. Phrase-based discrimination is sufficient — each issue
    string is built by the same generator a few lines up.
    """
    lower = issue.lower()
    if "blocked_on" in lower:
        return "blocked-on"
    if "contested" in lower:
        return "contested"
    if "critic" in lower:
        return "critic-blocking"
    return "unknown"


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        # If we can't read the payload, don't block — fail open.
        return 0

    # Anti-loop guard: if this hook has already triggered in this session,
    # let the agent stop. We never want infinite continue loops.
    if payload.get("stop_hook_active"):
        return 0

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
    workspace = project_dir / "workspace"
    if not workspace.exists():
        return 0

    issues: list[str] = []

    # Check 1: any project with state.json.blocked_on set?
    for state_file in workspace.glob("*/state.json"):
        if state_file.parent.name.startswith("_"):
            continue
        try:
            state = json.loads(state_file.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if state.get("blocked_on"):
            issues.append(
                f"Project {state.get('slug', state_file.parent.name)} is "
                f"blocked_on: {state['blocked_on']}. Resolve before ending session."
            )
        if state.get("contested_artifacts"):
            issues.append(
                f"Project {state.get('slug', state_file.parent.name)} has "
                f"contested artifacts unresolved. Run conflict-resolution flow."
            )

    # Check 2: any project with critic-notes containing a recent unresolved blocking concern?
    for notes in workspace.glob("*/critic-notes.md"):
        if notes.parent.name.startswith("_"):
            continue
        try:
            content = notes.read_text()
        except OSError:
            continue
        if "BLOCKING" in content and "STATUS: addressed" not in content:
            # Coarse check; Critic's notes append-only so newest concern wins.
            # Refine over time.
            issues.append(
                f"Critic has unresolved BLOCKING concerns in {notes}. "
                f"Address or log explicit override in dissent-log.md before ending."
            )
            break  # one signal is enough; don't spam

    if not issues:
        return 0

    # Emit one telemetry event per distinct issue. Subtype follows the brief's
    # enumeration (blocked-on | contested | critic-blocking). Summary is the
    # issue text itself, truncated by the helper.
    session_id = payload.get("session_id")
    for issue in issues:
        emit_event(
            source="stop-critic-check",
            type="block",
            subtype=_classify_issue(issue),
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={"summary": issue},
            session_id=session_id,
        )

    # Block stoppage. Agent receives stderr and continues.
    message = (
        "Stop blocked by Claude Team verification:\n\n"
        + "\n".join(f"  - {issue}" for issue in issues)
        + "\n\nResolve these OR explicitly mark them as accepted-with-override in "
        "the appropriate dissent-log.md, then I'll let the session end."
    )
    print(message, file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="stop-critic-check",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
