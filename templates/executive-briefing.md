# Executive Briefing

**Format used by EA at session-start, session-close, on-demand (`/status`, `/briefing`), and scheduled cadence.** Word budget: 250-400.

---

```
─────────────────────────────────────────────
EXECUTIVE BRIEFING — <YYYY-MM-DD HH:MM>

ACTIVE PROJECTS (<count>)

▸ <project-slug>
  Phase: <phase> (entered <relative time, e.g., "2h ago">)
  Last activity: <one-sentence summary of last meaningful event>
  Awaiting: <what needs the user, or "nothing">
  Blockers: <list, or "none">

▸ <next active project>
  Phase: <phase> (entered <relative>)
  Last activity: <one-sentence>
  Awaiting: <>
  Blockers: <>

PAUSED (<count>)
  ▸ <project-slug> — paused at <phase> (<relative>); resume cue: <user said when?>

DECISIONS NEEDED
  1. <Specific decision> for <project>
  2. <Specific decision> for <project>
  (or "(none)")

TEAM HEALTH (Org Designer)
  <pending proposal summary, OR "no proposals">
  <agent prompt sizes / WRONG_AGENT rate / split candidates if any>

[Optional]
RECENT FYI (last 24h, ≤3 items)
  - <event>
  - <event>
─────────────────────────────────────────────
```

---

## Variants

### Session-start opening brief
Same format. Emphasizes: "since last session, X happened, Y is waiting on you."

### Session-close summary
Same format. Emphasizes: "what advanced this session, what's pending."

### On-demand `/status`
Full format.

### `/briefing`
Full format. May include "RECENT FYI" if user appears to want context.

### Scheduled (Mon morning, Fri afternoon — when cron is built)
Full format with weekly emphasis: "this week's hits, next week's holds."

---

## Trim Rules

If projects > 4, condense per-project to 2 lines:
```
▸ <slug>: <phase>, <one-line status> (awaiting: <>)
```

If decisions > 5, group by project and prioritize top 3:
```
DECISIONS NEEDED (5 total — top 3 shown)
  1. <decision> for <project>
  2. <decision> for <project>
  3. <decision> for <project>
  (+2 more — see /queue for full list)
```

---

## Rules

- Word budget enforced
- Always include all four sections (ACTIVE / PAUSED / DECISIONS / TEAM HEALTH) even if "(none)"
- Never speculate — only report what state.json and logs confirm
- Never hide blockers or contradictions — those always appear in `Blockers:` or as Surfacing Alerts
- Use `▸` (U+25B8) consistently as project bullet
- Use `⚠` for warnings/blockers in Surfacing Alerts (not in routine briefings)
