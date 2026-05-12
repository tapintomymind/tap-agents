# Framework Change Discipline Protocol

**Owner:** Org Designer (canonical authority)
**Status:** Active 2026-05-06
**Authority:** User dispatch (2026-05-06) ratifying Org Designer's three Process Rules from `workspace/_global/org-designer-proposals/20260506-db-admin-ratification.md` §C, plus Architect Phase 1 brief at `workspace/_global/architect-brief-destructive-ops-phase1.md` §1.4.
**Critic enforcement:** at artifact level on every framework-change review.

---

## §1 Why this exists

The 2026-05-06 cross-branch wipe incident triggered a same-day inline-creation of three Tier 1 doctrinal changes (`agents/db-admin.md`, `protocols/destructive-data-ops.md`, 11 binding sections across existing agents) without Org Designer proposal-review-ratify. Org Designer's ratification audit (§C) found this was the **third such occurrence in 30 days** — `framework-contract-discipline` audit-amendments earlier the same day, plus `session-coordination-protocol` Rule 1 amendment same day. Each had genuine same-day urgency. None had structural review.

The structural failure was process, not content: the framework-changes were on-the-merits good, and the Org Designer + Critic ratifications converted on YELLOW with single-pass amendments. But the absence of a proposal-review-ratify-before-land discipline meant the doctrinal change happened in flight, with the team's adversarial reviewers learning of it after the fact.

This protocol fixes that class of failure structurally. Same trade-off shape as `protocols/destructive-data-ops.md` itself: a small process tax (~5 minutes per Tier 1 doctrinal change for the grep + proposal cycle) buys structural prevention of an entire class of recurring incident.

The canonical owner is Org Designer because the canonical inability — "the orchestrator made a Tier 1 doctrinal change without team review" — is a team-shape failure mode, and team-shape is Org Designer's lane.

## §2 Scope

This protocol governs Tier 1 doctrinal changes — additions, deletions, or content-altering edits — to:

- `.claude/agents/*.md` (canonical agent contracts, including `_planned/` stubs when promoted)
- `.claude/protocols/*.md`
- `.claude/templates/*.md` AND `.claude/templates/stacks/**/*.md` (this includes Tier 2 scaffold templates under `templates/stacks/_baseline/`)

It does NOT govern:

- Project-scoped `.claude/` artifacts under any project directory (those follow the project's own promotion discipline)
- Workspace-only artifacts under `.claude/workspace/` (drafts, proposals, audits, briefs are unrestricted)
- Memory file appends in `.claude/memory/` that don't change canonical contracts (lessons-learned, incidents, agent-changelog narratives)
- Draft proposals before they're submitted for review

**Templates surface clarification.** The framework-side `templates/stacks/_baseline/` is in scope. The agent-dashboard scaffold-source mirror at `agent-dashboard/scaffold-source/templates/` is NOT in scope of this protocol — it's a project-level mirror governed by its own propagation discipline. Framework changes propagate to scaffold-source as a follow-up sync step, not a parallel doctrinal write.

## §3 Rule 1 — No Tier 1 doctrinal change without review

A Tier 1 doctrinal change MAY be landed only via one of three gates:

**(a) Approved Org Designer proposal.** A proposal exists in `workspace/_global/org-designer-proposals/<YYYY-MM-DD>-<topic>.md` and the user has signed off on it. The proposal MUST cite which framework files will change and what the change is. Sign-off is recorded in the proposal itself or in the next turn's user message.

**(b) Explicit user direction in current turn.** The user, in the current turn (or the immediately preceding turn that triggered the orchestrator's response), names the file being changed. Soft direction ("update the agents") does NOT satisfy (b); explicit direction ("update `agents/critic.md` to add X") does.

**(c) OD-unavailable bridge.** Explicit user direction in current turn names the file being changed AND Org Designer is invoked-but-unavailable (no proposal materializes within 24h of inline ship). In this case, **Critic + EA jointly run the adversarial-review pass that Org Designer would have done**; the changelog records reviewer attribution as "Critic + EA jointly in OD's absence." Flag for OD review on next session for retroactive sign-off; if OD's eventual review surfaces revisions, those revisions land via normal Rule 1 path. Case (c) is a **one-time bridge per inline-ship event, not a permanent OD bypass.**

Inline addition/deletion/edit forbidden without (a), (b), or (c). Drafting in `workspace/_global/` is always allowed; **landing** is what requires the gate. The boundary between drafting and landing is the file-system action: a write to `.claude/agents/`, `.claude/protocols/`, or `.claude/templates/` is landing.

## §4 Rule 2 — Same-day-incident exception with sealing

When an in-flight incident requires a Tier 1 doctrinal change to mitigate, the change MAY be landed inline without prior Org Designer proposal IF and ONLY IF:

1. The change is marked `[PROVISIONAL — pending Org Designer ratification per workspace/_global/org-designer-proposals/<YYYY-MM-DD>-<topic>.md]` at the top of the file (or relevant section) at the moment of landing
2. An Org Designer dispatch is invoked within the same session, with a 48-hour OD-review window starting from the moment of landing
3. The marker stays in place until user sign-off — **NOT** until 48h elapses

Deadline format in the marker: `Ratification deadline (OD review target): YYYY-MM-DD HH:MM UTC`.

**PROVISIONAL fallback mechanic.** At deadline+1 (48h after landing, IF user has not yet signed off): Critic surfaces a **BLOCKING finding** in `critic-notes.md` at the next review of any artifact that depends on the provisional artifact. Finding text:

> `"PROVISIONAL ratification deadline (YYYY-MM-DD HH:MM) exceeded for <artifact-path>. Cannot certify dependent work as binding-grade until (a) user ratifies, (b) user extends deadline, or (c) user reverts the provisional ship. Surfacing to user; not auto-deleting."`

Critic does NOT delete the artifact at deadline+1. The artifact stays in place; the BLOCKING finding accumulates with each Critic review of dependent work. User decides: extend deadline, ratify, or revert.

**Deadline-rationale tightening.** 48h is an OD-review TARGET per OD's Rule 2 cadence, NOT a hard ratification deadline. The PROVISIONAL marker remains in place until user sign-off, NOT until 48h elapses. Deadline+1 triggers Critic surfacing only; user controls when the marker drops.

**Discipline signal.** Org Designer's monthly leakage audit tracks `[PROVISIONAL]` artifact accumulation. Sustained accumulation (multiple long-overdue PROVISIONAL artifacts) indicates either the gate is too tight (false-friction) or OD is over-loaded (capacity issue) — Org Designer raises the appropriate proposal in response.

## §5 Rule 3 — Cross-protocol-conflict grep

Every Tier 1 doctrinal change runs a cross-protocol-conflict grep over the framework-doctrinal surface BEFORE landing. The grep covers:

- `.claude/protocols/*.md`
- `.claude/agents/*.md`
- `.claude/templates/**/*.md` (including subdirectories like `templates/stacks/_baseline/`)

For terms that map to the change's substance: action class names ("destructive", "TRUNCATE", "DROP" for a DB-ops change), Tier classifications ("Tier A/B/C/D"), file paths the change touches, role names being created or modified.

**`templates/` is mandatory in the grep set, not optional.** Greps that cover only `agents/` + `protocols/` are non-compliant — they miss the scaffold-template surface and risk introducing protocol claims that contradict template content. The 2026-05-06 cross-branch wipe remediation's R1 brief committed exactly this gap: Rule 3 grep covered `agents/` + `protocols/` only, missed `templates/`. Critic R1 caught it; codified here as binding.

**Format.** Results recorded in the proposal under a `## Cross-protocol grep` heading with:
- The exact grep command(s) used
- The line-count summary per file matched
- A short "what conflicts I found" paragraph (or "no conflicts found")

Critic checks during review that the grep was done with full surface coverage. Two-minute discipline catches Tier B/C/D-style classification conflicts at authoring time, not after landing.

## §6 Workflow

The seven-step canonical path for any Tier 1 doctrinal change:

1. **Draft as proposal.** Author the change in `workspace/_global/org-designer-proposals/<date>-<topic>.md` (or `architect-brief-<topic>.md` for non-Org-Designer-led changes; conductor routes appropriately).
2. **Cross-protocol-conflict grep + record.** Execute the grep across all three surfaces (`agents/`, `protocols/`, `templates/`); record results in the proposal.
3. **Org Designer reviews** the proposal. Verdict: ratify / ratify-with-amendments / reject-and-restructure.
4. **User approves** the proposal (or sends it back).
5. **Orchestrator applies** the edits to the canonical files.
6. **Critic adversarial review** of the landed change against the proposal.
7. **Memory updates** atomic with the change (agent-changelog narrative; lessons-learned if applicable; patterns candidate if 3+ recurrence).

For incident-pressure same-day changes, the path collapses to: inline-land with `[PROVISIONAL]` marker → invoke Org Designer dispatch in same session → ratify within 48h target → drop the marker. Rule 2 is the same workflow telescoped against an incident timeline.

## §7 Critic enforcement

Critic reviewing ANY framework artifact change checks:

- **(a)** Approved Org Designer proposal cited in the change's commit/landing message OR explicit user direction quoted from the current turn OR (c) OD-unavailable with Critic+EA joint review attribution?
- **(b)** Cross-protocol grep done across `agents/`, `protocols/`, AND `templates/`? Grep results visible in the proposal or commit message?
- **(c)** If `[PROVISIONAL]`, deadline still in window?

Failures = BLOCKING finding. The change does NOT certify as binding-grade until each check passes.

**Self-governance.** When the artifact under change is `agents/critic.md` itself, Critic CANNOT self-review — that's a structural conflict of interest. Use Org Designer adversarial review as the substitute (or Critic+EA jointly per Rule 1 case (c) if OD unavailable). Same applies when the artifact under change is `agents/org-designer.md` (Critic substitutes for OD's role). The general principle: Tier 1 agent self-modification routes through whichever-other-Tier-1-agent-isn't-the-target as adversarial reviewer. The change-target's own contract cannot review its own change.

## §8 Worked examples

Three same-month inline-creation occurrences each illustrate one path through the protocol.

### §8.1 Primary: 2026-05-06 destructive-data-ops protocol (Rule 2 path)

In flight: cross-branch wipe incident, prod data lost, recovery via Neon PITR. Orchestrator inline-lands `protocols/destructive-data-ops.md` + `agents/db-admin.md` + 11 binding sections same-day. The inline landing was a Tier 1 doctrinal change without prior Org Designer review — exactly the failure mode this protocol exists to prevent. Under this protocol, the corrected sequence is:

1. Land with `[PROVISIONAL]` marker (Rule 2 same-day-incident exception applies)
2. Invoke Org Designer dispatch same session (the user's dispatch in the next turn is what initiated this)
3. Org Designer reviews + ratifies-with-amendments within 48h target (verdict landed `2026-05-06T~21:00`; this protocol is part of the amendment set)
4. Apply amendments via Architect-brief → Critic-review → orchestrator-land path
5. Drop `[PROVISIONAL]` marker after user sign-off
6. Memory entry: `incidents.md` 2026-05-06 cross-branch wipe + `lessons-learned.md` #9 + this protocol

Illustrates: same-day-incident exception with successful Org Designer ratification.

### §8.2 Alternate: 2026-05-06 session-coordination Rule 1 amendment (Rule 1 case (b))

User-directed inline change with no incident in flight. User explicitly named `protocols/session-coordination-protocol.md` Rule 1 in the current turn ("tighten Rule 1 to mean stale ≠ abandoned; modifying claimed files requires explicit user authorization"). Rule 1 case (b) was the gate — explicit user direction in current turn naming the file.

Under this protocol, the change is permitted because (b) is satisfied. Org Designer post-hoc review still recommended (and is part of Org Designer's monthly cadence anyway), but is not a precondition for landing. Memory entry attributed to "user-directed; Org Designer review pending next cadence."

Illustrates: user-directed inline change without OD proposal — the gate is the explicit user direction, not the incident exception.

### §8.3 Alternate: 2026-05-06 framework-contract-discipline + audit-routing fixes (Rule 1 case (a))

Org Designer dispatched audit on framework-contract-discipline + audit-routing closes with content amendments. Rule 1 case (a) was the gate — proposal first (the audit IS the proposal), ratification by user before edits, then orchestrator applied.

Under this protocol, the change is the canonical case (a) path. Slow, deliberate, structurally protected.

Illustrates: the canonical proposal-first path. Contrast with §8.1: the same protocol handles incident-pressure (Rule 2) vs. non-incident-pressure (Rule 1 case (a) or (b)) differently. Both are valid; the choice is determined by whether an incident is actually in flight at the moment of landing.

## §9 Agent prompt versioning (2026-05-07)

Every agent contract under `.claude/agents/` (Tier 1 and Tier 2) carries a `prompt_version` field in its frontmatter. The version is a date-with-revision shape: `YYYY-MM-DD-N` where N starts at 1 for the day's first revision and increments per same-day amendment.

```yaml
---
name: quality-engineer
description: ...
model: opus
prompt_version: 2026-05-07-1
trigger_conditions: ...
---
```

### Why

Without versioning, when an agent's contract changes (e.g., a new gate is added, a new event taxonomy is required, a privacy boundary is tightened), there's no way to know whether an in-flight project ran against the OLD or NEW version. The framework's improvement loop assumes contracts evolve; tracking version is how we know when a project's outputs reflect the current contract vs the prior one.

### Discipline

- **Bumping is required** when any §3-listed semantic change is made: trigger conditions, gates added/removed, output format changes, ownership changes, new mandatory references. Pure-formatting / typo edits do NOT require a bump.
- **Per-day shape:** the first edit of the day is `-1`. The second edit on the same day is `-2`, etc. A new day resets to `-1`.
- **Conductor logs the version per milestone.** Conductor's `transition-log.md` format gains a `Agent prompt versions:` line listing the version of each agent that contributed during that transition. (See `agents/conductor.md` for the format update.)
- **Critic flags staleness during review** (per `agents/critic.md` "Agent prompt-version staleness check"): when reviewing an artifact produced by an agent whose contract has been bumped since the project's last touch of that phase, flag as P2 with a re-run-or-justify recommendation.

### Bootstrap state (2026-05-07)

Agents updated in this round (Conductor, Critic, Quality Engineer, Org Designer) carry `prompt_version: 2026-05-07-1`. Agents not yet versioned are treated as "legacy" (no version field) and Conductor records `<unversioned>` in the transition log. As each legacy agent receives its next contract update, it gains a version field at that time.

## §10 Cross-references

- `protocols/framework-contract-discipline.md` — content discipline (Activation Context, Provenance citation, Stack-illustrative content). This protocol governs the **process** of changing framework artifacts; FCD governs the **content** they should contain. They're complementary axes, not overlapping.
- `protocols/autonomous-ops-permissions.md` — A/B/C/D tier classification for ops actions. Tier 1 doctrinal changes are themselves Tier B-equivalent ops (modifying shared persistent state — the framework codebase) — they fall under THIS protocol's Rule 1 in addition to autonomous-ops-permissions.
- `protocols/incident-protocol.md` — incident response posture. Rule 2 above is the framework-change variant of incident-response.
- `agents/org-designer.md` — Org Designer agent contract (canonical owner of this protocol).
- `agents/critic.md` — Critic agent contract (Rule 3 + §7 enforcement).
- `memory/incidents.md` 2026-05-06 cross-branch wipe entry — the originating incident for this protocol.
- `workspace/_global/org-designer-proposals/20260506-db-admin-ratification.md` §C — the formal proposal that introduced Process Rules 1, 2, 3.
