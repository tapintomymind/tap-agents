# Consistency Check Protocol

Conductor's automated diff between artifacts at every transition involving a new artifact. Catches contradictions before they propagate downstream.

## When the Check Runs

- Before any auto-advance transition
- Before surfacing any approval-required transition to the user
- After Critic finalizes a `critic-notes.md` update (re-check)
- On user request via Conductor invocation

## Four Categories of Findings

### 1. Ground-truth contradictions (severity: blocking)

New artifact contradicts:
- `seed.md` — verbatim user prompt
- `intake-brief.md` items marked `[clear]` or `[clarified]`
- A user-approved prior artifact

**Check rule:** Diff cited claims in new artifact against ground-truth sources. If new artifact's `[brief]` references differ in content from `intake-brief.md`, that's a contradiction.

**Example:** `prd.md` says "target users: indie musicians" but `intake-brief.md` (approved) says "target users: music fans aged 18-34."

### 2. Cross-artifact contradictions (severity: blocking)

- `scope.md` includes feature X not in `prd.md` acceptance criteria
- `tech-strategy.md` picks framework that violates a `prd.md` constraint
- `critic-notes.md` flagged `blocking` concern not addressed in subsequent artifact
- Two artifacts make conflicting claims about same fact (user count, market size, timeline)

**Check rule:** Cross-reference all explicit claims across artifacts in `workspace/<slug>/`. Flag any pair that differs without a documented reason.

**Example:** `tech-strategy.md` picks "React Native" but `prd.md` says "must work in browser without app install."

### 3. Citation gaps (severity: warning)

- Claims tagged `[research]` with no URL
- Claims with no tag at all (uncited assertions)
- `[assumption]` items in critical sections that weren't surfaced for user review

**Check rule:** Scan artifact for sentences making factual claims. For each, verify a citation tag is present and properly formed (per `citation-protocol.md`).

**Example:** PRD claims "the market for X is $2B" with no `[research]` tag.

### 4. Scope creep / scope drift (severity: blocking)

- MVP definition in `scope.md` larger than MVP boundaries set in `prd.md`
- `scope.md` introduces a v2 feature without explicit `[deferred to v2]` marker
- Features listed in `prd.md` are dropped from `scope.md` without explicit cut justification

**Check rule:** Diff feature lists between `prd.md` and `scope.md`. Each delta requires an explicit reason — addition needs PRD update, drop needs cut justification.

**Example:** `prd.md` says "v1 = playlist creation only"; `scope.md` includes "social sharing" in milestone 1 with no deferral marker.

## Severity Definitions

| Severity | Behavior |
|---|---|
| **Blocking** | Transition is blocked. Producer must revise OR user must explicitly override (logged in dissent). |
| **Warning** | Transition can proceed; surfaced in next Decision Packet under "Critic flags". |
| **FYI** | Logged in `critic-notes.md`; not surfaced to user unless they ask. |

## Consistency Report Format

When findings exist, Conductor writes to `workspace/<slug>/consistency-reports/<YYYYMMDD-HHMM>.md`:

```
─────────────────────────────────────────────
CONSISTENCY REPORT — <project-slug>
Transition: <from-phase> → <to-phase> (BLOCKED|WARNINGS-ONLY)
Generated: <timestamp>
Triggered by: <transition | critic-update | user-request>

Findings: <count>

▸ <CATEGORY> (severity: <blocking|warning|fyi>)
  <Specific finding with file references>
  Suggested resolution: <what would clear it>

▸ <next finding>
  ...

Action required: <producer-revision | user-decision | none>
─────────────────────────────────────────────
```

EA surfaces blocking-severity reports immediately as Surfacing Alerts.

## Resolution Path

Per `protocols/conflict-resolution.md`:

1. Conductor marks affected artifacts `[CONTESTED]` in `state.json.contested_artifacts`
2. Critic generates a conflict packet (structured comparison + recommended resolution)
3. EA surfaces the conflict packet to user
4. User decides (accept recommended / pick alternative / override anyway)
5. Producer agent re-runs with resolution
6. Consistency check re-runs
7. Repeat until clean OR user explicitly overrides remaining concerns

## Check Pairs by Transition

| Transition | Artifacts compared |
|---|---|
| `intaking → briefed` | `intake-brief.md` vs `seed.md`, `memory/audience-knowledge.md`, `memory/patterns.md` |
| `stratego → prd-ok` | `prd.md` vs `seed.md`, `intake-brief.md`, `critic-notes.md` |
| `scoping → planned` | `scope.md` vs `prd.md`; `tech-strategy.md` vs `prd.md`, `intake-brief.md`, `memory/stack-preferences.md` |
| `planned → scaffold` | `handoff-package.md` vs all prior artifacts (final consistency sweep) |
| `handed-off → shipped` | Tier 2 reportback claim of "shipped" vs `prd.md` acceptance criteria |
| `measured → retro` | Measured metrics vs `prd.md` success criteria |

## What Happens When Check Fails

1. Transition is **not advanced**
2. EA receives the report and surfaces it as a Surfacing Alert
3. `state.json.blocked_on` is set with the report path
4. Critic is invoked to produce a conflict packet (if findings warrant resolution)
5. User addresses the findings; system retries

## Forbidden Behaviors

- ❌ Conductor advancing past a blocking finding without user override (logged in dissent)
- ❌ Critic dismissing findings as "not worth surfacing"
- ❌ Producer agent silently editing `[CONTESTED]` artifacts (must wait for resolution)
- ❌ Editing `consistency-reports/` files retroactively (append-only directory)
- ❌ Skipping checks for "obvious" or "simple" projects — every transition runs the check
