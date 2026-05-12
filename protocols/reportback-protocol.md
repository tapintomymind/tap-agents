# Reportback Protocol — Tier 2 → Tier 1

How Tier 2 (project execution team) reports status, deviations, and decisions back up to Tier 1 (HQ).

## The Channel

Single file at the registered path: `<tier2-repo>/.claude/reportback.md`. Tier 2 appends; Tier 1's Conductor monitors.

## Required Reportback Events

Tier 2 MUST report these events:

| Event | When |
|---|---|
| **MVP shipped** | After deploying first version that meets PRD acceptance criteria (or noted deviations) |
| **Major scope deviation** | Before finalizing any feature drop, addition, or material change to PRD-defined functionality |
| **Blocked >24h** | When Tier 2 has been stuck on a single issue for over 24 hours |
| **Risk realized** | When a tech-strategy-identified risk actually materializes |
| **Decision needed from Tier 1** | When Tier 2 cannot make a call within its authority |
| **Promotion request** | When mid-build pivot is required (see Promotion Path below) |

## Optional Reportback Events (FYI)

Useful for context but not required:
- Milestone completed (per scope.md)
- Significant refactor completed
- Lessons learned during implementation (will feed `lessons-learned.md` at retro)
- Stack adjustment within strategy (e.g., picked specific library)

## Reportback Format

Each entry is appended to `reportback.md`:

```markdown
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
<Required when type = scope-deviation, risk-realized, promotion>

DECISION NEEDED FROM TIER 1
<Specific question for Tier 1, with options if applicable>
<Required when type = decision-needed, scope-deviation, promotion>

REPLACEMENT / WORKAROUND (if applicable)
<What Tier 2 did or proposes instead>

LIVE URL / ACCESS (for shipped events)
<Where Tier 1 can verify>

CITED CONSTRAINTS
<Specific tech-strategy risks, scope cuts, or PRD criteria this relates to>
─────────────────────────────────────────────
```

## Conductor's Monitoring

Conductor checks `reportback.md` at:
- Every Tier 1 invocation (e.g., user runs /status)
- File-modified hook (future automation)
- Scheduled cadence (future)

For each new entry:
1. Type detection (required vs FYI)
2. Consistency check: does this contradict `prd.md`, `scope.md`, or `tech-strategy.md`?
3. If contradiction → invoke conflict-resolution.md flow
4. If decision needed → EA surfaces to user
5. If FYI → log to project's transition log, include in next briefing

## Tier 2's Authority Boundary

| Tier 2 CAN do unilaterally | Tier 2 MUST escalate |
|---|---|
| All implementation decisions within scope | Scope deviation |
| Refactoring, bug fixes, internal architecture | MVP-shipped declaration (Tier 1 confirms acceptance criteria match) |
| Library/dependency choices within chosen stack | Adding features beyond approved scope |
| Test strategy, local dev workflow | Stack change after handoff |
| Anything tech-strategy didn't constrain | Promotion (mid-build pivot) |

## Tier 2 Cannot Mark "Shipped" Without Tier 1 Confirmation

When Tier 2 declares MVP shipped:
1. Tier 2 writes shipped reportback with live URL/access
2. Tier 1 Conductor runs consistency check: does deployed product match PRD acceptance criteria?
3. If yes → EA surfaces hard checkpoint Decision Packet for `handed-off → shipped`
4. If no (deviations not addressed) → conflict-resolution flow
5. User confirms → state transitions to `shipped`
6. If user rejects → reportback for revisit

This prevents Tier 2 from claiming shipped when scope has drifted.

## Promotion Path (Mid-Build Pivot)

When Tier 2 discovers the original Tier 1 plan needs significant revision (e.g., wrong target user, wrong stack, fundamental flaw in PRD):

1. Tier 2 writes `promotion-request` reportback:
   ```
   Type: promotion-request
   WHAT
   <reason for promotion request>
   
   PROPOSED NEW DIRECTION
   <what Tier 2 thinks should change>
   
   IMPACT
   <which PRD sections need rewrite, what scope changes, etc.>
   
   DECISION NEEDED FROM TIER 1
   Approve promotion (re-run from PRD) | Adjust within current plan | Reject promotion request
   ```

2. Tier 1 Conductor sets project state to `paused` (or `pivoted` if user approves)

3. EA surfaces immediately as Surfacing Alert

4. User decides:
   - **Approve promotion** → side-state to `pivoted`; Intake re-engages user; new PRD generated; new handoff issued; old Tier 2 receives revised package
   - **Adjust** → Strategist or Architect addresses specific issue without full re-run; revised handoff goes to Tier 2
   - **Reject** → Tier 2 receives "stay the course" with rationale; project resumes

5. Logged in dissent-log.md if user overrules Tier 2's promotion concern

## Reportback Hygiene

- **Append-only.** Never edit prior entries (mistake corrections go in new entries).
- **Complete.** Every required field for the event type must be filled. Conductor flags incomplete reportbacks back to Tier 2.
- **Cited.** Reportback claims about scope/PRD impact must reference specific sections.

## Forbidden Behaviors

- ❌ Tier 2 silently deviating from scope without reportback
- ❌ Tier 2 marking shipped without live URL or access mechanism
- ❌ Tier 1 ignoring `decision-needed` reportbacks beyond 24h (EA escalates)
- ❌ Tier 2 deleting or editing prior reportback entries
- ❌ Tier 2 making promotion decisions unilaterally — always requires user approval via Tier 1
- ❌ Multiple reportbacks for the same event (one event = one entry)
