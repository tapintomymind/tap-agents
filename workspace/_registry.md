# Portfolio Registry (human-readable)

Updated by Conductor on every state transition. Mirrors `workspace/_global/portfolio.json` in a scannable format.

For up-to-date executive briefing: `/status` (EA delivers same data + recommendations).

---

## Active Projects (2)

### claude-team-app (working name: Tap Studio)
- **Phase:** stratego (entered 2026-05-05 00:45)
- **Last activity:** Intake completed brief; user approved at 00:42
- **Awaiting:** Strategist + Critic + Designer drafting PRD (parallel)
- **Blockers:** none
- **Priority:** high (eat-own-dog-food project)
- **Next action:** Strategist drafts PRD using approved intake-brief.md
- **Workspace:** [workspace/claude-team-app/](workspace/claude-team-app/)

### ip-protection (working name: TapAgents IP Protection — Option D)
- **Phase:** briefed — DRAFT pending user approval (entered 2026-05-06 17:15)
- **Last activity:** Intake round 4 — directional brief written, paid-subs sub-decisions surfaced
- **Awaiting:** User approval of intake-brief.md
- **Blockers:** none
- **Priority:** high (gates TapAgents+TapHQ monetization; biz-finance + biz-legal + gtm-strategist activations queued behind approval)
- **Next action:** User approves brief → Conductor advances to stratego, or Architect dispatched in parallel for MCP-server spike while paid-subs discussion continues
- **Workspace:** [workspace/ip-protection/](workspace/ip-protection/)

## Paused Projects

*(none)*

## Recently Shipped

*(none)*

## Recently Abandoned / Pivoted

*(none)*

---

## Format

When populated, each project entry follows this format:

```
### <project-slug>
- Phase: <current_phase>
- Entered phase: <relative time>
- Last activity: <last_agent at last_agent_at>
- Awaiting: <description or "nothing">
- Blockers: <description or "none">
- Priority: <normal | high | low>
- Next action: <next_suggested_action.task>
- Workspace: workspace/<slug>/
```

## How to Use

- **Quick scan:** Glance for "Awaiting" rows that mention you (decisions waiting on user)
- **Drill in:** `/status` for EA's full briefing with recommendations
- **Specific project:** Read `workspace/<slug>/state.json` for raw state

This file is a CONVENIENCE for visual scanning. Source of truth for any agent is `workspace/<slug>/state.json` + `workspace/_global/portfolio.json`.
