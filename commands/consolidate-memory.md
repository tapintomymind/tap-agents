---
name: consolidate-memory
description: "Reflective pass over your memory files — merge duplicates, fix stale facts, prune the index. Two modes: legacy in-place (default; preserves original Anthropic skill behavior) and --dream-pass (new; immutable-input / proposed-output pipeline per protocols/dream-pass.md)."
---

# Memory Consolidation — TapAgents extension

You're doing a reflective pass over what the team has learned across projects. The goal: future sessions orient quickly — what worked, what failed, what the user prefers, what the team agreed — without re-deriving.

This is the local TapAgents extension to the Anthropic `consolidate-memory` skill. It preserves the original skill's three-phase shape in **legacy mode** (default per BL-031 user Fork 3 = legacy stays default) and adds a **dream-pass mode** that reads memory immutably and writes a parallel `memory.next/` candidate-store for accept/discard via EA Decision Packet.

**Source proposal:** `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md` (BL-031; user-approved 2026-05-07 with fork-defaults).
**Protocol:** `protocols/dream-pass.md` (canonical; this command body implements it).

---

## Invocation forms

```
/consolidate-memory                                          # legacy in-place mode (default)
/consolidate-memory --dream-pass                             # dream-pass mode, default tier
/consolidate-memory --dream-pass --tier=default              # explicit default tier
/consolidate-memory --dream-pass --tier=stretch              # stretch tier — Phase 2+ ONLY (defensive guard rejects pre-Phase-2)
/consolidate-memory --dream-pass --tier=aggressive           # aggressive tier — Phase 3+ ONLY (defensive guard rejects pre-Phase-3)
/consolidate-memory --dream-pass --instructions="<prose>"    # natural-language curation guidance
/consolidate-memory --dream-pass --dry-run                   # produces memory.next/ but suppresses Decision Packet auto-surface
/consolidate-memory --legacy                                  # explicit legacy invocation (same as no flags)
```

**Mode resolution:** `--dream-pass` and `--legacy` are mutually exclusive. Default = legacy (per Fork 3). The scheduled-task entry (per `protocols/dream-pass.md §6`) explicitly invokes `--dream-pass` regardless of this default — the cadence work happens either way.

---

## Defensive preflight (any mode)

Before either mode runs:

1. **Active-store path.** Resolve `${MEMORY_ROOT:-memory}/` (default = `memory/`).
2. **Pending-candidate guard.** If `memory.next/` already exists, REFUSE to run with this message:
   > Pending dream-pass at `memory.next/`; resolve via EA Decision Packet (accept / edit-then-accept / discard / pause-cadence) before running another consolidation.

   Exit. Do nothing else. Never overwrite a pending candidate.
3. **Read protocol.** Read `protocols/dream-pass.md` if `--dream-pass`. Read this skill's Phase 1-3 sections if `--legacy` (or no flag).
4. **Tier-gate guard.** If `--tier=stretch` and `protocols/dream-pass.md` Phase 2 not active, REFUSE with: "Stretch tier gated on Phase 2 dogfood completion per protocols/dream-pass.md §9. Run --tier=default or wait for Phase 2 graduation." Same shape for `--tier=aggressive` / Phase 3.
5. **Forbidden-env-var guard.** If `MEMORY_ROOT` is set to `memory.next/`, REFUSE with: "MEMORY_ROOT=memory.next/ is forbidden per protocols/dream-pass.md §2. memory.next/ is a candidate-store the runtime explicitly does not read; setting MEMORY_ROOT to it defeats the safety property." Exit.

---

## Mode: legacy (default)

Preserves the original Anthropic `consolidate-memory` skill behavior. **In-place mutation** of the active memory store. Backward-compatible with existing ad-hoc invocations.

### Phase 1 — Take stock

- List the active memory directory (`${MEMORY_ROOT:-memory}/`).
- Read the index file if present. **TapAgents memory shape has NO top-level `MEMORY.md`** — the structure is a set of topic files (`agent-changelog.md`, `lessons-learned.md`, `patterns.md`, `runtime-gotchas.md`, `test-patterns.md`, `security-patterns.md`, `ui-anti-patterns.md`, `incidents.md`, etc.) per `memory/README.md`.
- Skim each topic file. Note overlaps, stale entries, thin sections.

### Phase 2 — Consolidate (in-place)

**Surface a warning to the user before mutating:**
> Legacy mode mutates `${MEMORY_ROOT:-memory}/` files in place. Per BL-031, prefer `--dream-pass` for any non-trivial consolidation — that mode produces a reviewable candidate-store before changes land. Continue legacy mode? [yes/no]

If user confirms, proceed:

- **Separate the durable from the dated.** Preferences, working style, recurring workflows = durable; specific projects, deadlines, one-off tasks = dated. Retire dated when work is done; fold lasting takeaways into durable.
- **Merge overlaps within each file.** Two entries describing the same pattern → combine into one with richer wording. **Do NOT merge across files** — axis discipline per `framework-contract-discipline.md §1` is load-bearing.
- **Fix time references.** "Next week" / "this quarter" / "by Friday" → absolute dates.
- **Drop easy-to-re-find facts.** Memory restating connected-tools data → cut.
- **Preserve provenance tags.** Every entry retains its `— from <source>, <date>` tag per `memory/README.md §"Provenance required"`. If consolidation can't preserve provenance for a merged entry, prefer keeping the source entries verbatim over a provenance-stripped merged entry.
- **Preserve public/private split.** `agent-changelog.md` (public-safe) ↔ `agent-changelog-private.md` (project narrative) NEVER merge.

### Phase 3 — Tidy the index (TapAgents shape: NO-OP)

Original Anthropic skill Phase 3 looks for a top-level `MEMORY.md` index file. **TapAgents memory has no such file.**

- If `${MEMORY_ROOT:-memory}/MEMORY.md` exists (other deployment context, e.g., user-personal-memory shape): proceed with original Phase 3 — keep index ≤200 lines / ~25 KB; one line per entry under ~150 chars (`- [Title](file.md) — one-line hook`); remove pointers to retired memories; shorten lines carrying detail belonging to topic file; add anything newly important.
- If `${MEMORY_ROOT:-memory}/MEMORY.md` does NOT exist (TapAgents canonical shape): emit one-line note "Phase 3 skipped: no top-level MEMORY.md index in this memory shape" and exit. **Do NOT auto-create `MEMORY.md`** — manufacturing a memory file the framework does not have is an axis-discipline violation per `framework-contract-discipline.md §1`. Do NOT crash.

Finish with a short summary: how many files touched and what changed.

---

## Mode: --dream-pass

**Per `protocols/dream-pass.md`** — immutable-input / proposed-output / accept-discard pipeline. Active `memory/` is NEVER mutated. Output goes to a parallel `memory.next/` directory that the runtime explicitly does not read.

### Inputs (per `--tier`)

- **`--tier=default`** (default): read `${MEMORY_ROOT:-memory}/*.md` + `workspace/_global/active-sessions.md` (sealed entries with completion-notes only) + `workspace/_global/portfolio.json`. Hard cap **350 KB** total.
- **`--tier=stretch`** (Phase 2+ only): default + recent session transcripts (last 14 days; per-transcript hard cap 50 KB; secret-redaction per protocol amendment). Hard cap 1.2 MB.
- **`--tier=aggressive`** (Phase 3+ only): stretch + `memory/incidents.md` + `workspace/_global/backlog.json` (closed items only) + `workspace/<slug>/critic-notes.md` (latest pass per project). Hard cap 2 MB.

**Pre-curation input cap enforcement.** Measure `wc -c` total of input files BEFORE any curation work. If > tier cap, REFUSE to run and surface to user: "Input scope <N> KB exceeds <tier> cap of <K> KB. Reduce tier OR run manual `--instructions='aggressive merge of >90-day entries'` to compress active store first."

### Outputs

Created under `memory.next/` (parallel to active `memory/`; never overwrites active store):

- `memory.next/<filename>.md` — per-file proposed output, 1:1 mapping `memory/<filename>.md` → `memory.next/<filename>.md`. **No cross-file merges.**
- `memory.next/_diff.md` — auto-generated unified diff summary; per-file lines added / lines removed; per-file change category (`shrink | no-op | expand`); each new line carries source-trace pointer or `[INVENTED?]` flag if not traceable to input.
- `memory.next/_instructions.md` — verbatim `--instructions` value if provided; empty file if not.
- `memory.next/_provenance.md` — input scope manifest, timestamp, model + version, tier, ingest list (which files at which sizes).

Active `memory/` is **UNCHANGED**. `memory.next/` is the only writeable destination.

### Algorithm

**Step 1 — Read input scope per tier.** Enforce input cap. Build the ingest manifest (file path → size).

**Step 2 — Apply consolidation discipline (general).** Per `protocols/dream-pass.md §5`:
- Separate durable from dated (preferences/style = durable; specific projects = dated)
- Merge overlaps **within each file** (axis-discipline preserves cross-file structure)
- Fix time references → absolute dates
- Drop easy-to-re-find facts
- Preserve every entry's provenance tag (`— from <source>, <date>`)

**Step 3 — Apply TapAgents-specific discipline.**
- **Axis discipline (per `framework-contract-discipline.md §1`).** Per-file iteration loop only. Cross-file merges are not addressable operations. Topic files stay separate at all times.
- **Provenance preservation.** Pre-write regex check on every line containing entry-shape (`- "..." — from <source>, <date>`). If a proposed-output entry is missing the provenance suffix, REJECT the entry and fall back to the source entry verbatim.
- **Public/private split.** `agent-changelog.md` and `agent-changelog-private.md` stay separate. Same for any other public/private pair.
- **agent-changelog.md special handling.** If file is >180 KB single-file size at input, prioritize curation here — most wins come from this file (currently ~134 KB / 48% of memory dir per protocol §4 sizing note).

**Step 4 — Write `memory.next/`.** Write helper rejects any path under `${MEMORY_ROOT:-memory}/` while in `--dream-pass` mode. Only `memory.next/` writes succeed.

**Step 5 — Generate `_diff.md`.** Unified diff per file with:
- Total lines added / removed
- Per-file change category: `shrink | no-op | expand`
- Source-trace pointer for every NEW line (which input-side entry it derives from)
- `[INVENTED?]` flag for any new line without a source-trace
- Summary line at top: human-readable one-sentence characterization of the proposal

**Step 6 — Generate `_provenance.md`.** Input manifest, instructions verbatim, model + version, timestamp, ingest tier name.

**Step 7 — No-op detection.** If `_diff.md` shows zero net changes across all files AND zero `[INVENTED?]` flags, write `memory.next/_outcome.md` with:
```
result: no-op
reason: no curation deltas surfaced
input_size_bytes: <total>
input_files: <count>
timestamp: <ISO>
```
Skip Decision Packet surfacing. EA briefing notes the cycle as no-op — counts toward 3-no-op cadence-relax tracker per protocol §6.

**Step 8 — Signal EA (unless `--dry-run`).** EA reads `memory.next/_diff.md` + `memory.next/_provenance.md`, assembles Decision Packet (≤400 words per `templates/decision-packet.md` shape, with surface format per `agents/executive-assistant.md` "Memory health" section).

**Step 9 — On accept.** Conductor or skill body executes:
```
mv memory/ memory.prev.<ISO-ts>/
mv memory.next/ memory/
```
(Use repo-relative paths; resolve `${MEMORY_ROOT:-memory}/` for the source side.) Filesystem-atomic. Write `memory.prev.<ts>/_outcome.md` recording: `result: accepted`, OD's recommendation, user's actual choice, accept-timestamp.

**Step 10 — On discard.** Execute `rm -rf memory.next/`. Write a discard log entry to `workspace/_global/dream-pass-log.md` (creates file on first discard if absent) with: timestamp, reason from Decision Packet response, OD's recommendation. Active `memory/` unchanged.

**Step 11 — On pause-cadence.** Conductor (or operator manually) updates the scheduled-tasks entry `enabled: false` via `mcp__scheduled-tasks__update_scheduled_task`. Manual on-demand `/consolidate-memory --dream-pass` still available.

### Anti-patterns (forbidden under --dream-pass)

Per `protocols/dream-pass.md §5`:

- ❌ Touching `memory/` directly. Write helper rejects under `--dream-pass` mode.
- ❌ Producing empty `memory.next/` silently. Step 7 enforces no-op detection + marker write.
- ❌ Merging files axis discipline keeps separate. Per-file iteration loop prevents the operation entirely.
- ❌ Dropping provenance tags. Step 3 pre-write regex check + fall-back-to-source.
- ❌ Inventing facts. Three-layer enforcement: skill-body annotation (`[INVENTED?]`), OD review, user accept-flow surfacing.

### Defense-in-depth for "inventing facts"

The model may rephrase entries; never introduce entries. Three layers per `protocols/dream-pass.md §5`:

1. **Skill body annotation.** `_diff.md` flags lines without source-trace as `[INVENTED?]`.
2. **OD review.** OD compares `_diff.md` claims against `_provenance.md` input manifest before EA Decision Packet. Recommends discard if untraceable entries surface.
3. **User accept-flow.** Any `[INVENTED?]` flag surfaces in EA Decision Packet for explicit user attention.

Patterned on `protocols/destructive-data-ops.md` defense-in-depth shape.

---

## Output to user (any mode)

End with a short summary:
- **Legacy mode:** files touched (count), what changed (one-line per file), Phase 3 status (executed / skipped no-MEMORY.md / executed-with-no-changes)
- **Dream-pass mode:** files in `memory.next/` (count), `_diff.md` summary line, `[INVENTED?]` flag count, `_provenance.md` location, next step ("EA Decision Packet to follow" or "Decision Packet suppressed per --dry-run")

---

## Cross-references

- `protocols/dream-pass.md` (canonical pipeline contract)
- `agents/org-designer.md` "Dream-pass cadence + review" authority
- `agents/executive-assistant.md` "Memory health" surface format
- `framework-contract-discipline.md §1` (axis discipline; load-bearing)
- `memory/README.md §"Provenance required"`, §"Configurable Path"
- `protocols/destructive-data-ops.md` (defense-in-depth pattern source)
- BL-031: `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md`
- BL-031 EA Decision Packet (user approval): `workspace/_global/decision-packets/20260507-bl-031-dream-pass.md`
- Anthropic source pattern: claude.com/docs Managed Agents `dreams` (May 2026 preview, beta header `dreaming-2026-04-21`) — primary URL deferred per OD followup-list

---

## Why this command body lives here, not in `~/Library/.../skills-plugin/`

The Anthropic `consolidate-memory` skill (at `~/Library/Application Support/Claude/.../skills/consolidate-memory/SKILL.md`) is a 35-line in-place mutator targeting user-personal-memory shape (top-level `MEMORY.md` + topic files). TapAgents memory has a different shape (no top-level index; structured topic-file set; public/private split; provenance discipline). This local command body **extends** the Anthropic skill rather than displacing it: legacy mode preserves backward-compat with the original behavior (with TapAgents-shape Phase 3 no-op handling); dream-pass mode adds the immutable-input pipeline atop the same invocation surface.

Future contributors who fork TapAgents inherit this body; the original Anthropic skill remains untouched on user's machine.
