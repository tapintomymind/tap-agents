#!/usr/bin/env python3
"""
PostToolUse + PostToolUseFailure + PermissionDenied hook — observational only.

Captures tool calls whose response indicates a permission denial (Claude Code
permission mode, settings.json `permissions.deny` rules, framework hook blocks)
and emits a structured `harness-or-permission` block telemetry event to
events.jsonl. Closes the coverage gap surfaced by the 2026-05-12 BL-060
curator-dispatch arc (see
`workspace/_global/org-designer-proposals/2026-05-12-curator-vocab-harness.md`
§2.5).

PURELY OBSERVATIONAL — exit 0 always; never blocks; never modifies tool output.

------------------------------------------------------------------------------
Claude Code hook-event coverage rationale (verified against
https://code.claude.com/docs/en/hooks.md as of 2026-05-12):

- `PostToolUse`         fires "After a tool call **succeeds**". A tool call
                        denied by the framework PreToolUse gate (exit 2)
                        does NOT route through PostToolUse — the tool never
                        executed. PostToolUse therefore catches cases where
                        the tool ran but the tool's own response payload
                        contains a denial signal (e.g. some MCP servers
                        embed permission errors inside `tool_response`).
- `PostToolUseFailure`  fires "After a tool call **fails**". This catches
                        framework-hook blocks (exit 2 from PreToolUse hooks
                        like our orchestrator-dispatch-gate.py) AND tool
                        execution errors that include denial-class messages.
                        This is the primary capture surface for
                        TAPAGENTS_DISPATCH_GATE_FIRED_V1 events.
- `PermissionDenied`    fires "When a tool call is denied by the **auto mode
                        classifier**". This captures auto-mode classifier
                        denials specifically (separate code path from
                        PostToolUseFailure). The hook's `reason` field gives
                        the classifier's verbatim explanation.

Wiring to all three events maximizes the capture surface. The hook
dispatches on `hook_event_name` to choose the right field-extraction
strategy per event. DEVIATION FROM BRIEF: the brief named only PostToolUse,
but PostToolUse-only would miss framework-hook firings (which surface as
PostToolUseFailure) and auto-mode classifier denials (which surface as
PermissionDenied). All three wired for full coverage; behavior is identical
across the three (all exit 0, all emit a single block event).

------------------------------------------------------------------------------
Detection patterns (case-insensitive substring match against the literal
denial text — content of `tool_response`, `error`, or `reason` depending on
event):

  - "permission for this action has been denied"   → claude-code-permission
  - "permission denied"                            → claude-code-permission
  - "BLOCKED:"                                     → framework-hook
  - "TAPAGENTS_DISPATCH_GATE_FIRED_V1"             → framework-hook (our gate)
  - "violates the user's explicit"                 → claude-code-permission

Classification precedence (most-specific first):
  1. Contains TAPAGENTS_DISPATCH_GATE_FIRED_V1 → framework-hook (our gate)
  2. Contains "BLOCKED:" (any case)             → framework-hook (other hook)
  3. Contains "permission" + ("denied"|"violates"|"deny rule") with no
     framework markers → claude-code-permission (harness or settings.json
     deny). We can't reliably distinguish harness from settings.json deny
     at this surface — Org Designer triages from the message text.
  4. Default                                    → unknown

The hook is the data-collection mechanism. Classification can be refined
downstream (Org Designer's monthly Cadence 4 review parses the events.jsonl
and groups by `payload.denial_source` + `payload.denial_message`); the
hook's job is to capture, not to perfect-classify.

------------------------------------------------------------------------------
Stdin payload schemas (per Claude Code docs):

PostToolUse:
  {
    "session_id": "...",
    "hook_event_name": "PostToolUse",
    "tool_name": "Edit"|"Write"|"Bash"|...,
    "tool_input": { ... },
    "tool_response": { ... },          # tool's structured output
    "tool_use_id": "...",
    "duration_ms": <int>,
    "agent_id":    "..."  (subagent only),
    "agent_type":  "..."  (subagent only)
  }

PostToolUseFailure:
  {
    "session_id": "...",
    "hook_event_name": "PostToolUseFailure",
    "tool_name": "Edit"|"Write"|"Bash"|...,
    "tool_input": { ... },
    "error": "<string describing what went wrong>",   # PRIMARY denial signal
    "is_interrupt": false,
    "tool_use_id": "...",
    "duration_ms": <int>,
    "agent_id":   "..."  (subagent only),
    "agent_type": "..."  (subagent only)
  }

PermissionDenied:
  {
    "session_id": "...",
    "hook_event_name": "PermissionDenied",
    "tool_name": "Bash"|...,
    "tool_input": { ... },
    "tool_use_id": "...",
    "reason": "<classifier's explanation for why the call was denied>",
    "agent_id":   "..."  (subagent only),
    "agent_type": "..."  (subagent only)
  }

------------------------------------------------------------------------------
Exit contract:
  ALWAYS 0. PostToolUse / PostToolUseFailure / PermissionDenied hooks cannot
  block (their decision-control surfaces are `decision:"block"` for feedback
  to Claude, not for blocking the tool — the tool has already run/failed).
  Any uncaught exception is caught at top-level and emitted to misfires.jsonl;
  exit code stays 0.

Wired in: ../.claude/settings.json -> hooks.PostToolUse[0] (single-hook
PostToolUse chain), and additionally also added to hooks.PostToolUseFailure
and hooks.PermissionDenied for full coverage.

------------------------------------------------------------------------------
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Import the shared telemetry helper. Fail-open: if the import itself fails
# (file missing, syntax error, etc.), the hook still exits 0 — we just
# don't emit. Mirrors the orchestrator-dispatch-gate.py pattern.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_harness_block, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_harness_block(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


# Detection patterns — case-insensitive substring matches. The ordering of
# this list does not matter; classification precedence is applied below.
DENIAL_SUBSTRINGS_LOWER: tuple[str, ...] = (
    "permission for this action has been denied",
    "permission denied",
    "blocked:",
    "tapagents_dispatch_gate_fired_v1",
    "violates the user's explicit",
)


def read_payload() -> dict:
    """Read and parse the hook stdin payload; return {} on any failure."""
    try:
        raw = sys.stdin.read()
        if not raw:
            return {}
        return json.loads(raw)
    except Exception:
        return {}


def extract_denial_text(payload: dict) -> str:
    """Pull the denial text from whichever field the event uses.

    PostToolUse:        tool_response (dict or string)
    PostToolUseFailure: error (string, top-level)
    PermissionDenied:   reason (string, top-level)

    Returns a single string concatenating any populated denial-signal fields,
    so substring detection runs uniformly regardless of event shape.
    """
    parts: list[str] = []

    # Top-level error / reason fields (PostToolUseFailure / PermissionDenied)
    err = payload.get("error")
    if isinstance(err, str) and err:
        parts.append(err)
    elif err:
        parts.append(str(err))

    reason = payload.get("reason")
    if isinstance(reason, str) and reason:
        parts.append(reason)
    elif reason:
        parts.append(str(reason))

    # tool_response (PostToolUse) — can be dict, string, or other. Flatten.
    tr = payload.get("tool_response")
    if isinstance(tr, str):
        parts.append(tr)
    elif isinstance(tr, dict):
        # Common shapes: { "stdout": "...", "stderr": "...", "content": "..." }
        # or { "error": "...", "message": "...", "success": false }
        for key in ("stderr", "error", "message", "content", "stdout"):
            val = tr.get(key)
            if isinstance(val, str) and val:
                parts.append(val)
        # If `tool_response` has `is_error: true` it's typically a tool failure;
        # the actual text is in `content` or similar (already pulled above).
        # Last-resort: dump the dict if no string fields surfaced anything.
        if not parts:
            try:
                parts.append(json.dumps(tr, ensure_ascii=False)[:1000])
            except Exception:
                pass
    elif tr:
        # Some other shape — stringify defensively.
        try:
            parts.append(str(tr)[:1000])
        except Exception:
            pass

    return "\n".join(parts)


def matches_denial(text: str) -> bool:
    """True iff the text contains any of the known denial substrings (case-insensitive)."""
    if not text:
        return False
    lowered = text.lower()
    return any(sub in lowered for sub in DENIAL_SUBSTRINGS_LOWER)


def classify_denial_source(text: str) -> str:
    """Classify the denial source per precedence rules.

    Returns one of:
      "framework-hook"          — our PreToolUse gate or another framework hook fired
      "claude-code-permission"  — Claude Code permission mode or settings.json deny rule
      "permissions-deny"        — reserved; not separable from claude-code-permission at this surface
      "unknown"                 — pattern matched but origin couldn't be classified

    Precedence (most-specific first):
      1. TAPAGENTS_DISPATCH_GATE_FIRED_V1 → framework-hook (our authenticity marker)
      2. "BLOCKED:" present (any case)    → framework-hook (other framework hook)
      3. Permission-class phrasing        → claude-code-permission
      4. Default                          → unknown
    """
    if not text:
        return "unknown"
    lowered = text.lower()

    if "tapagents_dispatch_gate_fired_v1" in lowered:
        return "framework-hook"
    if "blocked:" in lowered:
        return "framework-hook"
    if (
        "permission denied" in lowered
        or "permission for this action has been denied" in lowered
        or "violates the user's explicit" in lowered
    ):
        return "claude-code-permission"

    return "unknown"


def derive_agent_context(payload: dict) -> tuple[str, str | None, str | None]:
    """Mirror orchestrator-dispatch-gate.py's is_subagent() detection.

    Per Claude Code docs, `agent_id` and `agent_type` are present iff the
    tool call originates inside a subagent (Task tool). Main-thread calls
    lack these fields.
    """
    agent_id = payload.get("agent_id")
    agent_type = payload.get("agent_type")
    if agent_id or agent_type:
        return ("subagent", agent_type if isinstance(agent_type, str) else None,
                agent_id if isinstance(agent_id, str) else None)
    return ("orchestrator", None, None)


def main() -> int:
    payload = read_payload()

    # Read stdin once; empty payload means there's nothing to inspect.
    if not payload:
        return 0

    tool_name = payload.get("tool_name") or ""
    tool_input = payload.get("tool_input") or {}

    denial_text = extract_denial_text(payload)
    if not matches_denial(denial_text):
        # No denial pattern in this tool call — silent pass.
        # We deliberately do NOT emit on pass to keep events.jsonl small;
        # the dispatch-gate follows the same convention (see its main()).
        return 0

    denial_source = classify_denial_source(denial_text)
    agent_context, agent_type, agent_id = derive_agent_context(payload)

    emit_harness_block(
        tool_name=tool_name,
        tool_input=tool_input if isinstance(tool_input, dict) else {},
        denial_source=denial_source,
        denial_message=denial_text,
        agent_context=agent_context,
        agent_type=agent_type,
        agent_id=agent_id,
        session_id=payload.get("session_id"),
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        # Fail-open: misfire to misfires.jsonl, then exit 0 (NOT re-raise).
        # PostToolUse-class hooks must not propagate exceptions; the tool
        # already ran, and the framework's contract is that telemetry is
        # best-effort.
        try:
            emit_misfire(
                source="permission-denial-capture",
                error=type(e).__name__ + ": " + str(e)[:200],
                payload={},
            )
        except Exception:
            pass
        sys.exit(0)
