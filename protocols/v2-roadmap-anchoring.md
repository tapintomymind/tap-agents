# V2 Roadmap Anchoring Protocol

**Version: 1.0 (introduced 2026-05-18 via framework-feedback-2026-05-18 Phase A.1)**

Codifies the classification rule Architect applies to every V-item in a V2 roadmap: anchor the architectural boundary NOW in `tech-strategy.md`, or DEFER until the gating condition triggers. Eliminates the silent failure where a future Architect re-derives a boundary cold and a Tier 2 implementer paints into a corner that the original Architect could have prevented with ~30 lines of forward-anchoring.

## §1. Pattern in one sentence

For each V-item in the architect's V2 roadmap, classify as `architecture-now` (anchor the boundary in `tech-strategy.md` at roadmap-creation time — three triggers must hold) or `architecture-deferred` (write the boundary later when the gating condition triggers — any one of three triggers fires). The classification + one-line reason annotate the V-item's scope-table row. Critic confirms each classification matches its V-item content.

## §2. When this fires

- Architect produces a V2 roadmap (a `tech-strategy.md` section or PRD addendum listing V-1, V-2, ..., V-N future items) → classify every V-item at roadmap-creation time.
- Architect revises a V2 roadmap (V-item added, removed, reshaped, or its gating condition changed) → re-classify the affected item.
- Critic reviews any `tech-strategy.md` artifact containing V-items → confirm classification field present + value matches V-item content (Critic axis-add itself lands in Phase B; see §6).

## §3. The classification rule

### `architecture-now` — anchor the boundary at roadmap-creation time

**ALL THREE triggers must hold** per `framework-feedback-2026-05-18.md §5 proposed change`:

1. **The boundary composes with a shipped or in-flight interface.** The composition shape is in the architect's working memory NOW — it's cheap to write down. (After 4-6 weeks of unrelated work, the shape decays and the boundary takes longer to re-derive.)
2. **There is a non-trivial implementer wrong-path risk if the boundary is not locked.** A tempting wrong-reuse, a parallel-build risk, or a "looks adjacent — reuse the existing thing" trap.
3. **The boundary spec costs less than ~40 lines of `tech-strategy.md` to write.** If the boundary is genuinely larger, the V-item is itself a Tier 1 work item and should be promoted out of V2 into the active scope.

If all three hold → anchor now. The cost is ~30 lines in `tech-strategy.md`; the benefit is the next implementer reads the lock instead of painting a corner.

### `architecture-deferred` — write the boundary later

**ANY ONE of three triggers fires** per `framework-feedback-2026-05-18.md §5 proposed change`:

1. **The boundary depends on a vendor pick that hasn't happened.** Twilio vs. Retell vs. Vapi for voice; Pinecone vs. Weaviate vs. pgvector for embeddings; Stripe vs. Lago vs. Paddle for billing. Locking the boundary before picking the vendor either picks the vendor implicitly (bad — defer the actual decision) or builds an over-abstracted interface no actual vendor maps to (worse).
2. **The boundary depends on telemetry signals not yet available.** Choice between in-process queue vs. external queue depends on actual concurrency / scale signals; locking before the signal is silently overfitting to current scale assumptions.
3. **The boundary is sufficiently independent that a future architect can re-derive it cold without painting prior code into corners.** No active composition, no implementer wrong-path risk, no looming "looks adjacent — reuse the existing thing" trap. Cheap to revisit.

If any one of these fires → defer. The cost is re-derivation work later; the benefit is no premature lock-in.

### What this rule prevents

Two failure modes per `framework-feedback-2026-05-18.md §5 paragraph "A naive future Architect"`:

- **Anchor-everything Architect** — bloats `tech-strategy.md`, premature lock-in, locks shapes that aren't actually clear yet. Wastes both authoring time and reading time.
- **Anchor-nothing Architect** — drops the optimization. Future implementer paints into a corner. The corner-paint shows up as a Tier 2 reportback "took 2 days to back out the wrong reuse" or a Critic flag "tech-strategy is missing the obvious boundary."

The classification rule is the middle path. Auditable.

## §4. Per-V-item annotation contract

Every V-item in a V2 roadmap (whether in `tech-strategy.md`, a PRD addendum, or a scope.md V-section) carries a one-line classification + one-line reason in the scope-table row:

```markdown
| V-N | <one-line description> | <gating condition> | <effort estimate> | **architecture-now** — <one-line reason: composition + risk + cost> |
| V-M | <one-line description> | <gating condition> | <effort estimate> | **architecture-deferred** — <one-line reason: vendor-pick / telemetry / independent> |
```

The reason is concrete:
- For `architecture-now`: name the composition target (the shipped interface) AND the wrong-path risk (the tempting wrong-reuse / parallel-build) AND a rough line-cost estimate.
- For `architecture-deferred`: name which of the three triggers fired AND why (vendor name range / signal description / independence assertion).

If you cannot write either line concretely, the V-item is mis-scoped or you haven't thought about it enough. There is no `unclassified` value.

## §5. Reserved section in `tech-strategy.md` — `## Architecture-now V-anchors`

For every V-item classified `architecture-now`, the boundary write lands in a reserved section of `tech-strategy.md`:

```markdown
## Architecture-now V-anchors

### V-N: <one-line V-item description>
- Composes with: <shipped/in-flight interface>
- Wrong-path risk this prevents: <one-line description of the tempting wrong-reuse>
- Boundary shape: <interface name + key method signatures + delegation contract — ~10-30 lines>
- Open question if any: <one-line OQ ID per protocols/decision-class-taxonomy.md if a non-engineering authority must resolve a sub-decision>
```

**Reserved section name:** `## Architecture-now V-anchors` (exact title). Architect places the section after the main tech-strategy content (typically post-§"Riskiest Technical Bets") and before any appendices.

**Template addition deferred to Phase B.** `templates/tech-strategy.md` exists at this Tier 1 framework root (verified 2026-05-18); the template addition adding this reserved section is queued for Phase B per `framework-feedback-2026-05-18-triage.md` Phase D sequencing for Item 7's template work. Until the template lands, Architect adds the section ad-hoc per this protocol's §5 contract — the protocol IS the spec; the template caches the spec.

## §6. Critic check at tech-strategy review

**[FUTURE — Phase B Critic axis-add]**

At Critic review time, for any `tech-strategy.md` artifact containing V-items, Critic checks:
- Every V-item has a classification field (`architecture-now | architecture-deferred`).
- The value matches the V-item content per §3 rule (e.g., a V-item that depends on Twilio-vs-Retell vendor pick AND is classified `architecture-now` is flagged — vendor-pick-pending fires `architecture-deferred`).
- Every `architecture-now` V-item has a corresponding entry in the `## Architecture-now V-anchors` section.
- Each anchor entry has all four fields per §5 (Composes with / Wrong-path risk / Boundary shape / Open question).

This axis-add is **bundled with three other axis-adds** into one Critic prompt-version bump in Phase B per `framework-feedback-2026-05-18-triage.md` "Notes the user might want to know" item 2:
- `depth_assessment` axis from Item 1 (research-artifact depth)
- `decision_class` axis from Item 3 (per `protocols/decision-class-taxonomy.md`)
- V-anchor classification axis from Item 5 (this protocol)
- Addendum-vs-revision axis from Item 7

Until that bump lands, classification gaps are caught by Architect self-discipline and consistency-check at `scoping → planned` (Conductor's existing check pairs).

## §7. Worked examples

Both drawn verbatim from this session's eligibilities-hub V2 roadmap per `framework-feedback-2026-05-18.md §5 paragraphs "V-1 inbound fax" and "V-8 voice partnership"`.

### Example 1: V-1 inbound fax — `architecture-now`

```markdown
| V-1 | Inbound fax intake | First customer requests inbound (currently outbound-only) | M | **architecture-now** — composes with shipped IArtifactStorage + ArtifactClassifierService; wrong-path risk: tempting IAttachmentTransport reuse (outbound-only); boundary spec ~25 lines |
```

All three `architecture-now` triggers hold:

1. **Composition with shipped interface.** Inbound fax shape composes with `IArtifactStorage` + `ArtifactClassifierService` which shipped in current scope `[framework-feedback-2026-05-18 §5 paragraph "V-1"]`.
2. **Wrong-path risk.** An implementer would reasonably reach for `IAttachmentTransport` to handle inbound — but that interface is **outbound-only**. Reusing it wraps the inbound flow in outbound semantics that don't match. The mis-reuse is the kind of "looks adjacent" trap §3.2 names.
3. **Boundary cost.** Locking `IInboundFaxReceiver` shape now is ~25 lines (interface signature + key method + relationship to `IArtifactStorage` for storage delegation + relationship to `ArtifactClassifierService` for content classification). Under the ~40-line threshold.

`## Architecture-now V-anchors` entry:

```markdown
### V-1: Inbound fax intake
- Composes with: IArtifactStorage (shipped — Phase A robustness-pass), ArtifactClassifierService (shipped — Phase A robustness-pass)
- Wrong-path risk this prevents: implementer reuses IAttachmentTransport (outbound-only) and wraps inbound in outbound semantics
- Boundary shape: IInboundFaxReceiver { receiveFax(payload: FaxPayload): Promise<ArtifactRef>; subscribe(handler: InboundFaxHandler): Subscription } delegating to IArtifactStorage.put for persistence + ArtifactClassifierService.classify for content type
- Open question if any: none at this layer (vendor pick for inbound fax provider is V-1's gating condition, NOT a sub-decision)
```

### Example 2: V-8 voice partnership — `architecture-deferred`

```markdown
| V-8 | Voice partnership for clinic intake | First clinic requests phone-call intake AND voice vendor selection complete | L | **architecture-deferred** — depends on vendor pick (Twilio vs. Retell vs. Vapi) which has not happened; locking before pick either picks implicitly or over-abstracts |
```

`architecture-deferred` trigger §3-deferred-1 fires (vendor pick pending):

- Twilio, Retell, and Vapi have meaningfully different interface shapes (synchronous vs. webhook-driven; first-party LLM integration vs. bring-your-own; managed conversational state vs. roll-your-own).
- Picking one shapes the IVoicePartner interface; locking the interface before picking either implicitly picks (e.g., a webhook-only contract de-facto picks Retell) or builds an interface so abstract no vendor maps to it without translation overhead.
- The V-item gating condition itself names "vendor selection complete" as a precondition. Defer the architecture write to that moment.

No `## Architecture-now V-anchors` entry. The V-item lives only in the V2 roadmap until its gating condition fires.

## §8. Cross-protocol consistency

- **`protocols/decision-class-taxonomy.md` — V-anchor decisions and OQ classes are orthogonal.** When a V-anchor surfaces a sub-decision as an OQ (e.g., "Should IInboundFaxReceiver also expose a delete operation for compliance?"), the OQ classifies per the decision-class taxonomy (this example: probably `legal` — compliance scope). The V-item's `architecture-now | architecture-deferred` classification is separate from the sub-OQ's `operational | strategic | commercial | clinical | legal` class.
- **V-anchor decisions surfaced in Decision Packets typically classify as `strategic`** per the decision-class taxonomy, because anchoring-now is a multi-quarter direction signal. Confirmed by §8 in this protocol's companion `protocols/decision-class-taxonomy.md` §11.
- **`protocols/workstream-index.md` — Reading order** for a workstream that produced a V2 roadmap should include both the V2 roadmap artifact AND any `architecture-now` V-anchor entries in `tech-strategy.md`. The anchors are not separate artifacts but cross-cited sections.
- **`protocols/checkpoint-protocol.md` — Consistency-check.** Conductor's `scoping → planned` consistency check (per `agents/conductor.md` §"Consistency Check — When and What") should verify V-item classifications are present and the `## Architecture-now V-anchors` section exists when ≥1 V-item is classified `architecture-now`. Implementation deferred to the Phase B Critic axis-add per §6 (consistency-check vs. Critic-axis overlap — Critic-axis is the canonical reviewer; Conductor's consistency-check is structural).

## §9. Forbidden behaviors

- ❌ V-item without a classification field (no `unclassified` value; if you can't classify, you haven't thought about the V-item enough).
- ❌ V-item classified `architecture-now` without a corresponding entry in `## Architecture-now V-anchors`.
- ❌ V-item classified `architecture-now` whose boundary spec exceeds ~40 lines (promote to active scope; the V-item is a Tier 1 work item, not a future-deferred one).
- ❌ V-item classified `architecture-deferred` with a write of the boundary in `tech-strategy.md` anyway (contradicts the classification; either upgrade to `architecture-now` or remove the boundary write).
- ❌ Anchor entry missing any of the four §5 fields (Composes with / Wrong-path risk / Boundary shape / Open question).

## §10. Forward references — Phase B

- **Critic axis-add** (per §6) — bundled with Items 1, 3, 7 axis-adds into one Critic prompt-version bump.
- **`templates/tech-strategy.md` update** — `## Architecture-now V-anchors` reserved section added to template per §5; deferred to Phase B per Phase A.1 scope.

## §11. Composes with

- `protocols/decision-class-taxonomy.md` — orthogonal classification axis; V-anchor sub-decisions surface as OQs per the taxonomy.
- `protocols/workstream-index.md` — Reading order cites `tech-strategy.md` and its `## Architecture-now V-anchors` section.
- `protocols/checkpoint-protocol.md` — consistency-check at `scoping → planned` confirms classification presence.
- `agents/architect.md` — owner of the classification step + the `## Architecture-now V-anchors` section authoring.
- `agents/critic.md` — Phase B axis-add per §6.
- `templates/tech-strategy.md` — Phase B template update per §5.
