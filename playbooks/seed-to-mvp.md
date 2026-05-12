# Playbook — Seed to MVP

The flagship workflow. From a raw idea to a shipped MVP, traversing the full state machine with all agents.

## When to Run

- New product idea
- Greenfield project
- Want to validate the team end-to-end on a real project

## Outcome

- Working MVP deployed
- Full audit trail in `workspace/<slug>/` (artifacts, logs, dissent, transitions)
- Lessons distilled into `memory/lessons-learned.md`
- Project ready for `measured` phase post-launch

## Step-by-Step

### Phase 0: Have an idea
You: "I want to build X" — or more specific. The seed can be one sentence or a paragraph.

### Phase 1: `seed → intaking → briefed`
1. Run `/team <your seed>` (or just talk — Intake activates if a seed is detected in conversation)
2. Intake captures `seed.md` verbatim
3. Intake interrogates 8 dimensions (skips ones you've covered)
4. Up to 2 rounds of pushback per weak answer
5. Intake writes `intake-brief.md`
6. **HARD CHECKPOINT:** EA delivers Decision Packet. You approve / request changes.
7. Conductor advances to `briefed`

**Expected duration:** 5-15 min of conversation, depending on idea clarity.

### Phase 2: `stratego → prd-ok`
1. Conductor invokes Strategist + Critic in parallel
2. Strategist writes `[WIP]` PRD
3. Critic reviews live, writes to `critic-notes.md`
4. Strategist addresses Critic concerns at finalize, drops `[WIP]`
5. Conductor runs consistency check (PRD vs brief, vs seed)
6. **HARD CHECKPOINT:** EA delivers Decision Packet. You approve PRD.
7. Conductor advances to `prd-ok`

**Expected duration:** 10-20 min of agent work + your review.

### Phase 3: `scoping → planned`
1. Conductor invokes Architect + Critic in parallel
2. Architect writes `[WIP]` `scope.md` and `tech-strategy.md`
3. Critic reviews
4. Architect addresses concerns, drops `[WIP]`
5. Conductor runs consistency check (scope vs PRD; tech-strategy vs PRD constraints)
6. **HARD CHECKPOINT:** EA delivers Decision Packet. You approve plan.
7. Conductor advances to `planned`

**Expected duration:** 15-30 min of agent work + your review.

### Phase 4: `scaffold → handed-off`
1. Conductor confirms target repo path with you
2. **HARD CHECKPOINT:** EA confirms "scaffold writes files to <path> — go?"
3. Architect writes `handoff-package.md` to workspace
4. Architect generates Tier 2 `.claude/` in target repo (agents, reportback channel, README)
5. Conductor verifies (target dir exists, files non-empty, test write to reportback succeeds)
6. Conductor advances to `handed-off`

**Expected duration:** 5-10 min of agent work + 1 confirmation from you.

### Phase 5: `handed-off → shipped`
1. Tier 2 takes over to actually build (this is project-team work, not HQ work)
2. Tier 2 reports back at: milestone completions (FYI), scope deviations (required), blockers (required), decisions needed (required)
3. EA surfaces relevant Tier 2 reportbacks
4. When Tier 2 declares MVP shipped:
   - Tier 2 writes shipped reportback with live URL
   - Conductor runs consistency check vs PRD acceptance criteria
   - **HARD CHECKPOINT:** EA delivers Decision Packet. You confirm shipped.
5. Conductor advances to `shipped`

**Expected duration:** Days to weeks. This is the actual build.

### Phase 6: `shipped → measured`
1. PRD-defined metrics start collecting data
2. EA includes metrics in next briefing
3. When at least one metric has data, Conductor auto-advances to `measured`

**Expected duration:** Days post-launch.

### Phase 7: `measured → retro` (you trigger)
1. When you're ready (typically after a meaningful measurement window — 2-4 weeks):
2. You say "let's retro project X" or run `/org-designer` for retro
3. Critic + Org Designer review entire project
4. Lessons distilled to `memory/lessons-learned.md`
5. Intake runs self-retro to identify missed questions
6. Org Designer may propose team changes if patterns emerged

**Expected duration:** 30-60 min of agent work + your review.

## What Could Go Wrong (and what happens)

| Failure mode | Recovery |
|---|---|
| Brief has critical `[open]` items | Intake doesn't advance; Conductor blocks; you decide to keep interviewing or override |
| Critic finds blocking concern | Producer revises OR you override (logged in dissent) |
| Consistency check fails | Conductor blocks; conflict-resolution flow kicks in |
| You disagree with PRD/scope | Discuss with EA; producer revises |
| Tier 2 hits a wall | Tier 2 writes blocked-24h reportback; Conductor surfaces to EA |
| Tier 2 wants to pivot | Tier 2 writes promotion-request; Intake re-engages |
| You want to pause | Say so; project transitions to `paused` with state preserved |
| You want to abandon | Say so; auto-mini-retro fires; project transitions to `abandoned` |

## Time Expectations Summary

| Phase | Typical duration |
|---|---|
| Intake → briefed | 5-15 min conversation |
| Stratego → prd-ok | 10-20 min + review |
| Scoping → planned | 15-30 min + review |
| Scaffold → handed-off | 5-10 min |
| Handed-off → shipped | Days to weeks (build time) |
| Shipped → measured | Days post-launch |
| Measured → retro | 30-60 min |

**Total HQ time before Tier 2 build: 35-75 min** of agent work + your review time at 5 hard checkpoints.

## Tips

- Don't multi-task during intake. Sharp focus = sharp brief.
- Read Decision Packets at hard checkpoints carefully. They're the only things asking for your time.
- Trust soft transitions to flow.
- If a Critic concern feels off, override with reasoning — the dissent log is how the team learns.
- After your first project, run `/grow-team` to see what Org Designer noticed.
