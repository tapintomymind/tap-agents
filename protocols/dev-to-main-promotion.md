# Dev → Main Promotion Protocol

**Status:** Load-bearing — applies to ALL dev → main promotions in any Tier 2 project that uses a `dev → main with prod gating` branch strategy.
**Authored:** 2026-05-06.
**Authority:** User directive 2026-05-06 — *"I need something that can help us stay coordinated between dev and main etc. Build tooling around what we learned first, then implement the styling into our first app push to main and then the db items too."*

This protocol complements (does not replace):
- `protocols/autonomous-ops-permissions.md` — tier classification + audit routing
- `protocols/changelog-protocol.md` — atomic-cadence + scope split
- `protocols/session-coordination-protocol.md` — Rule 6 (atomic commits per landed unit)
- `protocols/framework-contract-discipline.md` — illustrative-not-binding stack examples

This protocol uniquely owns: **the doctrine, ordering, and tooling contract for promoting code from a dev branch to a main branch when production deploys auto-fire from main and a backing data store may need a schema change.**

---

## §1. Why this exists

Coordination friction observed during 2026-05-06 sessions on the founding Tier 2 project (agent-dashboard): schema changes that should land before code deploys (additive) were on equal footing with schema changes that should land after code deploys (destructive). Without a doctrine, the operator picks ordering by intuition, and intuition fails on the destructive case (deployed code expecting old columns 500s when the column is already gone).

The promotion event is also the moment where multiple concerns collide: dirty working tree, branch parity, type/lint failures, env-var drift, schema delta, deploy verification, audit emission. A single command that encodes the doctrine prevents the operator from omitting any one of them under time pressure.

---

## §2. Scope: when this protocol fires

Promotion-from-dev-to-main fires this protocol when **any** of:

- The promotion includes one or more new schema migrations (additive, destructive, or rename)
- The promotion includes more than 5 commits since the last main merge
- The promotion touches env vars (`.env.*` files, Vercel env, secrets manager scopes — any platform's prod-env surface)
- The user explicitly invokes the protocol's tool (e.g., `./scripts/promote-to-prod.sh` in the agent-dashboard founding example)

A trivial UI-only one-commit hotfix MAY skip the protocol — but defaulting to running it costs nothing.

---

## §3. The three patterns (load-bearing)

Every schema-touching promotion is one of three patterns. The pattern dictates ordering. **Misordering breaks production.**

### §3.1 Additive

Net-new tables, net-new nullable columns, net-new indexes — anything that expands the schema without touching what existing code already reads.

**Ordering:** schema FIRST, code SECOND.

**Why:** the new code uses the new schema surface. If the code deploys before the schema migration, the deployed code returns 500s the moment a request hits the new code path. Migrate first → deployed code finds the table waiting.

**Regex-classifier limit (CONSTRAINT-addition holes):** the tool's pattern matcher cannot reliably tell whether a constraint addition is safe against existing rows. Cases that need manual review and may behave as destructive against a populated table:

- `ALTER TABLE … ADD COLUMN … NOT NULL` (no `DEFAULT`) on a table with existing rows → fails or rewrites the table.
- `ADD CONSTRAINT … UNIQUE` / `ADD CONSTRAINT … CHECK` against existing data → may fail if violators exist.
- `SET DEFAULT` / `DROP DEFAULT` on a populated column → may rewrite or shift application semantics.

The tool warns on these but does not auto-promote them to the destructive pattern; operator inspects and re-runs with `--allow-destructive` if rows are at risk.

### §3.2 Destructive

Drops a column, drops a table, drops an index, drops a constraint, truncates or row-deletes existing data, narrows a constraint (`NOT NULL` on existing nullable column), narrows a type.

**Ordering:** code FIRST, schema SECOND. Code MUST be backward-compatible — i.e., must function correctly against both the old (pre-drop) and new (post-drop) schema.

**Why:** if the schema migrates first, the still-deployed pre-migration code reads or writes the dropped column and 500s. Deploy backward-compat code first → it ignores or stops using the doomed column → migrate → done.

**Required guarantee:** the producer agent must confirm the code path no longer references the doomed column (grep + typecheck both clean) before the destructive migration runs. Otherwise, this is not a destructive promotion — it's a rename in disguise (see §3.3).

**Destructive-keyword set the tool matches:** `DROP COLUMN`, `DROP TABLE`, `DROP CONSTRAINT`, `DROP INDEX`, `ALTER COLUMN … TYPE …`, `SET NOT NULL`, `TRUNCATE`, `DELETE FROM`. Anything outside this set the regex misses; in that case the operator must classify manually and pass `--allow-destructive`. Mandatory: prod-schema introspection runs on the destructive path (see §6) and refuses on drift.

**Mandatory on destructive path (added 2026-05-06):** the tool routes through `db-admin` sentinel-verification BEFORE the destructive op runs (per `protocols/destructive-data-ops.md §3`). The verification step is in addition to introspection (§6); both must pass. See §5 bullets 14-15 for the script-implementation pattern (Gate 2.5).

### §3.3 Rename (expand–contract)

Rename a column, rename a table, change a column's type non-trivially.

**Ordering:** multi-step, multi-promotion. Cannot be done in a single dev→main promotion.

The expand–contract sequence (each step its own promotion):
1. **Expand:** add the new column (additive — see §3.1). Deploy code that writes to BOTH old and new column, reads from old. Backfill old → new.
2. **Cutover:** deploy code that reads from new, still writes to both.
3. **Contract:** deploy code that reads + writes new only (destructive — see §3.2). Drop old column.

**A single-script promotion tool MUST refuse the rename pattern** with an explicit error — the operator should run three sequential additive/destructive promotions instead.

---

## §4. Per-pattern checklist for the operator

Each promotion runs through the same five gates. Pattern affects ordering of gate 3 (execute), not the other gates.

### Gate 1 — Pre-flight (REFUSE if any fail)

- [ ] Working tree is clean OR the tool stashes-and-restores cleanly with a labeled stash (`promote-to-prod`).
- [ ] Current branch is `dev` (or the project's equivalent integration branch).
- [ ] `dev` is up-to-date with `origin/dev` (`git fetch && git status` reports no divergence).
- [ ] Type-check passes (`npx tsc --noEmit` for TypeScript stacks; equivalent on others).
- [ ] Lint passes (or warns on pre-existing failures with operator confirmation; never mask a NEW lint regression).
- [ ] `dev` is at least one commit ahead of `main`.
- [ ] All required prod env vars are present in the deploy platform (verified via `vercel env ls --environment=production`-equivalent — see §5).

### Gate 2 — Schema delta detection

The tool MUST classify the promotion before executing:

- Diff migration files (`drizzle/*.sql`, `prisma/migrations/`, `db/migrate/` — whatever the stack uses) between `dev` and `main`. Record count + filenames.
- For each new migration, parse its SQL (or generated artifact) for destructive keywords: `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN ... TYPE`, `ALTER COLUMN ... SET NOT NULL`, `RENAME`. Any hit promotes the pattern from additive → destructive (or to rename, which the tool refuses per §3.3).
- Optionally: introspect the live production schema and compare to the codebase's schema file (Drizzle: `drizzle-kit introspect` + diff vs `schema.ts`; Prisma: `prisma db pull` + diff). This catches drift between the migration history and the actual production state.

The tool prints the classification BEFORE executing: *"This promotion is ADDITIVE: 1 new migration, 2 new tables, 0 destructive operations."*

### Gate 3 — Execute (in pattern-correct order)

**Additive:**
1. Apply migration to production DB (Tier C — see §5).
2. Switch to `main`, merge `dev` with `--no-ff`, push.
3. Wait for auto-deploy to complete.

**Destructive:**
1. Switch to `main`, merge `dev` with `--no-ff`, push.
2. Wait for auto-deploy to complete and verify the new (backward-compat) code is live.
3. Apply migration to production DB (Tier C — see §5).

**Rename:** REFUSED — see §3.3.

### Gate 4 — Verify

- Deploy returns 200 on the configured prod URL (or returns the expected status for the project's smoke endpoint).
- Optionally: run a project-specific smoke check (1–3 critical paths). The protocol does not mandate which paths; the project's `tier2-conductor.md` does.
- Audit a representative read against the migrated table (additive) or confirm the dropped column is no longer queried (destructive).

### Gate 5 — Audit emission

A single audit-entry stanza (multi-line block) to the **project-scoped** `agent-changelog.md` per `protocols/autonomous-ops-permissions.md §6.1.1`. The stanza lands **regardless of outcome** — success or any per-phase failure — because the audit IS the forensic record. On failure, the stanza includes the phase reached, the failure reason, and the explicit rollback command.

```
## YYYY-MM-DD HH:MM — Ops: dev→main promotion <commit-range>

**Tier:** B (push) + C (prod schema migration, if applicable — approved via `--confirm-prod-migration` flag)
**Project:** <slug>
**Pattern:** additive | destructive
**Phase reached:** <phase name on failure; omit or "audit" on success>
**Schema changes:** <N migrations, listed>
**Commits:** <range>
**Outcome:** pass — merge <sha>, <url> responded <code>     # OR
**Outcome:** FAIL — <one-line reason>
**Rollback:** `<exact rollback command>`                     # only on FAIL
**Approval (Tier C only):** "<verbatim flag string or operator confirmation>"
```

The entry lands in `<project>/.claude/memory/agent-changelog.md`, NOT the framework changelog. The tool MUST `mkdir -p` the parent directory before writing — first-run on a fresh project repo cannot assume the path exists.

---

## §5. The promote-to-prod tool contract

Every Tier 2 project on the dev→main strategy SHOULD have a `scripts/promote-to-prod.sh` (or the stack-equivalent) that implements this protocol's contract. Founding implementation: `agent-dashboard/scripts/promote-to-prod.sh`.

**The tool MUST:**

1. `set -euo pipefail` (or stack equivalent for runtime safety).
2. `cd` to repo root from any caller directory.
3. Run all of Gate 1 before any side effect; refuse on first failure with a remediation hint.
4. Classify the promotion via Gate 2 and **print the action plan before executing**.
5. Require an explicit `--confirm-prod-migration` flag (or the stack equivalent gating mechanism) to proceed past plan-print on any promotion that includes a schema migration. Default behavior (no flag) is dry-run: print plan, exit 0.
6. Refuse the rename pattern with an explicit error.
7. Apply the pattern-correct ordering exactly.
8. Stash uncommitted scaffold work before branch switching; pop after branch operations complete (handles the founding case where `scaffold-source/*` accumulates uncommitted state mid-session).
9. Wait + poll the deploy platform for completion (curl a status endpoint, or use the platform's CLI poll command).
10. Verify the configured `PROD_URL` returns 200 before exit.
11. Append the audit entry to the project-scoped `agent-changelog.md` per Gate 5 — automatically, not as operator follow-up (atomic-cadence rule).
12. On success, print the merge SHA, the deployment URL, and the audit-entry path.
13. On failure at any gate, print the exact rollback command (e.g., `git push origin main --force-with-lease HEAD~1` if the merge landed but verification failed and the operator needs to revert; the tool MUST NOT auto-execute force-pushes — that is Tier D).
14. **(Added 2026-05-06)** Before any destructive op runs (after Gate 2, before Gate 3), invoke `db-admin` sentinel-verification against the prod `DATABASE_URL`. The script writes a sentinel via the URL, reads back via the same URL, refuses on 0 rows. Audit-id captured for the Gate 5 entry. **Implementation:** because a script cannot synchronously dispatch the `db-admin` agent, use a two-step operator flow — script halts on first run with instructions to invoke `/db-admin` in a second session, capture the audit-id, then re-run the script with `DB_ADMIN_AUDIT_ID=<id>` env var set. The script verifies the audit-id maps to the actual prod URL host before proceeding. See founding implementation at `agent-dashboard/scripts/promote-to-prod.sh:317-374` Gate 2.5.
15. **(Added 2026-05-06)** Interactive `DESTROY` typed-confirmation (Gate 3 in the founding implementation) satisfies `db-admin`'s Tier C per-command typed-confirmation requirement (per `protocols/destructive-data-ops.md §4`) IFF Gate 2.5 (above) already passed in the same script invocation. The combined flow is: classify → sentinel-verify (Gate 2.5) → surface BEFORE state + verified host → read DESTROY (Gate 3) → execute → audit. Per-invocation binding (per `destructive-data-ops.md §8 #6`) is satisfied by each script run doing its own sentinel-test against current `PROD_DB_URL`.

**The tool MUST NOT:**

- Auto-execute Tier D operations (force pushes, destructive SQL, secret rotation without backup).
- Migrate production schema without the `--confirm-prod-migration` flag.
- Migrate production with `--allow-rename` (rename is multi-promotion; the tool refuses this combination).
- Skip the audit entry on success OR failure (the audit IS the value — see autonomous-ops §7; see §4 Gate 5).
- Mask lint or typecheck failures.

### §5.1 Coordination with active-sessions (Rule 1)

A promotion run touches `CHANGELOG.md` + `agent-changelog.md`, both cross-cutting per `protocols/session-coordination-protocol.md` Rule 1. However, a promotion is **operator-blocking, single-process, and atomic** — it runs to completion or aborts with audit; nothing else can land on `main` mid-run by definition. **A Rule 1 manifest entry in `active-sessions.md` is therefore optional but recommended for cross-session visibility** (so a parallel agent peeking at the file sees the operator is mid-promotion). The tool itself does NOT write to `active-sessions.md`; the orchestrator may, before invoking the tool. Rule 6 (atomic commits per landed unit) IS load-bearing here and remains binding.

---

## §6. Branch parity verification

Beyond migration-file diffing, the tool SHOULD compare the live production schema to the codebase's schema file before executing. The mechanism varies by stack:

| Stack | Mechanism |
|---|---|
| Drizzle ORM | `drizzle-kit introspect` against the prod connection string; diff resulting `schema.ts` against the repo's `schema.ts`. |
| Prisma | `prisma db pull` against the prod schema; diff `schema.prisma` against the repo's. |
| Raw SQL migrations | `pg_dump --schema-only` against prod; diff against the repo's `schema.sql`. |
| Other | Stack-equivalent introspection. |

Drift detected here usually means either (a) a manual prod-schema edit that didn't go through migrations (incident — log per `protocols/incident-protocol.md`), or (b) a migration that was rolled back on prod but not removed from the repo. Either way: refuse the promotion until reconciled.

**Mandatory on destructive path:** introspection MUST run when `--allow-destructive` is used, and a non-empty drift-diff MUST cause the tool to refuse. Introspection failure (CLI errors, auth issues) on the destructive path is also a refusal — the tool cannot drop schema it cannot verify. On the additive path, introspection is opt-in (`INTROSPECT=1`) and drift is warn-only.

The tool's introspection step is illustrative for the founding stack (Drizzle + Neon). Other stacks substitute equivalents and keep the gate.

---

## §7. Rollback, per pattern

### Additive
- If schema migrated but code didn't deploy: harmless. Code paths that don't yet exist also don't yet break. Re-run the promotion later.
- If both landed and verification fails: revert the merge commit on `main` (`git revert -m 1 <merge-sha>`, push). The schema additions stay (additive is non-destructive on its own); the code stops using them.

### Destructive
- If code deployed but schema didn't migrate: the deployed code is backward-compat (per §3.2), so it functions against the old schema. Re-run the schema step later.
- If both landed and verification fails: this is the danger zone. Reverting the code re-introduces references to the now-dropped column → 500s. Either (a) restore the column from backup (Tier D — user-executes), or (b) hot-fix forward.
- This is why destructive promotions SHOULD ship with a feature flag that disables the new code path independently of the deploy. Out of scope for the tool; in scope for the producer agent's design.

### Rename
- Rollback per the failed step (additive or destructive). The full expand–contract sequence is multi-promotion by design; each step's rollback is its own pattern's rollback.

---

## §8. Cross-references

- Tier classification (B for push, C for prod migration): `protocols/autonomous-ops-permissions.md §2, §3`
- Audit-routing destination (project-scoped, not framework): `protocols/autonomous-ops-permissions.md §6.1.1`
- Atomic-cadence rule: `protocols/changelog-protocol.md §6` and user memory `feedback_changelog_proactive.md`
- Atomic commits per landed unit: `protocols/session-coordination-protocol.md §Rule 6`
- Stack-illustrative-not-binding framing: `protocols/framework-contract-discipline.md §3`
- Founding DB topology (current Tier 2 project — illustrative): user memory `project_db_topology.md`
- Founding branch strategy (current Tier 2 project — illustrative): user memory `project_branch_strategy.md`

---

## §9. Future hardening

The current protocol is operator-invoked (the operator runs `./scripts/promote-to-prod.sh`). Future enforcement layers, in increasing strictness:

1. **Pre-commit hook on `dev`** — when a commit on `dev` includes a new migration file, append a one-line breadcrumb to the commit message: *"This commit will require a dev→main promotion via `promote-to-prod.sh` (additive)"* — purely informational.
2. **Pre-push hook on `main`** — refuse `git push origin main` from any working tree that did not go through `promote-to-prod.sh`'s audit step. Detection: the tool emits a transient sentinel file consumed by the hook, then deletes it. (`protocols/session-coordination-protocol.md §Future enforcement` already lists this class of hook.)
3. **CI guard** — a CI check on the `main` branch refuses pushes that don't match a prior audit-changelog entry within the last 5 minutes. Closes the operator-bypass case entirely.

These layers are out of scope for the founding implementation; tracked here as the maturation path.

---

## §10. Known coverage gaps (founding-implementation only)

Tracked here so future hardening rounds know what's not yet exercised. These are acknowledged limits, not deferred bugs.

1. **First battle-test exercises additive-only.** The destructive path is safe-on-paper (regex set §3.2, mandatory introspect §6, interactive `DESTROY` typed-confirmation, partial-state audit on failure §4 Gate 5) but has not been run end-to-end against a real destructive migration. Next destructive promotion is its first real exercise.
2. **Constraint-addition heuristic is best-effort.** §3.1 lists known holes (NOT NULL inline on `ADD COLUMN` w/o DEFAULT, UNIQUE/CHECK against existing data, DEFAULT changes). Tool warns; operator decides.
3. **Vercel-poll failure is panic-print-only.** Tool prints rollback command and writes failure audit; does not auto-revert. Tier D escalation per §5.
4. **Stash-pop conflict is operator-resolves.** No auto-merge attempt; the labelled stash remains for manual inspection.
5. **DRY across founding-stack scripts.** Shared helpers (`say`/`ok`/`warn`/`fail`) duplicated rather than sourced. Refactor deferred until a second consumer exists.

These five items are the explicit follow-up surface for the next promotion-tooling hardening pass.

---

*This protocol is load-bearing for any Tier 2 project on the dev→main strategy. Founding implementation lives in agent-dashboard's scripts directory; future projects on different stacks substitute the introspection + deploy-poll mechanics while keeping the doctrine, ordering, gates, and audit routing.*
