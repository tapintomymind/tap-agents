# Org Designer Proposal — QE Promotion: Planned → Active

**Date:** 2026-05-06
**Type:** prompt-update (planned-to-active promotion)
**Trigger:** managed-surface auto-push positioning under v1.5 requires vendor-owned regression discipline at every release gate
**Status:** Proposed — awaiting user approval

---

## Observation

The active `quality-engineer.md` (12K) was hand-authored at activation time. The planned stub `_planned/quality-engineer.md` (17K) is a more complete, higher-fidelity contract that was drafted simultaneously with the original org-design proposal. The stub was never formally promoted because activation happened outside the standard Org Designer promotion flow.

### Files read

- Active: `.claude/agents/quality-engineer.md`
- Planned stub: `.claude/agents/_planned/quality-engineer.md`

### Concrete deltas — what the 17K stub has that the 12K active does not

- **Full activation-step checklist (11 steps):** exact file moves, template creation, Conductor/Critic/Architect cross-agent update steps, state-machine wiring, memory-initialization steps. Active version has none of this (activation already happened, but the record of what was supposed to happen is in the stub, not the active file).
- **`TEST_AUTH_BYPASS` pattern section:** active version has this (added post-activation); stub does not — making the active version ahead on this specific item.
- **Future-growth lens section:** stub has explicit fragmentation triggers (Test Strategist / Verification Engineer split at >50% project fire rate), sub-role spawn thresholds (Performance Engineer at >1k DAU, Accessibility at enterprise), Tier 2 mirror pattern, and Merge-with-Critic assessment. Active version: absent.
- **"Why Not Built Yet" section:** stub has a 4-point rationale for stub form and why N=1 evidence justified it without crossing the 3+ recurrence threshold. Useful as institutional memory; absent from active.
- **Tier confusion resolution:** stub explicitly addresses why QE belongs at HQ (cross-project strategy + pattern memory) vs Tier 2 (per-project implementation QA) and how they co-exist at scale. Active version: absent.
- **Slash command specification:** stub references `/qe-smoke <slug>` command shape; active uses `/quality`. Divergence to resolve at promotion.
- **State-machine impact narrative:** stub has an explicit two-paragraph description of how the `handed-off → shipped` checkpoint becomes a 2-step gate. Active version describes the gate but not the structural impact on state-machine contracts.
- **Cross-references block:** stub has explicit links to source proposal, seed incident, counterpart roles, routing owner. Active version: absent.
- **`memory/test-patterns.md` output:** both versions include this output, but the stub's description is more precise about what constitutes a reusable recipe.

### Active version has content the stub does not

- `TEST_AUTH_BYPASS` pattern with implementation detail (added post-activation).
- "Pattern memory compounds" as named operating principle.
- Full "Read on Every Invocation" list (`templates/test-plan.md` and `templates/smoke-report.md` explicitly called).
- Cleaner frontmatter (`trigger_conditions` with `fires_when`, `does_not_fire_when`, `parallel_with` structure).

**Net assessment:** neither file is a superset. The active version is the correct base; it needs to absorb the stub's future-growth, tier-confusion, cross-reference, and state-machine-impact content. This is a merge, not a wholesale overwrite.

---

## Proposal

Merge the stub's institutional-memory sections into the active file. The active file's operational contract (algorithm, outputs, authority, failure modes) is more refined and should remain the base. The stub contributes the sections that make the agent's design legible over time.

**Specifically, add to `.claude/agents/quality-engineer.md`:**
1. `## Future-Growth Lens` section (verbatim from stub — fragmentation triggers + sub-role spawn thresholds)
2. `## Tier Clarification` paragraph (HQ QE vs Tier 2 QE co-existence)
3. `## Cross-References` block (source proposal, seed incident, counterpart links)
4. Update `## Algorithm` intro to include the state-machine 2-step gate narrative (two sentences)
5. Resolve slash-command naming: standardize on `/quality` (already in active frontmatter and Wrong-Agent table) — update stub's `/qe-smoke` reference in the cross-references note

**Do NOT port from stub:**
- Activation checklist (already executed; historical only)
- "Why Not Built Yet" rationale (no longer applicable)
- Raw stub frontmatter (`status: planned`, `activation_trigger`)

### Why this fixes the observation

v1.5 introduces weekly minor / monthly major / quarterly structural release cadence. QE fires at every release gate. The agent's prompt needs the future-growth lens so Org Designer knows when to propose a split, and the tier-clarification so Tier 2 agents don't confuse their scope with QE's scope.

### Cost / risk

Adds ~60-80 lines to active prompt. Well under the 500-line bloat threshold. No behavioral change — additive institutional memory sections only.

### Alternative considered

Wholesale overwrite with the stub (as originally described in the task brief). Rejected: the active file is ahead on `TEST_AUTH_BYPASS`, frontmatter structure, and "Read on Every Invocation" list. Overwriting loses those gains.

---

## Replacement plan

- **Source (stub):** `.claude/agents/_planned/quality-engineer.md`
- **Target (active):** `.claude/agents/quality-engineer.md` — merge additive sections in, not overwrite
- **Mirror to:** `<project>/scaffold-source/agents/quality-engineer.md` — same merged output, per scaffold pattern
- **Frontmatter changes:** none required; active frontmatter (`model: opus`, `trigger_conditions` block) is the correct production shape
- **Disposition of `_planned/` version after promotion:** rename to `quality-engineer-superseded-2026-05-06.md` within `_planned/` — retain as historical reference (contains activation checklist and institutional rationale)

---

## Triggers under v1.5+

- Before any framework release (weekly minor / monthly major / quarterly structural — per v1.5 execution plan Phase 0.1)
- Phase 2 sync: smoke-run on any managed-surface integration before handoff
- Phase 3 user-surface PR gate: smoke-report required before EA Decision Packet on any user-facing PR
- User-reported runtime issues: reactive invocation within 24h of incident logged to `memory/incidents.md`

---

## Acceptance criteria (30 days)

- [ ] QE produces `test-plan.md` on at least 2 projects at the `scoping → planned` checkpoint without routing confusion with Critic
- [ ] At least 1 `smoke-report.md` with explicit enumerated coverage (not green-checkmark-only) clears the `handed-off → shipped` gate
- [ ] `memory/runtime-gotchas.md` has at least 1 new append from a QE invocation (pattern memory compounding)
- [ ] Zero `WRONG_AGENT` returns where QE was asked to do Critic's job (artifact review) — axis split is clean
- [ ] Org Designer sees no spike in user overrides on QE's smoke-report verdicts (override rate stays <40%)

---

## Risks

1. **Merge introduces inconsistency.** Selectively porting stub sections risks creating a franken-prompt where tone or cross-references don't align. Mitigation: do the merge in a single PR, run Critic over the merged file before committing.
2. **Scaffold mirror diverges.** If `<project>/scaffold-source/agents/quality-engineer.md` is not updated in the same commit, future scaffold-based projects get the stale file. Mitigation: single atomic PR covers both.
3. **`/quality` vs `/qe-smoke` naming.** Two invocation patterns exist across files. Users or agents may call the wrong one. Mitigation: standardize on `/quality` in this merge; add a deprecation note in the cross-references block for the stub's `/qe-smoke` alias.

---

## Execution checklist

- [ ] User approves this proposal
- [ ] Merge active + stub additive sections; rename stub to `quality-engineer-superseded-2026-05-06.md`
- [ ] Mirror merged file to `<project>/scaffold-source/agents/quality-engineer.md` in same PR
- [ ] `CHANGELOG.md` (T1) — v0.5.0 entry: "QE prompt — merged institutional-memory sections from planned stub; agent is now the authoritative single file"
- [ ] `memory/agent-changelog.md` — narrative entry (promotion trigger: v1.5 release gates require regression discipline)
- [ ] First QE invocation as hard gate on v1.5 Phase 1 PR (smoke-report required before Phase 1 ships)

---

## One question for the user

After promotion, should the `_planned/quality-engineer-superseded-2026-05-06.md` file be retained indefinitely as a historical reference, or should it be deleted after 90 days (when the activation rationale is no longer operationally relevant)?

---

*Filed by Org Designer — 2026-05-06. Surface in next EA briefing under TEAM HEALTH.*
