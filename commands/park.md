---
name: park
description: Capture a side-thought to the project's parked-thoughts log without derailing the active task. The orchestrator confirms and resumes.
---

# /park

The user has a side-thought, off-topic idea, or future-work note they want captured without pivoting away from the current task. Your job is to file it cleanly and return them to the active task.

## Action (do all of these)

1. Identify the active project's `.claude/workspace/` directory. In multi-project sessions this is the project the orchestrator was last operating on; in single-project sessions it is the current project. If you can't determine a project, default to `_inbox/` under the framework workspace.

2. Append the user's thought to `<project>/.claude/workspace/parked-thoughts.md` (create the file if missing), formatted exactly as:

   ```
   ## YYYY-MM-DDTHH:MMZ — parked during <active task or "(orchestrator idle)">

   <user's thought, verbatim>

   _captured by: /park_
   ```

   Use the current UTC time. Use the active milestone + day from `.claude/workspace/state.json` to fill in the "active task" hint, or "(orchestrator idle)" if no active task is known.

3. Decide if it warrants backlog promotion:
   - Real feature ask, bug, or follow-up → dispatch **backlog-curator** to evaluate ID allocation (fire-and-forget; the curator surfaces the new BL-NNN via EA on next `/briefing`).
   - Vague musing or "we should think about X someday" → leave it in `parked-thoughts.md` for the next Org Designer sweep.

4. Reply to the user in exactly this shape (no preamble, no summary of what you did):

   ```
   Parked: "<one-line gist of the thought>"
   Resuming: <active task description, one line>
   ```

   If there's no active task, the second line is `Resuming: orchestrator idle — say what's next or run /refocus`.

## Boundaries

- Do NOT start work on the parked thought, even if it looks easy.
- Do NOT ask follow-up questions about the parked thought right now.
- Do NOT block on the backlog-curator dispatch returning — fire it and continue.
- Do NOT add commentary, analysis, or your opinion about whether the thought is good or bad.

## See Also

- `/refocus` — restate the active task without parking anything
- `/queue` — see the decisions queue
- `/inbox` — see flagged items + FYI feed
