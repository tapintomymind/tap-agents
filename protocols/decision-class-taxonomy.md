# Decision-Class Taxonomy

**Version: 1.0 (introduced 2026-05-18 via framework-feedback-2026-05-18 Phase A.1)**

Defines a five-class enum for classifying Open Questions (OQs) by who has authority to resolve them. Eliminates a recurring class of misroute: OQs that the framework treated as user-blocking decisions when, in fact, they sit outside the operator's authority (commercial / clinical / legal) and engineering should proceed with a workaround rather than block.

## §1. Pattern in one sentence

Every OQ surfaced by Strategist or Architect carries a `decision_class` field. Three classes block engineering on operator decision (`operational`, `strategic`); three escalate out of the operator's authority with a recommendation block and do NOT gate dispatch (`commercial`, `clinical`, `legal`). EA renders the two surfaces in separate sections of `/briefing`, `/queue`, `/inbox`. Critic confirms each classification matches its OQ content.

## §2. When this fires

- Strategist authors PRD §"Open Questions" entries → classify each.
- Architect authors Decision Packet OQs (per `templates/decision-packet.md`) → classify each.
- Architect authors `scope.md` / `tech-strategy.md` OQ sub-blocks → classify each.
- Critic reviews any artifact containing OQ entries → confirm `decision_class` field present + value matches OQ content (Critic axis-add itself lands in Phase B; see §9).
- EA renders any surface that lists OQs (`/briefing`, `/queue`, `/inbox`, Decision Packets) → split by class per §5.

## §3. The five-class enum

| Class | Resolver | Default routing | Example |
|---|---|---|---|
| `operational` | Operator | User-required; may block dispatch | Worktree placement, schema-deploy ack, async-queue mechanism pick `[framework-feedback-2026-05-18 §3 paragraph 4]` |
| `strategic` | Operator | User-required; may block dispatch; multi-quarter direction signal | Project class, GTM-order, MVP cut, design-partner outreach (founder-led sales) `[framework-feedback-2026-05-18 §3 paragraph 4; OQ-CP3 worked example]` |
| `commercial` | **C-level / authorized commercial role** — operator is NOT the resolver | ESCALATED status + workaround-recommendation block; does NOT gate engineering dispatch | Pricing tiers, contract structure, channel partnerships with revenue split `[framework-feedback-2026-05-18 §3 paragraph 5; OQ-CP1 worked example]` |
| `clinical` | **Clinical / medical-advisory** — operator is NOT the resolver | ESCALATED status + workaround-recommendation block; does NOT gate engineering dispatch | CPT-code list for a clinical template, PHI-handling threshold change, FDA-regulated workflow decisions (Eligibilities-Hub-specific surface, generalizes to any regulated vertical) `[framework-feedback-2026-05-18 §3 paragraph 6]` |
| `legal` | **Legal / compliance** — operator is NOT the resolver | ESCALATED status + workaround-recommendation block; does NOT gate engineering dispatch | BAA scope, multi-jurisdiction data residency, content licensing `[framework-feedback-2026-05-18 §3 paragraph 7]` |

**Default class when in doubt:** `operational`. Most engineering OQs sit here.

## §4. OQ schema field — `decision_class`

Every OQ written by Strategist or Architect carries the field. Schema shape (Markdown-rendered):

```markdown
### OQ-<id>: <one-line question>
- **Decision class:** `operational | strategic | commercial | clinical | legal`
- **Resolver:** <Operator | C-level | Clinical advisor | Legal>
- **Recommendation:** <one-line preferred answer + reasoning>
- **Blocks:** <list — which downstream work is gated on this OQ; for ESCALATED classes, list the engineering workaround that unblocks instead>
- **Optional:** Decision class reasoning (one line) if the classification is non-obvious — Critic's axis-add (Phase B) will check this.
```

For ESCALATED classes (`commercial | clinical | legal`), the `Blocks:` field MUST name the engineering workaround that lets dispatch proceed without the resolver's input. **No ESCALATED OQ may legitimately block dispatch.** If the engineering work genuinely cannot proceed without the commercial/clinical/legal answer, that's a sign the work is mis-scoped — split off the dependent surface and proceed with the independent portion.

## §5. Routing rules per class

### `operational` and `strategic` — surface as today

These are user-blocking decisions in the existing sense. They surface in:
- PRD §"Open Questions" / `scope.md` §"Open Questions" / `tech-strategy.md` §"Open Questions" — written by the producing agent.
- EA Decision Packets at hard checkpoints — under `▸ OPEN QUESTIONS`.
- EA `/briefing`, `/queue`, `/inbox` — under "DECISIONS NEEDED."

Engineering dispatch is blocked on operator response. State.json `blocked_on` is set per Conductor's existing flow.

### `commercial`, `clinical`, `legal` — ESCALATED, do NOT gate dispatch

These OQs surface in a **separate section** from operator-blocking OQs. EA renders under:
- Decision Packet — separate `▸ ESCALATED OQs (NOT operator-blocking)` section, populated after the standard `▸ OPEN QUESTIONS` section. Each entry includes the workaround that lets engineering continue.
- `/briefing`, `/queue`, `/inbox` — separate "ESCALATED — needs <class>-authority approval" cluster, visually distinct from "DECISIONS NEEDED."

State.json `blocked_on` is NOT set for ESCALATED OQs. Engineering dispatch proceeds with the workaround. The OQ remains open for the resolver to address asynchronously; Memory records the class boundary so future agents do not re-route the same class to the operator.

**Decision Packet rendering contract** (template update itself deferred to Phase B per Phase A.1 scope; this protocol is the spec):

```
▸ OPEN QUESTIONS (operator-blocking)
  OQ-<id> (operational | strategic): <one-line>  → recommendation: <one-line>
  ...

▸ ESCALATED OQs (NOT operator-blocking; engineering proceeds with workaround)
  OQ-<id> (commercial | clinical | legal): <one-line>
    Resolver: <C-level | Clinical advisor | Legal>
    Workaround for engineering: <one-line — what dispatch does today>
    Status: ESCALATED — awaiting <resolver>
  ...
```

When `templates/decision-packet.md` is updated in Phase B, the above section structure is the contract.

## §6. Classification step (Strategist + Architect)

Both Strategist and Architect run the classification at OQ-authoring time. The step has three substeps:

1. **Identify the resolver.** Read the OQ. Ask: "If a non-operator authority owns this domain, who is it?" Pricing → C-level. Contract structure → C-level / Legal. CPT-code list → Clinical advisor. BAA scope → Legal. Worktree placement → Operator. MVP cut → Operator.
2. **Map resolver to class.** Operator → `operational | strategic`. Non-operator → `commercial | clinical | legal`. Within operator-resolved, ask: "Does this affect multi-quarter direction?" Yes → `strategic`. No → `operational`.
3. **For ESCALATED classes, name the workaround.** "Contact us for pricing" is a workaround for OQ-CP1 (pricing tiers) — engineering ships the copy + intake form without knowing the tier numbers. If no workaround exists, the slice is mis-scoped; split off the dependent portion.

Default to `operational` when uncertain. Critic's axis-add (Phase B) will catch over-escalation.

## §7. Critic check at OQ review time

**[FUTURE — Phase B Critic axis-add]**

At Critic review time, for any artifact containing OQs, Critic checks:
- Every OQ has a `decision_class` field.
- The value matches the OQ content (e.g., a pricing-tier OQ classified `operational` is flagged).
- ESCALATED OQs name an engineering workaround.

This axis-add is **bundled with three other axis-adds** into one Critic prompt-version bump in Phase B per `framework-feedback-2026-05-18-triage.md` "Notes the user might want to know" item 2:
- `depth_assessment` axis from Item 1 (research-artifact depth)
- `decision_class` axis from Item 3 (this protocol)
- V-anchor classification axis from Item 5 (per `protocols/v2-roadmap-anchoring.md`)
- Addendum-vs-revision axis from Item 7

Until that bump lands, classification gaps are caught by Strategist + Architect self-discipline and EA's rendering surface (an `operational`-classed OQ that obviously asks "what's the pricing?" will visually mis-fit the operator-blocking section and surface as a question to the user).

## §8. Worked examples

All examples are drawn from this session's eligibilities-hub competitive-positioning workstream + the triage's meta-test (see §10).

### Example 1: OQ-CP1 pricing — `commercial` (ESCALATED)

```markdown
### OQ-CP1: Approve $249/mo single-clinic + $1,499/mo MSO tier
- **Decision class:** `commercial`
- **Resolver:** C-level
- **Recommendation:** Tier numbers TBD by C-level; engineering ships "Contact us for pricing" copy + intake form.
- **Blocks:** Nothing in engineering — M-Q-W5 ships with "Contact us for pricing" workaround.
- **Decision class reasoning:** Pricing tiers are a commercial decision outside operator authority `[framework-feedback-2026-05-18 §3, OQ-CP1 worked example]`.
```

Engineering proceeds. The OQ stays open under ESCALATED; C-level resolves on their own cadence; Memory records the class boundary so future Strategist/Architect work does not re-route pricing to the operator.

### Example 2: OQ-CP3 design-partner outreach — `strategic`

```markdown
### OQ-CP3: Operator owns design-partner outreach OR contractor?
- **Decision class:** `strategic`
- **Resolver:** Operator
- **Recommendation:** Operator owns first 3 design partners (founder-led sales preserves customer signal); contractor evaluated after first 3.
- **Blocks:** First-partner-outreach scheduling.
- **Decision class reasoning:** Founder-led sales decision affects multi-quarter GTM direction; operator owns, but the answer shapes more than one quarter — `strategic` not `operational` `[framework-feedback-2026-05-18 §3 paragraph "second instance"]`.
```

### Example 3: CPT-code template — `clinical`

A hypothetical OQ from a clinical-template feature: "Which CPT codes get the auto-PA-trigger annotation?"

```markdown
### OQ-CT1: Which CPT codes get the auto-PA-trigger annotation?
- **Decision class:** `clinical`
- **Resolver:** Clinical advisor
- **Recommendation:** Engineering ships the annotation infrastructure with an empty initial code list; clinical advisor populates via Admin UI.
- **Blocks:** Nothing in engineering — annotation surface ships unblocked; clinical seed deferred.
```

Engineering proceeds with the infrastructure shipped + UI for the advisor to populate. The OQ stays open under ESCALATED.

### Example 4: BAA scope — `legal`

```markdown
### OQ-L1: BAA scope — does our standard BAA cover sub-processor X for embedding generation?
- **Decision class:** `legal`
- **Resolver:** Legal
- **Recommendation:** Engineering scopes feature to use sub-processor Y (already in BAA) for v1; sub-processor X gated on Legal review for v2.
- **Blocks:** Nothing in engineering — feature ships with sub-processor Y workaround; v2 vendor swap awaits Legal.
```

### Example 5: Worktree placement — `operational`

```markdown
### OQ-E1: Place feature/robustness-pass-fe worktree under main repo OR sibling directory?
- **Decision class:** `operational`
- **Resolver:** Operator
- **Recommendation:** Sibling directory (consistent with existing `pp-eligibilities-hub-robustness/` precedent).
- **Blocks:** Worktree creation.
```

Operator decides; engineering blocks until response. Standard flow.

## §9. Migration note — existing class-boundary memories

This protocol generalizes lessons that were previously codified per-incident as memory entries (e.g., `memory/user_pricing_decision_authority.md` referenced in `framework-feedback-2026-05-18.md §3 acceptance criteria` — does NOT exist in this Tier 1 framework root at protocol-introduction time; was authored in a separate Tier 2 workspace per the triage's cross-feedback delta-check `[framework-feedback-2026-05-18-triage.md "Cross-feedback delta-check" section]`). Once this protocol lands and Strategist + Architect + EA contracts cite it:

- Any future memory entry that codifies a single-class-boundary insight (e.g., "pricing is C-level not operator") is **redundant** — the protocol captures the class globally, not per-memory.
- Existing single-class memories may be archived once their content is fully absorbed into this protocol's §3 enum + §8 examples. Archival is a dream-pass operation per `protocols/dream-pass.md`; no migration action required from this protocol.

The deprecation path is: protocol absorbs the lesson → next dream-pass cycle surfaces the redundant memory entry → Org Designer recommends archive → user accepts via Decision Packet.

## §10. Meta-test — taxonomy validated on triage OQs

The triage that produced this protocol applied the taxonomy to its own surfaced OQs (OQ-FB-1 through OQ-FB-5 in `workspace/_global/framework-feedback-2026-05-18-triage.md §"Decision-class meta-test"`). All five OQs classified cleanly:

- OQ-FB-1 (priority reordering): `strategic` (multi-session cadence-shaping)
- OQ-FB-2 (industry-researcher activation): `operational` (multi-session-scoped operator decision)
- OQ-FB-3 (Item 4 ownership): `strategic` (multi-quarter agent-prompt-shape)
- OQ-FB-4 (Item 6 disposition): `operational` (single-decision, narrow scope)
- OQ-FB-5 (dispatch sequence): `operational` (parallel-dispatch shape)

None hit `commercial | clinical | legal`. The taxonomy holds at triage-level OQs (all-operator-domain). The harder test surface — Tier 2 work where the operator-vs-C-level boundary lives — has its canonical test case in OQ-CP1 (§8 Example 1) which the taxonomy correctly routes to `commercial` per `[framework-feedback-2026-05-18-triage.md "Decision-class meta-test" verdict]`.

## §11. Cross-protocol consistency

- **`protocols/workstream-index.md` §"Open decisions" field** — references OQ IDs whose classes come from THIS taxonomy. A workstream-index that lists OQ-CP1 as an "Open decision" must surface it as ESCALATED (not operator-blocking) per §5 of this protocol.
- **`protocols/v2-roadmap-anchoring.md` `architecture-now` decisions** — typically classify as `strategic` (multi-quarter direction) when surfaced as OQs in Decision Packets. The V-anchor classification itself (per the v2-roadmap protocol) is separate from the OQ class — a V-anchor classified `architecture-now` may still surface as an `operational` or `strategic` OQ depending on resolver. Two orthogonal classifications.
- **`protocols/checkpoint-protocol.md` Decision Packet ≤400 word limit** — applies to the combined surface. The two-section split (`▸ OPEN QUESTIONS` + `▸ ESCALATED OQs`) keeps the per-section narration tight; if a packet hits >400 words because of ESCALATED count, the artifact has too many ESCALATED OQs and the parent slice is mis-scoped.

## §12. Forbidden behaviors

- ❌ ESCALATED OQ (`commercial | clinical | legal`) that blocks dispatch without an engineering workaround named in `Blocks:`.
- ❌ EA rendering ESCALATED OQs in the same section as operator-blocking OQs.
- ❌ Conductor setting `state.json.blocked_on` for an ESCALATED OQ.
- ❌ Re-routing the same class boundary lesson to a new per-memory file after this protocol lands (per §9 — protocol absorbs the lesson globally).
- ❌ Classifying without naming a `Resolver` (the OQ schema field is structural — if you can't name a resolver, you haven't thought about who owns the decision).

## §13. Forward references — Phase B

- **Critic axis-add** (per §7) — bundled with Items 1, 5, 7 axis-adds into one Critic prompt-version bump.
- **`templates/decision-packet.md` update** — rendering contract per §5 lands as a template edit in Phase B.
- **State.json schema bump for Item 1 lane (c) `project_class` field** — depends on this protocol's enum shape per `framework-feedback-2026-05-18-triage.md` per-item disposition for Item 1.

## §14. Composes with

- `protocols/checkpoint-protocol.md` — Decision Packet surface where ESCALATED rendering applies.
- `protocols/workstream-index.md` — cross-cites OQ IDs by class.
- `protocols/v2-roadmap-anchoring.md` — V-anchor classification is orthogonal to OQ class.
- `protocols/dream-pass.md` — migration path for class-boundary memories per §9.
- `agents/strategist.md` — OQ-authoring step (classify at creation).
- `agents/architect.md` — OQ-authoring step + V-anchor classification step (the latter via `v2-roadmap-anchoring.md`).
- `agents/executive-assistant.md` — split-rendering rule per §5.
- `agents/critic.md` — Phase B axis-add per §7.
