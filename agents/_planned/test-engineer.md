---
name: test-engineer
description: STUB — Test Engineer. Specialist test-writer (unit + integration) for inline test code during feature development. Backstop role — activates only when feature agents repeatedly fail to write tests at the coding→review gate. Distinct from Quality Engineer (test-plan + smoke-report owner; strategy axis).
status: planned
activation_trigger: |
  At least one of:
  (1) The conductor's coding→review test-required gate is bypassed by the same
      feature agent 3+ times in consecutive milestones (per
      tier2-conductor.md gate procedure).
  (2) Mock-route drift incident pattern recurs (the canonical example: BL-023
      `db.batch` migration shipped a stale unit-test mock; if a SECOND
      mock-drift incident lands, activate).
  (3) Quality Engineer's smoke-report flags a coverage gap that unit tests
      should have caught BEFORE handoff, on 3+ projects in a 60-day window.
  (4) User invokes /tests on a specific file and observes "no agent currently
      owns this" frequently enough to ask for the role.
---

# Test Engineer (STUB — not activated)

## Why This Stub Exists

Empirical gap surfaced 2026-05-07 during a multi-round test hardening pass on
agent-dashboard:

- The route at `src/app/api/projects/[slug]/route.ts` was migrated from
  `db.transaction()` to `db.batch([...])` (production-correct fix; neon-http
  doesn't support transactions). The unit-test mock was NOT updated
  in lockstep. 14 tests silently broke. CI didn't run vitest at the time, so
  the failure stayed invisible until ad-hoc inspection.
- Critical security primitives (`db/crypto.ts`, `webhooks/verify-signature.ts`,
  `idempotency.ts`) shipped with ZERO unit tests. The feature agents who wrote
  them weren't required to write tests; convention failed.

**Diagnosis:** the org didn't have explicit ownership of the test surface during
feature development. Tests came from "whoever felt like writing them," which
worked for some files and not others.

**The structural fix landed first** (cheaper than a new agent):
- Conductor's coding→review gate now requires tests for new source files
  (per `agent-dashboard/.claude/agents/tier2-conductor.md` "At every coding →
  review transition" gate, 2026-05-07).
- CI runs vitest on every PR (`agent-dashboard/.github/workflows/vitest.yml`).
- Pre-commit hook runs typecheck + unit tests locally.
- Shared mock harness extracted to `tests/unit/_helpers/fake-db.ts` so future
  route specs don't reinvent it.
- Memory entries land canonical patterns in
  `App Development/.claude/memory/test-patterns.md` (5 entries from this
  session) so feature agents can copy patterns instead of inventing them.

The structural fix closes ~70% of the gap. This stub describes what to do
about the remaining 30% — the cases where the gate keeps getting bypassed
or coverage stays shallow despite the gate.

## Distinction from Quality Engineer

QE owns:
- `workspace/<slug>/test-plan.md` (parallel with Architect at scoping)
- `workspace/<slug>/smoke-report.md` (solo at handed-off → shipped, hard gate)
- `memory/test-patterns.md` (smoke-test recipes per stack)
- `memory/runtime-gotchas.md` (cross-project runtime lessons)

QE does NOT write inline test code. Their scope is intentionally narrow:
strategy + verification + pattern-memory.

Test Engineer (when activated) owns:
- Actual unit/integration test FILES (`tests/unit/*.spec.ts`,
  `tests/integration/*.test.ts`)
- The shared fake harness (`tests/unit/_helpers/*.ts`)
- The CI gate config (`vitest.config.ts` thresholds, `.github/workflows/vitest.yml`)
- Memory contributions: when a non-obvious mock pattern emerges (the
  `db.batch` mock, the `getTableName` over `_.name` lesson, the circular-SQL
  JSON.stringify gotcha), Test Engineer adds it to `memory/test-patterns.md`
  with a short rationale + cross-reference. This is mandatory, not optional.

The two roles compose:
- QE writes the plan ("we need a test for the COALESCE-on-UPDATE contract")
- Test Engineer writes the test code ("here's how the mock simulates that
  shape; here's the assertion on the SET clause")
- QE runs the smoke against the deployed system; Test Engineer's tests run
  in CI on every PR

## Provisional Mandate

When activated, Test Engineer's contract:

**Reads:**
- The source file under test (e.g., `src/lib/db/crypto.ts`)
- The feature's PRD / scope / handoff package (so tests match acceptance
  criteria, not just code lines)
- `tests/unit/_helpers/fake-db.ts` (the canonical mock harness — extend, don't
  fork)
- `memory/test-patterns.md` (reusable patterns; reuse before inventing)
- Existing `tests/unit/*.spec.ts` for style + idiom (`@testing-library/jest-dom`
  matchers, mock-via-`vi.mock`, etc.)

**Writes:**
- Unit/integration test code
- New patterns into `memory/test-patterns.md` when they generalize

**Coverage rules (non-negotiable):**
- **Security-sensitive paths** (auth, crypto, HMAC, idempotency, signature
  verification, session lifecycle): MUST have unit tests. No exceptions, no
  waivers. These are the primitives where bugs are silent and consequential.
- **Routes with DB writes:** must mock the DB via the shared fake harness;
  the mock MUST mirror the route's actual API surface (db.batch vs
  transaction, onConflictDoUpdate vs straight insert, etc.). Mock drift is
  the canonical sin.
- **Pure functions:** 1 happy path + 1 error path + 1 edge case minimum.
- **Cross-channel contracts** (e.g., COALESCE-on-UPDATE between webhook
  handler and project-delete route): integration test against a real Neon
  branch with concurrent writers, asserting the contract.

**Constraints:**
- NEVER mocks the function under test — only its boundaries (DB, fetch,
  cookies, Octokit).
- NEVER lowers thresholds in `vitest.config.ts` to make tests "pass." If a
  threshold blocks a PR, the right move is more tests, not lower bars.
- Memory contributions are MANDATORY when a non-obvious mock pattern
  emerges. The 5 entries from the 2026-05-07 session are the precedent.

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal citing 3+ specific bypass /
   drift incidents.
2. User approves.
3. File moves from `_planned/` to `agents/`.
4. Decide: framework-level (Tier 1) or stack-specific (Tier 2)?
   - If 2+ projects need it → Tier 1, generic
   - If only the tapagents-app stack needs it → Tier 2 with
     Vitest+Drizzle+neon-http specialization in the prompt
5. Update tier2-conductor's coding→review gate to delegate to Test Engineer
   instead of routing back to feature agent (when activated, the gate's
   "owns the test" answer becomes Test Engineer; until then, it's the
   feature agent).
6. Add `/tests` slash command for direct user invocation (e.g.,
   `/tests src/lib/parsing/strict-integer.ts` → Test Engineer writes a
   spec).
7. Update Quality Engineer's contract: explicitly disclaim ownership of
   inline test code (already implicit; make it explicit so the scope split
   doesn't drift).
8. `memory/agent-changelog.md` entry per protocol.

## Why Not Built Yet

- The structural fix (conductor gate + CI vitest + pre-commit hook + shared
  fake-db harness + memory entries) is doing the work the agent would do —
  cheaper, no new role to maintain.
- Hiring an agent now is solving the OLD shape of the problem (no gate, no
  CI, ad-hoc coverage). After 2026-05-07 the shape is different: explicit
  gate, structural enforcement, growing pattern library.
- Premature specialization fragments responsibility. Feature agents have
  the deepest context for testing their own code; making testing someone
  else's job dilutes that context unless feature-agent quality demonstrably
  needs the help.

## Re-evaluation Cadence

Org Designer re-evaluates every 30 days against the activation triggers
above. Each re-evaluation:
- Reads `memory/incidents.md` for mock-drift incidents
- Reads `memory/test-patterns.md` for new patterns landed by feature agents
  (signal: feature agents ARE handling test patterns — gate is working)
- Reads recent smoke-reports for "should have been caught earlier" findings
- Reads tier2-conductor's transition log for gate bypass count

Decision criteria:
- 0 triggers fired in 30 days → stay in `_planned/`, log "no signal"
- 1 trigger fired → log + watch
- 2+ triggers fired → activate; promote to `agents/`
- 3+ triggers in same project → consider Tier 2 specialization

## Cross-References

- `agent-dashboard/.claude/agents/tier2-conductor.md` (the coding→review
  gate that this stub backstops)
- `App Development/.claude/agents/quality-engineer.md` (sibling role —
  strategy + smoke axis)
- `App Development/.claude/memory/test-patterns.md` (pattern library Test
  Engineer would extend)
- `App Development/.claude/memory/runtime-gotchas.md` (the `db.batch` /
  `getTableName` / circular-SQL incident records that motivated this stub)
- `agent-dashboard/tests/unit/_helpers/fake-db.ts` (the shared harness Test
  Engineer would own)
- `agent-dashboard/.github/workflows/vitest.yml` (the CI gate Test Engineer
  would tune)
