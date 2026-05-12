# Dream-Pass — Immutable-Input / Proposed-Output Memory Curation

**Status:** Phase 1 LANDED. Phase 2 (4-week dogfood observation window) gates Phase 3 promotion.

**Source proposal:** `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md` (BL-031; user-approved 2026-05-07 with fork-defaults: Fork 1 weekly Sunday 23:00 UTC + 3-no-op-relax; Fork 2 default-tier memory + sealed-sessions + portfolio @ 350KB cap; Fork 3 legacy in-place stays default).

**Owner:** Org Designer (cadence + review). Skill body owned by `commands/consolidate-memory.md`. EA owns Decision Packet surface.

**Pattern source:** Anthropic Managed Agents `dreams` feature (May 2026 announcement, Research Preview gated behind beta header `dreaming-2026-04-21`). Local adaptation; the immutable-input + proposed-output + atomic-accept properties transfer cleanly because they are file-layout discipline, not API runtime — TapAgents stays local, file-based, Conductor-routed, user-in-loop. `[user: orchestrator-supplied framing from May 2026 Managed Agents announcement; primary URL claude.com/docs Dreams page — to be captured at next protocol revision pass per BL-025/BL-026 precedent]`.

**Industry portability:** dream-pass discipline is artifact-shape-agnostic. A marketing-campaign memory store or documentary-curation memory store has the same staleness risk; the protocol generalizes per `~/.claude/projects/.../memory/project_team_industry_portability.md`. Validation explicitly deferred to first non-app-dev project per `framework-contract-discipline.md §3` "current-stack-only" annotation pattern (BL-025 precedent).

---

## §1. Pattern in one sentence

A dream-pass reads the active memory store **immutably**, writes a parallel `memory.next/` directory of proposed curation output, and surfaces accept/discard via EA Decision Packet. The active store is **never** mutated by the pass — only the user's accept action atomically replaces it. Bad-curation output is discarded with zero data loss.

---

## §2. Immutable input invariant (load-bearing)

The dream-pass pipeline is read-many-write-new, never read-one-mutate-in-place.

**Inputs.** Per ingest tier (§4), the skill body reads files under the active memory directory (`${MEMORY_ROOT:-memory}/*.md`) plus an explicit ingest manifest. Inputs are **read-only** for the duration of the pass. The skill body's write helper rejects any write path under the active memory directory while running in `--dream-pass` mode — only `memory.next/` writes succeed.

**Output destination.** A parallel `memory.next/` directory tree. One file per active memory file (1:1 mapping `memory/<file>.md` → `memory.next/<file>.md`), plus three internal metadata files (`_diff.md`, `_instructions.md`, `_provenance.md` — see §3).

**Crucial framing — `memory.next/` is NOT a `MEMORY_ROOT` instance.** The configurable `${MEMORY_ROOT:-memory}` mechanism (per `memory/README.md §"Configurable Path"`) exists for *active-store relocation* — switching which directory the runtime reads. `memory.next/` is the *opposite* shape: a candidate-store the runtime **explicitly does not read**. Setting `MEMORY_ROOT=memory.next/` is **forbidden by this protocol** and would defeat the safety property by promoting a candidate to active without user accept. Agents continue to read from `${MEMORY_ROOT:-memory}/` exclusively at all times.

**Why the invariant matters.** Curation aggressive enough to be useful (merging duplicates, dropping stale entries, restructuring) carries non-zero risk of dropping a load-bearing entry. Without immutable-input discipline, a wrong curation pass is a partial data loss event. With it, a wrong pass is a discardable artifact at `memory.next/` and the active store stays exactly where it was.

---

## §3. File layout convention

```
memory/                       # active store (agents read this; ${MEMORY_ROOT:-memory})
├── lessons-learned.md
├── patterns.md
├── runtime-gotchas.md
├── ...

memory.next/                  # candidate store (created by dream-pass; gitignored; runtime NEVER reads)
├── lessons-learned.md
├── patterns.md
├── ...
├── _diff.md                  # auto-generated unified diff summary; what changed vs. memory/
├── _instructions.md          # verbatim --instructions value driving this pass (empty if not provided)
└── _provenance.md            # input scope manifest, timestamp, model, tier, ingest list

memory.prev.<ISO-ts>/         # archive (created on accept; gitignored; pruned at 90 days)
└── ...                       # immutable snapshot of pre-accept memory/
```

### Internal metadata files

- **`_diff.md`** — unified diff summary per file (lines added / lines removed / change category: `shrink | no-op | expand`). Each new line in `memory.next/<file>.md` carries a "source-trace" pointer indicating which input-side entry the new line derives from; lines without a source-trace are flagged `[INVENTED?]` for OD review (§5) + Decision Packet surfacing.
- **`_instructions.md`** — verbatim `--instructions` natural-language guidance that drove this pass (e.g., `aggressive prune of P3 items older than 60 days`). Empty if not provided.
- **`_provenance.md`** — input scope manifest (which files, which sizes, which tier), instructions verbatim, model + version, timestamp, ingest tier name.

### Atomic accept-flow

```
mv memory/ memory.prev.<ts>/ && mv memory.next/ memory/
```

Filesystem-atomic at modern POSIX-compliant systems. Active `memory/` is exactly the user-accepted store at every moment.

### Discard flow

```
rm -rf memory.next/
```

Active store unchanged. Discard is logged to a dream-pass log (per §6) for cadence calibration.

### Two-layer rollback surface

- **Fast rollback (90-day window):** `mv memory/ memory.discard.<ts>/ && mv memory.prev.<ts>/ memory/` — one filesystem op, recovery minutes.
- **Indefinite rollback (git history):** `git log -- memory/<file>.md` and `git diff <commit-sha> -- memory/<file>.md`. Slow-decay defects discovered >90 days post-accept (after archive prune) are recoverable via git surgery. The 90-day archive is fast-rollback convenience; git history is last-line-of-defense.

---

## §4. Tier'd ingest scope

Three rollout tiers; staggered per OD proposal §4 phase-gating. Phase 1 enables default tier only.

| Tier | Phase | Inputs | Hard cap |
|---|---|---|---|
| **default** | Phase 1+ | `memory/*.md` + `workspace/_global/active-sessions.md` (sealed entries + completion-notes) + `workspace/_global/portfolio.json` | 350 KB total |
| **stretch** | Phase 2+ (gated) | default + recent session transcripts (last 14 days; per-transcript hard cap 50 KB) | 1.2 MB total |
| **aggressive** | Phase 3+ (gated) | stretch + `memory/incidents.md` + `workspace/_global/backlog.json` (closed items) + `workspace/<slug>/critic-notes.md` (latest pass per project) | 2 MB total |

**Default-tier sizing rationale.** Empirical measurement at proposal time: `wc -c memory/*.md` total = 278502 bytes (~272 KB). The 350 KB cap holds 25% headroom over current volume. If memory grows past 350 KB before scheduled cadence catches up, OD invokes manual `/consolidate-memory --dream-pass --tier=default --instructions="aggressive merge of >90-day entries"` to compress via curation rather than raising the cap.

**`agent-changelog.md` special handling.** As of 2026-05-07: 134 KB on its own — half the default-tier input by volume. Two consequences:
1. Curation discipline focuses heavily on this file (it's where the most wins are).
2. The cap-headroom (78 KB) is mostly headroom on the *other* memory files.

If `agent-changelog.md` grows past ~180 KB single-file (>50% of cap), it gets first-priority curation in the next dream-pass cycle and a strict-merge-instruction is generated by OD. Per-file size delta tracked via `_provenance.md`.

**Forbidden at default tier:**
- Recent transcripts (Phase 2+ — secret-redaction discipline not yet codified)
- `workspace/<slug>/` raw artifacts (Phase 2+ — re-mining project-specific context risks project-leakage into framework memory per `framework-contract-discipline.md §1`)
- `memory/incidents.md` (Phase 3+ — already consolidated by author at writing-time; re-curation risk)
- `workspace/_global/backlog.json` raw (Phase 3+ — high-volume + noisy; cross-references useful but defer until trust earned)

---

## §5. Curation discipline (hard rules, not heuristics)

### Anti-patterns (forbidden under `--dream-pass`)

1. **Touching `memory/` directly.** Skill body's write helper rejects any path under the active memory directory in `--dream-pass` mode. Only `memory.next/` writes succeed.
2. **Producing empty `memory.next/` silently.** If `_diff.md` shows zero net changes, skill writes `memory.next/_outcome.md` with `result: no-op` marker and surfaces no Decision Packet.
3. **Merging files the axis discipline keeps separate.** Skill body iterates per-file (1:1 mapping `memory/<file>.md` → `memory.next/<file>.md`); cross-file merges are not even an addressable operation in the body's loop. Per `framework-contract-discipline.md §1`: never merge `lessons-learned.md` into `patterns.md`; never merge `runtime-gotchas.md` into `lessons-learned.md`; never merge `agent-changelog.md` (public-safe) into `agent-changelog-private.md` (project-narrative); the axis structure is load-bearing.
4. **Dropping provenance tags during consolidation.** Per `memory/README.md §"Provenance required"`: every entry in proposed output retains its `— from <source>, <date>` tag. Skill body's pre-write validation runs a regex check on every line containing entry-shape; if a proposed-output entry is missing the provenance suffix, the entry is rejected and the source entry is preserved verbatim.
5. **Inventing facts not present in input scope.** The model can REPHRASE entries; not INTRODUCE entries.

### Defense-in-depth for "inventing facts"

This anti-pattern is model-discipline, not code-structural. Three-layer enforcement (patterned on `protocols/destructive-data-ops.md`):

- **(a) Skill-body annotation.** `_diff.md` generation includes for each new line in `memory.next/<file>.md` a "source-trace" pointer indicating which input-side entry the new line derives from. Lines without a source-trace are flagged `[INVENTED?]`.
- **(b) OD diff review.** OD compares `_diff.md` claims against `_provenance.md` input manifest before EA Decision Packet. If diff contains entries not traceable to input, OD recommends discard.
- **(c) User accept-flow.** Any `[INVENTED?]` flag in `_diff.md` surfaces in the EA Decision Packet for explicit user attention.

The cost is `_diff.md` is more verbose; the benefit is hallucination-defense without requiring a perfect first-pass model.

### Curation discipline summary (skill body MUST honor)

1. **Separate the durable from the dated.** Preferences, working style, recurring workflows = durable; specific projects, deadlines, one-off tasks = dated. Retire dated when work is done; fold lasting takeaways into durable.
2. **Merge overlaps within file.** Two entries describing the same pattern → combine into one with richer wording.
3. **Fix time references.** Convert "next week" / "this quarter" / "by Friday" to absolute dates.
4. **Drop easy-to-re-find facts.** If memory restates something pullable from connected tools, cut it. Keep what's hard to re-derive.
5. **Preserve axis discipline.** Per anti-pattern 3 above. Topic files stay separate.
6. **Preserve public/private split.** `agent-changelog.md` (public-safe) and `agent-changelog-private.md` (project narrative) stay separate. Same for any other public/private pair.
7. **Preserve provenance.** Per anti-pattern 4. Every entry retains source + date.

---

## §6. Cadence

### Default cadence

**Weekly Sunday 23:00 UTC** — fired at the local-time equivalent for the user's timezone, since `mcp__scheduled-tasks__create_scheduled_task` evaluates cron expressions in the user's local timezone (not UTC).

**Implementation as of Phase 1 land:**
- User timezone: EDT (UTC-4) per system clock at landing time (2026-05-06).
- Sunday 23:00 UTC = Sunday 19:00 EDT.
- Cron registered: `0 19 * * 0` (Sunday 19:00 EDT). Re-register if user timezone changes.
- The scheduled-tasks MCP applies a small deterministic delay of several minutes at dispatch time to balance server load.

**Intent (load-bearing rationale).** A low-attention slot at end of week — Decision Packet surfaces in Monday's first EA briefing as a natural review point. EDT Sunday 19:00 is Sunday evening for the user, hitting the same "end-of-week wind-down" intent the proposal's UTC framing was selecting for. If the user travels across timezones, the cron should be re-registered against the destination local time to preserve the intent.

### Self-tuning relax-trigger

If 3 consecutive scheduled cycles produce zero accepted changes (no-op / discarded outright), cadence relaxes from weekly to bi-weekly automatically via `mcp__scheduled-tasks__update_scheduled_task` (`cronExpression` updated to bi-weekly Sunday). If 3 consecutive bi-weekly cycles produce zero acceptance, relaxes further to monthly. Patterned on `framework-contract-discipline.md §4` cadence-relax-trigger. Observable, not subjective.

The relax-trigger is a self-tuning rule. The user always retains override (skip-cadence-this-week + manual force-this-week are both Decision Packet forks).

### Manual on-demand

Always available regardless of schedule:
```
/consolidate-memory --dream-pass [--tier=default|stretch|aggressive] [--instructions="<prose>"] [--dry-run]
```

`--dry-run` produces `memory.next/` but suppresses the Decision Packet auto-surface; useful for OD inspecting a candidate before EA shows the user.

### Event-driven trigger (Phase 3+ stretch)

Heuristic-laden ("after N retros / N unconsolidated entries / what's N?"); deferred until manual + scheduled cadence yields enough data to calibrate threshold. Out of scope for Phase 1.

---

## §7. Decision Packet integration

### Surface format (EA reads `memory.next/_diff.md` + `memory.next/_provenance.md`)

EA assembles a Decision Packet (≤400 words per `templates/decision-packet.md`) on dream-pass completion. Surface includes:

- Dream-pass produced N file changes (+M lines / −K lines, breakdown from `_diff.md`)
- OD recommendation (approve / approve-with-edits / discard / pause-cadence)
- One-line characterization of the proposal (taken from `_diff.md` "Summary" line)
- Any `[INVENTED?]` flags surfaced verbatim
- Decision fork: `accept-as-proposed | edit-then-accept | discard | pause-cadence`

OD always defers to user; OD's annotation is the *recommendation*, not the decision.

### User accept

EA logs accept verbatim to dream-pass log + `ea-decisions-queue.md`. Conductor (or the skill body if Conductor not in flight) executes atomic mv per §3 accept-flow. `memory.prev.<ts>/_outcome.md` records `result: accepted`, OD's recommendation, user's actual choice, accept-timestamp.

### User discard

Conductor (or skill body) executes `rm -rf memory.next/`. Discard log entry written to `workspace/_global/dream-pass-log.md` (creates file on first discard if absent; lives outside `${MEMORY_ROOT:-memory}/` to keep the active store free of dream-pass operational metadata; the log is also where no-op cycles increment the cadence-relax tracker per §6). Active `memory/` unchanged.

### User pause-cadence

User can pause-cadence via Decision Packet fork. Conductor (or operator manually) updates the scheduled-tasks entry `enabled: false` via `mcp__scheduled-tasks__update_scheduled_task`. Manual on-demand still available.

### User edit-then-accept

User edits `memory.next/<file>.md` in place (active `memory/` still unchanged; only the candidate is edited). User signals "accept-edited" — Conductor / skill body executes the same accept-flow with user's edits incorporated.

---

## §8. Failure modes + mitigations

### Phase-1-relevant

| Failure mode | Mitigation |
|---|---|
| Dream-pass produces bad output user accidentally accepts | `_diff.md` shows exactly what changed; user reviews before accepting; `memory.prev.*/` retained 90 days as fast-rollback; OD recommendation in Decision Packet acts as second pair of eyes |
| Dream-pass merges files axis discipline keeps separate | Anti-pattern 3 hard rule; skill body's per-file iteration loop prevents the operation; OD review catches drift |
| Dream-pass drops provenance tags during consolidation | Anti-pattern 4 hard rule; skill body's pre-write regex check + fall-back-to-source; OD review catches drift |
| Schedule fires while user mid-checkpoint and Decision Packet timing awkward | Sunday 23:00 local-time chosen specifically as low-attention slot; user can pause-cadence via fork; schedule overrideable, not enforced |
| Legacy `/consolidate-memory` user invokes on directory with pending `memory.next/` and confuses modes | Skill body's first step (any mode) checks for `memory.next/` existence; if present, refuses to run with surfacing message: "Pending dream-pass at `memory.next/`; resolve via Decision Packet first." Defensive guard. |
| Dream-pass output rate exceeds user's review capacity | Self-tuning cadence-relax (§6) — 3 consecutive low-acceptance cycles trigger relax to bi-weekly, then monthly |
| Bad-curation surfaces >90 days post-accept (after `memory.prev.<ts>/` archive prune) | Two-layer rollback (§3) — active `memory/` is git-tracked; `git log -- memory/<file>.md` recovers indefinitely. 90-day archive is fast-rollback convenience, not last-line-of-defense |

### Phase-2+-relevant (not Phase 1)

| Failure mode | Mitigation |
|---|---|
| Dream-pass surfaces secrets from transcripts (stretch tier) | Stretch-tier scope explicitly Phase 2-gated; protocol amendment for stretch tier requires secret-redaction discipline + per-transcript opt-out flag |
| OD-sycophancy on dream-pass output (well-presented packet bypasses careful review) | User runs `/grow-team` after week 4 of Phase 2 dogfood to evaluate OD's recommendation calibration; >40% disagreement triggers OD self-review + new OD proposal |

---

## §9. Phase rollout

### Phase 1 (this protocol) — landed

- `protocols/dream-pass.md` (this file)
- `commands/consolidate-memory.md` (slash-command body extending Anthropic skill with `--dream-pass` mode; legacy in-place mode preserved per Fork 3)
- `agents/org-designer.md` diff (cadence + review authority)
- `agents/executive-assistant.md` diff (Decision Packet surface format)
- Scheduled-task entry registered via `mcp__scheduled-tasks__create_scheduled_task` (weekly Sunday 23:00 local time per Fork 1)
- `.gitignore` additions (`memory.next/`, `memory.prev.*/`)

**No live dream-pass run during Phase 1 land.** First scheduled fire is next Sunday 23:00 local time post-landing.

### Phase 2 — dogfood observation window (4 weekly cycles minimum)

Phase 2 gates Phase 3.

- 4 weekly cycles complete (or 8 cycles if 20-30% acceptance triggers extended observation per OD proposal §4)
- Acceptance rate ≥30%
- Zero accepted dream-passes that subsequently surfaced as bad-curation incidents (per `incidents.md`)
- At least one cycle exercised `--instructions` field successfully
- User runs `/grow-team` after week 4 for OD calibration check (per OD proposal §4 Devil's-Advocate addition)

**Phase 2 fail-recovery paths** (per OD proposal §4):
- Acceptance rate <20% after 4 cycles → OD retro on calibration; revised tuning; relaunch Phase 2 from cycle 1
- Acceptance rate 20-30% after 4 cycles → extend observation window by 4 cycles before deciding
- Bad-curation incident accepted by user (post-accept regret) → Phase 2 hard-fails; rollback via `memory.prev.<ts>/`; OD writes incident entry + follow-up proposal addressing curation-discipline gap; relaunch Phase 2 only after gap closed

### Phase 3 — aggressive-tier ingest + event-driven trigger evaluation

Gates on Phase 2 success. Aggressive-tier opens (incidents + closed-backlog + critic-notes); event-driven trigger evaluated empirically. Separate OD proposal at Phase 3 entry.

### Phase 4 — framework-default promotion

Once Phase 3 settles, dream-pass promotes from "TapAgents-flavored extension" to "framework default behavior" — `templates/stacks/_baseline/` includes scheduled dream-pass cadence in any new project's memory hygiene contract. Cross-stack portability validated by then.

---

## §10. Cross-references

- BL-031 source: `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md`
- BL-031 EA Decision Packet (user approval): `workspace/_global/decision-packets/20260507-bl-031-dream-pass.md`
- BL-031 Critic adversarial review (proposal phase): `workspace/_global/critic-review-bl031-dream-pass.md`
- BL-025 (rubric outcome grading) — parallel adoption pattern from same Anthropic May 2026 announcement: `protocols/outcome-grading.md`
- BL-026 (managed-agents-comparison doc) — anticipates dream-pass as lift candidate: `.claude/docs/managed-agents-comparison.md`
- BL-029 (iterate-on-user's-behalf principle) — dream-pass review-mode is concrete realization: `memory/backlog.md` BL-029 entry
- `framework-contract-discipline.md §1` — axis discipline (load-bearing through dream-pass)
- `framework-contract-discipline.md §3` — stack-portability (industry-portability framing)
- `framework-contract-discipline.md §4` — Org Designer cadence pattern (dream-pass cadence patterned on)
- `backlog-protocol.md §3` — archive cadence (90-day pattern; dream-pass adopts for `memory.prev.*/`)
- `checkpoint-protocol.md` — Decision Packet user-touch surface
- `destructive-data-ops.md` — defense-in-depth pattern (dream-pass three-layer enforcement modeled on)
- `memory/README.md` — public/private split; provenance rule; configurable `${MEMORY_ROOT}` (NOT a precedent for `memory.next/`)
- `memory/_examples/` — example file shapes (dream-pass output mirrors this parallel-directory pattern)
- Industry-portability anchor: `~/.claude/projects/.../memory/project_team_industry_portability.md`
- User principle anchor: `~/.claude/projects/.../memory/feedback_iterate_on_users_behalf.md`
- Anthropic source pattern: claude.com/docs Managed Agents `dreams` feature (May 2026 preview, beta header `dreaming-2026-04-21`) — primary URL deferred per OD followup-list

---

## §11. Forbidden behaviors (hard rules)

- ❌ No in-place mutation under `--dream-pass` flag (only `memory.next/` is writeable)
- ❌ No `MEMORY_ROOT=memory.next/` (defeats safety property; agents must always read active store)
- ❌ No `memory.next/` retention beyond one cycle (resolve via Decision Packet before next pass)
- ❌ No auto-accept without user signoff (except via explicit `auto-accept` flag the user explicitly enables — Phase 3+ at earliest, requires separate OD proposal)
- ❌ No transcript ingest at default tier (Phase 2+ gated; secret-redaction discipline required)
- ❌ No project-workspace-artifact ingest at default tier (Phase 2+ gated; project-leakage risk)
- ❌ No empty `memory.next/` produced silently (must write `_outcome.md` no-op marker)
- ❌ No cross-file merges (axis discipline; per-file 1:1 mapping only)
- ❌ No dropped provenance tags (validation enforced at write-time)
- ❌ No invented facts (model rephrases input entries; never introduces entries; `[INVENTED?]` flagging required for OD review)
