#!/usr/bin/env python3
"""
PreToolUse hook — orchestrator dispatch gate.

Hard-blocks code-MUTATING tool calls on the main (orchestrator) thread.
Subagent tool calls pass through. This enforces the TapAgents product
design: orchestrator dispatches via the Agent tool; subagents do the
work.

Detection of main-thread vs subagent: the Claude Code PreToolUse
payload includes `agent_id` and `agent_type` when the call originates
inside a subagent (Task tool). Main-thread calls lack these fields.
Source: https://code.claude.com/docs/en/hooks.md

Hard-blocked on main thread:
  - Edit, Write, NotebookEdit (any file path)
  - Bash matching mutating subcommand patterns
      git commit | rebase | merge | cherry-pick | revert | reset --hard
      npm install / pnpm install / yarn add / bun add (deps mutation)
      drizzle-kit push | migrate (DB schema mutation)
      vercel deploy (deploy state mutation)

Allowed on main thread (read-only / status):
  - Read, Grep, Glob, etc. — all non-mutating tools
  - Bash for: git status/log/diff/branch/show, ls, cat, find, grep,
    npm/pnpm/yarn run-scripts (test, lint, build), tsc, etc.
  - Edit/Write on Claude Code's user auto-memory directory
    (`~/.claude/projects/<encoded-project>/memory/*.md`) — documented
    inline-write surface per Claude Code OS instructions.

Wired in: ../.claude/settings.json -> hooks.PreToolUse[1] (after
pre-tool-gate.py which handles dangerous patterns / env-file edits).

Stdin payload schema (Claude Code PreToolUse hook):
  {
    "tool_name": "Edit"|"Write"|"Bash"|...,
    "tool_input": { ... },
    "agent_id": "..."  (present only inside subagent),
    "agent_type": "...",
    ...
  }

Exit codes:
  0 → allow tool call
  2 → block with stderr message
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Import the shared telemetry helper that lives alongside us in hooks/.
# `_`-prefix prevents the build-script's frontmatter-listing logic from
# picking it up as a top-level hook. Fail-open: if the import itself
# fails (file missing, syntax error, etc.), the gate still works — we
# just don't emit.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return

# Bash subcommand patterns that constitute code/state mutation.
# Tight list — avoid false-positives on read commands.
MUTATING_BASH_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bgit\s+commit\b"), "git commit"),
    (re.compile(r"\bgit\s+rebase\b"), "git rebase"),
    (re.compile(r"\bgit\s+merge\b"), "git merge"),
    (re.compile(r"\bgit\s+cherry-pick\b"), "git cherry-pick"),
    (re.compile(r"\bgit\s+revert\b"), "git revert"),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "git reset --hard"),
    (re.compile(r"\bgit\s+push\b"), "git push"),
    # Package managers — installs / deps mutation. `run` subcommand allowed.
    (re.compile(r"\bnpm\s+(install|i|uninstall|update|upgrade)(\s|$)"), "npm install/update"),
    (re.compile(r"\bpnpm\s+(install|i|add|remove|update)(\s|$)"), "pnpm install/update"),
    (re.compile(r"\byarn\s+(add|remove|install|upgrade)(\s|$)"), "yarn add/install"),
    (re.compile(r"\bbun\s+(add|remove|install|update)(\s|$)"), "bun add/install"),
    # DB schema mutation
    (re.compile(r"\bdrizzle-kit\s+(push|migrate)\b"), "drizzle-kit push/migrate"),
    # Deploy mutation
    (re.compile(r"\bvercel\s+(deploy|--prod|link)\b"), "vercel deploy/link"),
    (re.compile(r"\bnpx\s+vercel\s+(deploy|--prod|link)\b"), "vercel deploy/link"),
]

# File-mutating tools — always blocked on main thread.
FILE_MUTATING_TOOLS = {"Edit", "Write", "NotebookEdit"}

# Allowlist: Claude Code's user auto-memory directory.
# Path shape: ~/.claude/projects/<encoded-project>/memory/*.md
# Claude Code's OS-level instructions tell Claude to write/edit memory files
# directly via Write/Edit. Forcing those through a subagent burns context
# and adds latency for zero audit value (memory files are user-state, not
# project artifacts). The pattern is intentionally tight — only matches
# the `~/.claude/projects/<segment>/memory/` shape that Claude Code itself
# owns; does NOT match framework `.claude/` paths (App Development/.claude/...)
# or Tier 2 `.claude/` paths (App Development/<project>/.claude/...).
AUTO_MEMORY_PATH_RE = re.compile(r"/\.claude/projects/[^/]+/memory/")

AGENT_HINT = (
    "Dispatch a subagent via the Agent tool. Likely candidates:\n"
    "  - `architect` / `strategist` / `designer` for planning + spec work\n"
    "  - `critic` for independent review of an existing artifact\n"
    "  - `quality-engineer` for runtime smoke / fix-verification\n"
    "  - `ops-security` for threat-model / auth review\n"
    "  - project-specific implementers under `.claude/agents/_planned/`\n"
    "If a domain-specific implementer doesn't exist yet, dispatch `architect` "
    "to design the work and propose the right specialist."
)


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def is_subagent(payload: dict) -> bool:
    """Per Claude Code docs, agent_id / agent_type present iff inside a subagent."""
    return bool(payload.get("agent_id") or payload.get("agent_type"))


def find_mutating_bash(command: str) -> str | None:
    for pattern, label in MUTATING_BASH_PATTERNS:
        if pattern.search(command):
            return label
    return None


def block(reason: str, *, payload: dict, tool_name: str, subtype: str, summary: str) -> int:
    """Hard-block the tool call with stderr message + emit a telemetry event.

    Telemetry emit is fail-open: any emit_event() exception is swallowed
    by _telemetry, so blocking semantics are unaffected.
    """
    sys.stderr.write(
        "Orchestrator-dispatch gate BLOCKED: " + reason + "\n\n" + AGENT_HINT + "\n\n"
        "To override for one call: the user can comment out this hook in "
        "the active `.claude/settings.json` (hooks.PreToolUse) or accept the "
        "dispatch path. Drift is the cost the gate is here to prevent.\n"
    )
    emit_event(
        source="orchestrator-dispatch-gate",
        type="block",
        subtype=subtype,
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload={"tool_name": tool_name, "summary": summary},
        session_id=payload.get("session_id"),
    )
    return 2


# Subtype derivation: matches the `subtype` field documented in
# protocols/telemetry-events.md. One per tool-class so consumers can group
# without parsing the payload.summary.
_FILE_TOOL_SUBTYPE = {
    "Edit": "edit",
    "Write": "write",
    "NotebookEdit": "notebook-edit",
}


def main() -> int:
    payload = read_payload()

    # Subagent? Always allow — that's the whole point. Don't emit on pass
    # per BL-035 §2.3 (keep events.jsonl small in v0.10.0).
    if is_subagent(payload):
        return 0

    tool_name = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}

    # File-mutating tools — block on main thread.
    if tool_name in FILE_MUTATING_TOOLS:
        file_path = tool_input.get("file_path") or "(unknown)"
        # Allowlist: Claude Code's user auto-memory directory. Match the path
        # shape `~/.claude/projects/<segment>/memory/` regardless of leading
        # $HOME prefix. Emit a passthrough event so the bypass is observable.
        if AUTO_MEMORY_PATH_RE.search(file_path):
            emit_event(
                source="orchestrator-dispatch-gate",
                type="pass",
                subtype="auto-memory-passthrough",
                agent_context="orchestrator",
                agent_type=None,
                agent_id=None,
                payload={"tool_name": tool_name, "summary": f"{tool_name} on {file_path}"},
                session_id=payload.get("session_id"),
            )
            return 0
        return block(
            f"`{tool_name}` on `{file_path}` from the orchestrator thread is blocked. "
            "Code changes flow through subagents.",
            payload=payload,
            tool_name=tool_name,
            subtype=_FILE_TOOL_SUBTYPE.get(tool_name, "file-mutate"),
            summary=f"{tool_name} on {file_path}",
        )

    # Bash — block only on mutating subcommand patterns.
    if tool_name == "Bash":
        cmd = tool_input.get("command") or ""
        label = find_mutating_bash(cmd)
        if label:
            return block(
                f"Bash `{label}` on the orchestrator thread is blocked. "
                f"State-mutating commands flow through subagents.\n"
                f"  command was: {cmd!r}",
                payload=payload,
                tool_name="Bash",
                subtype="bash-mutate",
                summary=f"{label}: {cmd}",
            )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="orchestrator-dispatch-gate",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        raise
