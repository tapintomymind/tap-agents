# Knowledge Base — <project-slug>

**Last curated:** <ISO timestamp>
**Curated by:** knowledge-curator (auto-sweep <YYYY-MM-DD> + phase-transition <phase>)

<!--
This file is owned by `knowledge-curator` (see `agents/_planned/knowledge-curator.md`).
It holds user-narrative-grade context for cold-resume — NOT mechanical state (state.json),
NOT work-units (backlog.md), NOT status events (reportback.md).
Triage rubric: "would the user want this recalled in 3 months?" — same rubric as the
operator-level MEMORY.md auto-memory.
Bias toward merge-and-prune over append. Terse entries. Cite source artifact for every
non-trivial claim with the same provenance discipline as memory/lessons-learned.md.
Never delete; supersede with `[superseded YYYY-MM-DD on user direction]` when needed.
-->

---

## Goals — why this project exists

<!--
Bulleted list of user-stated goals. Each line cites source (seed.md line ref,
decision-packet path, or conversation-log line ref). Terse.
When the user re-states goals in conversation, the OLD goal stays with a struck-through
render + the date superseded. Preserve trajectory; don't erase it. Cold-resume readers
need to see the evolution, not just the endpoint.
-->

- <goal 1> — source: `<artifact>:<line>`
- <goal 2> — source: `<artifact>:<line>`

---

## Decisions made — with rationale

<!--
Chronological list. Format:
- <YYYY-MM-DD> · <one-line decision> — rationale: <one-line why> — source: `decision-packets/<file>`

Includes BOTH:
  (a) Decision-Packet hard decisions (the canonical case)
  (b) Inline user statements that have decision-weight (verbatim where load-bearing)

The user's verbatim choice IS the rationale. Capturing it at decision-time preserves the
language that was load-bearing for the choice. If the rationale is "we picked B over A
because of constraint X," the constraint cite belongs in the rationale line.
-->

- <YYYY-MM-DD> · <decision> — rationale: <why> — source: `<path>`

---

## Stakeholders, constraints, deadlines

<!--
Anyone the user has NAMED — partners, regulators, advisors, downstream consumers,
collaborators. Stakeholder name + relationship + commitment (if any) + source cite.

Constraints — budget, time, platform, compliance, technology — that the user has STATED
(not inferred by agents). One line each with source cite.

Deadlines — user-stated time pressure (launch dates, demo dates, contractual deadlines).
One line each with source cite.
-->

**Stakeholders:**
- <name> — <relationship> — source: `<artifact>:<line>`

**Constraints:**
- <constraint> — source: `<artifact>:<line>`

**Deadlines:**
- <date or window> — <what's due> — source: `<artifact>:<line>`

---

## Glossary

<!--
Project-introduced terms with one-sentence definitions. The cold-resume reader (or a new
collaborator, or the product UI rendering this file) needs to know what "tapagents" means
without re-deriving it from operator memory.

Example shape:
- **tapagents** — the brand on tapagents.ai (live + directed), covering both the dashboard
  product (formerly "TapHQ") and the TapAgents framework npm package. Source: operator note
  2026-05-12 brand consolidation.
- **"sweep-in pattern"** — when an internal-source change gets bundled into a public-source
  release without separate attribution. Source: `project_v0120_sync_sweep_in.md`.

Add new terms as they appear with load-bearing weight in conversation. Prune terms that
turn out to be one-shot.
-->

- **<term>** — <definition>. Source: `<artifact>:<line>`

---

## Story so far

<!--
3-7 sentence narrative for cold-resume. The "if you read nothing else, read this" paragraph.
Curator REWRITES this section on EVERY phase transition. Append-only does NOT apply here —
the whole point is to maintain a single coherent paragraph that's CURRENT.
Daily sweep does NOT rewrite this section (only phase-transition trigger does) — this
avoids the "churn without value" failure mode codified in OD proposal §3.2 Risk 2.

The paragraph answers: where is this project today, what's been decided that's load-bearing
for what's next, and what's the current open question. Read it as the chapter title for
the current phase.
-->

<3-7 sentence paragraph here, rewritten each phase transition.>

---

## Parked / unresolved

<!--
Items the user mentioned but didn't decide yet. Pulls from `parked-thoughts.md` after
triage — only NARRATIVE-LEVEL items belong here (not work-unit items; those go to
backlog.md, owned by Backlog Curator).

The distinction: a parked thought like "I want a knowledge base feature" is narrative-level
until it becomes a decision (then it moves to "Decisions made") or a work-item (then it
moves to backlog.md). A parked thought like "let's add a button on the dashboard" is
work-unit-level — Backlog Curator's lane, not this section.

When a parked item resolves (decision or work-item), move it to the appropriate section
or remove it (with rationale comment if non-obvious).
-->

- <parked item> — source: `parked-thoughts.md:<line>` — status: unresolved
