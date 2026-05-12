# Baseline Tier 2 Kit

**Used by Architect when no stack-specific template exists.** Generic 4-agent set that works for any stack.

## When This Kit is Used

- Project picks a stack with no `templates/stacks/<stack>/` directory
- Architect logs to `memory/agent-changelog-private.md`: "first project on stack X — baseline used; codify template after this project ships"

## What's Generated (4 agents)

| Agent | Role |
|---|---|
| `tier2-conductor.md` | Project state machine; routes Tier 2 work; reports to Tier 1 |
| `tier2-implementer.md` | Generic build agent; specializes via stack hint at invocation |
| `tier2-critic.md` | Project-scoped Critic for code review |
| `tier2-deployment.md` | Generic deploy agent; reads tech-strategy for hosting picks |

Plus README + reportback.md scaffold.

## Promotion to Stack-Specific Template

After a project on a new stack ships successfully:
1. Org Designer reviews what worked / what was missing in the baseline kit
2. Org Designer proposes a new `templates/stacks/<stack>/` template based on the project's actual Tier 2 set
3. User approves
4. Future projects on this stack get the specialized template instead of baseline

## Variables (substituted by Architect at scaffold time)

Each baseline agent file uses placeholders Architect substitutes:
- `{{PROJECT_SLUG}}` — e.g., `music-discovery-2026`
- `{{STACK}}` — e.g., `nextjs`, `bun-cli`, `python-fastapi`
- `{{TIER1_WORKSPACE_PATH}}` — absolute path to Tier 1 project workspace
- `{{TIER1_HANDOFF_PACKAGE_PATH}}` — absolute path to handoff package
- `{{REPORTBACK_PATH}}` — absolute path to reportback.md
- `{{MILESTONES}}` — JSON array of milestones from scope.md
