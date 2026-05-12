---
name: refocus
description: Re-read state.json and restate the active task in one tight block. Use after distractions, context drift, or returning to a session.
---

# /refocus

The user wants you back on the active task. Read-only restatement, no work, no dispatch.

## Action

1. Read `<project>/.claude/workspace/state.json` for the active project.
   If multi-project ambiguity: use the project most recently touched (most recent `last_agent_at` or `entered_phase_at`).

2. (Optional) Skim `<project>/.claude/workspace/parked-thoughts.md` so you know what to NOT bring up as candidates.

3. Reply with exactly this shape:

   ```
   Project: <slug>
   Phase: <current_phase or current_milestone> — <milestone name>
   Status: <status>, day <N> (<day_part>)
   Next: <first item in tasks_pending, one line>
   Blocker: <blocked_on or "none">
   Critic-open: <count of open critic concerns or "0">
   ```

   Keep each line ≤ 100 chars. Truncate long task strings to ≤ 80 chars + `…`.

4. Stop. Wait for the user's next instruction.

## Boundaries

- Do NOT dispatch any subagent during `/refocus` — this is read-only.
- Do NOT modify state.json or any artifact.
- Do NOT bring up parked thoughts as candidates — those are intentionally parked.
- Do NOT prefix with conversational filler ("Sure, here's where we are…"). Just the block.

## See Also

- `/status` — full executive briefing across all projects (EA)
- `/queue` — decisions waiting on the user
- `/park <thought>` — capture a side-thought without derailing
