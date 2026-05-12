# Tier 2 Reportback Channel

**Location:** `<target-repo>/.claude/reportback.md`
**Project:** <project-slug>
**Tier 1 workspace:** <absolute path to <tier1-hq>/.claude/workspace/<slug>/>
**Established:** <ISO timestamp>

---

## How This Channel Works

Tier 2 appends entries to this file when events occur. Tier 1's Conductor monitors and surfaces relevant entries to user via EA.

Required reportback events: `mvp-shipped`, `scope-deviation`, `blocked-24h`, `risk-realized`, `decision-needed`, `promotion-request`.

Optional FYI events: `milestone-completed`, `refactor`, `lesson-learned`, `stack-adjustment`.

Full protocol: see Tier 1 `protocols/reportback-protocol.md`.

---

## Entry Format

```
─────────────────────────────────────────────
TIER 2 REPORTBACK — <project-slug>
Type: <required-event-type | fyi>
Date: <ISO timestamp>
Tier 2 agent: <which Tier 2 agent reports>

WHAT
<Concise description of the event>

CONTEXT (if needed)
<Background — why this matters>

PRD/SCOPE IMPACT
<Does this affect PRD acceptance criteria? Scope milestones? Tech strategy?>
<Required when type = scope-deviation, risk-realized, promotion-request>

DECISION NEEDED FROM TIER 1
<Specific question for Tier 1, with options if applicable>
<Required when type = decision-needed, scope-deviation, promotion-request>

REPLACEMENT / WORKAROUND (if applicable)
<What Tier 2 did or proposes instead>

LIVE URL / ACCESS (for shipped events)
<Where Tier 1 can verify>

CITED CONSTRAINTS
<Specific tech-strategy risks, scope cuts, or PRD criteria this relates to>
─────────────────────────────────────────────
```

---

## Entries

<!-- Tier 2 appends entries below this line. Append-only. -->
