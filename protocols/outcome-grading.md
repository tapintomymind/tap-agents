# Outcome Grading — Rubric-Style Producer↔Reviewer Handoff

**Status:** Phase 1 LANDED (Critic codification, no behavior change). Phase 2 (Quartet dogfood, MANUAL-ITERATE mode) gates on `workspace/<slug>/.outcome-grading-active` marker activation per `protocols/outcome-grading.md §6`.

**Source proposal:** `workspace/_global/org-designer-proposals/20260506T2146-bl-025-rubric-outcome-grading.md` (BL-025; user-approved 2026-05-06 with fork-defaults: `max_revision_attempts = 2`, codify-only Critic scope, reviewer-extracts rubric authorship).

**Pattern source:** Anthropic Managed Agents `outcomes` feature (May 2026 announcement). Local adaptation; the producer↔grader separation, structured envelope, and bounded iteration loop transfer cleanly because they're protocol-shape, not API-runtime. TapAgents stays local + file-based + Conductor-routed + user-in-loop.

---

## §1. Pattern in one sentence

Each reviewer (Critic on plan axis; QE on runtime-functional axis; UI/UX Reviewer on runtime-visual axis; Ops/Security on runtime-adversarial axis) writes a **YAML-fenced result envelope** at the top of each pass's section in their existing review file. Conductor reads the envelope's `result` field at `handed-off → shipped` and routes by structured outcome instead of parsing prose verdict text.

The rubric — the criteria the reviewer grades against — is **extracted by the reviewer from existing producer artifacts** (PRD `§Acceptance`, scope milestone exit criteria, `design-spec.md §7 default-coverage`, `threat-model.md` mitigation map, generated Tier 2 set), not authored by the producer. Zero producer-side change.

---

## §2. Result envelope schema

Every reviewer review file's per-pass section begins with a YAML fenced code block:

````markdown
## Pass: <YYYY-MM-DDTHH:MM:SSZ>

```yaml
result: satisfied  # one of: satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/prd.md§Acceptance  # or design-spec.md§7, threat-model.md, etc.
criteria_evaluated:
  - id: AC-1
    description: User can authenticate via GitHub OAuth and reach /dashboard
    status: pass  # one of: pass | fail | partial | not_tested
    evidence: tests/e2e/auth.spec.ts:42 — "redirects to /dashboard after callback"
    severity: not_applicable  # one of: P0 | P1 | P2 | not_applicable
  - id: AC-7
    description: Live OAuth refresh-token rotation
    status: not_tested
    reason: requires production OAuth credentials; out of scope for smoke
    severity: not_applicable
findings_summary:
  P0: 0
  P1: 1
  P2: 3
  notes: 7
verdict: LAND-WITH-FOLLOWUPS  # human-readable; mirrors BL-019 vocabulary
followup_items_filed:
  - BL-NNN  # actual IDs allocated by Backlog Curator at filing
  - BL-NNN
```

[prose: per-finding details, exploratory observations, anti-sycophancy log, sign-off — existing required sections continue here]
````

For `result: unable_to_grade` cases, two additional fields are mandatory; `criteria_evaluated:` may be empty:

````markdown
```yaml
result: unable_to_grade
reason_class: infra  # one of: infra | tooling | precondition_absent | runtime_error
reason_detail: Deployed URL https://<project>.vercel.app returned 502 across 3 retry attempts at 22:14:32, 22:14:45, 22:15:02
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/prd.md§Acceptance
criteria_evaluated: []
```
````

### Field semantics

- **`result`** (enum, required) — see §3.
- **`revision_attempts`** (integer, 0-indexed) — count of revisions APPLIED to the Tier 2 artifact. Initial review pass = 0. After first failing review and one Tier 2 revision = 1.
- **`max_revision_attempts`** (integer, default 2) — hard cap before user-escalation. Default per BL-025 user fork; raisable to 3 only as a Tier C ops action with single-cycle scope.
- **`rubric_source`** (path:section, required) — pointer to the producer artifact section the reviewer extracted criteria from. Reviewer cites; producer doesn't author.
- **`criteria_evaluated`** (list, required unless `unable_to_grade`) — per-criterion breakdown. See per-criterion schema below.
- **`findings_summary`** (object, required) — counts by severity. Mirrors existing BL-019 `0 P0 / 1 P1 / 3 P2 / 7 Note` shape.
- **`verdict`** (string, optional) — human-friendly verdict label. Mirrors BL-019 vocabulary (`GREEN-LAND-NOW`, `LAND-WITH-FOLLOWUPS`, `BLOCK`). Conductor parses `result`, not `verdict`; verdict is for human readers.
- **`followup_items_filed`** (list of BL-IDs, optional) — ancillary metadata when followups are filed as backlog rather than iterated. Backlog Curator allocates IDs at filing time per `protocols/backlog-protocol.md §2.1`.
- **`reason_class`** + **`reason_detail`** — required when `result == unable_to_grade`; forbidden otherwise.

### Per-criterion schema

```yaml
- id: AC-1                          # criterion ID, extracted from rubric source
  description: <one-line description, lifted verbatim or paraphrased from producer artifact>
  status: pass                      # pass | fail | partial | not_tested
  evidence: <file:line OR HTTP probe output OR screenshot path>  # required when status != not_tested
  reason: <required when status == not_tested — why couldn't run this criterion>
  severity: P1                      # P0 | P1 | P2 | not_applicable; required when status in {fail, partial}
```

### Severity enum

Bridges to the existing P0/P1/P2 vocabulary used by Critic, QE, UI/UX Reviewer, and Ops/Security:

| Severity | Meaning | Envelope behavior |
|---|---|---|
| **P0** | Blocking — gates ship | `findings_summary.P0 > 0` typically maps to `result: needs_revision` (per-reviewer routing rules in agent contracts may modify) |
| **P1** | Notable — warning, not blocking by default | Counted in `findings_summary.P1`; per-reviewer rules decide whether to file as backlog or escalate to `needs_revision` |
| **P2** | Polish / informational | Counted; never gate-blocking |
| **not_applicable** | Used for `pass` and `not_tested` criteria | Never gate-blocking |

---

## §3. Result enum

Five values. Mutually exclusive. Distinct semantics.

| Result | Meaning | Conductor action (at `handed-off → shipped`) |
|---|---|---|
| **satisfied** | Reviewer approves the artifact for the gate it controls. Includes LAND-WITH-FOLLOWUPS shape — followups filed as backlog via `followup_items_filed:` are not iteration triggers. | Gate passes (combined with all other reviewers' results). EA assembles Decision Packet. |
| **needs_revision** | Reviewer found one or more BLOCK-class concerns (typically ≥1 P0 finding, OR a per-reviewer-judged blocker even at lower nominal severity). Tier 2 artifact must be revised before re-review. | If `revision_attempts < max_revision_attempts`, Conductor dispatches Tier 2 implementer with failing-criteria revision brief. Else escalates to `max_iterations_reached`. |
| **max_iterations_reached** | Loop reached `max_revision_attempts` without converging to `satisfied`. | Set `state.json.blocked_on = "review-revisions-exhausted:<reviewer>"`. Signal EA. Decision Packet surfaces under BLOCKING with full revision history. User decides: ship anyway (logs to dissent), raise `max_revision_attempts` (one-shot Tier C bump), or reject. |
| **failed** | Runtime error, contract violation, mis-routed dispatch, agent-execution crash. Distinct from the artifact being bad. | Set `state.json.blocked_on = "review-failed:<reviewer>:runtime-error"`. Signal EA immediately. NO auto-iteration — runtime/contract problem, not implementation gap. |
| **unable_to_grade** | Non-runtime "couldn't run." Reviewer ran, but the review couldn't proceed. Mandatory `reason_class` + `reason_detail` disambiguate. | Set `state.json.blocked_on = "review-unable-to-grade:<reviewer>:<reason_class>"`. Signal EA. Decision Packet surfaces with `reason_detail`. Distinct from `failed`. |

### `unable_to_grade.reason_class` enum

| reason_class | Meaning |
|---|---|
| **infra** | Deployed URL unreachable, 502, connection refused, DNS failure |
| **tooling** | Playwright crash, browser hang, runner failure, lockfile-resolution failure |
| **precondition_absent** | Required producer artifact missing (no threat-model when one was contracted; no design-spec.md §7 default-coverage block) |
| **runtime_error** | Catch-all for review-execution errors not covered above |

### Forbidden behaviors

- Conductor MUST NOT downgrade `failed` to `needs_revision` to keep the loop running.
- Reviewer MUST NOT invent a result enum value beyond the five.
- Reviewer MUST NOT mark `criteria_evaluated[].status: pass` when evidence cannot be cited — use `not_tested` with `reason` instead.
- Producer MUST NOT author a rubric inline in their artifact. The rubric is reviewer-extracted from existing acceptance/scope/spec/threat-model structure.

---

## §4. Iteration loop semantics (handed-off → shipped only)

Auto-iteration is enabled ONLY at the `handed-off → shipped` gate. Pre-handoff phases (`prd-ok → scoping → planned`) continue to use user-mediated revision loops via Decision Packets per `protocols/checkpoint-protocol.md`. Critic's existing producer-revision loop on PRDs/scopes/tech-strategies is unchanged.

### Loop algorithm (Conductor-driven)

1. At `handed-off → shipped` entry, Conductor fans out the eligible review tier per `agents/conductor.md §"Review-tier fan-out"`. Initialize `state.json.review_iteration.<reviewer>` block per §5 schema. Set `revision_attempts: 0` for each fired reviewer.
2. Each reviewer writes their review file with the YAML fenced envelope at section-top.
3. Conductor reads the **last** yaml-fenced block in each review file (most-recent-pass-wins) and inspects each envelope's `result` field.
4. Conductor's per-result actions (per §3 table above):
   - All `satisfied` → gate passes; EA assembles Decision Packet; Backlog Curator post-edit verifies any `followup_items_filed:` BL-NNNs per `protocols/backlog-protocol.md §4`.
   - ≥1 `needs_revision`, all `revision_attempts < max_revision_attempts` → dispatch Tier 2 implementer with cross-reviewer revision brief (§4.1 below). Increment `revision_attempts` for each `needs_revision` reviewer once Tier 2's revision lands. Re-dispatch ONLY the reviewers that returned `needs_revision`; reviewers that returned `satisfied` do not re-run.
   - ≥1 `needs_revision`, ≥1 reviewer at `max_revision_attempts` → escalate per `max_iterations_reached`.
   - ≥1 `failed` → escalate immediately; no auto-iteration.
   - ≥1 `unable_to_grade` → escalate immediately; no auto-iteration.

### §4.1. Cross-reviewer brief assembly

When ≥1 reviewer returns `needs_revision`, Conductor builds the Tier 2 revision brief as follows:

1. **Group failing criteria by reviewer.** Each group preserves its rubric-source attribution (`rubric_source: prd.md§Acceptance` for QE; `design-spec.md§7` for UI/UX; `threat-model.md` for Ops/Security; `Tier2-set` for Critic-on-Tier-2).
2. **Sort within each group by severity.** P0 first, then any reviewer-judged-P0-equivalent-but-nominal-P1, then any other failing criteria.
3. **Rank groups by reviewer-priority precedence.** Default order — blast-radius-first, then dependency-order:
   - **Ops/Security P0 first** — adversarial findings (auth bypass, IDOR, leaked secret) gate authentication/authz plumbing; other fixes shouldn't be applied on top of unfixed auth surface.
   - **QE P0 second** — functional correctness (acceptance criteria) is the layer below UX; UI fixes against broken functional flow waste effort.
   - **UI/UX P0 third** — visual / IA concerns matter, but they're rendered on top of working functional surfaces; fix functional layer first, then surface.
   - **Critic-on-Tier-2 last** — generated-set quality; typically lowest blast-radius runtime axis (the generated agents and scaffolds aren't yet live with users).
   This default is overridable: if a specific cycle's failing criteria from Critic-on-Tier-2 logically gate (e.g., "missing deployment agent makes deploy unreviewable"), Conductor logs the override in `routing-log.md` with reasoning. Tier 2 implementer addresses in this order.
4. **Conflict detection.** If Conductor identifies cross-reviewer conflict at brief-assembly time (e.g., QE's `AC-3` fix would touch the same file as UI/UX's `DC-7` fix in opposite directions), it emits a conflict packet to Critic per `protocols/conflict-resolution.md` BEFORE dispatching Tier 2. Critic generates resolution; user decides if conflict is material; brief is reissued with resolution baked in.
5. **Brief format.** Markdown listing groups in priority order, with per-criterion: `id, description, rubric_source, severity, evidence-of-failure-from-envelope, reviewer-suggested-resolution-if-any`. Tier 2 implementer's reportback documents which criteria were addressed in the revision pass (mirrors the envelope's per-criterion structure).

### §4.2. Tier 2 implementer auto-revision authority

Phase 1 (this protocol's landing) does NOT enable auto-iteration. Phase 1 is **codify-only** for Critic — Critic emits the envelope; behavior unchanged. The trio (QE, UI/UX, Ops/Security) contracts are updated to emit envelopes too, but the iteration loop fires in **MANUAL-ITERATE mode** during Phase 2 dogfood.

**Phase 2 (manual-iterate):** Conductor surfaces `needs_revision` to user via EA Decision Packet (treated like `max_iterations_reached`). User manually dispatches Tier 2 implementer with the cross-reviewer brief. Loop advances under user control. Validates envelope shape + Conductor parsing + brief assembly + user-flow ergonomics — without yet requiring the Tier 2 baseline scaffold update.

**Phase 3 (auto-iterate):** Gates on (a) Phase 2 dogfood success criteria all met (per BL-025 proposal §5) AND (b) `templates/stacks/_baseline/agents/tier2-conductor.md` updated with "outcome-grading revision-brief acceptance" — Tier 2 conductor parses the cross-reviewer brief, dispatches per-criterion fix work, reports back with mirroring per-criterion-addressed metadata. This Tier 2 contract update is authored by a separate OD proposal at Phase 3 entry. Until both prerequisites land, the auto-iterate path is reserved.

---

## §5. state.json schema delta (handed-off phase only)

Only present when `current_phase == "handed-off"`. Cleared on phase advance to `shipped`.

```json
{
  "current_phase": "handed-off",
  // ... existing fields unchanged ...

  "review_iteration": {
    "qe": {
      "revision_attempts": 0,
      "max_revision_attempts": 2,
      "last_result": null,
      "last_envelope_path": null,
      "tier2_revision_dispatched_at": null,
      "history": []
    },
    "ui_ux_reviewer": { /* same shape */ },
    "ops_security": { /* same shape — only present if scoping-stage threat-model existed */ },
    "critic": { /* same shape — only relevant for handed-off Critic-on-Tier-2 review per handoff-protocol.md */ }
  }
}
```

### Field semantics

- **`revision_attempts`** — current count of revisions APPLIED to the Tier 2 artifact (0-indexed; `0` = no revisions yet, only initial review pass run; `1` = one revision applied, second review pass either pending or complete).
- **`max_revision_attempts`** — hard cap on revision attempts before user-escalation. Default 2; configurable per-project via dissent-logged user override (raise to 3 is a Tier C ops action, one-shot for the cycle).
- **`last_result`** — most recent envelope `result` value. `null` until first review pass completes.
- **`last_envelope_path`** — pointer to the envelope (file path + section anchor like `#latest-yaml-fenced-block` or `#pass-2026-05-06T22:14`). Used by EA Decision Packet for surfacing.
- **`tier2_revision_dispatched_at`** — timestamp of last Tier 2 revision dispatch on `needs_revision`. Tracks loop progress.
- **`history`** — append-only log of `{attempt: N, result: 'satisfied' | 'needs_revision' | ..., dispatched_at: <ts>, completed_at: <ts>}` tuples. Used for cross-run anti-rubber-stamp and audit.

### Initialization

When Conductor enters `handed-off` phase, initialize `review_iteration.<reviewer>` block for each reviewer that will fire (per the existing review-tier-fan-out logic — Ops/Security only present if threat-model existed at scoping). All fields null/empty until the reviewer runs.

### Backward compatibility

Projects that entered `handed-off` before this protocol lands have no `review_iteration` block. Conductor detects absence and creates the block on next invocation, treating any existing review file as iteration 1 history.

---

## §6. Backward compatibility — marker mechanism

Projects that entered `handed-off` before this protocol lands have review files without YAML fenced envelopes. The detection rule:

1. Conductor maintains a workspace-level marker file `workspace/<slug>/.outcome-grading-active` (empty file, gitignored at workspace level so it doesn't pollute other projects' state).
2. The marker is created when **all three** conditions hold: (a) the protocol has landed (this file exists in `protocols/`); AND (b) the project enters `handed-off` phase post-landing; AND (c) the project's first review post-protocol-landing fires.
3. **Before marker creation:** review files lacking the YAML envelope silent-fallback to prose-parse semantics. No CONTRACT-DRIFT warning.
4. **After marker creation:** any review file in this workspace lacking the YAML fenced envelope block triggers a CONTRACT-DRIFT warning to EA per `agents/conductor.md §"Outcome-grading envelope handling"`.

**Phase 1 status:** the marker mechanism is documented but not activated. Phase 1 lands the protocol + Critic codification + trio contract updates without enabling the iteration loop. Phase 2 dogfood activates the marker on the first <project> `handed-off → shipped` cycle that uses the envelope contract end-to-end.

**Conductor parsing rule.** When a review file has multiple yaml-fenced blocks (multi-pass file), Conductor parses the **LAST** ` ```yaml ... ``` ` block — last-pass-wins semantics. This works uniformly across append-only review files (Critic's `critic-notes.md`, UI/UX Reviewer's `design-review.md`) and overwriteable-but-multi-pass-within-cycle files (QE's `smoke-report.md`, Ops/Security's `security-audit.md`).

When parsing fails (yaml block syntactically invalid, required fields missing), Conductor signals the affected reviewer with a re-dispatch request specifying the parse error rather than inventing values.

---

## §7. Anti-rubber-stamp interaction

Each reviewer has existing anti-sycophancy / anti-rubber-stamp mechanisms in their contract:

- **Critic:** Devil's Advocate trigger — if a review produces 0 blocking and 0 warning concerns, force a second adversarial pass before sign-off (`agents/critic.md §"Anti-Sycophancy Rule"`).
- **QE:** two-clean-runs forced-adversarial-pass (`agents/quality-engineer.md` Operating Principle 4).
- **UI/UX Reviewer:** single-pass + cross-run (N=5) + severity-calibration triggers (`agents/ui-ux-reviewer.md §"Anti-sycophancy"`).
- **Ops/Security:** two-clean-audits forced-paranoid-pass (`agents/ops-security.md` Algorithm step 8).

**These mechanisms are unchanged.** The result envelope makes them **forensically auditable**:
- The envelope's `revision_attempts`, `last_result`, and `history` fields make cross-run triggers mechanical instead of memory-based ("count `last_result == 'satisfied'` across last N envelopes").
- The envelope's `findings_summary` makes single-pass triggers parseable (the existing rule "if everything passed, force a second pass" becomes "if `findings_summary.P0 + P1 == 0`, force a second pass").
- The envelope's `criteria_evaluated[].evidence` field provides the audit-trail closure for "did the reviewer actually look?" — every criterion marked `pass` cites a file:line or probe output.

**Org Designer monitoring.** The envelope makes one new pattern detectable at the OD layer: per-reviewer `result: satisfied` rate >90% across last N projects → calibration-audit trigger. Pre-envelope, this required prose parsing; post-envelope, it's a mechanical count.

---

## §8. Rubric extraction discipline

The rubric is **extracted from existing producer artifacts**, not authored by the producer. This means zero producer-side change for QE/UI-UX/Ops-Security adoption — the rubric source is the producer's existing PRD/scope/design-spec/threat-model.

### Reviewer extraction algorithms (per axis)

| Reviewer | Rubric source | Criterion ID format | Extraction step |
|---|---|---|---|
| **Critic (on Tier 2 set)** | Generated Tier 2 agents + handoff-package items | `T2-1` per generated-agent contract; `HP-1` per handoff-package required-section | Map each generated artifact + handoff section to a criterion; status reflects whether the artifact meets the contract |
| **QE** | `prd.md §Acceptance` + `test-plan.md` mapping | `AC-1`, `AC-2`, ... | Each AC becomes a criterion ID; cross-reference your prior `test-plan.md` (each AC was already mapped to ≥1 test there); status reflects whether the smoke run hit the deployed surface and observed pass/fail |
| **UI/UX Reviewer** | `design-spec.md §7 default-coverage` | `DC-1: /dashboard@375px:loaded`, `DC-2: /dashboard@1440px:loaded`, ... | Each route + breakpoint + state combination from §7 becomes a criterion ID; status reflects whether the rendered surface matches spec at that combination |
| **Ops/Security** | `threat-model.md` mitigation map | `M-1: oauth-state-validation`, `M-2: session-cookie-signed`, ... | Each mitigation in the map becomes a criterion ID; status reflects whether the deployed surface enforces that mitigation |

The reviewer cites the rubric source in the envelope's `rubric_source:` field. Single source of truth — if the producer artifact changes, the rubric automatically updates next pass.

### Producer-side responsibility

Producers MUST keep their existing structure rubric-extractable. This is mostly already true:

- Strategist: PRD `§Acceptance` items must be testable (existing critic-flagged warning per `agents/critic.md §"Pattern Library — PRD-specific"`).
- Architect: scope milestone exit criteria must be enumerated (existing critic check).
- Designer: `design-spec.md §7 default-coverage` must enumerate routes + breakpoints + states (existing UI/UX Reviewer entry contract per `agents/ui-ux-reviewer.md §"Algorithm — At handed-off → shipped"`).
- Ops/Security: `threat-model.md` mitigation map must use stable IDs (`M-1`, `M-2`, ...) so security-audit's envelope can reference them — codified in `agents/ops-security.md` Memory File Authority.

If a producer artifact lacks the required structure for rubric extraction at gate-time, the affected reviewer returns `result: unable_to_grade` with `reason_class: precondition_absent` and `reason_detail` citing the missing structure. This gates ship until the producer fills the gap; it does NOT auto-iterate (precondition_absent isn't a Tier 2 implementation problem).

---

## §9. Industry portability

Per `protocols/framework-contract-discipline.md §3` (stack-specific examples are illustrative-by-example with portability framing), this protocol is industry-portable:

- The envelope schema is YAML — works for any markdown review file across any project type (not just web/Next.js/Vercel/Drizzle).
- The rubric extraction discipline cites artifact structure (sections, IDs), not stack-specific tools.
- The result enum is artifact-shape-agnostic — `satisfied | needs_revision | failed | unable_to_grade | max_iterations_reached` apply to a Slack-bot review the same as a marketing-site review the same as a database-migration audit.
- The example `criteria_evaluated[]` entries in §2 use Next.js + GitHub OAuth as illustrative — the structure (id, description, status, evidence, severity) is the contract; the specific test/route/auth pattern is project-attributable.

Future projects in non-web domains (mobile, marketing, media curation) adopt this protocol without protocol changes — the producer's artifact format determines the criterion IDs; the reviewer extracts and grades.

---

## §10. Forbidden behaviors

- **No producer-side rubric authoring.** Producer writes their existing artifact; reviewer extracts criterion IDs from it. Producer ≠ rubric-author.
- **No result-enum invention.** The five values in §3 are exhaustive. Reviewers MUST NOT invent new result values (e.g., `partially_satisfied`, `mostly_done`).
- **No Conductor downgrade of `failed`.** `failed` is a runtime/contract problem, not an implementation gap. Conductor MUST NOT silently downgrade to `needs_revision` to keep the iteration loop running.
- **No `pass` without `evidence`.** Every `criteria_evaluated[].status: pass` MUST cite a file:line, probe output, or screenshot path in `evidence:`. Marking pass without evidence is rubber-stamp-via-envelope-shortcut; existing anti-sycophancy mechanisms catch this, but it's also a structural protocol violation.
- **No envelope rewrite across passes.** YAML envelopes are append-only within review files (matches the append-only file discipline of `critic-notes.md` and `design-review.md`). New passes append a new dated section with a fresh envelope; they do NOT edit prior envelopes.

---

## §11. Cross-references

- **BL-025 source proposal:** `workspace/_global/org-designer-proposals/20260506T2146-bl-025-rubric-outcome-grading.md`
- **BL-019 envelope precedent:** `workspace/<slug>/critic-review-bl019-fix.md` (organic crystallization of the verdict shape this protocol formalizes)
- **Anthropic source pattern:** Managed Agents `outcomes` feature (May 2026 announcement)
- **Reviewer contracts that emit envelopes:**
  - `agents/critic.md` — codification (Phase 1)
  - `agents/quality-engineer.md` — dogfood lane 1 (Phase 2)
  - `agents/ui-ux-reviewer.md` — dogfood lane 2 (Phase 2)
  - `agents/ops-security.md` — dogfood lane 3 (Phase 2)
- **Conductor envelope handling:** `agents/conductor.md §"Outcome-grading envelope handling"`
- **State machine and gate semantics:**
  - `protocols/state-machine.md` — phase eligibility + state.json schema (this protocol adds `review_iteration` block)
  - `protocols/checkpoint-protocol.md` — 5-hard-checkpoint discipline (this protocol scopes auto-iteration to `handed-off → shipped` only)
  - `protocols/handoff-protocol.md` — Tier 1 → Tier 2 packaging contract (Critic-on-Tier-2 review per `§"Critic Review of Generated Tier 2"`)
- **Quality / verification protocols:**
  - `protocols/verification-before-completion.md` — paste-able evidence rule (the envelope's `evidence:` field codifies this for criterion-level grading)
  - `protocols/consistency-check.md` — Conductor's diff machinery (envelope handling is parser-level; consistency check stays artifact-level)
- **Backlog mechanics:**
  - `protocols/backlog-protocol.md §2.1` — canonical ID-allocation rule (Backlog Curator allocates `followup_items_filed[]` BL-NNNs at filing)
  - `protocols/backlog-protocol.md §4` — post-edit verify cadence (fires on every backlog mutation including `followup_items_filed[]` allocation)
- **Industry portability anchor:** `~/.claude/projects/.../memory/project_team_industry_portability.md` (TapAgents generalizes beyond app-dev; this protocol preserves portability per §9)
- **User principle anchor:** `memory/feedback_iterate_on_users_behalf.md` — "iterate on user's behalf most of the time" (this protocol's bounded auto-iteration loop is a structural realization of that principle)

---

## §12. Provisional / amendment status

This protocol is **canonical**, not provisional. Phase 1 ships the protocol + Critic codification + trio contract updates. The marker mechanism in §6 gates Phase 2 dogfood activation; the Tier 2 baseline scaffold update referenced in §4.2 gates Phase 3 auto-iterate. Both are documented as forward dependencies, not provisional caveats on this document.

Future amendments (e.g., adding a `partial_credit` criterion-status if Phase 2 dogfood reveals binary pass/fail/partial/not_tested is too coarse; adding a new `result` value if a new review-execution failure mode surfaces) require a new Org Designer proposal per `protocols/framework-contract-discipline.md §4` cadence.
