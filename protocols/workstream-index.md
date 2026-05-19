# Workstream Index Protocol

**Version: 1.0 (introduced 2026-05-18 via framework-feedback-2026-05-18 Phase A.1)**

Defines a Conductor-owned reader-oriented index that appears at `workspace/<slug>/workstream-index.md` once a workstream produces ≥3 artifacts inside a single project. The index is the entry point a future agent (or cold-resumed session) reads to recover: which artifact is canonical, which order to read, which decisions are open, which workstreams compose. Replaces the implicit "grep across 6 files" recovery cost with a one-read cost.

## §1. Pattern in one sentence

When a workstream produces ≥3 artifacts under a single project's workspace directory (`workspace/<slug>/*.md` plus any subdirectory output), Conductor emits or rebuilds `workspace/<slug>/workstream-index.md` as an idempotent reader-oriented map. The index is regenerated (not diff-patched) on workstream entry, workstream exit, and on dispatch when the artifact count just crossed the threshold. Backlog Curator's daily sweep verifies index ↔ filesystem parity and flags drift to `workspace/_global/backlog-curator-notes.md` for human review.

## §2. When this fires

The threshold rule:

| Condition | Action |
|---|---|
| Workstream produces its 3rd artifact in a single project | Conductor emits `workstream-index.md` (creates the file if first workstream in the project) |
| Active workstream produces a new artifact (4th+, or a revision to an existing artifact) | Conductor rebuilds the entry for that workstream |
| Conductor enters a workstream (first agent dispatched under the workstream tag) | Rebuild check — if file exists, refresh status + reading order |
| Conductor exits a workstream (status flips to `complete` / `shipped` / `superseded`) | Rebuild check — final status reflected in the index |
| Backlog Curator daily sweep detects index ↔ filesystem drift | Flag-tag `WORKSTREAM-INDEX-DRIFT-CANDIDATE` appended to `workspace/_global/backlog-curator-notes.md` (Curator does NOT rewrite the index — surfaces for human review) |

**Why ≥3 artifacts** (per `framework-feedback-2026-05-18.md §2 paragraph "Alternative considered"`): lower threshold and every project gets an index of trivial size; higher threshold and the index never fires when it's needed. 3 is the empirical floor where the "grep across N files to recover the context" cost starts exceeding "one read of an index."

**Where artifacts count toward threshold:**

- `workspace/<slug>/*.md` — every Markdown artifact at the workspace root (PRDs, scopes, tech-strategies, addenda, design specs, decision packets, research artifacts).
- `workspace/<slug>/*/` — any subdirectory output (e.g., `competitor-deep-dives/`, `features/`, `consistency-reports/`).
- Updates to `state.json.<workstream-name>` blocks count as a single artifact (the JSON block, not the individual fields).

**What does NOT count:**

- `transition-log.md`, `routing-log.md`, `dissent-log.md`, `critic-notes.md` — process logs, not workstream content.
- `seed.md`, `intake-brief.md` — pre-workstream foundations.
- Files outside the project workspace (`docs/`, `tap-agents/`, etc. — those have their own indexing surfaces).

## §3. File location and naming

Single file per project at:

```
workspace/<slug>/workstream-index.md
```

One file per project, multiple workstreams within. Format spec in §4 supports the multi-workstream shape.

The file is git-tracked (project audit trail) and `[WIP]`-free (Conductor's rebuild is deterministic — there is no draft state). Conductor's existing append-only write discipline does NOT apply to this file — it is rebuild-in-place (idempotent regeneration is the contract per §5).

## §4. Format spec

Verbatim per `framework-feedback-2026-05-18.md §2 paragraph "Format"`:

```markdown
# Workstream index — <slug>

## Workstreams active in this project

### <workstream-name> (e.g., competitive-positioning)
- Kicked off: <ISO date>
- Trigger: <one line>
- Status: <phase>
- Entry point: <relative path>
- Reading order:
  1. <path> — <one-line purpose>
  2. <path> — <one-line purpose>
  ...
- Open decisions: <list of OQ IDs + status>
- Composes with: <other workstream names>

### <next workstream>
...
```

**Field semantics:**

- **Workstream name** — e.g., `competitive-positioning`, `robustness-pass`, `mvp-scaffold`. Conductor reads from `state.json.<workstream-name>` blocks or from artifact filename conventions (e.g., `competitive-analysis-2026-05-18.md` belongs to the `competitive-positioning` workstream).
- **Kicked off** — ISO date when the first workstream artifact landed.
- **Trigger** — one-line reason the workstream started (e.g., "User-requested competitive scan vs. Competitor A + Competitor B").
- **Status** — `active | complete | shipped | superseded | paused | abandoned`. Sourced from `state.json.<workstream-name>.status` if present; otherwise from Conductor's transition-log inference.
- **Entry point** — relative path to the artifact a future agent should read FIRST to orient. Usually the most canonical / most-current artifact (e.g., the latest PRD addendum, not the original analysis).
- **Reading order** — numbered list of artifacts in the order a reader should consume to recover full context. Each entry: `<relative path> — <one-line purpose>`. Honor the dependency order (research → strategist addendum → architect packet → scope fold-in). NOT alphabetical.
- **Open decisions** — bulleted list of OQ IDs from any artifact in the workstream, each annotated with status (`PENDING | RESOLVED | ESCALATED | DEFERRED`) per `protocols/decision-class-taxonomy.md` §5. Cross-references the canonical OQ source.
- **Composes with** — list of other workstream names this one depends on, supplements, or feeds into. Bidirectional (each side names the other).

**Idempotency rule:** Conductor regenerates the entire file from current state on every fire. There is no "diff and patch" mode; the file IS the rebuild output. This eliminates a class of drift where partial updates leave stale fields.

## §5. Rebuild algorithm (Conductor)

On each fire (per §2 triggers):

1. **List artifacts.** `find workspace/<slug>/ -maxdepth 3 -name "*.md" -not -name "transition-log.md" -not -name "routing-log.md" -not -name "dissent-log.md" -not -name "critic-notes.md" -not -name "seed.md" -not -name "intake-brief.md" -not -name "workstream-index.md"` plus any subdirectories.
2. **Group by workstream.** Read `state.json` for `<workstream-name>` block keys + filename conventions. Map each artifact to a workstream (default: `general` if no workstream-specific tag).
3. **For each workstream with ≥3 artifacts:** build the entry per §4 format.
4. **Order reading by dependency.** Research input → Strategist artifact → Architect artifact → scope fold-in → Decision Packet. Honor the producer chain.
5. **Pull open decisions.** For each workstream's artifacts, scan for OQ entries (Markdown `### OQ-<id>:` headings per `protocols/decision-class-taxonomy.md` §4 schema). List each with status.
6. **Identify compositions.** Read `state.json.<workstream-name>.composes_with` if present; otherwise infer from cross-citations in artifacts (e.g., `competitive-positioning` cites `robustness-pass` Phase B gate → record bidirectional).
7. **Write the file.** Replace the existing `workspace/<slug>/workstream-index.md` in its entirety. No append; no in-place edit.
8. **Log rebuild.** Append one line to `transition-log.md`: `[soft] workstream-index rebuilt (<slug>) — <N> workstreams, <M> artifacts.`

The rebuild is mechanical; if it produces a different output than the prior file, the file changes — that IS the drift signal. Backlog Curator's sweep (§6) catches the case where Conductor missed a rebuild fire.

## §6. Backlog Curator drift sweep

**[FUTURE — Phase B Backlog Curator extension]**

Curator's daily sweep (per `agents/backlog-curator.md` Cadence "Daily sweep") gains an additional check:

For each `workspace/<slug>/workstream-index.md`:
1. Walk the project's artifact filesystem per §5 step 1.
2. Compare the artifact set against the index's "Reading order" entries.
3. If filesystem has ≥1 artifact not listed in the index, OR the index lists ≥1 artifact missing from filesystem → flag.
4. Append finding to `workspace/_global/backlog-curator-notes.md` under tag `WORKSTREAM-INDEX-DRIFT-CANDIDATE` per Curator's existing flag-tag pattern (mirrors `STATUS-DRIFT-CANDIDATE` / `STALENESS-CANDIDATE`):

```
─────────────────────────────────────────────
<YYYY-MM-DD HH:MM>
Tag: WORKSTREAM-INDEX-DRIFT-CANDIDATE
Project: <slug>
Index path: workspace/<slug>/workstream-index.md
Drift: <one-line — e.g., "Filesystem has 7 artifacts; index lists 6 (missing: <path>)" OR "Index lists artifact at <path> that no longer exists">
Suggested action: Conductor rebuild on next dispatch
─────────────────────────────────────────────
```

Curator does NOT rewrite the index — surfaces for human review. The Curator-extension itself is part of the **Phase B bundle** combining Item 2 (this sweep) + Item 4 (state.json git-evidence reconciliation) into one Curator prompt-version bump per `framework-feedback-2026-05-18-triage.md` "Phase B" sequence. The sweep clause is the SPEC here; the Curator-side implementation lands in Phase B.

## §7. EA optional read

**[OPTIONAL — Phase A]**

EA may cite the workstream-index when surfacing project status in `/briefing`, `/status`, `/queue`. Specifically:

- In ACTIVE PROJECTS section, when a project has a non-empty `workspace/<slug>/workstream-index.md`, EA may include a one-line "Active workstreams: <names>" under the project's brief.
- In Decision Packets that reference an artifact from a multi-artifact workstream, EA may include `▸ READING ORDER` citing the index's per-workstream Reading order.

Not required for Phase A. EA's existing reading list does NOT change in Phase A.1 — this is a forward-reference for Phase B / Phase C as the index proves out. The triage scope explicitly defers EA contract changes to Phase B per `framework-feedback-2026-05-18-triage.md` Phase B/D sequencing.

## §8. Worked example — competitive-positioning workstream

Using the artifacts a representative competitive-positioning workstream might produce (≥3 load-bearing artifacts across research input, Strategist addendum, Architect fold-ins, and Decision Packet), the index would render as:

```markdown
# Workstream index — <project>

## Workstreams active in this project

### competitive-positioning
- Kicked off: <ISO date>
- Trigger: User-requested competitive scan vs. Competitor A + Competitor B
- Status: active (Phase A dispatched; Phase B gated on robustness-pass merge)
- Entry point: workspace/<project>/competitive-positioning-<ISO-date>.md
- Reading order:
  1. workspace/<project>/competitive-analysis-<ISO-date>.md — research input; profiled Competitor A + Competitor B; mentioned Competitor C, Competitor D, Competitor E, Competitor F, Competitor G
  2. workspace/<project>/competitive-positioning-<ISO-date>.md — Strategist addendum; supplements prd.md rev N §2/§6/§7/§8/§11 (NOT a rewrite — addendum-vs-revision classification per protocols/prd-addendum-pattern.md §3)
  3. workspace/<project>/scope.md rev N+1 §6 — Architect milestone fold-in (quick-wins seeded)
  4. workspace/<project>/tech-strategy.md rev N+1 §11 — Architect V-1/V-4 architecture-now anchors (per protocols/v2-roadmap-anchoring.md)
  5. workspace/<project>/decision-packet-competitive-positioning-<ISO-date>.md — Architect Decision Packet (Phase A dispatch; Phase B gated)
  6. docs/marketing/<regulatory-or-market-context-doc>.md — PMM background-dispatched output for a related market-context milestone
- Open decisions:
  - OQ-CP1 (commercial, ESCALATED — pricing tier numbers TBD by C-level; engineering ships "Contact us for pricing" workaround per protocols/decision-class-taxonomy.md §8 Example 1)
  - OQ-CP3 (strategic, PENDING — operator owns first N design partners; contractor evaluated after)
  - R-CP1..R-CP6 (risk-tracking, ongoing — competitor moves to watch monthly)
- Composes with: robustness-pass (Phase B gates on its merge); industry-researcher activation (per industry-researcher activation criteria)

### robustness-pass
- Kicked off: <ISO date>
- Trigger: <to be filled by Conductor from state.json>
- Status: in-progress (illustrative: if a session detects state.json drift — claimed in-progress but no worktree/branch on disk — Curator flags as STATE-DRIFT-CANDIDATE per backlog-curator sweep)
- Entry point: <canonical artifact path>
- Reading order: <Conductor populates>
- Open decisions: <Conductor populates>
- Composes with: competitive-positioning (Phase B gate dependency)
```

This rendering is **illustrative** — the example shows the shape; an actual rebuild against a real project workspace produces the live content. Competitor names above are placeholders (`Competitor A`..`Competitor G`); a live index uses the real product names from the project's competitive-analysis artifact.

## §9. Forbidden behaviors

- ❌ Conductor writing a partial / append-style update to `workstream-index.md`. The file is rebuild-only.
- ❌ Curator rewriting the index. Curator flags drift; Conductor rebuilds.
- ❌ Surfacing index changes as their own Decision Packet — rebuilds are soft transitions, logged in transition-log.
- ❌ Counting `transition-log.md` / `routing-log.md` / `dissent-log.md` / `critic-notes.md` / `seed.md` / `intake-brief.md` toward the ≥3 threshold.
- ❌ Index without `Open decisions:` field listing OQ IDs by class status (per `protocols/decision-class-taxonomy.md` §5 cross-cite).

## §10. Forward references — Phase B

- **Backlog Curator extension** (per §6) — bundled with Item 4 (state.json git-evidence reconciliation) into one Curator prompt-version bump per `framework-feedback-2026-05-18-triage.md` Phase B sequencing.
- **EA contract update** (per §7) — optional read of the index in `/briefing` and Decision Packets; deferred to Phase B per Phase A.1 scope.

## §11. Composes with

- `agents/conductor.md` — owner of the rebuild responsibility; trigger points listed in §2.
- `agents/backlog-curator.md` — drift-sweep extension per §6 (Phase B).
- `agents/executive-assistant.md` — optional surface citation per §7 (Phase B).
- `protocols/decision-class-taxonomy.md` — `Open decisions:` field cites OQ IDs by class status.
- `protocols/state-machine.md` — workstream tags live in state.json blocks Conductor reads.
- `protocols/checkpoint-protocol.md` — Decision Packets that reference multi-artifact workstreams compose with the index's Reading order.
