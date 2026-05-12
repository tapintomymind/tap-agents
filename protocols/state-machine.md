# State Machine Protocol

The state machine is the canonical contract for what phase each project is in and what's required to move between phases. **Conductor enforces it.** No agent may act outside the eligibility table below.

## Phases (12 + 3 side states)

```
seed → intaking → briefed → stratego → prd-ok → scoping →
planned → scaffold → handed-off → shipped → measured → retro

Side states (enterable from any phase):
  paused, pivoted, abandoned
```

## Phase Eligibility & Entry Contracts

| Phase | Eligible agent(s) | Entry contract | Approval | Auto-advance? |
|---|---|---|---|---|
| `seed` | Intake | Project slug created in `workspace/<slug>/` | — | Auto |
| `intaking` | Intake | `seed.md` exists | — | Auto |
| `briefed` | Strategist (Critic ‖) | `intake-brief.md` complete; no `[open]` items in critical dimensions: **Problem clarity, Scope discipline, Success definition** | **HARD** | No |
| `stratego` | Strategist (Critic ‖) | Brief approved by user | — | Auto |
| `prd-ok` | Architect | `prd.md` exists; cites `intake-brief.md`; includes acceptance criteria; `critic-notes.md` reviewed | **HARD** | No |
| `scoping` | Architect (Critic ‖) | PRD approved | — | Auto |
| `planned` | Architect | `scope.md` (with explicit MVP cut + cut justification) + `tech-strategy.md` (stack named, architecture style chosen, riskiest bets identified); `critic-notes.md` updated | **HARD** | No |
| `scaffold` | Architect | Tech strategy approved | **HARD** | No (writes to project repo) |
| `handed-off` | Conductor monitors; Tier 2 owns | `handoff-package.md` exists; Tier 2 `.claude/` generated; reportback channel established | — | Auto on scaffold completion |
| `shipped` | EA surfaces; future GTM agent | Tier 2 reports MVP live | **HARD** | No |
| `measured` | Future Growth Analyst | At least one PRD-defined metric has data | — | Auto |
| `retro` | Org Designer + Intake | Project measured ≥ 1 cycle | **HARD** | User triggers |

`‖` = runs in parallel.

**5 hard checkpoints in seed-to-shipped pipeline.** `retro` is a 6th, user-triggered.

## Side States

### `paused`
- `state.json` preserves: current phase, last agent run, `next_suggested_action`, `entered_phase_at`
- Resumable to exact prior state
- Intake greets user with: "we paused at `<phase>` with next-suggested `<action>`; want to continue or revisit?"

### `pivoted`
- Spawns new `workspace/<new-slug>/` directory
- New project's `state.json`: `pivoted_from: <original-slug>`
- Original project's `state.json`: `pivoted_to: <new-slug>`, `current_phase: pivoted`
- Original gets `pivot-reason.md` documenting the pivot
- Lessons from original carry forward as input to new project's intake

### `abandoned`
- Triggers automatic mini-retro (≥2 sentences) before closing
- Lessons land in `memory/lessons-learned.md` with provenance
- `state.json`: `current_phase: abandoned`, `abandoned_reason: <text>`
- No project closes silently

## `state.json` Schema

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
    { "phase": "seed",     "entered": "2026-05-04T13:50:00Z", "exited": "2026-05-04T13:51:00Z" },
    { "phase": "intaking", "entered": "2026-05-04T13:51:00Z", "exited": "2026-05-04T14:05:00Z" },
    { "phase": "briefed",  "entered": "2026-05-04T14:05:00Z", "exited": "2026-05-04T14:10:00Z" }
  ],
  "open_questions": ["Spotify API rate limits at scale"],
  "blocked_on": null,
  "contested_artifacts": [],
  "pivoted_from": null,
  "pivoted_to": null,
  "abandoned_reason": null
}
```

## Transition Mechanics

When Conductor advances a phase, it appends to `workspace/<slug>/transition-log.md`:

```
─────────────────────────────────────────────
Transition: prd-ok → scoping
Triggered: 2026-05-04 14:22
Contract check: PASS
  ✓ prd.md exists
  ✓ prd.md cites intake-brief.md
  ✓ acceptance criteria present (5 items)
  ✓ critic-notes.md reviewed (3 concerns: 2 accepted, 1 deferred)
User approval: YES (verbatim: "looks good, move on")
Next agent: Architect
─────────────────────────────────────────────
```

If contract check FAILS, transition is blocked and findings are surfaced to EA, not silently retried.

## Routing Rules (referenced by Conductor)

1. **Phase-locked.** Agent must be in eligibility column for current phase.
2. **Trigger-condition match.** Agent's `fires_when` declaration must match current state.
3. **Confidence threshold.** Conductor logs confidence 0.0-1.0 with reasoning. <0.7 triggers EA surfacing.
4. **Wrong-agent detector.** Every agent self-checks scope at top of execution; returns `WRONG_AGENT:` if misrouted.
5. **Human override.** User can always specify routing; overrides logged in `dissent-log.md`.

## Hard-Checkpoint Approval Format

Conductor never advances a HARD transition without explicit user approval. EA delivers a Decision Packet (see `protocols/checkpoint-protocol.md`). User responses recognized:

- `approve` / `yes` / `lgtm` / `ship it` → advance
- `request changes` / `revise` / `change <X>` → producer agent re-runs with feedback
- `discuss` → opens conversation; no advance until subsequent approval
- `reject` / `no` / `back to drawing board` → producer agent re-runs from scratch

## Portfolio Registry (updated on every transition)

After updating `state.json`, Conductor MUST also update:

1. **`workspace/_global/portfolio.json`** — machine-readable cross-project state
2. **`workspace/_registry.md`** — human-readable scannable view

These provide the portfolio-level view EA uses for cross-project briefings and Org Designer mines for portfolio-level patterns.

## Verification-Before-Completion (cross-reference)

The `Stop` hook (`hooks/stop-critic-check.py`) enforces session-end protocol: cannot end session with unresolved blockers, contested artifacts, or BLOCKING Critic concerns. See `protocols/verification-before-completion.md`.

## Forbidden Actions

- ❌ Conductor cannot advance HARD transitions without user approval
- ❌ Conductor cannot invoke an agent not eligible for current phase
- ❌ No agent may write to `state.json` except Conductor
- ❌ No agent may modify `transition-log.md` retroactively (append-only)
- ❌ `seed.md` is immutable after creation (enforced by `pre-tool-gate.py`)
- ❌ Side-state transitions still produce a `transition-log.md` entry
- ❌ Editing artifacts marked `[CONTESTED]` is blocked by hook
- ❌ Conductor MUST update portfolio.json + _registry.md on every transition
