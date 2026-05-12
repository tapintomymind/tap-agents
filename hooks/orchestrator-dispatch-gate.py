#!/usr/bin/env python3
"""
Tier 2 PreToolUse hook — orchestrator dispatch gate.

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


def block(reason: str) -> int:
    sys.stderr.write(
        "Orchestrator-dispatch gate BLOCKED: " + reason + "\n\n" + AGENT_HINT + "\n\n"
        "To override for one call: the user can comment out this hook in "
        "`agent-dashboard/.claude/settings.json` (hooks.PreToolUse) or accept the "
        "dispatch path. Drift is the cost the gate is here to prevent.\n"
    )
    return 2


def main() -> int:
    payload = read_payload()

    # Subagent? Always allow — that's the whole point.
    if is_subagent(payload):
        return 0

    tool_name = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}

    # File-mutating tools — block on main thread.
    if tool_name in FILE_MUTATING_TOOLS:
        file_path = tool_input.get("file_path") or "(unknown)"
        return block(
            f"`{tool_name}` on `{file_path}` from the orchestrator thread is blocked. "
            "Code changes flow through subagents."
        )

    # Bash — block only on mutating subcommand patterns.
    if tool_name == "Bash":
        cmd = tool_input.get("command") or ""
        label = find_mutating_bash(cmd)
        if label:
            return block(
                f"Bash `{label}` on the orchestrator thread is blocked. "
                f"State-mutating commands flow through subagents.\n"
                f"  command was: {cmd!r}"
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
