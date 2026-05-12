# Team Rhythm Protocol — Idle Cadence

**Status:** Load-bearing for the *habit*; advisory for any individual instance. Applies when the team has surplus capacity and no live producer is dispatched. PASS 2 (2026-05-06) — addressed Critic P0-1 (Cadence 1↔2 disambiguation), P0-2 (Reconciler role + fallback chain), P0-3 (split Cadence 5 into 5a + 5b, source-of-truth citations, supersession marker as convention-ratification deliverable), P1-5 (framework-contract-discipline.md cross-reference). P1-1, P1-2, P1-3, P1-4, P1-6, P2 items deferred as next-pass amendments per Critic recommendation; surface in EA briefing.
**Authored:** 2026-05-06
**Authority:** User-binding per directive 2026-05-06: *"build good idle tendencies so agents are consistently learning and growing with their peer agents and the company itself has a structure so robust and token efficient it makes the output desirable."*

---

## Why this exists

A human team's idle time is mostly individual — read, learn, rest. An agentic team's idle time is structurally different:

- **Memory is a living asset.** `memory/lessons-learned.md`, `memory/patterns.md`, `memory/runtime-gotchas.md`, `memory/ui-anti-patterns.md`, `memory/security-patterns.md`, `memory/incidents.md` decay or stay sparse unless actively curated.
- **Contracts drift.** Agent prompts (`.claude/agents/*.md`) evolve over time; their cross-references go stale; their format diverges from peers.
- **Patterns get re-discovered.** Without active promotion (incident → pattern → contract update), the same friction re-occurs project after project.
- **Artifact coherence rots.** Cross-references between protocols, plans, decision packets, and memory files need maintenance.

The equivalent of human reading is **active maintenance of the team's collective brain.** This protocol codifies the rhythm.

---

## Three principles (load-bearing)

### Principle 1 — Read-heavy, write-light, deltas not rewrites

Idle work observes far more than it writes. When it writes, it writes deltas to existing files, never wholesale rewrites of memory files. Empty memory files that exist as "(populated as projects complete)" placeholders are anti-pattern: at minimum one entry seeded at agent activation, more added incrementally. New memory files are authored only when no existing file owns the axis.

### Principle 2 — Peer-agent learning is the highest-leverage category

When one agent's work today taught another agent something — explicit or implicit — that's the idle-pass priority. Cross-axis memory entries (e.g., a UI-axis finding cross-referenced into runtime-gotchas) compound across projects far more than single-agent lessons. Each memory file has an "Adjacent files" footer pointing to peer-axis siblings; cross-references are bidirectional.

### Principle 3 — Scheduled, not constant. Token-efficient by default.

Idle work fires on a defined cadence (below) — not as continuous background. Memory writes are deltas; review notes are bounded; archival sweep is quarterly. Critic-notes files cap at ~15K each; overflow forces follow-up files. The question at every idle-pass dispatch: "Is this read sized to the actual signal?" If a synthesis would otherwise read every file, it's mis-scoped.

---

## The five cadences

### Cadence 1 — Per-session-close (lightweight, automatic)

**When:** End of any session (user signs off, idle >30min after meaningful interaction, or natural session boundary).
**Who:** EA, via `templates/session-close.md`.
**Output:** ~200-300 word session-close summary. Six sections: WHAT ADVANCED / WHAT WAS DECIDED / WHAT YOU TOUCHED / WHAT'S PENDING / OPEN BLOCKERS / NEXT TIME EA WILL OPEN WITH.
**Cost:** ~1-2 minutes of agent time. No memory writes; surfaces only.
**Status:** Already in place per `templates/session-close.md`.

### Cadence 2 — End-of-day pattern extraction (the new one)

**When:** End of any day with substantive work. Fires at most ONCE per working day, and only when ≥1 of:
  (a) User invokes `/end-of-day` explicitly (slash command not yet bound — backlog item), OR
  (b) Session boundary AND substantive day occurred (≥2 agent dispatches OR ≥1 artifact landed) AND no Cadence 2 has fired today, AND user has not signaled "more work coming today" (e.g., "back in 10 min", "running parallel").

If neither (a) nor (b) fires by end of working day, no Cadence 2 runs that day. Skipping a day is acceptable — the rhythm is not punitive.

**Relationship to Cadence 1.** Cadence 1 fires on every session boundary; it is lightweight (summary only, no memory writes). Cadence 2 is heavier (~10-15 min agent wall time, multi-file deltas) and fires under the conditions above. Cadence 1 still runs on every session-close regardless of Cadence 2 status.

**Who:** EA + Critic in parallel (the synthesis pair). EA writes `workspace/_global/patterns-YYYY-MM-DD.md` (synthesis); Critic writes `workspace/_global/memory-gap-audit-YYYY-MM-DD.md` (gap analysis with surgical deltas). Reconciler (defined below) applies deltas + surfaces summary.

**Reconciler role.** The agent or session that (a) reads both EA's pattern-synthesis output and Critic's gap-audit output, (b) applies surgical deltas to memory files per the gap-audit's recommendations, and (c) surfaces a one-paragraph summary to the user. The reconciler is NEVER the same agent as one of the parallel synthesis agents (separation-of-concerns rule).

Reconciler fallback chain (first match wins):
  1. The user's active main session (if user is present at trigger time — this was the path for the 2026-05-06 first run).
  2. Conductor (if EA is one of the parallel agents — Conductor takes the routing role).
  3. Org Designer (if Conductor is otherwise occupied OR if cross-axis structural changes are recommended in the gap audit).
  4. Defer reconciliation: stage the EA + Critic outputs in `workspace/_global/`, log a backlog entry "EOD reconciliation deferred YYYY-MM-DD", surface in next user briefing.

The fallback chain ensures the cadence cannot stall on "no orchestrator available" — the deferred case is explicit and bounded (next briefing surfaces it).

**Output:**
- EA: 200-400 words, six sections (What recurred / What surprised / Friction points / Cross-agent patterns / What worked unusually well / Recommendations to Critic).
- Critic: 300-500 words, P0/P1/P2 gap counts + surgical delta proposals + anti-patterns flagged + structural memory-design observations.
- Reconciler: synthesizes both, applies the deltas surgically, surfaces summary to user (or defers per fallback step 4).

**Cost:** ~10-15 min agent wall time (EA + Critic in parallel) + ~5 min reconciler synthesis.

**Token discipline:** EA reads CHANGELOG today's entries only, agent-changelog today's narrative, sealed sessions, recent decision packets. Critic scans memory files (catalog) + reads the same primary signal. Neither reads the full project state.

**Status:** First run 2026-05-06 (this artifact's authoring day). Reconciler was the user's main session (fallback step 1). Evidence: `workspace/_global/patterns-2026-05-06.md` + `workspace/_global/memory-gap-audit-2026-05-06.md`.

### Cadence 3 — Weekly process-adherence audit

**When:** End of a working week, OR when a session count for the week ≥10. Triggered by Critic (standing rule) or user via `/audit-week`.
**Who:** Critic (sampling); EA (surfaces results).
**Output:** ~200-word audit at `workspace/_global/process-audit-WW-YYYY.md`. Picks 3 random recent transitions; verifies the contract was followed; flags drift before it compounds.
**Cost:** ~10 min agent time.
**Status:** Not yet binding — activate when first month of EOD pattern-extraction has run.

### Cadence 4 — Monthly Org Designer pass

**When:** Monthly, OR on-trigger (project completion, agent activation, recurring failure pattern observed).
**Who:** Org Designer (already in contract).
**Output:** Org Designer proposal at `workspace/_global/org-designer-proposals/YYYYMMDD-<topic>.md`. Reviews team shape, agent over/under-tasking, missing roles, contract drift.
**Cost:** ~30-60 min agent time.
**Status:** Active per `agents/org-designer.md`. Cadence formalized here; previously trigger-only.

**Scope clarification — does NOT subsume the leakage audit.** `protocols/framework-contract-discipline.md` §4 specifies a separate monthly leakage audit (with relax-trigger structure: second-project-trigger, two-clean-cycles-trigger). That cadence has its own codification and lives there, not here. Cadence 4 (this one) is the broader team-shape / contract-drift review; the leakage audit is a narrower, framework-contract-specific discipline. They can run in the same monthly window if Org Designer chooses, but the protocols are separate. When in doubt: framework-contract-discipline.md owns the leakage-audit specifics.

### Cadence 5a — Quarterly archive sweep (move stale resolved artifacts)

**When:** End of calendar quarter (closest weekend).
**Who:** Org Designer (delegate to backlog-curator stub when activated).
**What:** Three move-or-prune actions on resolved artifacts. Each rule cites its source-of-truth so a future executor reading Cadence 5a alone can verify the rule.

- **Sealed `active-sessions.md` entries older than 30 days → pruned** (entries already self-document; sealed-and-old is noise). _Source: `protocols/session-coordination-protocol.md` Rule 1 (sealed-entry quarterly cleanup at 30 days)._
- **Critic-notes files in `workspace/_global/` resolved >30 days → moved to `workspace/_global/_archive/`.** _Source: rule introduced in this protocol; revisit at next leakage audit. The 30-day cutoff is provisional._
- **Resolved decision packets >90 days → moved to `workspace/_global/_archive/`.** _Source: rule introduced in this protocol; revisit at next leakage audit. The 90-day cutoff is provisional._

**Existing files exceeding the 15K critic-notes cap.** Critic-notes files exceeding 15K at the time this protocol activates (e.g., the 22K + 14K UI/UX Reviewer activation files flagged in `memory-gap-audit-2026-05-06.md`) are grandfathered — the cap rule (§Token-efficiency Rule 3) is forward-only. Quarterly archive sweep moves them to `_archive/` as-is when resolved >30 days, without splitting.

**Cost:** ~20 min agent time.
**Status:** First sweep due 2026-08-01.

### Cadence 5b — Annual memory-file currency review (mark obsolete; do NOT delete)

**When:** Annually, OR on-trigger (a memory entry is cited as superseded during normal work).
**Who:** Org Designer.
**What:** Read memory entries older than 1 year for currency. If an entry is obsolete (framework version superseded, project deprecated, lesson contradicted by later evidence), mark with a `superseded by <ref>` note. **Do NOT delete** — institutional memory is permanent; superseded entries stay as historical record.

**Open question — supersession marker convention.** As of 2026-05-06, no codified convention exists for what `superseded by ...` looks like in memory files (incidents.md, lessons-learned.md, runtime-gotchas.md, etc.). The shape will be ratified by Org Designer at the first Cadence 5b run (no later than 2027-05-06). Until then, Cadence 5b dispatches MUST surface the convention question to user before applying any supersession markers — the first run of 5b is therefore a convention-ratification dispatch, not a routine sweep.

**Cost:** ~30 min agent time (after convention is ratified; ~60-90 min for the first run including ratification).
**Status:** First run due 2027-05-06 OR earlier on-trigger. Convention ratification is the first 5b dispatch's deliverable.

---

## Anti-patterns (what idle is NOT)

- **NOT a license to refactor.** Idle work observes, synthesizes, and promotes. It does not invent new features, restructure code, or "clean up" production surfaces without a backlog item authorizing it.
- **NOT speculative.** "While we're idle, let's think about feature X" is brainstorming masquerading as idle work — it's valid but it's a separate dispatch, not idle. Idle work operates on what already happened.
- **NOT continuous background.** Every cadence has a defined trigger and bounded output. There is no "always-on idle" — that would be cron, and cron is its own thing per the `schedule` skill.
- **NOT a way to bypass review.** Memory deltas from idle work still go through Critic adversarial review (the gap-audit IS a Critic pass). Promoting a "lesson" without Critic-screening creates memory bloat.
- **NOT a substitute for in-line writing.** When an agent learns something during live work, that lesson lands in memory in the same dispatch — atomic-cadence per `protocols/changelog-protocol.md`. Idle pattern extraction promotes lessons that DIDN'T get written down at the time, not lessons that should have been.

---

## Token-efficiency rules

1. **Bounded reading lists.** Every idle dispatch specifies what to read explicitly. "Read recent changes" is mis-scoped; "read CHANGELOG entries v0.4.7 → v0.6.0 + agent-changelog today's narrative + sealed sessions today" is correctly scoped.
2. **Deltas, never rewrites.** Memory files are append-only or surgical-delta. Full-file rewrites are anti-pattern unless the file's structure itself is being migrated (rare; Org Designer dispatch only).
3. **Cap review-notes files at ~15K.** Critic-notes files in `workspace/_global/` that exceed ~15K force a follow-up file (`<topic>-cont.md`). Keeps individual files reviewable.
4. **Quarterly archive sweep** moves resolved review-notes to `workspace/_global/_archive/` so the active workspace stays small.
5. **Parallel dispatches over sequential.** EA + Critic for EOD pattern extraction run in parallel — different lenses on the same primary signal — not as a chain.
6. **Adjacent-files footers** in memory files. Single-line per file pointing to peer-axis siblings. Makes cross-axis peer learning (Principle 2) discoverable from inside any one file.

---

## How idle work compounds toward "desirable output"

The user-stated goal: *"the company itself has a structure so robust and token efficient it makes the output desirable."*

Three feedback loops:

1. **Pattern extraction → faster future packets.** Today's webhook-ownership packet was the third instance of "parallel-session-aware decision-packet drafting." Promoted to `patterns.md` (today). Next packet author won't re-derive the discipline; they'll cite the pattern.
2. **Cross-axis peer learning → fewer recurring bugs.** UI/UX Reviewer's z-index finding crosses into runtime-gotchas (today). Future runtime triage will think to check UI-anti-patterns.md for analogous shape; future UI review will check runtime-gotchas.md for layout-primitive class issues.
3. **Memory hygiene → smaller dispatches.** When `lessons-learned.md` is empty, every Critic invocation has to derive lessons from CHANGELOG. When it's populated, Critic cites the file. Same applies for Architect, Strategist, Designer, Ops/Security, etc. Populated memory shrinks the dispatch payload required for any given task.

These compound. The output gets more desirable over time without the team getting larger or running longer. That's the goal.

---

## Cross-references

- Per-session-close template: `templates/session-close.md`
- Atomic-cadence rule: `protocols/changelog-protocol.md`
- Cross-session coordination: `protocols/session-coordination-protocol.md`
- Dispatch efficiency (token-efficiency baseline): `protocols/dispatch-efficiency.md`
- Verification before completion (applies to idle-promoted claims too): `protocols/verification-before-completion.md`
- Framework-contract discipline (monthly leakage audit — separate cadence, owned there not here): `protocols/framework-contract-discipline.md`
- Memory file index (Adjacent-files footer pattern): every `memory/*.md` file
- First-run evidence: `workspace/_global/patterns-2026-05-06.md` + `workspace/_global/memory-gap-audit-2026-05-06.md`
- PASS 2 review: `workspace/_global/critic-review-team-rhythm.md`

---

*This protocol is load-bearing for the *habit* — the team self-runs the cadence without per-instance approval. Any individual cadence's output is advisory: idle work cannot block production, but skipping the cadence systematically degrades the company's brain.*
