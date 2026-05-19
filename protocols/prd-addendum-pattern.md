# PRD-Revision-vs-Addendum Pattern

**Version: 1.0 (introduced 2026-05-18 via framework-feedback-2026-05-18 Phase B.4)**

Codifies when Strategist (or any artifact-producing agent) writes a PRD revision (in-place rewrite, rev N → rev N+1) vs. when it writes a PRD addendum (parallel artifact, cites the PRD). Eliminates the silent failure modes where a naive author either always-rewrites (PRD churn, future agents re-read the same product narrative N times) or always-addends (PRD becomes a stale skeleton with N parallel addenda nobody can navigate).

## §1. Pattern in one sentence

Every Strategist-authored artifact that supplements a live PRD declares EITHER `Status: PRD revision (rev N → rev N+1)` OR `Status: Draft addendum to prd.md rev N; not a PRD rewrite`. Strategist classifies at authoring time per §3 decision rule, cites which trigger fires, and Critic confirms the choice per `agents/critic.md` Phase B `addendum_vs_revision` axis. Revisions become the new canonical product narrative; addenda are explicit secondary entry points cross-cited from `protocols/workstream-index.md`.

## §2. When this fires

- Strategist supplements an existing PRD with new product/positioning content — classify as revision or addendum at authoring time.
- Strategist responds to a Critic concern or user-directed change request on a live PRD — same classification step (most often a revision when content shifts product semantics; addendum when adding a parallel frame).
- Architect or other downstream agent produces a PRD-supplementing artifact (rare but possible, e.g., a competitive-positioning addendum authored by Architect when Strategist is unavailable) — same classification rule applies.
- Critic reviews any Strategist artifact that supplements a live PRD — confirm the `Status:` declaration is present + the choice is justified per §3 (Critic axis-add itself lands per `agents/critic.md` Phase B; see §6).

## §3. The classification rule

### PRD-revision (in-place rewrite, rev N → rev N+1)

**ANY ONE of three triggers fires** per `framework-feedback-2026-05-18.md §7 proposed change`:

1. **The change shifts product semantics.** Target user, value prop, in-scope features change. The canonical product narrative is no longer accurate without the change — readers who consume only the old PRD get a wrong picture. Examples: persona pivot (PT/OT clinics → multi-specialty MSO mid-market), MVP-IN list reshape (added a new flagship feature class), value-prop reframe (workflow tool → AI-first decision support).

2. **The change introduces or removes a major user story or risk.** The PRD's user-stories section or risks-for-Architect section materially expands or contracts. A future Architect reading only the old PRD would mis-scope the architecture.

3. **The change is the canonical answer downstream agents need indefinitely.** Multi-quarter durability — Architect, Critic, future GTM, future implementers all consume this as the single source of truth from now on. The change is not time-stamped to a specific moment; it represents the new canonical product reality.

If any one of these holds → revise in-place. Increment rev number (`rev 3.1 → rev 3.2`; major version bumps for major semantic shifts). The old PRD content is replaced; revision-note at top of PRD records what changed and why.

### PRD-addendum (parallel artifact, cites the PRD)

**ANY ONE of three triggers fires** per `framework-feedback-2026-05-18.md §7 proposed change`:

1. **The change introduces a parallel frame that supplements but doesn't replace the canonical PRD.** Competitive positioning, regulatory positioning, segment-specific positioning, audience-specific positioning. The canonical product narrative stays valid; the addendum adds a frame downstream agents can read alongside.

2. **The change carries its own decision-packet trail that doesn't belong in the PRD's lifecycle.** The change has its own OQs, its own checkpoints, its own dispatch dependencies that resolve on a different cadence than the PRD's revision cycle. Folding into the PRD would entangle the two timelines.

3. **The change is time-stamped to a specific moment.** Competitive scan, regulatory event, market shift. The change should be READ AS a moment ("here's what we knew about the competitive landscape on 2026-05-18") — not absorbed-and-forgotten into the PRD where its time-stamp is lost.

If any one of these holds → write an addendum. File name carries the time stamp (e.g., `competitive-positioning-2026-05-18.md`, `regulatory-update-2026-Q3.md`, `segment-positioning-mso-mid-market-2026-05-18.md`). Header declares the addendum status + the trigger that fires. Cross-cites the supplemented PRD sections.

### What this rule prevents

Two failure modes per `framework-feedback-2026-05-18.md §7 paragraph "A naive Strategist"`:

- **Always-rewrite Strategist** — every supplement becomes a PRD revision. PRD churn: revs accumulate (rev 3.1 → 3.2 → 3.3 → 3.4 → 3.5 within a single quarter). Downstream agents re-read the canonical narrative N times for material that's actually parallel-frame content. The PRD's audit trail blurs — what changed in 3.2 vs 3.4 becomes hard to recover.

- **Always-addendum Strategist** — every supplement becomes a parallel artifact. PRD becomes a stale skeleton with N parallel addenda nobody can navigate. The canonical product narrative drifts from reality because semantic shifts that should have folded into the PRD instead sit as siblings. Future agents must read PRD + N addenda + cross-check for contradictions. Workstream-index helps but only after ≥3 artifacts threshold; below that, the navigation cost compounds without offset.

The classification rule is the middle path. Auditable per §6 Critic axis.

## §4. Self-check at authoring time

Strategist runs the classification at the moment of authoring the supplement. The step has three substeps:

1. **Read the change.** What's changing? Who reads it? On what cadence?
2. **Apply the rule.** Walk §3 triggers in order — revision triggers first (1, 2, 3), then addendum triggers (1, 2, 3). The FIRST trigger that fires determines the classification. Revision triggers take precedence: if both a revision trigger AND an addendum trigger fire (e.g., a competitive frame that ALSO shifts the target persona), the change is a revision because semantic shift dominates parallel framing.
3. **Cite the trigger in the artifact header.** State explicitly which trigger fired and why. The header `Trigger:` line is the audit surface Critic and future readers consume.

Default when uncertain: **PRD revision**. Most semantic-grade changes are revisions; the addendum is the more disciplined choice (preserves the canonical PRD, lower churn) but the wrong default — defaulting to addendum when a revision is actually called for is the more common silent-failure mode per §3's always-addendum trap.

## §5. Header conventions

### Revision header

```markdown
# PRD — <project-name> (rev N+1)

**Status:** PRD revision (rev N → rev N+1)
**Date:** <ISO date>
**Author:** Strategist
**Revision note:** <one-paragraph summary of what changed in this rev and why>
**Trigger:** <which §3 revision trigger fired — semantic shift / user-story-or-risk change / canonical-indefinite-answer>

[rest of PRD content, incorporating the change in-place]
```

The prior rev's content is replaced; the revision-note at top is the audit trail. The supersession is recorded in `state.json.prd_revision_history[]` per Conductor's existing transition flow.

### Addendum header

```markdown
# <addendum title>

**Status:** Draft addendum to `prd.md` rev N; not a PRD rewrite
**Date:** <ISO date>
**Author:** Strategist (or other producing agent)
**Relationship to PRD:** This document supplements PRD §X (<section name>), §Y (<section name>)... It does not modify the live PRD text; downstream feature briefs may cite either.
**Trigger:** <which §3 addendum trigger fired — parallel frame / own decision-packet trail / time-stamped moment>

## §1. Citation index

| PRD § | Section name | This addendum's relationship |
|---|---|---|
| §X | <section name> | Supplements with <frame> |
| §Y | <section name> | Supplements with <frame> |

[rest of addendum content]

## §N. Composes with

- `prd.md` rev N (canonical product narrative)
- <other addenda this composes with, if any>
- <relevant Architect or Designer artifacts>
```

The addendum is filed alongside the PRD at `workspace/<slug>/<addendum-name>-<ISO-date>.md`. The supplemented PRD sections are unchanged. Workstream-index per `protocols/workstream-index.md` §4 lists the addendum as a secondary entry point in Reading order.

The `templates/prd-addendum.md` template caches this addendum-header shape — author addenda using the template; the protocol is the spec.

## §6. Critic check at review time

**[FUTURE — Phase B Critic axis-add lands in same dispatch as this protocol]**

At Critic review time, for any artifact that supplements a live PRD, Critic checks:

- The artifact's header declares EITHER `Status: PRD revision (rev N → rev N+1)` OR `Status: Draft addendum to prd.md rev N; not a PRD rewrite`.
- The choice is justified — the `Trigger:` line names which §3 trigger fires.
- For addendums: the §1 citation index is present and lists supplemented PRD sections.
- For revisions: the revision-note at top summarizes what changed and why.

This is the `addendum_vs_revision` axis on Critic per `agents/critic.md` Phase B. It bundles with three other axis-adds (`depth_assessment`, `decision_class` correctness, V-anchor classification justification) into one Critic prompt-version bump per `framework-feedback-2026-05-18-triage.md` "Notes the user might want to know" item 2.

Until the bump lands, classification gaps are caught by Strategist self-discipline at §4 + by user inspection at the next checkpoint when EA surfaces the addendum-vs-revision shape in a Decision Packet.

## §7. Worked example — competitive-positioning-<ISO-date>.md (addendum)

This protocol exists because of a working example. A Strategist authored `workspace/<project>/competitive-positioning-<ISO-date>.md` as an addendum to `prd.md` rev N (NOT a PRD rewrite). The addendum's actual header read:

```markdown
**Status:** Draft addendum to `prd.md` rev N; not a PRD rewrite
**Relationship to PRD:** This document supplements PRD §2 (target user), §6 (active backlog), §7 (success criteria), §8 (out-of-scope), and §11 (risks for Architect). It does not modify the live PRD text; downstream feature briefs may cite either.
```

Applying §3 to confirm this classification was correct: the change introduced a competitive frame that supplemented the canonical product narrative without replacing it. Trigger §3-addendum-1 fired (parallel frame: competitive positioning supplements but does not replace the canonical PRD). The target persona stayed valid — the competitive analysis added context, did not shift the target user. The PRD's MVP-IN/MVP-OUT list stayed valid — the addendum's quick-wins folded into scope.md §6, not into the PRD's IN list. The addendum also carries its own decision-packet trail (`decision-packet-competitive-positioning-<ISO-date>.md` with its own OQ block, e.g., OQ-CP1..OQ-CP6) on a different cadence than PRD rev N → N+1 — addendum-trigger §3-addendum-2 also fires. And the time-stamp (`-<ISO-date>`) tags it to a moment — addendum-trigger §3-addendum-3 also fires. Three of three addendum triggers held; the classification was correct.

A counter-factual: had the same session shifted the target persona to a different segment definition, the change would have hit revision-trigger §3-revision-1 (semantic shift in target user). Even though the trigger material came from competitive context, the resulting change to product semantics is a revision, not an addendum. PRD rev N → N+1 with revision-note explaining the persona pivot is the right shape.

**This worked example lives in a Tier 2 project workspace** NOT present in this Tier 1 framework root — the artifact name is the canonical reference; full content is in the project's own workspace.

## §8. Composes with

- `agents/strategist.md` — owner of the classification step at PRD-supplement authoring time per §4.
- `agents/critic.md` — Phase B `addendum_vs_revision` axis per §6.
- `templates/prd-addendum.md` — caches the addendum-header shape per §5; introduced in Phase B.4 alongside this protocol.
- `protocols/workstream-index.md` — addenda surface as secondary entry points in workstream-index Reading order per workstream-index §4. The reading-order entry for an addendum cites both the addendum AND the PRD section it supplements (no orphan addendum entries).
- `protocols/decision-class-taxonomy.md` — addenda may carry their own OQs (per addendum-trigger §3-2); each OQ classifies per the taxonomy. Addenda do NOT inherit the PRD's OQ list; they add their own.
- `protocols/checkpoint-protocol.md` — Decision Packet surface where addendum-vs-revision shape is rendered (revisions trigger a `prd-ok` re-review at the user's discretion; addenda do NOT re-trigger `prd-ok` unless cross-cited per checkpoint protocol).

## §9. Forbidden behaviors

- ❌ Strategist supplements a PRD without declaring `Status: PRD revision` OR `Status: Draft addendum`. Header is required — silent supplements are unauditable.
- ❌ Header declares addendum status but the change actually shifts product semantics (§3-revision-1 trigger fired). This is the always-addendum trap; Critic axis-add catches it.
- ❌ Header declares revision but the change is purely a parallel frame (§3-addendum-1 trigger fired) with no semantic shift. This is the always-rewrite trap; Critic axis-add catches it.
- ❌ Addendum without `## §1. Citation index` listing supplemented PRD sections (§5 header convention violated).
- ❌ Revision without `Revision note:` at top summarizing the change (§5 header convention violated).
- ❌ Addendum that modifies the live PRD text (per §5: "It does not modify the live PRD text"). If the addendum needs to change PRD text, the change is a revision, not an addendum.

## §10. Forward references

- **`templates/prd-addendum.md`** — template introduced in Phase B.4 alongside this protocol, caches §5 addendum-header shape.
- **`agents/critic.md` `addendum_vs_revision` axis** — Critic axis-add bundled with three others in Phase B.1.
- **`agents/strategist.md` PRD revision-pass algorithm step 3 per `agents/strategist.md`** — Strategist's PRD revision-pass algorithm gains the classification step in Phase B.4.

## §11. Cross-protocol consistency

- **`protocols/workstream-index.md`** — multi-artifact workstreams that include both a PRD revision and one or more addenda render in workstream-index Reading order with the revision FIRST (canonical narrative), then addenda in chronological order (oldest first), each annotated with its supplemented PRD sections.
- **`protocols/decision-class-taxonomy.md`** — OQs that appear in addenda classify per the taxonomy independent of the PRD's OQs. An addendum's OQ list does NOT inherit from PRD; it's a parallel decision surface per addendum-trigger §3-addendum-2.
- **`protocols/checkpoint-protocol.md`** — revisions trigger consistency-check + Critic re-review at user discretion (the `prd-ok` checkpoint may re-fire); addenda do NOT re-trigger `prd-ok` because they don't replace the canonical PRD (per §1).
