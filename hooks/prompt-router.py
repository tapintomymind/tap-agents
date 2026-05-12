#!/usr/bin/env python3
"""
Tier 2 UserPromptSubmit hook — agent-dashboard.

Lightweight intent classifier. On every user prompt, detects three
patterns and emits a routing nudge as additional context:

  1. Code-implementation intent (verbs: implement, fix, build, refactor,
     add, write, change, etc.) → reminds the orchestrator to DISPATCH
     a subagent rather than inline-edit. The PreToolUse gate would
     hard-block anyway; this nudge prevents the block from being the
     first signal.

  2. Side-thought / off-topic intent ("by the way", "what about",
     "I was wondering", etc.) → suggests `/park <thought>` so the
     active task isn't derailed.

  3. Status / decision / slash-command — no nudge (orchestrator is the
     right handler for those, or the slash command already routes).

Wired in: ../.claude/settings.json -> hooks.UserPromptSubmit[0].

Stdin payload schema (Claude Code UserPromptSubmit hook):
  { "prompt": "...", ... }

Output: JSON envelope on stdout per Claude Code hook spec:
  { "hookSpecificOutput": {
      "hookEventName": "UserPromptSubmit",
      "additionalContext": "<markdown nudge>"
  } }

If no nudge applies, emit nothing (exit 0).
"""
from __future__ import annotations

import json
import re
import sys

IMPLEMENT_VERB_RE = re.compile(
    r"\b(implement|build|fix|refactor|add|create|write|change|modify|update|"
    r"rewrite|patch|bug[ -]?fix|wire (it )?up|hook (it )?up|set ?up|"
    r"port|migrate|extract|inline|debug|delete|remove|rename|reorganize)\b",
    re.IGNORECASE,
)

SIDE_THOUGHT_RE = re.compile(
    r"\b(by the way|btw|what about|while we'?re here|side ?note|aside|"
    r"unrelated|tangent|i was (wondering|thinking)|random thought|"
    r"out of curiosity|on a different note|off topic|off-topic)\b",
    re.IGNORECASE,
)

STATUS_RE = re.compile(
    r"\b(status|where are we|what'?s (next|left|happening|the state)|"
    r"recap|summari[sz]e|brief me|what'?s on the queue|catch me up)\b",
    re.IGNORECASE,
)

SLASH_COMMAND_RE = re.compile(r"^\s*/[a-z][\w-]*\b", re.IGNORECASE)

# Short prompts (1-2 words like "yes", "ok", "go ahead", "continue") are
# acknowledgements, not intents. Skip nudging on these.
ACK_PROMPT_RE = re.compile(
    r"^\s*(yes|y|yep|yeah|ok|okay|sure|go|go ahead|continue|proceed|"
    r"thanks|thank you|no|n|nope|stop|wait|hold on|pause|next)\.?\s*$",
    re.IGNORECASE,
)


ROUTING_NUDGE = (
    "## Routing nudge — code-intent prompt detected\n\n"
    "As **orchestrator**, dispatch via the Agent tool — do not Edit/Write/Bash-mutate "
    "inline. The PreToolUse gate (`orchestrator-dispatch-gate.py`) will hard-block "
    "code-mutating tools on the main thread.\n\n"
    "Pick the right agent for the task:\n"
    "- **architect** — scope, tech-strategy, scaffolding decisions\n"
    "- **strategist** — PRD, success criteria, MVP cut\n"
    "- **designer** — UX patterns, design tokens, components\n"
    "- **critic** — independent adversarial review of an artifact\n"
    "- **quality-engineer** — runtime smoke tests, fix-verification\n"
    "- **ops-security** — threat model, OWASP, auth/authz review\n"
    "- **ui-ux-reviewer** — visual / IA review of running UI\n"
    "- **backlog-curator** — ID allocation, item-count + sync\n"
    "- **db-admin** — destructive data ops (Tier B+) chokepoint\n"
    "- (project-specific implementers under `.claude/agents/_planned/`)\n\n"
    "If genuinely trivial and you've decided to inline anyway: surface the block to the "
    "user, name the agent that should run, and only proceed if they confirm override."
)

PARK_NUDGE = (
    "## Routing nudge — side-thought detected\n\n"
    "This reads like an off-topic aside, not advancement of the active milestone.\n\n"
    "**Options:**\n"
    "- `/park <thought>` — capture to `.claude/workspace/parked-thoughts.md` without "
    "  derailing the current task. The orchestrator confirms and resumes.\n"
    "- If it's actually on-topic, ignore this nudge and proceed.\n"
    "- If it's a decision the user needs to make, surface via EA / `/queue` rather than "
    "  diving in immediately."
)


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def classify(prompt: str) -> str | None:
    """Return 'implement', 'side', or None."""
    if not prompt:
        return None
    # Skip slash-command invocations — those already route.
    if SLASH_COMMAND_RE.match(prompt):
        return None
    # Skip short acknowledgements.
    if ACK_PROMPT_RE.match(prompt):
        return None
    # Skip status / brief intents.
    if STATUS_RE.search(prompt):
        return None
    # Side-thought first (more specific patterns).
    if SIDE_THOUGHT_RE.search(prompt):
        return "side"
    if IMPLEMENT_VERB_RE.search(prompt):
        return "implement"
    return None


def emit(additional_context: str) -> None:
    envelope = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": additional_context,
        }
    }
    sys.stdout.write(json.dumps(envelope))


def main() -> int:
    payload = read_payload()
    prompt = payload.get("prompt") or ""

    intent = classify(prompt)
    if intent == "implement":
        emit(ROUTING_NUDGE)
    elif intent == "side":
        emit(PARK_NUDGE)
    # else: no output, no nudge

    return 0


if __name__ == "__main__":
    sys.exit(main())
