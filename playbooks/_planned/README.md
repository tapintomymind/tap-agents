# Planned Playbooks

Playbooks the team will likely need but doesn't have yet. Each stub documents:

1. **When to build it** — what triggers warrant promoting it from `_planned/`
2. **Provisional purpose** — what the playbook would cover
3. **Provisional prerequisites** — what agents need to be activated for it to work

## Current Stubs

| Playbook | Build when |
|---|---|
| `validate-feature-idea.md` | Active product needs feature-prioritization workflow (post first MVP) |
| `post-launch-retro.md` | First project has been measured for ≥2 weeks |
| `pivot-from-feedback.md` | Feedback Synthesizer activated AND first feedback-driven pivot occurs |

## Promotion Process

When trigger conditions are met:
1. Org Designer (or you) writes the playbook
2. Org Designer adds it to root `playbooks/`
3. Updates `playbooks/<name>.md` with full step-by-step
4. Adds slash command if appropriate
5. Logs to `memory/agent-changelog.md`

## Why Stubs

Same logic as `agents/_planned/`: build playbooks against real workflows, not imagined ones. A pre-written playbook for a workflow that never runs is dead weight.
