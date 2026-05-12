# Handoff Package — <project-name>

**From:** Tier 1 HQ (`<tier1-hq>/.claude/`)
**To:** Tier 2 (`<target-repo>/.claude/`)
**Generated:** <ISO timestamp>
**Architect:** <agent invocation reference>
**Project slug:** <slug>
**Approved at planned → scaffold checkpoint:** <timestamp + verbatim user approval>

---

## 1. Source Artifacts (full copies)

### 1.1 PRD

<<<EMBED FULL CONTENTS OF prd.md HERE>>>

### 1.2 Scope

<<<EMBED FULL CONTENTS OF scope.md HERE>>>

### 1.3 Tech Strategy

<<<EMBED FULL CONTENTS OF tech-strategy.md HERE>>>

### 1.4 Brief Excerpts (relevant sections only)

<<<EMBED RELEVANT SECTIONS OF intake-brief.md — Constraints, Technical Assumptions, Open Questions>>>

---

## 2. Decision Context

### 2.1 Riskiest technical bets
<Pulled forward from tech-strategy.md §3 — Tier 2 must address these or escalate>

- **<Risk 1>:** <description, mitigation>
- **<Risk 2>:** <description, mitigation>

### 2.2 MVP cuts (do NOT re-add without Tier 1 approval)
<Pulled from scope.md §1>

- **<Feature>:** <reason for cut>
- **<Feature>:** <reason for cut>

### 2.3 Open questions deferred to Tier 2
<Items Tier 2 has authority to decide during build>

- **<Question>:** <context for resolution>

### 2.4 Critic flags addressed and deferred
<Pulled from critic-notes.md — items the user accepted as deferred>

- **<Flag>:** <how addressed in plan, or why deferred>

### 2.5 Dissent log notes
<Pulled from dissent-log.md — overrides Tier 2 should be aware of>

- **<Override>:** <reasoning, consequence-if-right>

---

## 3. Tier 2 Reportback Contract

Tier 2 MUST report:
- MVP shipped (with live URL)
- Major scope deviation
- Blocked >24h
- Risk realized
- Decision needed from Tier 1
- Promotion request

Format and full protocol: see embedded `protocols/reportback-protocol.md` below.

<<<EMBED FULL CONTENTS OF reportback-protocol.md HERE>>>

---

## 4. Tier 2 Agent Specifications

The following Tier 2 agents have been generated for this project's stack (`<chosen-stack>`):

- `tier2-conductor.md` — project state machine for implementation phases
- `<stack>-architect.md` — implementation-level architecture
- `<component>-agent.md` — component/UI work (if frontend in scope)
- `<db>-agent.md` — database work
- `deployment-agent.md` — release / deploy

<<<EMBED EACH AGENT'S FULL CONTRACT — generated from templates/stacks/<chosen-stack>/>>>

---

## 5. Memory Pointers

Tier 2 has READ-ONLY access to parent memory at:
`<absolute path to <tier1-hq>/.claude/memory/>`

Specifically useful files:
- `memory/stack-preferences.md` — defaults Architect drew from
- `memory/lessons-learned.md` — relevant past projects
- `memory/patterns.md` — cross-project conventions

Tier 2 may NOT write to parent memory.

---

## 6. Initial Tier 2 State

```json
{
  "tier1_project_slug": "<slug>",
  "tier1_workspace_path": "<absolute path to workspace/<slug>/>",
  "tier1_handoff_package_path": "<absolute path to this file>",
  "current_phase": "tier2-initialization",
  "handoff_received_at": "<timestamp>",
  "stack": "<chosen-stack>",
  "milestones": [<list from scope.md>],
  "current_milestone": null,
  "blocked_on": null,
  "reportback_path": "<absolute path to .claude/reportback.md in target repo>"
}
```

---

## 7. Verification Checklist

Before Conductor advances `scaffold → handed-off`, verify:
- [ ] Target `.claude/` directory exists and is non-empty
- [ ] This handoff-package.md exists at both Tier 1 workspace AND Tier 2 location
- [ ] `reportback.md` exists at registered path (initially empty/header only)
- [ ] All Tier 2 agent files non-empty
- [ ] Test write to Tier 2's `reportback.md` succeeds

---

## Sign-off

- Architect generated package: <yes>
- Cross-checked vs PRD/scope/tech-strategy: <yes>
- User approved at scaffold checkpoint: <yes/no, timestamp, verbatim>
- Verification checklist passed: <yes/no, items pending>
