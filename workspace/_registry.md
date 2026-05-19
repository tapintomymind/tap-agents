# Portfolio Registry (human-readable)

Updated by Conductor on every state transition. Mirrors `workspace/_global/portfolio.json` in a scannable format.

For up-to-date executive briefing: `/status` (EA delivers same data + recommendations).

---

## Active Projects

### tapagents-football-gm
- Phase: planned
- Entered phase: 2026-05-14 (scoping → planned hard checkpoint passed; user verbatim "Approve" on Decision Packet v2)
- Last activity: conductor (scoping → planned advance) at 2026-05-14T18:00:00Z
- Awaiting: Tier 2 implementation kickoff on user "go for build" signal
- Blockers: none
- Priority: high
- Next action: User signals "go for build" → Architect produces implementer briefs + QE produces test-plan.md
- Workspace: workspace/tapagents-football-gm/

Dual-purpose project: primary goal is a football GM simulation game (PGM3 / UFootballGM lineage, web/Next.js, American football, fictional rosters, phased P1 Roster+Sim → P2 Draft → P3 Cap+Trades → P4 Progression); secondary goal is framework dogfood in USE-AS-CUSTOMER mode. Per Q6 lock, the framework-hands-off constraint is binding — no TapAgents changes mid-build, no Org Designer dispatch mid-project, STUB agents (QE, GTM) activate only on explicit user signal. Framework frictions are captured in framework-friction-log.md for post-project retrospective only.

**Scoping → planned cycle summary (closed 2026-05-14):**
- PRD.md — CLEAR-rev3 (3 rev cycles: rev1 folded CR-6/7/8, rev2 added per-risk kill criteria CR-13, rev3 added ZenGM + monetization OOS)
- scope.md — CLEAR-rev1 (1 rev cycle: folded Critic C-SCOPE-1/3/4 + Designer §10 SaveStateIndicator reconciliation)
- tech-strategy.md — CLEAR-rev1 (1 rev cycle: same rev pass as scope.md)
- design-spec.md — CLEAR-rev1 (1 rev cycle: folded Critic C-DESIGN-1/2/3/4)
- Stack pick locked: Next.js 15.5.18 + Drizzle + Neon-deploy + SQLite-devDep + Zod + pure-rand + faker; 12 npm pins clean
- Sim engine: drive-aggregated + xoroshiro128+ seeded RNG; 21-day kill budget + fallback ladder
- DB topology: Neon Postgres (deploy) + SQLite (devDep-only local DX)
- Design metaphor: PGM3-desktop + UFootballGM-mobile drill-down at 375px; sticky position-group dividers; single "Saved" chip + NODE_ENV dev debug pill
- 5 kill criteria locked (sim 21d + variance 1000-season stat + cap 4wk + JSON schema 2wk migration + mobile-density M-A2.6 ship-gate)
- Pool B = ZERO; Q6 framework-hands-off preserved; framework-friction-log.md has 5 entries
- Decision Packet v2 approved 2026-05-14 verbatim "Approve"

---

### ip-protection
- Phase: planned
- Entered phase: 2026-05-13 (scoping → planned hard checkpoint passed; user verbatim "Approve" on Decision Packet v3)
- Last activity: conductor (scoping → planned advance per Decision Packet v3 approval) at 2026-05-13T21:00:00Z
- Awaiting: 3 parallel Architect activations (dashboard MVP scope, auto-drive Conductor scope, email & lifecycle infra scope) + QE test-plan.md; Tier 2 implementation awaits user "go for build" signal
- Blockers: none
- Priority: high
- Next action: Three Architect dispatches + QE dispatch run in parallel; user signals "go for build" to begin Tier 2 implementation against locked MCP-build scope.md + tech-strategy.md artifacts
- Workspace: workspace/ip-protection/

**Planning cycle summary (closed 2026-05-13):**
- architect-spike-mcp-server.md — CLEAR (rev 2 hygiene cleared)
- pricing-tier-design.md — CLEAR-equivalent (rev 2 reconciliation cleared; W-A SOC2 cross-coupling fixed)
- ops-security-envelope-spike.md — CLEAR + 2 P2 judgment calls acknowledged
- legal-scope-spec.md — WARN (rev 2; 3 P2 + 2 FYI polish for counsel-handoff; counsel authorized to proceed)
- gtm-distribution-plan.md — WARN (rev 1; 1 cosmetic P1 + 4 P2 FYIs; content production authorized)
- Cross-couples verified clean: biz-finance retention Path-(a), SOC2 timing alignment ops-security → biz-finance → gtm Phase 4, 6 named risks consistent biz-legal §0/§8, FTC §5 4-claim validation biz-legal → gtm

**Scoping → planned cycle summary (closed 2026-05-13):**
- scope.md — CLEAR (rev pass 5; γ-expanded 5-agent v1 roster; M-A2.5 + M-A4.5 milestones; all 12 user-decisions APPROVED)
- tech-strategy.md — CLEAR (rev pass 5; γ-expansion absorbed; §13 QE handoff widened; stack + 12 risks + γ-expanded MCP tool surface)
- ops-security-review-decisions-2026-05-13.md — CLEAR-with-WARN (3 WARNs; 22 hardening items within milestone budgets)
- Decision Packet v3: `workspace/_global/decision-packets/2026-05-13-ip-protection-scoping-to-planned.md` — verbatim "Approve" 2026-05-13
- Deferred activations queued: 3 Architect (dashboard MVP, auto-drive Conductor, email & lifecycle infra) + QE (test-plan.md); Tier 2 implementation awaits user build signal; Org Designer 3-STUB promotion separate queue

---

### tapagents-app
- Phase: handed-off
- Entered phase: 2026-05-05
- Last activity: conductor (BL-034 feature-closed + cascade-rename-bl059 Phase 1) at 2026-05-14T12:14Z
- Awaiting: Tier-2 ongoing impl; no Tier-1 blocker
- Blockers: none
- Priority: high
- Next action: ongoing Tier-2 work — see workspace/tapagents-app/backlog.md
- Workspace: workspace/tapagents-app/

**Cascade-rename-bl059 Phase 1 note (2026-05-14):** Slug consolidated from prior `claude-team-app` (Tier-1 planning) + `agent-dashboard` (Tier-2 impl) into single `tapagents-app` slug per BL-059 plan. Phase 1 (snapshot + workspace consolidation + metadata) executed; Steps 4-12 (filesystem rename + memory/protocol/script sweeps + Vercel + GitHub + backlog closure + verification smoke) sequenced as separate dispatches.

---

## Paused Projects

*(none)*

## Recently Shipped

*(none)*

## Recently Abandoned / Pivoted

*(none)*

## Superseded / Archaeology

*(none — claude-team-app slot consolidated into tapagents-app via BL-059 cascade-rename Phase 1 on 2026-05-14)*

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
