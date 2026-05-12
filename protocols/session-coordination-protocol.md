# Session Coordination Protocol

**Status:** Load-bearing — applies to ALL Claude sessions in this workspace, ALL the time.
**Authored:** 2026-05-06.
**Authority:** User-binding per directive 2026-05-06: *"I can't have cross session drifts and consistency is key. The whole team is connected and needs to act that way ALL the time."*

---

## Why this exists

This workspace runs multiple parallel Claude sessions concurrently. Each session is conceptually another instance of the user working on the same company. Without explicit coordination, parallel sessions drift:

- Same CHANGELOG version claimed twice
- Plans for the same surface authored independently by two sessions (e.g., v1.5 plan and BL-013 both spec the webhook handler)
- Agent-changelog files race-edited during in-flight work
- Decisions fragmented across uncoordinated artifacts

Real friction observed 2026-05-06 (concrete recent example, agent-dashboard project context): CHANGELOG entries [0.4.7] (UI/UX activation) → [0.5.0] (v1.5 Phase 0) → [0.5.1] (UI/UX refinements) landed within hours from three independent sessions. The framework operated; the seams were noisy. Provenance citation, not canonical shape — sessions on other project types will surface different friction patterns.

This protocol codifies how parallel sessions stay consistent. It is **mandatory** for any session touching cross-cutting workspace files.

This protocol is complementary to (not duplicative of):
- `protocols/conflict-resolution.md` — resolves contradictions within a single project's artifact chain
- `protocols/consistency-check.md` — automated diff at state-machine transitions
- `protocols/changelog-protocol.md` — scope split between framework and project changelogs

This protocol uniquely owns: **inter-session coordination across concurrent Claude sessions.**

---

## Scope: when this protocol fires

**MUST follow** when editing any of these:

- `.claude/CHANGELOG.md`
- `.claude/memory/agent-changelog.md`
- `.claude/memory/agent-changelog-private.md`
- Any agent contract under `.claude/agents/*.md` (including `_planned/`)
- Any protocol under `.claude/protocols/*.md`
- Any template under `.claude/templates/*.md`
- `.claude/agents/conductor.md` specifically (state-machine routing — load-bearing for everyone)
- Cross-cutting plans (e.g., a project's `.claude/docs/<plan-name>.md` execution-plan artifact, or any equivalent multi-phase planning document with cross-cutting impact)
- Cross-cutting decision packets in `.claude/workspace/<scope>/decision-packet-*.md`
- Any file referenced by ≥2 agents' "Read on Every Invocation" lists
- `.claude/memory/` shared memory files (lessons-learned, patterns, runtime-gotchas, etc.)

**MAY skip** when:

- Editing a single PRD/scope/spec inside one project's `workspace/<slug>/` (single-session-scoped)
- Writing scoped code in a Tier 2 project (the dashboard's own `src/`)
- Running a smoke test
- Read-only operations of any kind

When in doubt: assume cross-cutting and run the protocol. The cost of running unnecessarily is low; the cost of skipping when it applies is real.

---

## The six rules

### Rule 1 — Session manifest (declare your work)

**File:** `.claude/workspace/_global/active-sessions.md`

Before starting non-trivial cross-cutting work, append a session entry:

```yaml
## <session-id>
started: <ISO datetime>
scope: <one sentence — what this session is doing>
files_in_flight:
  - <full repo-relative path from framework workspace root, NOT a basename>
  - <full repo-relative path from framework workspace root>
status: in-progress
last_updated: <ISO datetime>
```

**Path-format contract (load-bearing):** `files_in_flight` entries MUST be full repo-relative paths from the framework workspace root (the directory containing `.claude/`). Examples: `agent-dashboard/src/lib/foo.ts`, `.claude/protocols/x.md`, `.claude/workspace/_global/y.md`. **Basenames alone (e.g., `foo.ts`) are NOT permitted** — the auto-seal matcher requires path-precision to avoid false-positives across monorepos or sibling projects (e.g., a basename `foo.ts` would historically match `unrelated-project/foo.ts` and seal the wrong session). The `agent-dashboard/scripts/promote-to-prod.sh` auto-seal helper enforces this contract: claims without at least one `/` character are skipped + surfaced as a warning at promote time, leaving the entry's status untouched. Operator must fix the manifest entry to a fully-qualified path before re-promoting if that session's work shipped.

**Session-id format:** `<YYYY-MM-DDTHH-MM>-<short-scope>` (use hyphens, not colons, in the time portion to keep filename-safe). Example: `2026-05-06T14-30-v15-phase0`.

**Update** the `last_updated` field whenever your work transitions (file landed, scope shifted, or after each ~20-30 min of in-flight work).

**On session end:** change `status` to `sealed` and add `completion_note: <one-line>`. Do NOT delete the entry. Sealed entries remain as historical record. Quarterly cleanup prunes sealed entries older than 30 days. **If your session's work merges via a project promotion script (e.g., `agent-dashboard/scripts/promote-to-prod.sh`), the script auto-seals — you only seal manually for non-promote paths (read-only sessions, decision packets, agent-contract-only edits).**

**Auto-seal mechanism (current enforcement, A):** project promotion scripts seal in-progress entries whose `files_in_flight:` list overlaps the merge's file set. Auto-sealed entries carry these extra fields for forensic transparency:

- `auto_sealed: <YYYY-MM-DDTHH-MM>` — timestamp the script wrote the seal
- `auto_seal_merge: <SHA>` — the merge commit that triggered the seal
- `auto_seal_outcome: <success | partial — <reason>>` — script outcome at seal time
- `auto_seal_files: [list]` — the subset of `files_in_flight` that actually shipped in the merge
- `completion_note: AUTO-SEALED via <script> — shipped via merge <SHA> at <timestamp>; <N> of <M> claimed files merged. <CAUTION line if N<M>.`

If a `completion_note:` is already present (manual seal landed first), the script appends only the `auto_*` metadata — it does NOT overwrite human-set notes. If the manifest is malformed or unreadable, the script warns + skips — auto-seal is a metadata convenience, never a promotion gate.

Reference implementation: `agent-dashboard/scripts/promote-to-prod.sh` (`auto_seal_active_sessions()` helper, fired at start of Gate 5 and inside `fail_with_audit` for partial-state). Other-stack promotion scripts SHOULD implement the same shape; the manifest format is framework-portable so scripts in any stack can match.

**EA drift-detection (current enforcement, B):** Executive Assistant runs a stale-session sweep on every `/status` and `/briefing`. For each `status: in-progress` entry whose `last_updated` is >2h old, EA cross-references the entry's `files_in_flight:` against `git log` since `last_updated`. Entries whose claimed files have landed on the integration branch surface as drift candidates with the suggested fix. EA is read-only on the manifest — it surfaces, never seals. This is the safety net for cases where auto-seal didn't fire (manual merges, hotfixes, projects without a promotion script). See `agents/executive-assistant.md` "Session-Tracking Drift Sweep" for the full algorithm + surface format.

**Why:** other sessions read this before touching cross-cutting files. If your session is editing `conductor.md` from 14:30 to 14:45, another session opening at 14:33 sees "in flight, do something else for 15 minutes." Auto-seal + EA-sweep together close the gap that produced the 2026-05-06 drift incident (BL-023 + BL-013 Phase 5 left in-progress for ~3.5h after merge bf2f08a landed).

**Anti-pattern:** silently editing CHANGELOG.md without first writing a session manifest entry.

### Rule 2 — CHANGELOG drafts (claim version at landing, not edit)

**Directory:** `.claude/workspace/_global/changelog-drafts/`

While work is in flight, write your CHANGELOG entry to `<session-id>.md` in the drafts directory. Do **NOT** write directly to `.claude/CHANGELOG.md` until landing time.

**Draft body format** (no version header):

```markdown
### <Type — Heading>

<entry body>

### Files changed
- <path>

### Cross-references
- <path>
```

**At landing:**

1. Re-read `.claude/CHANGELOG.md` to find the next free version number.
2. Stamp the version header on your draft (e.g., `## [0.6.0] — 2026-05-06`).
3. Insert at the top of `.claude/CHANGELOG.md` after the header block, before the prior entry.
4. Move the draft file to `_landed/<version>.md` for archival.
5. Atomic git commit pairing the CHANGELOG entry with the agent-changelog narrative entry (per `protocols/changelog-protocol.md`).

**Why:** version numbers are atomic claims. Writing the header at edit time is a race; writing the body to a session-scoped file and stamping at landing eliminates the race entirely.

**Anti-pattern:** opening `.claude/CHANGELOG.md` and writing `## [0.6.0] — 2026-05-06` while another session is mid-edit. The first to commit wins; the second has to renumber and rebase.

### Rule 3 — Decision packets (single authority for cross-plan conflicts)

When two plans/specs/contracts cover the same surface, the resolution lives in **one decision packet**, not in inline edits to both plans.

**Where:** `.claude/workspace/<scope>/decision-packet-<topic>.md` (the agent-dashboard scope, the global scope, the relevant project scope).

**The packet:**

- Names the conflict
- Names the plans that overlap
- States the resolution
- Lists which plan(s) get updated to reference it
- Names the agent owner and the user-approver

**Both plans then add** a one-line cross-reference: *"§X is owned by [decision packet path] — see DP for current authority."*

**Why:** decision packets are immutable historical records. Plans evolve. When two plans evolve in parallel about the same surface, the packet is the arbitrator.

**Anti-pattern:** editing two plans concurrently to resolve a conflict. Whichever lands second silently overwrites or contradicts the first.

### Rule 4 — Lane ownership (agents own files; cross-lane edits dispatch)

Each agent owns specific files. Sessions editing outside their lane MUST dispatch the owner agent rather than editing directly.

**Selected ownership** (canonical mapping; full version in each agent contract):

| Agent | Owns |
|---|---|
| Designer | `templates/design-spec.md`, project-level `design-spec.md`, `default-coverage` blocks |
| UI/UX Reviewer | `design-review.md` outputs, `memory/ui-references.md`, `memory/ui-patterns.md`, `memory/ui-anti-patterns.md` |
| QE | `test-plan.md`, `smoke-report.md`, `memory/runtime-gotchas.md`, `memory/test-patterns.md` |
| Ops/Security | `security-audit.md`, `threat-model.md`, `memory/security-patterns.md`, `memory/security-lessons.md` |
| Conductor | `state.json`, state-machine routing decisions |
| Architect | `tech-strategy.md`, `scope.md`, execution plans |
| Critic | `critic-review.md` outputs (no primary content authoring) |
| EA | `executive-briefing.md`, decision packet preparation, status surfaces |
| Org Designer | `org-designer-proposals/`, agent activations/promotions, `_planned/` contents |
| Strategist | `prd.md`, ICP definitions |
| Intake | `intake-brief.md`, `seed.md` |

**Why:** parallel sessions each respecting lane ownership produce naturally non-overlapping edits. Two sessions both wanting to edit `design-spec.md` is the wrong shape — one session should dispatch Designer; the other waits for the dispatch result.

**Anti-pattern:** Session A edits `design-spec.md` directly while Session B dispatches Designer. Session A's edits race with Designer's; one silently overwrites the other.

### Rule 5 — EA briefing opens every non-trivial session

Before starting work that may touch cross-cutting files, run `/briefing` (or invoke EA via the Skill tool / Agent tool / `executive-assistant.md` directly).

**EA reads:**

- `active-sessions.md` (rule 1)
- `changelog-drafts/` (rule 2)
- recent decision packets (rule 3)
- workspace state across all projects
- agent-changelog narratives
- the EA-protocol itself (`protocols/ea-protocol.md`)

**EA surfaces** what's in flight and flags potential collisions BEFORE you start work.

**Why:** the briefing is the cross-session standup. Skipping it produces the kind of friction this protocol exists to eliminate.

**Anti-pattern:** opening a fresh session and immediately editing `CHANGELOG.md` without checking what's in flight elsewhere.

### Rule 6 — Atomic git commits per landed unit

Each landed unit of work is its own commit:

- Phase complete → commit
- Task complete → commit
- Decision packet approved → commit
- Agent activated or promoted → commit
- Refinement landed → commit

Don't accumulate work across sessions in the working tree. Frequent commits = git surfaces conflicts cleanly. Even local-only commits are checkpoints other sessions can rebase against.

**Why:** the working tree is shared across sessions. Long-lived uncommitted work is invisible to coordination tooling. Committed work is visible via `git log`.

**Anti-pattern:** Session A makes 8 file edits over 2 hours without committing; Session B starts and edits one of those files; when Session A finally commits, the merge is messy.

---

## Conflict resolution flow

When a session detects a conflict via `active-sessions.md` (another session is editing a file you want to edit):

1. **Check status + last_updated.** If `in-progress` and last_updated within the last 30 minutes — pause your edit. Do something else from your scope. Re-check in 30 minutes.
2. **If sealed** (status: `sealed`, completion_note present) — proceed normally. Their work is done; their claim is released.
3. **If stale** (status: `in-progress` AND last_updated > 1 hour) — **DO NOT auto-take-over claimed files.** Stale ≠ abandoned. Other session may be drafting offline, designing in another tool, or mid-implementation without committing. The original "proceed but check for left-behind state" wording was insufficient — it produced overlapped work on 2026-05-06 (BL-015/16 incident). Required behavior:
   - **Read-only investigation IS allowed.** Read their brief, check git log, probe prod state — these don't modify claimed files.
   - **Modifying any claimed file requires explicit user authorization.** Surface to user with: (a) the other session's id + last-update + claimed files, (b) what's on disk vs what's claimed (committed code? brief only? in-progress drafts?), (c) explicit options: *wait*, *take over with authorization*, *work on a non-overlapping path*.
   - **Self-pivot signal:** if I find myself reading another session's brief in detail to understand what they were going to do — that IS the signal to stop and surface, even before touching claimed files.
   - The cost of asking is one message; the cost of overlapping work is real (wasted producer time, divergent implementations, conflict-resolution overhead, user frustration).
4. **If genuinely concurrent and your work cannot wait** — write a decision packet (rule 3) explicitly resolving how the two sessions' work will reconcile. Cross-reference both sessions' manifest entries.

When a session detects plan/spec drift (two plans for the same surface):

1. Stop editing both plans.
2. Write a decision packet.
3. Update both plans to reference the packet.
4. Resume work from the packet's resolution.

If conflict-resolution flow fails (sessions genuinely cannot agree, or human judgment needed): escalate to user via EA Decision Packet per `protocols/checkpoint-protocol.md`.

---

## Current enforcement (active)

This protocol is largely **advisory at the filesystem layer** — sessions follow it because they have read this file and the user has stated it is binding. The following enforcement IS active and runs automatically:

- **Auto-seal on promotion (Rule 1, A).** Project promotion scripts seal in-progress `active-sessions.md` entries whose `files_in_flight:` overlaps the merged file set. Reference implementation: `agent-dashboard/scripts/promote-to-prod.sh`. Closes the most common drift-source: work that ships but whose session entry is left open.
- **EA stale-session sweep (Rule 1, B).** Executive Assistant flags stale-but-shipped entries on every `/status` and `/briefing`. Catches cases auto-seal can't see — manual merges, hotfixes, work shipped via paths that don't run the promotion script. Read-only; surfaces only.

## Future enforcement (hooks)

Future hardening via Claude Code hooks (in `.claude/settings.json` per the `update-config` skill):

- **Pre-edit hook on `CHANGELOG.md`** — checks `active-sessions.md` for collision; refuses if another session has the file in `files_in_flight` and `last_updated` is recent.
- **Pre-edit hook on `conductor.md`** — requires session manifest entry first.
- **Pre-commit hook** — validates atomic-cadence rule (CHANGELOG entry paired with agent-changelog narrative entry, per `protocols/changelog-protocol.md`).
- **Pre-edit hook on agent contracts** — requires the editing session to be the agent's owner OR have a decision packet authorizing the cross-lane edit.

Hooks are out of scope for this initial protocol document. Track activation as a backlog item; revisit if friction persists.

---

## Cross-references

- Atomic-cadence rule: `~/.claude/projects/.../memory/feedback_changelog_proactive.md`
- Changelog scope split: `.claude/protocols/changelog-protocol.md`
- Conflict resolution within a single project: `.claude/protocols/conflict-resolution.md`
- Consistency check at transitions: `.claude/protocols/consistency-check.md`
- EA briefing protocol: `.claude/protocols/ea-protocol.md`
- Industry portability: `~/.claude/projects/.../memory/project_team_industry_portability.md`
- Conductor routing: `.claude/agents/conductor.md`
- Update settings.json (for hooks): the `update-config` skill

---

*This protocol is load-bearing. Violations are not "process pedantry" — they cause real coordination friction across the company. If a session is unsure whether the protocol applies, default to applying it.*
