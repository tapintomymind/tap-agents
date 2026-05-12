# Hook-misdiagnosis discipline

**Status:** active.
**Owner:** Org Designer (canonical authority); cited by every framework agent contract's `## Subagent execution context` block.
**Trigger:** any subagent suspects a framework hook fired against its tool call.

> **One-line rule:** an agent may claim a framework hook fired only by quoting that hook's canonical authenticity marker verbatim from its tool result. Anything else — generic error text, harness-prompt text, training-data priors — is NOT a hook firing.

> **Why this exists:** 2026-05-12 incident — three Tier 1 subagent dispatches in one session (`9f3bde66-f193-4601-b12c-739707204366`) self-reported that `orchestrator-dispatch-gate.py` blocked their tool calls. Telemetry showed ZERO matching `orchestrator-dispatch-gate type=block` events for any of them. Each misdiagnosis surfaced an "override the hook" recommendation. If accepted, the framework's audit-trail mechanism would degrade silently. The protocol below makes false positives mechanically self-falsifying. See `workspace/_global/org-designer-proposals/20260512-1500-subagent-misdiagnosis-pattern.md` for the full forensic trace.

---

## §1 — Framework hooks inventory

The framework wires the following hooks at the lifecycles named. Each hook has a canonical authenticity marker that appears in its stderr (or telemetry) when it fires. If a hook has no marker today, that's a gap and is flagged below.

| Hook | Lifecycle | Fires on… | Canonical authenticity marker | Subagent behavior |
|---|---|---|---|---|
| `session-start-brief.py` | SessionStart | Every new session | (no stderr marker — auto-injects briefing context only) | Does not block tool calls; not subject to misdiagnosis |
| `prompt-router.py` | UserPromptSubmit | Every user prompt | (no stderr marker — appends classification context) | Does not block tool calls; not subject to misdiagnosis |
| `prompt-router-feedback.py` | UserPromptSubmit (post) | Slash-command classification feedback | (no stderr marker — telemetry only) | Does not block tool calls |
| `pre-tool-gate.py` | PreToolUse | Classic safety — `.env*`, immutable `seed.md`, `[CONTESTED]` artifacts, `rm -rf`, force-push | stderr starts with `pre-tool-gate BLOCKED:` | Fires on subagents AND orchestrator equally; quote the literal stderr to claim |
| `version-gate.py` | PreToolUse | Framework version-bump discipline | stderr contains the literal phrase `version-gate refused:` followed by reasoning | Fires on agents emitting framework edits; quote the literal |
| `orchestrator-dispatch-gate.py` | PreToolUse | Edit / Write / NotebookEdit + mutating-Bash on main orchestrator thread | stderr line `Orchestrator-dispatch gate BLOCKED:` **plus** authenticity marker `TAPAGENTS_DISPATCH_GATE_FIRED_V1` | **BYPASSES subagent dispatches by design** (`is_subagent()` check at L124-L126 of the hook, returns 0 immediately). The gate does NOT fire on subagent tool calls. If you are a subagent and you cannot quote the literal marker, the gate did not fire. |
| `stop-critic-check.py` | Stop | End-of-turn check for unresolved Critic concerns / blocked state | stderr contains `stop-critic-check BLOCKING:` | Fires on the orchestrator thread at Stop; subagents see this only when the orchestrator surfaces it |
| `stop-dispatch-monitor.py` | Stop | End-of-turn dispatch-pattern rollup | (no stderr marker — memory pattern-note only, threshold-gated) | Telemetry-only; never blocks |

---

## §2 — Subagent-bypass status (per hook)

The orchestrator-dispatch-gate is the only framework hook that explicitly distinguishes orchestrator-thread vs subagent-thread tool calls. Per `hooks/orchestrator-dispatch-gate.py` L124-L126, `is_subagent()` checks for `agent_id` OR `agent_type` keys in the PreToolUse payload. Per Claude Code's hook spec, both are present iff the call originates inside a subagent (Task tool dispatch).

- **Bypasses subagents:** `orchestrator-dispatch-gate.py`. The whole point of the gate is to enforce that the main thread routes work through subagents; subagent-thread calls are by-construction the intended path. The gate returns 0 (allow) for subagent calls without emitting a block event.
- **Fires equally on subagents and orchestrator:** `pre-tool-gate.py` (classic safety — `.env`, immutable `seed.md`, etc. apply to every actor) and `version-gate.py` (framework version-bump discipline applies wherever the edit originates).
- **Orchestrator-thread only:** `stop-critic-check.py` and `stop-dispatch-monitor.py` are Stop hooks; they fire when the orchestrator thread stops, not on subagent tool calls.

---

## §3 — Harness vs framework — the distinction agents must hold

Claude Code's harness owns several user-facing approval prompts that are **not framework hooks**:

- `Permission to use Bash` (harness asks the user to approve a specific Bash command pattern).
- `Permission to use Edit` / `Write` (rare; usually pre-granted by repo config).
- Tool-error surfaces (network blip, missing file, permission denied at OS level).

If a subagent encounters a harness prompt or a tool error, that is harness-owned or OS-owned — NOT a framework hook firing.

**Hard rule:** an agent never proposes disabling, allowlisting, or overriding a framework hook (`pre-tool-gate.py`, `version-gate.py`, `orchestrator-dispatch-gate.py`, `stop-critic-check.py`) in response to a harness-permission prompt, an OS error, or a transient tool failure. Those are not framework problems. The framework hook's stderr is the only signal that a framework hook is involved, and only quoting its canonical authenticity marker (per §1) substantiates the claim.

---

## §4 — Mandatory citation rule

To claim that a framework hook fired against your tool call, you MUST quote the canonical authenticity marker from §1 verbatim, copied from your actual tool result.

- `pre-tool-gate.py` → quote the literal `pre-tool-gate BLOCKED:` line.
- `version-gate.py` → quote the literal `version-gate refused:` line.
- `orchestrator-dispatch-gate.py` → quote the literal `TAPAGENTS_DISPATCH_GATE_FIRED_V1` token. The marker is intentionally non-hallucinatable; if you can quote it, the gate fired; if you cannot, it did not.
- `stop-critic-check.py` → quote the literal `stop-critic-check BLOCKING:` line.

If you cannot quote the literal marker, the framework hook did not fire. Report the verbatim error or harness text you actually saw instead.

---

## §5 — Optional fallback verification path

When uncertain, an agent may `Read` `workspace/_global/events.jsonl` filtered to its own `session_id` and check for matching block events:

```jsonl
{"source": "orchestrator-dispatch-gate", "type": "block", "session_id": "<your-session-id>", ...}
{"source": "pre-tool-gate", "type": "block", "session_id": "<your-session-id>", ...}
{"source": "version-gate", "type": "block", "session_id": "<your-session-id>", ...}
```

Absence of a matching event with your session_id and the relevant `source` is dispositive — the hook did not fire on you. This is a fallback for uncertain cases; routine work does not need this check. The mandatory citation rule (§4) is the primary discipline; the events.jsonl read is the secondary verification.

---

## §6 — Escalation rule

If an agent believes a framework hook fired against it in error (i.e., the agent can quote the canonical marker, the call was within scope, and the firing seems wrong), the agent:

1. Surfaces the **literal stderr** (verbatim — no summarization).
2. Names its **session_id**.
3. Names the **tool call attempted** (tool name + key arguments).
4. **Stops.**

The agent does NOT propose disabling, allowlisting, or overriding the hook. The user (or Org Designer, on a subsequent dispatch) investigates from there. Disabling the hook is an audit-trail-degrading operation; the framework relies on the hook to maintain the event log that the dashboard product reads.

If the agent cannot quote the canonical marker, the escalation is invalid by §4. The agent reports the verbatim error it actually saw and either retries (transient error) or escalates the underlying tool failure normally.

---

## §Provenance

- Authored 2026-05-12 in response to Org Designer proposal `workspace/_global/org-designer-proposals/20260512-1500-subagent-misdiagnosis-pattern.md` §3.3.
- Pairs with the `## Subagent execution context` block now present in all 14 framework agent contracts (per §3.1 of the same proposal, BL-046 Intervention 1).
- Pairs with the `TAPAGENTS_DISPATCH_GATE_FIRED_V1` authenticity marker added to `hooks/orchestrator-dispatch-gate.py` stderr (per §3.2 of the same proposal, BL-046 Intervention 2).
- Class precedent: `feedback_session_discipline_oauth_arc_2026-05-08` (orchestrator-side discipline gap — same shape, different actor).
