# Smoke Report — <project-slug>

**Pass:** <YYYY-MM-DD HH:MM> — <handed-off → shipped gate | re-audit after fix | /quality direct invocation>
**Reviewer:** Quality Engineer
**Deployed URL audited:** <https://...>
**Test plan referenced:** `workspace/<slug>/test-plan.md` (sections cited inline)
**Tier 2 commit / branch:** <commit SHA + branch name from state.json.tier2_deployed_at>

---

## 0. Result envelope (per `protocols/outcome-grading.md`)

This block MUST appear at the top of each pass's section in `smoke-report.md`. Conductor parses the LAST yaml-fenced block in the file when the iteration loop produces multiple passes within one deployment cycle.

````yaml
result: satisfied  # one of: satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/prd.md§Acceptance
criteria_evaluated:
  - id: AC-1
    description: User can authenticate via OAuth and reach /dashboard
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
verdict: LAND-WITH-FOLLOWUPS  # human-readable; optional but recommended
followup_items_filed:
  - BL-NNN  # actual ID allocated by Backlog Curator at filing
  - BL-NNN
````

If `result == unable_to_grade`, add `reason_class:` and `reason_detail:` fields and `criteria_evaluated:` may be empty. See `protocols/outcome-grading.md §2` for full schema + per-criterion semantics.

---

## 1. Project context

- **Project type:** <e.g., dashboard / dev-tool console / agent-driven service>
- **Stack:** <from tech-strategy.md>
- **Deployment target:** <Vercel / Railway / etc.>
- **Test plan source:** `workspace/<slug>/test-plan.md` (each AC mapped to ≥1 test there)

## 2. What was tested

Enumerated. One row per criterion, with result + evidence. Mirrors `criteria_evaluated[]` from the envelope but with prose detail.

| # | Criterion (from envelope) | Test command / probe | Result | Evidence |
|---|---|---|---|---|
| 1 | AC-1: OAuth → /dashboard | `curl -L -b cookie.jar https://.../auth/github` then GET /dashboard | pass | 200 + project list rendered |
| 2 | AC-2: ... | ... | ... | ... |

## 3. What wasn't tested

Enumerated. Surfaces that were in PRD acceptance but explicitly skipped this pass.

- **AC-7: Live OAuth refresh-token rotation** — requires production OAuth credentials; out of scope for smoke
- ...

## 4. What couldn't be tested

Enumerated. Surfaces where infrastructure / tooling blocked execution.

- <criterion> — <reason: rate-limited API, third-party dependency, infrastructure outage, etc.>

## 5. Blocking failures (P0)

Any P0 = transition blocked. Maps to envelope `findings_summary.P0`.

If none: **None.**

For each P0:

```
### P0-1 — <one-line title>

- **Criterion:** <id from envelope>
- **Failing probe:** <exact command / URL / test file:line>
- **Observed:** <what happened>
- **Expected (from PRD AC):** <what the AC says should happen>
- **Why blocking:** <one sentence on user-visible impact>
- **Recommended path:** <implementation hint — Tier 2 fixes; QE does NOT edit code>
```

## 6. Notable failures (P1) — backlog-filed

Maps to envelope `findings_summary.P1` and `followup_items_filed[]`.

```
### P1-1 — <one-line title> (filed as <BL-NNN>)

- **Criterion:** <id from envelope>
- **Failing probe:** <command / URL / test:line>
- **Observed:** <what happened>
- **Recommended path:** <implementation hint>
- **Backlog entry:** `workspace/<slug>/backlog.md §BL-NNN`
```

## 7. Exploratory observations (P2 / notes)

Beyond the planned coverage. Adversarial probes, unexpected behaviors, defense-in-depth hardening opportunities.

- <surface / probe> — <observation>

## 8. Anti-sycophancy log

Required when previous smoke run was fully clean. Document:
- **Cross-run trigger active:** <yes / no — count `last_result == 'satisfied'` across last N envelope history>
- **Forced-adversarial pass framing:** "What's the single weakest probe I haven't run? What does this stack typically fail under?"
- **What surfaced (or didn't):** <findings>
- **If second pass also clean:** "Two-pass clean smoke run — coverage list at [list]; flag for Org Designer if pattern repeats."

Omit this section if any P0 finding exists.

## 9. Sign-off

- **Pass result:** <ship-eligible | blocked on P0 | partial — see §4 for what couldn't be tested>
- **Coverage:** <N criteria evaluated / N planned in test-plan.md>
- **Recommended next action:** <one sentence — e.g., "Approve ship; P1 findings filed as BL-NNN/BL-NNN for next session">
- **Signal:** Conductor + EA notified.

---

_Append-only across passes within a deployment cycle. New passes append a new top-level "Pass: <ts>" header with fresh envelope; do not rewrite prior sections. Across deployment cycles, the file may be overwritten — but within one cycle, the iteration loop produces multi-pass append behavior._
