# Playbook — Portfolio Review

Cross-project review across all active and recently-completed projects. Different from per-project retro — this is HQ-level strategic look at the whole portfolio.

## When to Run

- Quarterly (until automated cadence built)
- When you feel the portfolio is "off" without being able to name why
- Before deciding what to build next
- After 3-5 projects have completed (enough data for patterns)

## Outcome

- Cross-project pattern report
- Stale memory entries flagged for retirement
- Team-shape proposals if warranted
- Recommendations for next-project priorities

## Step-by-Step

### Step 1: Run `/org-designer`
Org Designer scans all `workspace/*/` projects (active + paused + completed).

### Step 2: Org Designer assesses

For each project:
- Did it ship?
- If not, why? (Failed at brief? PRD? Scope? Tech? Build?)
- Which checkpoints had user friction? (overrides, discussions, rejections)
- What lessons were extracted?
- Was the lesson actually applied in subsequent projects?

For the team:
- Which agents fired most? Least?
- Where did Conductor have low confidence?
- Where did `WRONG_AGENT:` returns come from?
- What's the agent prompt size trajectory? (bloat indicator)

For memory:
- Which entries have been unused in last 3 projects? (retirement candidates)
- Which patterns turn out to no longer match recent projects? (stale candidates)
- What new patterns emerge from recent projects? (codification candidates)

### Step 3: Org Designer writes proposals

Bundled in a single proposal file at `workspace/_global/org-designer-proposals/<timestamp>-portfolio-review.md`. Sections:

- WHAT'S WORKING
- WHAT'S NOT WORKING (with cited evidence)
- TEAM-SHAPE RECOMMENDATIONS (if any)
- MEMORY HYGIENE RECOMMENDATIONS (retirements, codifications)
- NEXT-PROJECT PRIORITIES (if user asked or if patterns suggest)

### Step 4: EA surfaces

Under TEAM HEALTH in next briefing, EA notes "portfolio review proposal pending."

### Step 5: You review

Read the proposal. Decide each item: approve / reject / discuss.

Approved changes execute via Org Designer's normal flow:
- Team-shape changes → file moves, prompt updates
- Memory retirements → entries removed (or moved to archive section)
- Codifications → new entries added to `patterns.md` etc.

### Step 6: Update changelog

`memory/agent-changelog.md` (and private changelog) gets the narrative entry.

## Tips

- Schedule it. Without a calendar trigger, portfolio reviews don't happen.
- Don't run mid-project — wait until at least one project hits a stable phase.
- Trust Org Designer's pattern detection over your gut for "this isn't working" — your gut might just be project-fatigue.
- If Org Designer surfaces nothing, that's also a signal — could mean system is healthy, or could mean Org Designer's heuristics need tuning.

## Future: Automated Portfolio Reviews

When scheduled cadence is built:
- Quarterly auto-trigger
- EA delivers the proposal as a standalone email-style briefing on a fixed day
- User reviews async

Until then, manual via `/org-designer` or this playbook.
