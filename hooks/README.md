# Hooks

Deterministic gates and triggers that run outside agent judgment. Hooks enforce protocol via shell commands wired into Claude Code's lifecycle events.

## What's here

| Hook | Event | Purpose |
|---|---|---|
| `stop-critic-check.py` | `Stop` | Block session end if any project has unresolved blockers, contested artifacts, or BLOCKING Critic concerns. Forces Critic-on-completion. |
| `pre-tool-gate.py` | `PreToolUse` | Block dangerous shell patterns (`rm -rf /`, `sudo rm`, `chmod 777`, `.env` access, `--force` push) AND block edits to immutable `seed.md` or `[CONTESTED]` artifacts. |

## How they work

Configured in `.claude/settings.json`. Each hook:
1. Receives event payload via stdin (JSON)
2. Parses, checks rules
3. Exits 0 (allow) or 2 (block, stderr message goes back to the agent)

Stop hooks blocking stoppage causes the agent to receive the stderr message and continue working. PreToolUse hooks blocking a tool call causes the agent to see the message and choose another path.

## Anti-loop guards

`stop-critic-check.py` checks `stop_hook_active` in the payload. If true, the hook fails open — never block stoppage twice in a row, that's an infinite loop.

## Failing open

If the hook can't parse the payload OR encounters an unexpected error, it exits 0 (allow). Better to let work continue than to break Claude Code with a flaky hook.

## Tuning

These are v1, intentionally minimal. Tune the rules:
- `stop-critic-check.py` — add more checks as the team's failure modes emerge
- `pre-tool-gate.py` — add more `DANGEROUS_BASH_PATTERNS` and `check_file_protection` rules

## Reference

Pattern source: [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) — the canonical hooks playbook.

Claude Code hooks documentation: <https://code.claude.com/docs/en/hooks-guide>
