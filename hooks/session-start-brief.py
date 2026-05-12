#!/usr/bin/env python3
"""
SessionStart hook — orchestrator briefing.

Fires on every session start (startup / resume / clear / compact).
Auto-detects workspace shape and emits an orchestrator briefing as
additional context (per Claude Code hook spec JSON envelope):

  - **Tier 2 mode** (`.claude/workspace/state.json` exists)
    Single-project brief: active milestone, top pending tasks,
    blocked_on, critic concerns.

  - **Tier 1 / framework mode** (`.claude/workspace/<slug>/state.json`)
    Cross-project brief: per-project phase + last_agent + blocked_on,
    sorted by recent activity. Captures the team-wide view the
    framework session (CTO/CPO conductor role) needs.

  - **No state mode** — emits routing rule only.

Every brief includes the routing rule that encodes the TapAgents
thesis: the orchestrator DISPATCHES via the Agent tool; it does not
Edit/Write/Bash-mutate inline. The PreToolUse `orchestrator-dispatch-gate.py`
enforces this for code-mutating tools (passes through for subagents
via `agent_id` / `agent_type` payload fields).

Wired in: `<root>/.claude/settings.json` -> `hooks.SessionStart[0]`.

Stdin payload schema (Claude Code SessionStart hook):
  { "source": "startup"|"resume"|"clear"|"compact", ... }

Output: JSON envelope on stdout:
  { "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": "<markdown briefing>"
  } }
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def find_workspace() -> Path | None:
    """Locate the active workspace/ directory across both layouts.

    Tier 2 projects: `<project>/.claude/workspace/`
    Tier 1 framework: `<framework-root>/.claude/workspace/` where
        `<framework-root>` may be the `.claude/` dir itself (so workspace
        is a sibling of `hooks/`).

    Strategy: try `$CLAUDE_PROJECT_DIR/.claude/workspace` first, then
    `$CLAUDE_PROJECT_DIR/workspace`, then walk up from `__file__`
    looking for a `workspace/` directory adjacent to a `hooks/` dir.
    Returns None if no workspace is found.
    """
    candidates: list[Path] = []
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        candidates.append(Path(env) / ".claude" / "workspace")
        candidates.append(Path(env) / "workspace")
    # File-based fallback: this script lives in some `hooks/` dir;
    # its sibling `workspace/` is the framework layout, and its
    # parent's `.claude/workspace/` is the tier-2 layout.
    here = Path(__file__).resolve()
    hooks_dir = here.parent
    candidates.append(hooks_dir.parent / "workspace")  # framework: .claude/workspace
    candidates.append(hooks_dir.parent / ".claude" / "workspace")  # tier 2: <project>/.claude/workspace
    for c in candidates:
        if c.is_dir():
            return c
    return None


WORKSPACE = find_workspace()
TIER2_STATE = WORKSPACE / "state.json" if WORKSPACE else None  # single-project shape
PARKED_PATH = WORKSPACE / "parked-thoughts.md" if WORKSPACE else None


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def emit(additional_context: str) -> None:
    envelope = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": additional_context,
        }
    }
    sys.stdout.write(json.dumps(envelope))


def load_state(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def count_parked(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        return sum(1 for line in path.read_text().splitlines() if line.startswith("## "))
    except OSError:
        return 0


def parse_iso(s: str | None) -> datetime:
    if not s:
        return datetime.min.replace(tzinfo=timezone.utc)
    s = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------------
# Tier 2 (single project) briefing
# ------------------------------------------------------------------------

def render_tier2_brief(state: dict, source: str) -> str:
    slug = state.get("tier2_project_slug") or state.get("slug") or (WORKSPACE.parent.parent.name if WORKSPACE else "project")
    milestone = state.get("current_milestone", "?")
    status = state.get("current_milestone_status", "?")
    day = state.get("milestone_day")
    day_part = state.get("milestone_day_part")
    blocked = state.get("blocked_on")
    critic_open = state.get("tier2_critic_concerns_open") or []

    m_block = (state.get("milestones") or {}).get(milestone) or {}
    name = m_block.get("name", "")
    pending = m_block.get("tasks_pending") or []
    parked = count_parked(PARKED_PATH) if PARKED_PATH else 0

    lines: list[str] = []
    lines.append(f"## Orchestrator briefing — {slug}")
    lines.append("")
    lines.append(f"**Active milestone:** {milestone} — {name}")
    lines.append(f"**Status:** {status}" + (f" (day {day}{', ' + day_part if day_part else ''})" if day else ""))
    lines.append("")

    if blocked:
        lines.append(f"**BLOCKED ON:** `{blocked}`")
        lines.append("")
    if critic_open:
        lines.append(f"**Open critic concerns:** {len(critic_open)} — resolve before advancing the phase.")
        lines.append("")
    if parked:
        lines.append(f"**Parked thoughts:** {parked} in `.claude/workspace/parked-thoughts.md` — review with `/inbox` when ready.")
        lines.append("")

    if pending:
        lines.append("**Top pending tasks:**")
        for t in pending[:3]:
            short = t if len(t) <= 240 else t[:237] + "..."
            lines.append(f"- {short}")
        if len(pending) > 3:
            lines.append(f"- _(+{len(pending) - 3} more in state.json)_")
        lines.append("")

    lines.append(_routing_rule_block(source))
    return "\n".join(lines)


# ------------------------------------------------------------------------
# Tier 1 (multi-project) briefing
# ------------------------------------------------------------------------

def discover_projects() -> list[tuple[str, dict, Path]]:
    """Return [(slug, state, state_path), ...] for each project in workspace/."""
    if WORKSPACE is None or not WORKSPACE.exists():
        return []
    out: list[tuple[str, dict, Path]] = []
    for child in WORKSPACE.iterdir():
        if not child.is_dir():
            continue
        if child.name.startswith("_"):  # _examples, _global, _inbox
            continue
        sp = child / "state.json"
        st = load_state(sp)
        if st is None:
            continue
        out.append((child.name, st, sp))
    return out


def render_tier1_brief(projects: list[tuple[str, dict, Path]], source: str) -> str:
    # Sort by most recent activity. Prefer last_agent_at; fall back to entered_phase_at.
    def sort_key(triple):
        _slug, st, _p = triple
        return parse_iso(st.get("last_agent_at") or st.get("entered_phase_at"))

    projects.sort(key=sort_key, reverse=True)

    lines: list[str] = []
    lines.append("## Orchestrator briefing — TapAgents framework (cross-project view)")
    lines.append("")
    lines.append(f"_{len(projects)} project(s) tracked in `.claude/workspace/`. Sorted by last activity._")
    lines.append("")

    any_blocked = False
    for slug, st, _p in projects:
        phase = st.get("current_phase") or st.get("current_milestone") or "?"
        last_agent = st.get("last_agent", "?")
        last_at = st.get("last_agent_at") or st.get("entered_phase_at") or "?"
        blocked = st.get("blocked_on")
        critic_open = st.get("tier2_critic_concerns_open") or []
        priority = st.get("priority", "?")
        next_action = (st.get("next_suggested_action") or {}).get("task")

        block_marker = " 🚧 BLOCKED" if blocked else ""
        lines.append(f"### `{slug}` — phase={phase} · priority={priority}{block_marker}")
        if blocked:
            any_blocked = True
            lines.append(f"- BLOCKED on: `{blocked}`")
        # last_agent often has a long trail; trim to one line.
        la = last_agent.split("\n")[0] if last_agent else "?"
        if len(la) > 160:
            la = la[:157] + "..."
        lines.append(f"- last: {la} _(at {last_at})_")
        if critic_open:
            lines.append(f"- open critic concerns: {len(critic_open)}")
        if next_action:
            na = next_action if len(next_action) <= 160 else next_action[:157] + "..."
            lines.append(f"- next: {na}")
        lines.append("")

    if any_blocked:
        lines.append("⚠️  One or more projects are BLOCKED — resolve via `/queue` or `/briefing`.")
        lines.append("")

    lines.append(_routing_rule_block(source))
    return "\n".join(lines)


# ------------------------------------------------------------------------
# Shared routing-rule block
# ------------------------------------------------------------------------

def _routing_rule_block(source: str) -> str:
    return (
        "---\n\n"
        "### Routing rule\n\n"
        "You are the **orchestrator**. Dispatch to subagents via the Agent tool — do NOT "
        "Edit/Write/Bash-mutate the project tree inline. The PreToolUse gate "
        "(`hooks/orchestrator-dispatch-gate.py`) enforces this for code-mutating tools; "
        "main-thread Edit/Write/mutating-Bash hard-blocks with the right agent named. "
        "Subagent calls (via the Agent tool) bypass the gate.\n\n"
        "**Slash-command surface:** `/team` (new work) · `/feature` (in-project ideation) · "
        "`/intake` · `/strategist` · `/architect` · `/designer` · `/critic` · `/design-review` · "
        "`/grow-team` · `/status` · `/queue` · `/briefing` · `/inbox` · `/park <thought>` · `/refocus`.\n\n"
        f"_(SessionStart hook, source={source})_"
    )


# ------------------------------------------------------------------------
# Entry
# ------------------------------------------------------------------------

def main() -> int:
    payload = read_payload()
    source = payload.get("source", "startup")

    # Tier 2 single-project shape takes precedence if present.
    state = load_state(TIER2_STATE) if TIER2_STATE else None
    if state is not None:
        emit(render_tier2_brief(state, source))
        return 0

    # Tier 1 multi-project shape.
    projects = discover_projects()
    if projects:
        emit(render_tier1_brief(projects, source))
        return 0

    # No state at all — emit only the routing rule + a hint to bootstrap.
    emit(
        "## Orchestrator briefing\n\n"
        "_(no `.claude/workspace/state.json` and no per-project state files found.)_\n\n"
        "Bootstrap: run `/team` to start new work, `/intake` to seed a project from scratch, or "
        "`/status` to ask EA for a cross-project view.\n\n"
        + _routing_rule_block(source)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
