# Conflict Resolution Protocol

When the consistency check, Critic, user, or another agent surfaces a contradiction, this protocol governs how it gets resolved.

## What Counts as a Conflict

- Consistency check finding marked `blocking`
- Critic finding marked `blocking`
- User explicitly contradicts an artifact ("the PRD says X but I want Y")
- Agent returns `WRONG_AGENT:` indicating fundamental misroute (handled separately, see state machine)
- Tier 2 reportback contradicts Tier 1's PRD/scope

Warnings and FYI items do NOT enter conflict resolution — they're surfaced via briefings, not gated.

## The 6-Step Flow

### Step 1: Lock affected artifacts

Conductor marks artifacts `[CONTESTED]` in `state.json.contested_artifacts`:

```json
"contested_artifacts": [
  {
    "path": "workspace/<slug>/scope.md",
    "contested_at": "2026-05-04T15:18:00Z",
    "reason": "scope-creep vs prd.md"
  }
]
```

While contested, no agent may edit these artifacts. Producer can revise only after resolution unlocks.

### Step 2: Identify the parties

Each contested artifact has a producer. Conflicts are:

- **Internal-to-agent:** different sections of the same agent's artifact contradict each other (e.g., scope.md milestone-1 contradicts scope.md cuts list)
- **Cross-agent:** different agents' artifacts contradict (e.g., Strategist's PRD vs Architect's scope)
- **User-vs-agent:** user explicitly contradicts agent output

### Step 3: Critic generates conflict packet

Critic produces `workspace/<slug>/conflict-log.md` entry using `templates/conflict-packet.md`-style structure:

```
─────────────────────────────────────────────
CONFLICT — <project-slug>
Source: <consistency-check | critic-flag | user | tier-2-reportback>
Detected: <timestamp>

CLAIM A
Source: <file:section>, written by <agent>
"<verbatim claim>"
Cited: <citation tag and source>
Approved: <yes/no, when>

CLAIM B
Source: <file:section>, written by <agent>
"<verbatim claim>"
Cited: <citation tag and source>
Approved: <yes/no, when>

ANALYSIS
<Critic's assessment of why claims differ — inference error, scope creep,
ground-truth violation, or genuine ambiguity>

RECOMMENDED RESOLUTION
<Critic's recommended path — typically "revise <agent>'s artifact to match
ground truth" or "update upstream artifact and propagate">

ALTERNATIVES
- <Alternative path 1>
- <Alternative path 2>
- Override: accept the contradiction (logs to dissent-log.md)

Awaiting user decision.
─────────────────────────────────────────────
```

### Step 4: User decides

EA surfaces the conflict packet as a Surfacing Alert. User selects:

| Choice | Action |
|---|---|
| Accept recommended resolution | Producer agent re-runs with resolution as input |
| Pick alternative | Specified producer re-runs with alternative as input |
| Override (accept contradiction) | Logged in `dissent-log.md`; artifacts unlocked; transition proceeds |
| Discuss | Opens conversation; no resolution until subsequent decision |

### Step 5: Resolution executes

Producer agent re-runs. Output is written to the original artifact path (replaces, doesn't append). Conductor unlocks the artifact in `state.json.contested_artifacts`.

Consistency check re-runs against the revised artifact and all related artifacts.

### Step 6: Log the resolution

Append to `workspace/<slug>/conflict-log.md`:

```
─────────────────────────────────────────────
RESOLUTION — <conflict reference>
Decided: <timestamp>
User decision: <accept-recommended | alternative | override>
User reasoning: <verbatim>
Producer rerun: <agent>
Outcome: <revised artifact path or "override accepted">
Re-check result: <pass | further conflicts found>
─────────────────────────────────────────────
```

## Special Case: Agent Disagrees with User

Sometimes user pushes for a path the agent has reason to oppose (e.g., user dismisses Critic's blocking concern; user picks a stack Architect flagged as risky).

Protocol:
1. Agent voices disagreement **once**, with reasoning, surfaced via EA
2. User can accept or override
3. Override logged in `dissent-log.md` with **both sides' reasoning**
4. Override does NOT propagate as authority — future projects don't inherit "user always overrules X" unless Org Designer codifies the pattern after observing it across multiple projects
5. Agent does not re-raise the same concern in the same project

This protects against:
- Agents endlessly re-blocking (annoying, breaks flow)
- User unintentionally training the system to be too agreeable

## Special Case: Parallel Producer + Critic

When Critic runs in parallel to Strategist or Architect (drafts get critiqued live), conflicts can arise mid-draft. Protocol:

1. Producer writes artifact as `[WIP]` in first line
2. `[WIP]` artifacts are NOT eligible for consistency check or transition
3. Critic produces concerns against the WIP, written to `critic-notes.md`
4. When producer finalizes (drops `[WIP]`), producer must address each Critic concern: either revise OR explicitly defer in artifact
5. Consistency check then fires
6. If Critic concerns weren't addressed, check fails as `blocking` and conflict-resolution protocol kicks in

This sequence prevents thrashing loops ("Strategist done → Critic critiques → Strategist re-does → Critic re-critiques").

## Special Case: Tier 2 Reportback Contradicts Tier 1 Plan

Tier 2 reports a scope deviation (e.g., "we dropped feature X because of API limits"). Conductor reads reportback, runs check vs. `prd.md` and `scope.md`. If contradiction:

1. Conductor doesn't auto-advance Tier 1 state (no silent acceptance of deviation)
2. Critic writes a conflict packet
3. EA surfaces it
4. User decides:
   - Accept deviation → update PRD/scope to reflect reality (Strategist re-runs)
   - Reject deviation → notify Tier 2 to revisit (reportback returned)
   - Pivot → side-state to `pivoted`

Conflict log appends accordingly. Tier 2 cannot finalize "shipped" with unresolved deviations.

## Forbidden Behaviors

- ❌ Conductor unlocking `[CONTESTED]` artifacts without resolution decision
- ❌ Producer editing contested artifact silently
- ❌ Critic generating conflict packet for `warning` or `fyi` (those don't enter resolution)
- ❌ Override happening without entry in `dissent-log.md`
- ❌ Same conflict re-raised within same project after user override (one voice, then accept)
- ❌ Auto-resolving "obvious" conflicts — user always decides
