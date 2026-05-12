# Portfolio Registry (human-readable)

Updated by Conductor on every state transition. Mirrors `workspace/_global/portfolio.json` in a scannable format.

For up-to-date executive briefing: `/status` (EA delivers same data + recommendations).

---

## Active Projects

*(none — Conductor populates this section as Tier-1 projects are scoped via `/team` and advance through the state machine.)*

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
### <slug>
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
