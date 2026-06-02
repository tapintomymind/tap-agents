# Claude Team — Design Spec

**Date:** 2026-05-04
**Author:** Tap Desai (with Claude as collaborator)
**Status:** Draft for review
**Location of resulting system:** `App Development/.claude/`

---

## 1. Vision

Build a multi-agent "company" that lives in `App Development/.claude/` and behaves like a C-suite + corporate functions for software product development.

- **Parent `.claude/` = Company HQ (C-suite).** Owns portfolio strategy, product vision, scoping, tech direction, team shape, executive reporting. Does not write production code.
- **Each project's `.claude/` = Product team (Tier 2).** Receives a charter from HQ, owns implementation, reports up. Generated per-project by HQ.

The system is designed so the user (CEO) interacts only when meaningful decisions or summaries are required. All routine handoffs, consistency checks, and routing happen automatically via the state machine.

The team grows over time: starts lean (7 agents) and adds specialists when real friction emerges, governed by an Org Designer agent that watches team performance.

The HQ pattern is intended to be **open-source-ready** from day one, with a private-fork mechanism for the user's actual product taste, projects, and proprietary refinements.

---

## 2. Founding Team (7 Agents)

| Agent | Corporate role | Direction | Cadence |
|---|---|---|---|
| **Intake** | Director of Product Discovery | User → Team (downward) | New work / scope shifts / pause-resume |
| **Executive Assistant (EA)** | Chief of Staff | Team → User (upward) | Continuous; triggers + on demand |
| **Conductor** | CTO/CPO | Team-internal routing | Every transition |
| **Strategist** | VP Product | Conductor-driven | Per project, PRD phase |
| **Architect** | VP Engineering | Conductor-driven | Per project, scoping + tech + scaffolding |
| **Critic** | Independent advisor | Reads everything; writes flags | Continuous, parallel to producers |
| **Org Designer** | Head of People | Reads team activity; writes proposals | Slow cadence (post-project / on demand) |

**Two CEO-facing voices, five backstage.**
- The user only ever talks to **Intake** (gathering work) or **EA** (reviewing work).
- All other agents communicate via artifacts and the state machine.

### Planned (not built day one)
- **GTM Strategist** — built when first project ships
- **Growth Analyst** — built when first project has users
- **Customer Researcher** — split off Strategist if research depth demands
- **Industry Researcher** — split off Strategist if competitive intel deepens
- **Feedback Synthesizer** — built when first project has user feedback

These live as stubs in `agents/_planned/` with `README.md` documenting trigger conditions for activation.

---

## 3. Directory Structure

```
App Development/.claude/
├── README.md                          # Public-ready: how the team works
├── CHANGELOG.md                       # Public-ready: technical changes
├── LICENSE                            # MIT (default); revisit if licensing as product
├── .gitignore                         # Splits public/private layers
│
├── agents/                            # Tier 1 agent definitions
│   ├── intake.md
│   ├── executive-assistant.md
│   ├── conductor.md
│   ├── strategist.md
│   ├── architect.md
│   ├── critic.md
│   ├── org-designer.md
│   └── _planned/
│       ├── README.md                  # Why these aren't built; activation triggers
│       ├── gtm-launch-strategist.md   # Stub (renamed to gtm-launch-strategist 2026-05-11 — see _archive/)
│       ├── growth-analyst.md          # Stub
│       ├── customer-researcher.md     # Stub
│       ├── industry-researcher.md     # Stub
│       └── feedback-synthesizer.md    # Stub
│
├── commands/                          # Slash commands for direct invocation
│   ├── team.md                        # /team "<seed>" — Conductor entrypoint
│   ├── intake.md                      # /intake — direct to Intake
│   ├── status.md                      # /status — EA briefing
│   ├── briefing.md                    # /briefing — explicit executive briefing
│   ├── queue.md                       # /queue — show decisions queue
│   ├── inbox.md                       # /inbox — flagged items + FYI feed
│   ├── strategist.md
│   ├── architect.md
│   ├── critic.md
│   ├── org-designer.md
│   └── grow-team.md                   # /grow-team — Org Designer review
│
├── protocols/                         # Inter-agent rules
│   ├── state-machine.md
│   ├── handoff-protocol.md            # Tier 1 → Tier 2 packaging
│   ├── reportback-protocol.md         # Tier 2 → Tier 1 reporting
│   ├── conflict-resolution.md
│   ├── consistency-check.md
│   ├── checkpoint-protocol.md
│   ├── intake-protocol.md
│   ├── ea-protocol.md
│   └── citation-protocol.md
│
├── templates/                         # Artifact templates
│   ├── prd.md
│   ├── research-brief.md
│   ├── scope-doc.md
│   ├── tech-strategy.md
│   ├── critic-review.md
│   ├── intake-brief.md
│   ├── handoff-package.md
│   ├── reportback.md
│   ├── executive-briefing.md
│   ├── decision-packet.md
│   ├── session-close.md
│   ├── dissent-entry.md
│   ├── question-bank/
│   │   ├── README.md
│   │   ├── 01-problem-clarity.md
│   │   ├── 02-scope-discipline.md
│   │   ├── 03-success-definition.md
│   │   ├── 04-users-and-distribution.md
│   │   ├── 05-technical-assumptions.md
│   │   ├── 06-constraints.md
│   │   ├── 07-existing-state.md
│   │   ├── 08-decision-rights.md
│   │   └── 09-compliance-and-legal.md  # Reserved for future expansion
│   └── stacks/                        # Tier 2 scaffolding templates per framework
│       └── README.md                  # Populated as Architect encounters new stacks
│
├── playbooks/                         # End-to-end multi-agent workflows
│   ├── seed-to-mvp.md                 # Flagship: idea → shipped MVP
│   ├── portfolio-review.md            # Cross-project portfolio sweep
│   └── _planned/
│       ├── README.md
│       ├── validate-feature-idea.md
│       ├── post-launch-retro.md
│       └── pivot-from-feedback.md
│
├── memory/                            # Cross-project team brain
│   ├── README.md                      # Public: explains memory model
│   ├── _examples/                     # Public: example files for clones/forks
│   │   ├── product-principles.example.md
│   │   ├── stack-preferences.example.md
│   │   ├── audience-knowledge.example.md
│   │   ├── patterns.example.md
│   │   └── lessons-learned.example.md
│   ├── product-principles.md          # PRIVATE
│   ├── stack-preferences.md           # PRIVATE
│   ├── audience-knowledge.md          # PRIVATE
│   ├── patterns.md                    # PRIVATE
│   ├── lessons-learned.md             # PRIVATE
│   ├── intake-retros.md               # PRIVATE
│   ├── agent-changelog.md             # Public: structural team evolution
│   └── agent-changelog-private.md     # PRIVATE: project-specific narrative
│
├── workspace/                         # Active project state — PRIVATE (gitignored)
│   ├── _examples/                     # Public: example project showing artifact shapes
│   │   └── example-project/
│   │       ├── seed.md
│   │       ├── intake-brief.md
│   │       ├── prd.md
│   │       ├── scope.md
│   │       ├── tech-strategy.md
│   │       ├── critic-notes.md
│   │       ├── dissent-log.md
│   │       ├── conversation-log.md
│   │       ├── transition-log.md
│   │       └── state.json
│   ├── _global/                       # PRIVATE: cross-project HQ dashboard
│   │   ├── ea-feed.md
│   │   ├── ea-state.json
│   │   └── org-designer-proposals/
│   ├── _inbox/                        # PRIVATE: future automation hook for new seeds
│   └── <project-slug>/                # PRIVATE: per-project state (option B structure)
│       ├── state.json
│       ├── seed.md
│       ├── intake-brief.md
│       ├── prd.md
│       ├── research-industry.md
│       ├── research-customer.md
│       ├── scope.md
│       ├── tech-strategy.md
│       ├── critic-notes.md
│       ├── dissent-log.md
│       ├── conflict-log.md
│       ├── conversation-log.md
│       ├── transition-log.md
│       ├── routing-log.md
│       ├── ea-decisions-queue.md
│       ├── consistency-reports/
│       └── handoff-package.md
│
└── docs/                              # Documentation
    └── specs/                         # Design specs (this file lives here)
        └── 2026-05-04-<project>-design.md
```

### Public / Private split (`.gitignore` rules)

```
# Private user data
memory/*.md
!memory/_examples/
!memory/agent-changelog.md
!memory/README.md

# Private workspace
workspace/*
!workspace/_examples/
!workspace/.gitkeep

# Private playbooks
playbooks/_private/

# Standard ignores
.DS_Store
*.local.json
.env*
```

### Memory path portability

All agents read memory via `${MEMORY_ROOT}` (defaults to `memory/`). This enables:
- Local private memory for the user
- Public examples for new clones
- Future multi-tenant configurations

### Future-extensibility hooks (not built v1, but designed-toward)
- `tenants/<tenant>/projects/<slug>/` (replaces `workspace/<slug>/` if multi-tenant ever needed)
- `workspace/_inbox/` (event-driven seed intake)
- Cron / scheduled triggers for Org Designer + EA
- Self-healing scans

---

## 4. State Machine

Each project moves through 12 phases, plus 3 side-states (`paused`, `pivoted`, `abandoned`).

### Phases

```
seed → intaking → briefed → stratego → prd-ok → scoping →
planned → scaffold → handed-off → shipped → measured → retro
```

### Phase definitions and entry contracts

| Phase | Eligible agent(s) | Entry contract | Approval |
|---|---|---|---|
| `seed` | Intake (only) | Project slug created | Auto |
| `intaking` | Intake | `seed.md` exists | Auto |
| `briefed` | Strategist (Critic ‖) | `intake-brief.md` complete; no `[open]` items in critical dimensions (Problem clarity, Scope discipline, Success definition) | **Hard** — user confirms |
| `stratego` | Strategist (Critic ‖) | Brief approved | Auto |
| `prd-ok` | Architect | `prd.md` exists, cites brief, includes acceptance criteria; `critic-notes.md` reviewed | **Hard** — user approves PRD |
| `scoping` | Architect (Critic ‖) | PRD approved | Auto |
| `planned` | Architect | `scope.md` (with explicit MVP cut) + `tech-strategy.md` (stack named, architecture style chosen, riskiest bets identified); `critic-notes.md` updated | **Hard** — user approves plan |
| `scaffold` | Architect | Tech strategy approved | **Hard** — user confirms "go" (writes to project repo) |
| `handed-off` | Conductor monitors; Tier 2 owns | `handoff-package.md` exists; Tier 2 `.claude/` generated; reportback channel established | Auto on scaffold completion |
| `shipped` | EA surfaces; future GTM agent acts | Tier 2 reports MVP live | **Hard** — user confirms |
| `measured` | Future Growth Analyst | At least one PRD-defined metric has data | Auto |
| `retro` | Org Designer + Intake | Project measured ≥ 1 cycle | **Hard** — user triggers |

**5 hard checkpoints per project** in the seed-to-shipped pipeline (briefed, prd-ok, planned, scaffold, shipped).

### Side states

- **`paused`** — `state.json` preserves phase, last agent, next-suggested. Resumable to exact state.
- **`pivoted`** — spawns new `<project-slug>/` with `pivoted_from: <original-slug>`; original gets `pivoted_to:` and `pivot-reason.md`.
- **`abandoned`** — triggers automatic mini-retro (≥2 sentences) before closing. Lessons land in `memory/lessons-learned.md`.

### `state.json` schema

```json
{
  "slug": "music-discovery-2026",
  "current_phase": "scoping",
  "entered_phase_at": "2026-05-04T14:22:00Z",
  "last_agent": "architect",
  "last_agent_at": "2026-05-04T14:30:00Z",
  "priority": "normal",
  "next_suggested_action": {
    "agent": "critic",
    "task": "review draft scope.md for MVP discipline",
    "confidence": 0.85,
    "reasoning": "Critic eligible parallel to architect; new artifact triggers review"
  },
  "history": [
    { "phase": "seed",     "entered": "...", "exited": "..." },
    { "phase": "intaking", "entered": "...", "exited": "..." },
    { "phase": "briefed",  "entered": "...", "exited": "..." }
  ],
  "open_questions": ["Spotify API rate limits at scale"],
  "blocked_on": null,
  "contested_artifacts": []
}
```

### Transition mechanics

Conductor produces a transition record per advance, appended to `transition-log.md`:

```
Transition: prd-ok → scoping
Triggered: 2026-05-04 14:22
Contract check: PASS
  ✓ prd.md exists
  ✓ prd.md cites intake-brief.md
  ✓ acceptance criteria present (5 items)
  ✓ critic-notes.md reviewed (3 concerns: 2 accepted, 1 deferred)
User approval: YES (verbatim: "looks good, move on")
Next agent: Architect
```

Auto-advances are surfaced as a single line by EA; hard transitions trigger a full Decision Packet.

---

## 5. Agent Contracts

Every agent contract has the same shape: **Mandate · Inputs · Outputs · Authority · Failure modes · Trigger conditions · Wrong-agent return rules.**

### 5.1 Intake

- **Mandate:** Interview the user about new or shifting work; produce a structured brief downstream agents can act on without further clarification.
- **Inputs:** User input verbatim; `memory/patterns.md`, `memory/audience-knowledge.md`, `memory/product-principles.md`; `templates/question-bank/*` on demand; existing `workspace/<slug>/` artifacts (re-intake).
- **Outputs:** `seed.md` (verbatim, immutable), `intake-brief.md` (8-dimension structured), `conversation-log.md` (append-only), `memory/intake-retros.md` (post-project).
- **Authority:**
  - ✅ Choose which dimensions to interrogate; push back on weak answers up to 2 rounds; initiate new project slugs.
  - ❌ Cannot write artifacts owned by other agents; cannot advance state past `briefed`; cannot decide tech strategy.
- **Failure modes:** Briefs with >5 `[open]` items in critical dimensions; downstream clarification asks; user override of question selection; >10 questions to complete a brief.
- **Trigger conditions:** New work; scope change; resume from pause; `WRONG_AGENT:` redirect for requirements gap. Does not fire mid-flow.
- **Wrong-agent return:** PRD, scope, tech-rec, status, team-shape → redirect to Strategist / Architect / Architect / EA / Org Designer.

### 5.2 Executive Assistant

- **Mandate:** Be the user's only proactive interface to team activity. Surface what needs attention; defer what doesn't.
- **Inputs:** All `state.json`, `transition-log.md`, `critic-notes.md`, `dissent-log.md`; Tier 2 reportbacks; Org Designer pending proposals; own `ea-state.json`.
- **Outputs:** Executive briefings, decision packets, per-project `ea-decisions-queue.md`, global `ea-feed.md`, immediate surfacing alerts.
- **Authority:**
  - ✅ Decide what to surface vs. defer; group/batch related items; reorder queue by priority; snooze at user request.
  - ❌ Cannot decide for user; cannot suppress contradictions or blockers; cannot edit artifacts; cannot route work.
- **Failure modes:** Wrong status reports; critical items buried; user requesting status outside cadence; briefings >300 words consistently.
- **Trigger conditions:** Session start/close; checkpoint reached; blocker/contradiction; `/status`; scheduled cadence; significant Tier 2 event.
- **Wrong-agent return:** Requirements / writing / team-shape → redirect.

### 5.3 Conductor

- **Mandate:** Enforce state machine. Route to eligible agents. Run consistency checks at every transition. Never act outside protocol.
- **Inputs:** All `state.json`; `protocols/state-machine.md`, `handoff-protocol.md`, `consistency-check.md`; current artifacts; agent trigger declarations.
- **Outputs:** State transitions, routing decisions with confidence scores, consistency check reports, agent invocations, per-project `routing-log.md`.
- **Authority:**
  - ✅ Auto-advance soft transitions when contract met; block on contract failure; invoke any eligible agent for current phase; surface contradictions to EA.
  - ❌ Cannot advance past hard checkpoints without approval; cannot invoke ineligible agents; cannot edit artifact content; cannot decide team shape.
- **Failure modes:** Routing confidence <0.7 frequently; frequent `WRONG_AGENT:`; transitions stuck >48h with no blocker; missed contradictions later caught by Critic/user.
- **Trigger conditions:** Any agent completes output; state.json updated; user approves checkpoint; `/status`. Does not fire on paused/abandoned projects.
- **Wrong-agent return:** N/A — Conductor is the router.

### 5.4 Strategist

- **Mandate:** Translate intake briefs into a PRD with explicit user definition, problem statement, success criteria, and MVP acceptance criteria.
- **Inputs:** `intake-brief.md` (primary), `seed.md`; `memory/product-principles.md`, `audience-knowledge.md`, `patterns.md`, `lessons-learned.md` (filtered); `templates/prd.md`; web research (cited).
- **Outputs:** `prd.md`; light `research-industry.md` and `research-customer.md` (until split off).
- **Authority:**
  - ✅ Define MVP scope from brief; cite external research per citation protocol; flag intake gaps requiring re-intake; recommend feature deferrals.
  - ❌ Cannot pick stack/architecture; cannot define MVP contradicting brief without flagging; cannot finalize PRD without Critic review pass; cannot make uncited claims.
- **Failure modes:** PRDs revised after Critic review consistently; user MVP scope overrides; Architect clarification asks; weak/missing citations.
- **Trigger conditions:** Phase = `briefed` and brief approved; user requests revision; Critic returns blocking concerns. Does not fire when brief incomplete.
- **Wrong-agent return:** Tech stack / scope-as-milestones / architecture / status / requirements → redirect.

### 5.5 Architect

- **Mandate:** Translate approved PRD into shippable scope (milestones with explicit MVP cut), tech strategy (stack + architecture style + risk identification), and Tier 2 scaffolding.
- **Inputs:** `prd.md` (primary), `intake-brief.md` (constraints); `memory/stack-preferences.md`, `patterns.md`, `lessons-learned.md`; `templates/scope-doc.md`, `tech-strategy.md`, `stacks/*`; web research (cited).
- **Outputs:** `scope.md` (sequenced milestones with MVP cut), `tech-strategy.md` (stack + architecture + risks), `handoff-package.md`, generated Tier 2 `.claude/` in target repo (only after `scaffold` phase).
- **Authority:**
  - ✅ Pick stack with cited reasoning; cut MVP features with reasoning; sequence milestones by dependency + risk; identify riskiest bets; generate Tier 2 agents for chosen stack.
  - ❌ Cannot redefine product requirements (PRD is source of truth — flag conflicts); cannot scaffold before user approves tech strategy; cannot pick stack without citing reasoning; cannot make uncited claims.
- **Failure modes:** User stack overrides; user-restored MVP cuts; heavy hand-edits needed on Tier 2 scaffolds; risks missed that surface later.
- **Trigger conditions:** Phase = `prd-ok` (scope start), `scoping` (continuing), `planned` (scaffold authorized); user revision requests; Critic blocking concerns.
- **Wrong-agent return:** Product requirements / ICP / marketing / status / requirements → redirect.

### 5.6 Critic

- **Mandate:** Adversarially review every artifact other agents produce. Find weak claims, missing citations, scope creep, hidden assumptions, internal contradictions. Never produce primary artifacts.
- **Inputs:** Whatever artifact is in flight; `seed.md`, `intake-brief.md` (ground-truth); other artifacts in same project (consistency); `memory/lessons-learned.md` (recurring failure patterns); `protocols/citation-protocol.md`.
- **Outputs:** `critic-notes.md` (append-only with timestamp + concern + severity `blocking|warning|fyi`); optional `WRONG_AGENT:` escalations.
- **Authority:**
  - ✅ Block transitions via blocking concern (only resolved by user decision or producer revision); flag uncited claims; surface cross-artifact contradictions; reject artifacts contradicting seed without override; run parallel to producers.
  - ❌ Cannot edit other agents' artifacts; no primary content; cannot block on warning/fyi.
- **Failure modes:** Concerns dismissed by user consistently (over-blocking, taste off); concerns missed user catches manually (incomplete coverage); all concerns marked `blocking` (severity miscalibration); producing opinions instead of citing weak claims (drifting into co-author).
- **Trigger conditions:** Any new/updated artifact; consistency check finds contradiction; user requests review. Does not fire on `[WIP]` artifacts or within 60min of prior critique (debounce).
- **Wrong-agent return:** Asked to write content rather than critique → redirect.

### 5.7 Org Designer

- **Mandate:** Continuously evaluate team shape. Detect cracks, gaps, bloat, recurring failures. Propose splits, merges, new roles, prompt updates. Never act unilaterally.
- **Inputs:** All `agents/*.md`; `memory/agent-changelog.md` (history); all `critic-notes.md` (failures); all `dissent-log.md` (overrides); all `routing-log.md` (uncertainty); `memory/intake-retros.md`; all `WRONG_AGENT:` returns; all `state.json` (stuck-phase detection).
- **Outputs:** `workspace/_global/org-designer-proposals/<timestamp>-<topic>.md`; `memory/agent-changelog.md` (approved changes with reasoning); `memory/lessons-learned.md` (post-retro distillations).
- **Authority:**
  - ✅ Propose any team-shape change (split, merge, new role, retire, prompt edit); surface team-health items in EA briefings; trigger Intake retro after project completion; recommend question-bank changes.
  - ❌ Cannot edit any agent's prompt unilaterally — all changes require user approval; cannot route live work; cannot create/delete projects; cannot run mid-checkpoint.
- **Failure modes:** Proposals consistently rejected (heuristics off); real cracks not surfaced (forensic scanning shallow); over-eager splits; under-eager splits; self-blindness mitigated by user `/grow-team` prompts.
- **Trigger conditions:** Project completion (auto-retro); `/grow-team`; EA flags team-health concern; agent prompt >500 lines; `WRONG_AGENT:` rate exceeds threshold.
- **Wrong-agent return:** Product requirements / scope / status / routing → redirect.

---

## 6. Routing Reliability — Five Layers

| Layer | Mechanism | What it solves |
|---|---|---|
| **1. Phase-locked routing** | State machine restricts which agents are eligible per phase | Eliminates ~80% of routing errors structurally |
| **2. Trigger conditions** | Each agent declares structured `fires_when`/`does_not_fire_when`/`parallel_with` | Within-phase routing becomes a query, not a guess |
| **3. Confidence-scored decisions** | Every Conductor routing decision logs 0.0-1.0 confidence + reasoning | <0.7 auto-surfaces to user via EA; logged for Org Designer review |
| **4. Wrong-agent detector** | Every agent does scope check at top of execution; returns `WRONG_AGENT:` if misrouted | Last-line defense; misroute caught at destination, not just dispatch |
| **5. Human override** | User can always specify routing; logged in `dissent-log.md` | Authority always with user; chronic overrides become Org Designer signal |

### Anti-drift specifics

- `routing-log.md` per project — every routing decision searchable
- Stale-route detection — Conductor suggestion + 24h idle → EA surfaces
- Wrong-agent retro — every `WRONG_AGENT:` triggers Org Designer note in `agent-changelog.md`

### Citation Protocol (drift prevention at artifact level)

Every claim in any agent artifact must be tagged:

- `[seed]` — direct from original brief
- `[user]` — stated in conversation (with line reference)
- `[brief]` — from `intake-brief.md`
- `[research]` — from WebSearch/WebFetch (with URL)
- `[inference]` — agent's reasoning from cited inputs
- `[assumption]` — agent guessed; explicitly flagged for user

**Untagged = hallucination by definition.** Critic's first review pass scans for compliance.

---

## 7. Conflict Resolution + Consistency Check

### Consistency Check (Conductor — automated)

Runs at every transition involving a new artifact. Four categories:

1. **Ground-truth contradictions** — new artifact contradicts `seed.md` or approved `intake-brief.md`
2. **Cross-artifact contradictions** — `scope.md` adds feature not in `prd.md`; `tech-strategy.md` violates PRD constraint
3. **Citation gaps** — uncited claims, missing URLs, unsurfaced assumptions
4. **Scope creep** — MVP definition expanded vs. PRD; v2 features in milestone-1 without explicit deferral

Failed checks **block transition**, generate report at `workspace/<slug>/consistency-reports/<timestamp>.md`, surface via EA.

### Conflict Resolution (when contradiction confirmed)

6-step flow:

1. **Lock** — Conductor marks `[CONTESTED]` in `state.json`
2. **Identify parties** — internal-to-agent vs. cross-agent
3. **Conflict packet** — Critic produces structured comparison
4. **User decides** — accept recommended / pick alternative / override anyway (logged in dissent)
5. **Resolution executes** — producer re-runs with resolution; check re-runs
6. **Log** — `workspace/<slug>/conflict-log.md` (append-only)

### Special cases
- **Agent disagrees with user:** voiced once with reasoning; user override logged with both sides; doesn't propagate as authority unless Org Designer codifies pattern
- **Parallel producer + Critic:** Strategist writes `[WIP]` (not check-eligible); Critic critiques WIP; Strategist must address or defer each concern at finalize; Conductor's check fires after `[WIP]` removed

---

## 8. Checkpoint Model + Dissent Log

### Hard checkpoints (5 per project, seed-to-shipped)

| Transition | Why hard |
|---|---|
| `intaking → briefed` | Brief is the contract for everything downstream |
| `stratego → prd-ok` | PRD is the product definition |
| `scoping → planned` | Stack pick + MVP cuts feel irreversible |
| `planned → scaffold` | Generates files in real project repo |
| `handed-off → shipped` | Confirms MVP live |

Plus `measured → retro` (user-triggered).

### Decision Packet format (~250-400 words)

EA delivers at every hard checkpoint:

- Summary (3 bullets)
- Key decisions baked in
- Critic flags (with severity)
- Open questions
- Artifact references
- Recommended action (one path, ranked first)
- Options: `[approve]` / `[request changes]` / `[discuss]` / `[reject and revise]`

### Soft checkpoint format (one line)

```
[soft] briefed → stratego (music-discovery-2026)
Strategist now drafting PRD; ~10-15 min ETA. EA will surface PRD when ready.
```

### What is NOT a checkpoint
- Critic `warning` and `fyi` concerns (next briefing, not interrupt)
- Org Designer proposals (next briefing under "TEAM HEALTH" or `/grow-team`)

### Dissent Log

Per-project `dissent-log.md` captures:
- User overrides Critic blocking concern
- User overrides Conductor routing
- User overrides Architect stack pick
- User overrides recommended resolution in conflict packet
- Agent flag dismissed without addressing

Each entry: timestamp, type, original concern, user decision, user reasoning, agent agreement (yes/no), revisit-trigger.

**Why load-bearing:**
- Org Designer reads it (override patterns → calibration signal)
- Critic reads it (recurring overrides on same concern → severity recalibration)
- User reads it (self-debugging your own decision patterns)
- `shipped → measured` validates dismissed concerns post-launch

---

## 9. Versioning + Memory

### Repo strategy
- Repo = `App Development/.claude/` only (option A from design discussion)
- Initial: `git init`, `gh repo create <org>/<project> --private --source=. --push`
- Public/private split via `.gitignore`
- License: MIT default; revisit if commercial licensing path activates

### Two changelogs
- `CHANGELOG.md` (root, public) — technical changes
- `memory/agent-changelog.md` (public-safe narrative) — *why* the team evolved structurally
- `memory/agent-changelog-private.md` (private) — narrative referencing real projects

### Memory layout (the team brain)

| File | Purpose | Written by | Read by | Visibility |
|---|---|---|---|---|
| `product-principles.md` | What "good" means; user's taste codified | User; Org Designer proposes | Intake, Strategist, Critic | Private |
| `stack-preferences.md` | Default stacks per project type | User + Architect | Architect | Private |
| `audience-knowledge.md` | Recurring ICPs and known facts | Intake (on confirmed ICP), Strategist | Intake, Strategist | Private |
| `patterns.md` | Cross-project recurring decisions | Org Designer proposes | All agents | Private |
| `lessons-learned.md` | Post-mortems with lessons | Critic + Org Designer at retro | All agents (filtered) | Private |
| `intake-retros.md` | Intake's self-retros | Intake; Org Designer codifies | Intake | Private |
| `agent-changelog.md` | Narrative team evolution (structural) | Org Designer (with user approval) | All agents on context refresh | Public |
| `agent-changelog-private.md` | Project-specific narrative | Org Designer | All agents on context refresh | Private |

### Memory hygiene rules
1. **Memory = cross-project facts only.** Project-specific lives in `workspace/`.
2. **Provenance required.** Every entry: `- "Lesson text" — from <project-slug>, <date>`. Without provenance, can't audit safety-to-share or freshness.
3. **Memory expires.** Org Designer reviews quarterly (or on `/grow-team`); proposes retirements for stale patterns.

### Memory access pattern

Each agent prompt includes filtered read list:
```
On invocation, read these memory files:
- memory/product-principles.md (always)
- memory/audience-knowledge.md (filter to current project's ICP)
- memory/lessons-learned.md (filter by tags matching current project)
```

Different agents read different slices. Effective context stays manageable.

### Public/Private fork strategy (locked: option A with override)

- Public agent prompts ship as the baseline
- Private overrides via `agents/_private/<agent>.override.md` (gitignored), loaded on top of baseline
- v1 default: no overrides, agents grow via public-safe changes
- One config flip: full divergence path if proprietary refinement ever needs to land

---

## 10. Tier 2 Handoff + Reportback Contract

### Handoff Package (Tier 1 → Tier 2)

Generated by Architect; `workspace/<slug>/handoff-package.md`. Contains:

1. **Source artifacts** (full copies, not references): `prd.md`, `scope.md`, `tech-strategy.md`, `intake-brief.md` excerpts
2. **Decision context** — riskiest bets, MVP cuts + reasoning, deferred questions
3. **Tier 1 reportback contract** — what events to report, format, where
4. **Tier 2 agent specifications** — generated from `templates/stacks/<chosen>/`; project-scoped state machine, EA, conductor
5. **Memory pointers** — read-only access to parent `memory/`

### Reportback (Tier 2 → Tier 1)

Tier 2 writes to `<project-folder>/.claude-tier2-reportback.md`; Tier 1's Conductor monitors.

**Required:**
- MVP shipped (date, what shipped, gaps from scope, live URL)
- Major scope deviation
- Blocked >24h
- Risk realized (which tech-strategy risk; how addressed)
- Decision needed from Tier 1

**Optional (FYI):**
- Milestone completed
- Significant refactor
- Lessons learned during implementation (feeds `memory/lessons-learned.md` at retro)

### Tier 2 cannot do unilaterally
1. Finalize scope deviation as "done" without Tier 1 acknowledgment
2. Mark MVP shipped without Tier 1 confirming PRD acceptance criteria match
3. Add features beyond approved scope without Tier 1 cycle

### Tier 2 CAN do unilaterally
- All implementation decisions (within scope)
- Refactoring, bug fixes, internal architecture choices
- Library/dependency choices within chosen stack
- Test strategy, local dev workflow
- Anything tech-strategy didn't specifically constrain

### Promotion Path (mid-build pivot)

If Tier 2 discovers original plan needs significant revision:

1. Tier 2 writes `promotion-request.md` to reportback channel
2. Tier 1 Conductor sets project state to `pivoted` (or `paused`)
3. Intake re-engages user
4. Strategist + Architect re-run from appropriate state
5. New handoff package issued
6. Tier 2 receives updated package and resumes

### Tier 2 shape (sketch — full spec is follow-on doc)

Project-repo `.claude/` mirrors HQ structure but project-scoped:
```
project-repo/.claude/
├── README.md (generated by Tier 1, includes generation date)
├── handoff-package.md (copy of HQ's handoff)
├── agents/
│   ├── <stack>-architect.md
│   ├── <component>-agent.md
│   ├── <db>-agent.md
│   ├── deployment-agent.md
│   └── tier2-conductor.md
├── reportback.md (channel back to Tier 1)
└── workspace/
```

**Full Tier 2 spec is out of scope for this design — generated by Tier 1's Architect after Tier 1 is validated and a real project triggers scaffolding.**

---

## 11. Open-source Readiness

### Decisions locked
- `workspace/` and most of `memory/` are gitignored from day one
- Two-tier memory: `_examples/` ships, real files private
- Provenance required on every memory entry (audit trail for what's safe to share)
- README written public-ready from day one
- License: MIT default
- Naming: repo `<org>/<project>` for now; consider brand-neutral name (`claude-org`, `agent-os`) before any public flip
- Multi-project / portfolio mindset is first-class (`workspace/_global/` is the HQ dashboard)

### Future-extensibility hooks (designed-toward, not built v1)
- Multi-tenant (`tenants/<tenant>/projects/<slug>/`)
- Cron / scheduled triggers (Org Designer weekly review, EA Mon/Fri briefings)
- Event-driven seed intake (`workspace/_inbox/`)
- Self-healing scans (stale-state, prompt-bloat, override-rate)

### Commercial licensing (long-term option)
The HQ pattern itself is the IP. If team-as-product is pursued:
- Dual-license (MIT for community, commercial for paid tier)
- Paid layer: hosted memory/state, scheduled automation, multi-tenant management UI
- Private agent forks remain user-controlled

---

## 12. What is explicitly OUT of scope for this spec

- **Tier 2 detailed spec.** Generated post-validation; separate design doc per stack.
- **Specific agent prompt contents.** This spec defines agent *contracts*; actual prompts get drafted in implementation phase.
- **Cron / scheduled automation implementation.** Hooks designed; build deferred.
- **Multi-tenant restructure.** Single-tenant works; restructure path documented.
- **Web UI / dashboard.** Terminal + EA briefings cover v1.
- **GTM, Growth, Customer Researcher, Industry Researcher, Feedback Synthesizer agents.** Stubs only; built when real friction triggers.
- **Open-source release plan.** Repo built private; flip to public is a separate decision later.

---

## 13. Success Criteria for v1

The team is "working" when:

1. **End-to-end seed-to-shipped works** for at least one real project (likely tapintomymind feature or new app idea)
2. **All 5 hard checkpoints fire correctly** with proper Decision Packets
3. **Consistency check catches at least one cross-artifact contradiction** during normal operation
4. **At least one `WRONG_AGENT:` return is observed and handled cleanly** (proves the safety net works)
5. **Org Designer surfaces at least one valid team-shape proposal** within first 3 projects
6. **`memory/lessons-learned.md` gains at least one cross-project lesson** that influences a subsequent project's PRD
7. **EA briefings stay under ~300 words** consistently
8. **No silent state advancement past hard checkpoints** (zero violations)

---

## 14. Risks and Open Questions

### Risks
1. **Overdesign drag.** 7 agents + protocols is complex for first project; mitigation: keep first project simple, lean on protocols even when "obvious."
2. **Memory pollution.** Without strict hygiene, memory becomes junk drawer; mitigation: provenance rule + Org Designer quarterly reviews.
3. **Critic over-blocking.** New Critic prompt may flag everything; mitigation: severity calibration, explicit dismissal logged for tuning.
4. **Tier 2 drift.** Long-running Tier 2 projects accumulate scope without Tier 1 awareness; mitigation: required reportbacks, Conductor monitoring.
5. **Org Designer blind spots.** Self-referential — Org Designer can't propose changes to itself well; mitigation: user `/grow-team` for explicit Org Designer review.

### Open questions (defer to implementation)
1. How should EA decide briefing cadence beyond session-start/close? Time-based? Event-based?
2. Should the Conductor support running multiple projects' transitions in true parallel, or serialize?
3. How does memory inheritance work when a project pivots? Inherit from original, fresh, or hybrid?
4. What's the right retention policy for `conversation-log.md`? It can grow unboundedly.
5. How should EA's "snooze" work mechanically — file-based timer, or natural language ("remind me Monday")?

These don't block the design; they're flagged for resolution during build.

---

## 15. Implementation Sequencing (preview — full plan in writing-plans)

The implementation plan (next document) will sequence the build. Likely order:

1. **Scaffolding** — directory structure, `.gitignore`, README, LICENSE, repo init
2. **Protocols** — write `state-machine.md`, `consistency-check.md`, `conflict-resolution.md`, `citation-protocol.md`, `checkpoint-protocol.md`, `intake-protocol.md`, `ea-protocol.md`, `handoff-protocol.md`, `reportback-protocol.md`
3. **Templates** — PRD, scope, tech-strategy, intake-brief, decision-packet, executive-briefing, dissent-entry, question-bank (8 dimensions)
4. **Agents — Conductor first** (everything depends on routing)
5. **Agents — Intake + EA** (the user-facing voices)
6. **Agents — Strategist + Architect** (the producers)
7. **Agents — Critic** (parallel reviewer)
8. **Agents — Org Designer** (meta layer, last)
9. **Memory seed** — write `_examples/` files first, then real `memory/*.md` with initial user content
10. **Playbook — `seed-to-mvp.md`** (validates end-to-end)
11. **First test run** — pick a real project, run it through, observe failures, refine
12. **GitHub push** — only after first successful end-to-end run

---

## End of design spec

**Next steps per brainstorming process:**
1. Self-review for placeholders, contradictions, ambiguity, scope
2. User review of this spec
3. On approval → invoke writing-plans skill to produce detailed implementation plan
