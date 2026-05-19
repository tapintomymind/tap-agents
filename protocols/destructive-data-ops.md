# Destructive Data Operations Protocol

**Status:** [PROVISIONAL — pending Org Designer ratification per workspace/_global/org-designer-proposals/20260506-db-admin-ratification.md]. Ratification deadline (OD review target): 2026-05-08 21:00 UTC.

How the team performs ANY destructive operation against a database, file system, or other persistent shared resource. Owned by `db-admin` agent (canonical authority); read by Conductor before routing any DB-touching task; bound on all Tier 1 + Tier 2 agents that emit DB-mutating commands.

> **One-line rule:** No destructive op runs against shared persistent state until the URL/path has been verified to map to the branch/scope the operator believes via a write-and-read sentinel test, AND the operator has given an explicit per-command "go" with both target and proposed change shown.

> **Why this exists:** 2026-05-06 incident — orchestrator ran `TRUNCATE` against what it believed was the dev Neon branch using a URL from `neonctl connection-string --branch-id <dev>`. The CLI returned the project's primary endpoint regardless of `--branch-id`, so the destructive op hit the production branch. The dev branch was never touched. Protocol authored to make this class of failure impossible going forward.

---

## §1 — Scope

This protocol binds on:

- **Database mutating commands**: `TRUNCATE`, `DELETE`, `DROP`, `UPDATE` (any unfiltered or schema-wide), `ALTER`, `INSERT` of large fixture sets, `drizzle-kit push --force`, `drizzle-kit generate` (when output applied), schema migrations.
- **File system destructive ops**: `rm -rf` against shared paths (anything outside an isolated worktree the operator owns), `mv` to overwrite, `truncate` of log files in shared locations.
- **Shared infrastructure mutations**: Vercel `env rm`, Vercel `deployment delete`, GitHub repo deletes, GitHub App secret rotations, branch protection changes, IAM changes.
- **Anything irreversible** in shared state.

This protocol does NOT bind on:

- Operations against the operator's own working tree (dev box, isolated worktree).
- Read-only queries (SELECT, file reads).
- Build artifacts the operator created in the same session (e.g., the local `.next/` directory).
- Single-row INSERTs the operator authored as part of legitimate flow (e.g., audit-row writes).

---

## §2 — Tier classification

Destructive ops inherit the autonomous-ops tier of their target:

| Tier | Target | Per-op confirmation required? |
|---|---|---|
| **A** | Operator's own ephemeral state (local DB, /tmp, isolated worktrees) | Self-authorized; no extra confirm. |
| **B** | Shared dev infrastructure (dev Neon branch, dev Vercel, shared dev cache) | Per-op user "go" required after sentinel-verification. |
| **C** | Production (prod Neon branch, prod Vercel, prod GitHub App, customer-facing data) | Per-op user "go" required after sentinel-verification AND a typed-confirmation phrase ("confirm prod {operation} on {target}"). Each call gets its own confirmation, even within a single session. |

Standing pre-authorization for Tier C does NOT exist. Sessions that received "you can run X" earlier do NOT inherit authorization for Y.

> **Reconciliation note** (2026-05-06): The Tier classification above supersedes the former Tier D blanket prohibition for destructive SQL specifically. See `protocols/autonomous-ops-permissions.md` §2 for the parent autonomy doctrine; that protocol's Tier D table no longer covers destructive SQL as of 2026-05-06.

---

## §3 — The sentinel test (mandatory before any Tier B+ destructive op)

Before any TRUNCATE/DELETE/DROP/large-UPDATE against a database the operator did not write the URL for in the same session:

1. **Build the sentinel value.** A unique string that's safe to store and trivially identifiable: `<project-prefix>-verify-${crypto.randomUUID()}` (project-prefix configured per project; identification, not security).
2. **Write the sentinel** to a low-impact table on the target. **Current-stack example** (Postgres + Drizzle target with `bug_reports` table per FCD §3 stack-illustrative framing): `INSERT INTO <writable-low-impact-table> (id, route, error_message, environment, status, promoted_to_incident) VALUES (gen_random_uuid(), '/__sentinel__', '<sentinel>', 'sentinel-test', 'open', false)`. Adapt to the target's schema. **Other stacks**: dedicated `__sentinel__` schema (Edge case below). The shape generalizes — what matters is "INSERT a unique value via the target URL".
3. **Read the sentinel back via the SAME URL the destructive op will use.** `SELECT id FROM bug_reports WHERE error_message = '<sentinel>'`.
4. **If 0 rows: ABORT.** The URL routes somewhere different from where you wrote. Do NOT proceed. Surface the discrepancy to the user with both the URL host and the sentinel value.
5. **If 1+ rows: branch identity confirmed.** Proceed to §4.
6. **Delete the sentinel row** before running the destructive op (the sentinel itself is a Tier B INSERT/DELETE; it does NOT recursively need its own sentinel test — it's by construction a no-impact row).

Edge case — empty/uninitialized DB: if you cannot INSERT (e.g., no writable tables, schema not yet applied), use a `CREATE TABLE __sentinel__` + `INSERT` + `SELECT` + `DROP TABLE` cycle instead. If the target lacks any table-create capability (read-only replica), abort and ask the user — the URL is wrong.

#### §3.1 Read-only role / read-only replica URL

If the agent's role lacks INSERT on any writable table: attempt `CREATE TABLE __sentinel__` + INSERT + SELECT + DROP TABLE cycle (per existing edge-case fallback above). If CREATE TABLE also fails (read-only replica, role lacks DDL), abort with REJECT reason `target-not-writable` — different class from `URL routes elsewhere`; this is "URL routes correctly but target is wrong shape (read-only)."

#### §3.2 Trigger-bearing target tables

Default sentinel target MUST be trigger-free. The protocol cannot guarantee any specific application table is trigger-free across projects. **Recommendation**: prefer a dedicated `__sentinel__` table created at db-register population time (`CREATE TABLE IF NOT EXISTS __sentinel__ (id uuid primary key, sentinel_value text, ts timestamptz default now())`), which inherits no application triggers. If project policy forbids schema additions to prod, fall back to the lowest-impact application table the operator has certified trigger-free; certification recorded in per-project register.

#### §3.3 SELECT-timeout behavior

If sentinel SELECT-back times out, treat as VERIFICATION FAILURE — not PASS by default. **Default timeout: 5 seconds** (configurable; the SELECT is by primary key on the sentinel value, should be sub-millisecond on any reachable DB). Timeout means the URL is TCP-reachable (INSERT would have failed earlier otherwise) but the SELECT hangs. A destructive op against the same URL would hang too; aborting is correct. REJECT reason: `sentinel-verification-timeout`.

#### §3.4 Sentinel-cleanup-failure

If the destructive op succeeded but the cleanup DELETE failed (step 6 above): log to the audit entry as `sentinel_cleanup: failed`; surface a warning to the operator with table + id + error + "manual cleanup recommended"; do NOT block (op already succeeded), do NOT roll back (op is irreversible). Orphaned sentinel rows are non-fatal; track via audit-mining loop if the pattern becomes systematic.

#### §3.5 ORM/transport batching atomicity

For ORM-mediated DB clients (e.g., Drizzle on Neon HTTP transport), the verify-write-and-read MUST run inside the ORM's atomicity primitive — otherwise INSERT and SELECT can route to different connection-pool workers, with race risk.

**Current-stack example** (`@neondatabase/serverless` HTTP transport with Drizzle, per `memory/lessons-learned.md #7`): use `db.batch([INSERT_sentinel, SELECT_sentinel])` (Drizzle) or `sql.transaction([...])` (raw driver, array form). Without batching, atomicity is not guaranteed.

**Other stacks**: full Postgres clients wrap INSERT + SELECT in a single transaction (`BEGIN; INSERT; SELECT; COMMIT;` — DELETE happens later, separate). MySQL / MS SQL / Oracle equivalents use the provider's transaction primitive. The atomicity primitive used is recorded in the per-project register so db-admin can verify it on each invocation.

#### §3.6 Network-partition mid-test

If sentinel INSERT returns success but the connection drops before SELECT returns, the test is INDETERMINATE — the INSERT may have committed server-side (URL routes correctly) or rolled back (routing unconfirmed). Reconnect, then issue a SELECT with the exact sentinel value as the WHERE clause:

- **1 row returned:** INSERT did commit; URL routes to where we wrote. Treat as VERIFIED. Proceed with destructive op (the connection-drop is itself a signal that the URL is reachable, just unstable).
- **0 rows returned:** INSERT was rolled back server-side. Connection-stability is itself a signal that destructive ops on this URL aren't safe right now. ABORT with REJECT reason `sentinel-network-partition-indeterminate-rerun`. Operator: re-run sentinel-test with a fresh sentinel value when the connection is stable.
- **>1 rows returned:** sentinel value collision (extremely unlikely with UUID-based sentinels — see §3.8). Treat as VERIFICATION FAILURE; ABORT with reason `sentinel-uniqueness-violation`.

Critical: do NOT trust that a connection-drop "must mean the INSERT failed" — that's an ad-hoc assumption that fails on partial commits. The SELECT is the source of truth.

#### §3.7 Connection-pool / read-replica routing

For clients on connection poolers (pgbouncer, etc.) or read-replica routing, the verification SELECT MUST go to the SAME connection (or primary) as the INSERT. Otherwise: INSERT lands on one pool worker, SELECT on another — combined with any read-replica-after-write lag, the SELECT can return 0 rows even though the INSERT committed.

**Provider-specific guidance:**

- **pgbouncer transaction-mode pooling:** wrap INSERT + SELECT in a single transaction (`BEGIN; INSERT; SELECT; COMMIT;`) — pgbouncer pins the connection for the transaction's lifetime.
- **pgbouncer session-mode pooling:** pin to the same session (don't release-and-reacquire between INSERT and SELECT).
- **Read-replica routing (any provider):** SELECT MUST target primary, not a replica. If the client library auto-routes SELECTs to replicas, force primary via the library's primary-routing flag (e.g., Postgres `pg` driver with explicit `target_session_attrs=read-write` connection-string param; ORMs typically have a `useMaster` or `replicaOff` flag).
- **Neon HTTP transport:** `db.batch([INSERT, SELECT])` already pins routing within the batch (per §3.5). Single round-trip; no pool routing variability.

If the project's client setup doesn't fall cleanly into any of the above, the per-project register MUST record the verified-atomicity primitive used. db-admin REJECTS sentinel-test runs that use a primitive not validated against this list.

#### §3.8 Sentinel-value uniqueness

Sentinel values MUST be UUID-suffixed (`<project-prefix>-verify-${crypto.randomUUID()}`). Reasons:

- **Case-sensitivity / encoding independence:** UUIDs are hex-only, immune to collation differences across providers (Postgres default vs. MySQL `utf8mb4_general_ci` vs. SQL Server case-insensitive collations). A project-prefix-only sentinel on a case-insensitive collation could match a stale sentinel from a concurrent or prior session.
- **Per-test-instance uniqueness:** UUIDv4 has 122 bits of randomness; collision probability is negligible at any conceivable destructive-op volume.
- **Forbidden:** bare project-prefix sentinels without a UUID component (e.g., `<project-prefix>-verify-<date>`). The protocol REJECTS sentinel generators that don't include a UUID. db-admin's pre-check verifies the sentinel value contains a UUID-shaped substring; if absent → REJECT with reason `sentinel-uniqueness-violation`.
- **Sentinels longer than provider-allowed column widths:** UUIDv4 with the project-prefix is typically <60 chars; well within standard text columns. If a project's sentinel target column has a length constraint <60 chars, the operator certifies in the per-project register and uses a shorter prefix while keeping the UUID intact.

---

## §4 — Per-command authorization

After §3 sentinel verification:

1. Surface a "before-state" snapshot to the user: the URL host (no password), the branch label as you understand it, and current row counts (or equivalent state metric) for tables you'll mutate.
2. Surface the proposed change as plain text. **Current-stack example** (Neon endpoint host shown per FCD §3 stack-illustrative framing): `WILL <OP> <table> (<count> rows) ON <host>` — e.g., `WILL TRUNCATE projects (4 rows) ON <verified-host> (you've labeled this 'dev')`. Replace host pattern with the target provider's surface (RDS, Cloud SQL, Aurora, etc.). The shape ("OP target hosts you've labeled X") generalizes.
3. **Wait for explicit per-op user confirmation.** For Tier B: any affirmative ("go", "yes", "proceed"). For Tier C: a typed phrase that names the operation and the verified target host. **Current-stack example** (Neon endpoint host shown): `confirm prod TRUNCATE on <verified-host>`. The phrase pattern generalizes: `confirm <env> <OP> on <host>` across providers (RDS instance hostname, Cloud SQL connection name, etc.).
4. Run the destructive op.
5. Read state back; surface "after-state" to the user.

Combining the BEFORE query and the destructive op into a single command is **forbidden** for Tier B+. The user MUST see the BEFORE state and have a chance to abort before the destructive command runs.

### §4.1 Authorization sources

The protocol's §4 step 3 "explicit per-op user confirmation" can be satisfied by one of the following authorization sources, listed in order of trust:

| Source | Tiers permitted | Form of evidence | Constraints |
|---|---|---|---|
| Live operator typing in chat | A, B, C | Verbatim quoted user message (affirmative for Tier B; typed-confirmation phrase for Tier C) | Per-op; never carries over to a subsequent op even in the same session |
| Live operator typing in chat with pre-approved batch | A, B | Single verbatim user message that names every op in the batch by table+op+host | Batch must be enumerated by db-admin and quoted back to the user before any op runs |
| **CI-bot — sentinel-bound script on push-to-branch** [Ratified by Org Designer 2026-05-12 — see conditions block below] | A, B only (NEVER Tier C) | Merge-to-branch commit SHA + author + timestamp recorded as `user_confirmation.verbatim` | All of the following are binding: (i) script is named in the per-project register (e.g., `scripts/migrate-preview-branch.mjs`); (ii) sentinel-verify cycle per §3 runs on every invocation; (iii) static destructive-pattern guard per §8 #6 carve-out below; (iv) branch-ID provenance check via provider API (mitigates URL rotation silent-wrong-branch); (v) audit-log entry written and committed back to repo in same CI run; (vi) Tier C targets refused unconditionally |

#### CI-bot row — rationale

The merge-to-branch event is a stronger authorization signal than a chat affirmative for repetitive low-risk additive migrations: the migration content was reviewed in a PR diff before merge, the commit SHA is forgery-resistant compared to a free-text chat message, and the GH Actions runner's environment is reproducible. The trade-off is that automation can drift (URL rotation, secret staleness); the binding constraints above are the mitigations. The CI-bot path is **narrow by design**: only the named scripts in the per-project register, only Tier A/B targets, only with the guard chain intact.

If any constraint is unmet at runtime (e.g., sentinel fails, branch-ID probe mismatches, destructive pattern detected, audit-log writeback fails), the bot MUST exit non-zero before applying anything. The bot's authorization is conditional on the full chain; failure of any link reverts the op to operator-driven Tier B (or Tier C if data-loss risk is identified).

#### [Conditions on ratification 2026-05-12]

The CI-bot row in the §4.1 authorization table is ratified for live use subject to the following conditions. Any condition that lapses suspends the CI-bot authorization path until db-admin + Org Designer re-ratify. Conditions are binding on db-admin (canonical owner of the protocol) and on every named CI script in any per-project register.

**C-1 — Register-growth gate.** Adding a NEW named script to any per-project register's "Named-CI-scripts" section requires `db-admin` + `org-designer` joint review BEFORE the script can run in CI. The per-project register MUST list every named CI script by absolute repo-relative path, the tier(s) it operates against, the named branches it targets, and a citation to the joint-review proposal in `workspace/_global/org-designer-proposals/`. A script that runs in CI without a register entry is a `bypass-without-authorization` finding — ops-security flags P0, db-admin REJECTs retroactively, audit entry records `outcome: unauthorized-script-no-register-entry`.

**C-2 — Tier C absolute floor.** The CI-bot path is permitted A and B only. Tier C targets are refused unconditionally. This is non-negotiable; no future amendment may relax this without a new ratification cycle and an explicit incident-class justification (which the 2026-05-06 incident itself argues against). Per-project registers MUST list Tier C endpoint hosts and any tier-C host in the script's target chain triggers an immediate exit-non-zero before the sentinel cycle runs. If a Tier C host is added to a project's branch topology mid-cycle (e.g., new prod environment), the script's `--expected-endpoint` argument MUST refuse to match it, and the audit entry MUST record `outcome: refused-tier-c-host-detected`.

**C-3 — Branch-ID probe is a HARD gate, not optional.** The amendment's §4.1 constraint (iv) and §8 #6 constraint 5 require branch-ID provenance via provider API. The first consumer (`tapagents-app/scripts/migrate-preview-branch.mjs`, path reflects post-2026-05-14 BL-059 cascade-rename; was `agent-dashboard/`) currently treats `NEON_API_TOKEN` as optional and downgrades to a host-prefix-only check when the token is absent (per the script's `probeBranchId` skipped-no-token branch). **This condition makes the API probe non-optional for production use.** Within 30 days of ratification (target 2026-06-11), the script MUST be amended so that absent `NEON_API_TOKEN` → exit non-zero with `branch_id_probe: refused-no-token-no-fallback`. The host-prefix-only fallback is a discovery-phase convenience that does NOT survive ratification. The 2026-05-06 incident root cause was specifically a CLI flag returning the project's primary endpoint regardless of `--branch-id`; a host-prefix check against an operator-supplied label inherits the same trust class (operator-supplied labels can themselves be wrong, exactly as `.env.local` comments were wrong on 2026-05-12). The Neon API call is the only independent verification. db-admin tracks this 30-day window in the per-project register; absence of the API-probe-mandatory amendment at 30 days suspends the CI-bot authorization for that project.

**C-4 — Bot identity verification.** The amendment satisfies §4 step 3 "explicit per-op user confirmation" via merge-to-branch commit SHA + author. This is forgery-resistant on the audit trail BUT the GH Actions runner itself is a trust surface that the protocol does not currently verify. Specifically: a compromised GH Actions runner (or a forged push from someone with branch-write access who lacks repo-merge-review approval — note that branch protection rules may or may not require PR review on `dev`) could trigger the CI-bot path with an attacker-controlled SQL payload. The static destructive-pattern guard catches DROP/TRUNCATE/ALTER-DROP-COLUMN/DELETE-FROM, but an attacker-crafted INSERT could still write malicious rows. Within 60 days of ratification (target 2026-07-11), the script MUST be amended to require that the branch the workflow triggers on has branch protection enabled with at least one required reviewer; if branch protection is absent on the trigger branch, the script exits non-zero with `outcome: refused-branch-protection-missing`. Probe via `gh api /repos/{owner}/{repo}/branches/{branch}/protection` at script start.

**C-5 — Rollback behavior on mid-flight sentinel failure.** The current protocol §3.4 covers cleanup-failure (post-op DELETE that fails) but does not address mid-flight failure during the destructive op itself. For the CI-bot path: if the script begins applying statements (i.e., gates passed) and a statement errors mid-migration, the script MUST (a) record `outcome: partial-failure-mid-flight` in the audit entry with the exact statement that errored AND the count of statements applied before the error, (b) exit non-zero, (c) commit the audit entry back to the repo before exit, (d) signal EA via the workflow's failure notification path so the operator is alerted within the workflow run's lifetime, not at the next manual review. Mid-flight failure is operationally distinct from refused-at-gate; the recovery path (Neon PITR, manual fix-forward migration, etc.) requires the operator to know exactly how many statements committed. The script's current statement-by-statement loop satisfies (a) and (b) but the audit-commit-before-exit ordering (c) is not explicit in the implementation. Add a `try/finally` around the apply phase that runs the audit writeback regardless of statement outcome. db-admin verifies this is in place before the first non-dry-run production use.

**C-6 — Audit-commit failure escalation.** §8 #6 constraint 6 requires the audit entry to be committed back to the repo in the same CI run. The current script's `migration-auto-sync.md` §3.2 acknowledges race conditions ("if rebase also fails, the migration is already applied but the audit-log push is queued for the next run. We tolerate eventual audit consistency"). **The ratification narrows this:** for the audit-commit's *failure to land within the same CI run*, the script MUST signal a structured warning to the operator via the workflow's status output AND post to a known escalation path (Slack / EA / GitHub issue created by the bot itself) within that run. "Queued for next run" is acceptable as a recovery state for the audit file, but the failure-to-land event itself MUST be surfaced immediately, not implicitly deferred. The next destructive op against the same target is REJECTed by db-admin if the prior run's audit-commit is still in the eventual-consistency queue at the time the next op fires. Eventual consistency is acceptable for the file; immediate visibility is required for the operator.

**C-7 — Register-listed scripts are versioned by commit SHA, not by path.** The amendment authorizes "a named script in the register" but the path alone is mutable — anyone with write access to `scripts/migrate-preview-branch.mjs` can swap its contents. The per-project register MUST also record either (a) the SHA of the script file at the time of its authorization, refreshed on every joint-review re-authorization, OR (b) the commit SHA of the merge that landed the script. At runtime the GH Actions workflow MUST verify the script file's content hash matches the register's recorded hash OR the script's most recent commit SHA matches the register's. Hash drift between the register and the live script triggers exit-non-zero with `outcome: refused-script-hash-drift`. This closes the "swap the script, keep the name" attack surface that the path-only authorization leaves open.

**C-8 — Sunset clause.** This carve-out lapses 2026-11-12 (6 months from ratification) unless db-admin + Org Designer jointly re-affirm it via a new proposal. The re-affirmation must cite (a) zero `bypass-without-authorization`, `refused-script-hash-drift`, or `refused-branch-protection-missing` incidents during the prior 6 months, AND (b) zero incidents in `memory/incidents.md` involving the CI-bot path applying to a wrong branch or applying a destructive payload that the guard missed. Either condition's failure during the window opens a same-day Org Designer review with authority to suspend the carve-out without re-affirmation.

**C-9 — Org Designer recurring audit.** The CI-bot path is included in the monthly project-leakage / framework-contract-discipline audit (per `protocols/framework-contract-discipline.md §4`). The audit specifically checks: (i) named-scripts list growth across projects (any growth without joint-review = BLEED-BLOCKING); (ii) frequency of guard-refusals across CI runs (rising trend = WARNING, suggests destructive migrations are being attempted in scripts); (iii) frequency of branch-ID probe mismatches (any non-zero = WARNING). The audit output goes to the same `workspace/_global/org-designer-proposals/<date>-project-leakage-audit.md` path used today, with a dedicated `## CI-bot carve-out review` section.

**C-10 — No expansion to non-migration destructive ops without ratification.** The carve-out is specifically authorized for additive Drizzle migrations on a single Tier B target (Preview branch). Expansion of the named-scripts list to cover OTHER destructive op classes — index rebuilds, data backfills, schema introspection rewrites, archival deletes, dev-branch teardowns, etc. — requires a new ratification cycle. db-admin REJECTS any proposed expansion that arrives via amendment-without-review.

---

## §5 — URL provenance

When obtaining a database URL from a tool/CLI/integration:

| Source | Trust level | What's required |
|---|---|---|
| `.env.local` written by operator themselves | High | Acceptable as-is for Tier A (local). |
| Explicit user-provided string in chat (this turn) | High | Acceptable; record provenance in the audit trail. |
| `vercel env pull` (when value is non-empty) | Medium | Sentinel-verify (§3) before any Tier B+ destructive op. |
| `neonctl connection-string --branch-id` | **Low — known-fragile** | Sentinel-verify (§3) before ANY destructive op. May return primary endpoint regardless of `--branch-id` flag. |
| Inferred from project metadata or naming convention | **Untrusted** | NEVER use without sentinel-verify. |

CLI tools that route by branch name/id MAY return the project's primary endpoint regardless of the flag. The 2026-05-06 incident was rooted in trusting `neonctl --branch-id` without verification.

---

## §6 — Recovery awareness

Before any IRREVERSIBLE op against persistent state, the agent MUST surface the recovery option to the user:

- Provider-specific PITR window. **Current-stack example**: Neon's `history_retention_seconds` setting (typically 6h–30d depending on plan; query `GET /projects/{id}` for the actual value). **Other providers**: AWS RDS PITR window, GCP Cloud SQL retention, etc. State the actual window length in pre-op surfacing — don't hardcode.
- Postgres in general: WAL-based PITR if configured.
- File system: presence/absence of recent backup or filesystem snapshot.
- GitHub: presence of soft-delete / undelete window for the target operation type.

If recovery is impossible (truly irreversible): make this explicit in the pre-op surfacing — "this operation cannot be undone; once committed, recovery requires rebuilding from external state."

---

## §7 — Audit trail

Every Tier B+ destructive op produces a single audit log entry with:

- ISO timestamp
- Operator session ID (or agent name)
- Target URL host (no password)
- Branch label as understood by operator
- Sentinel value used + sentinel-test outcome
- BEFORE state (row counts or equivalent)
- Operation issued (verbatim SQL or command)
- AFTER state
- User confirmation source (chat message ID or quoted text)

Audit entries land in the project's `<tier-2-claude-dir>/audits/destructive-ops.log` (path is project-specific; project's actual path lives in the project's `db-register.md`). **Format: markdown sections with structured YAML bodies** (chosen over JSONL for current-scale dominant access patterns: operator real-time scan, post-incident grep, no programmatic audit-mining loop yet). Auditable indefinitely.

**Format spec** (one entry per `## <ISO-timestamp>` markdown section, YAML body, `---` separator):

````markdown
## 2026-05-06T21:00:00Z

```yaml
log_format_version: "1.0"
session_id: "<orchestrator-or-agent-name + uuid>"
audit_id: "<uuid generated by db-admin>"
tier: "B" | "C"
op: "TRUNCATE" | "DROP TABLE" | "DELETE" | "ALTER" | "drizzle-kit-push" | ...
target:
  url_host: "<host with no password>"
  branch_label: "<as the operator believed>"
  verified_branch: "<as confirmed by sentinel + register>"
  table_or_resource: "<table name or resource id>"
sentinel:
  value: "<sentinel value>"
  result: "verified" | "failed"
  select_back_count: 1
before_state: "<row counts or equivalent>"
command: |
  <verbatim SQL or shell command, multi-line preserved>
after_state: "<row counts post-op>"
user_confirmation:
  mode: "affirmative" | "typed-phrase"
  verbatim: "<quoted user text or phrase>"
outcome: "success" | "failure"
outcome_detail: "<one-line result>"
```

---
````

**File header** (written once when log is created): `# Destructive Operations Audit Log` + a one-paragraph note pointing here for the format spec + `**log_format_version:** 1.0` line. The `log_format_version` field is forward-compat: a future migration script (markdown → JSONL or markdown → SQLite) can identify which schema version each entry uses.

**File rotation**: out of scope; operator rotates manually. **Trust model**: this file IS the canonical source-of-truth for "this op was verified by db-admin"; the inter-agent `DestructiveOpVerdict` YAML is a convenience-only message for tooling. See §1.9 of the implementation brief for trust-model details.

---

## §8 — Forbidden patterns

These are violations regardless of intent or authorization:

1. **`TRUNCATE` without sentinel-test** against any URL not written by the operator in the same session.
2. **Trusting CLI `--branch-id` / `--scope` / `--env` flags** for routing without sentinel-verify.
3. **Combining BEFORE-snapshot and destructive-op in the same command** for Tier B+.
4. **Reusing prior session's user authorization** for new destructive ops.
5. **"This is just a no-op" rationalization** to skip sentinel-test (e.g., "the table is already empty"). The sentinel-test is to verify URL identity, not to verify table state — the test still runs.
6. **Writing a destructive command into a script that will run later** without binding the script to per-invocation sentinel-verify.

#### §8 #6 — Carve-out for sentinel-bound CI scripts [Ratified by Org Designer 2026-05-12 — conditions per §4.1 ratification block]

A NAMED script registered in the per-project `db-register.md` MAY perform destructive ops in a deferred-execution context (e.g., GitHub Actions on push-to-branch) PROVIDED ALL of the following hold on EVERY invocation:

1. **Per-invocation sentinel-verify** per §3 — fresh sentinel value (UUIDv4-suffixed), INSERT → SELECT-back → DELETE cycle, atomicity primitive matching the register's recorded value. No "this script ran successfully an hour ago" carry-over; the sentinel cycle runs every time.
2. **Static destructive-pattern guard** — the script reads the migration/SQL payload BEFORE applying and refuses (non-zero exit) if the payload matches forbidden destructive patterns (case-insensitive): `\b(DROP|TRUNCATE|ALTER\s+.*\s+DROP\s+COLUMN|DELETE\s+FROM)\b`. Destructive migrations stay operator-driven through a chat-time `db-admin` dispatch with the typed-confirmation phrase per §2 + §4.
3. **Atomicity scope** — the sentinel-verify AND the pattern-guard run inside (or immediately gated by, on the same connection as) the same transaction as the destructive op. The script MAY perform statement-by-statement application after the gates pass, but the gates themselves never run "out-of-band" from the op.
4. **Tier B (or A) only** — Tier C targets are refused unconditionally; the script's authorization model is the merge-to-branch event, which is too weak for production. Tier C requires the typed-confirmation phrase from a live human operator.
5. **Branch-ID provenance check** — if the provider offers a branch-id-resolving API (e.g., Neon's `GET /projects/{id}/branches`), the script calls it to confirm the URL host's branch ID matches the expected branch ID recorded in the per-project register. URL rotation (Vercel auto-rotates secrets, Neon re-points endpoints) can silently swap the destination; this probe catches it.
6. **Audit-log writeback** — the script writes a full §7 audit entry (with `session_id` clearly identifying the bot — e.g., `gh-actions-migrate-preview-<run-id>-<commit-sha>`) to the project's `<tier-2-claude-dir>/audits/destructive-ops.log`, commits the audit entry back to the repo in the same CI run, and exits non-zero if the writeback fails.

The carve-out is narrow: only named scripts in the register, only Tier A/B, only with all gates intact on every invocation. This is NOT blanket permission for arbitrary deferred destructive scripts. Adding a new script to the register requires `db-admin` + `org-designer` joint review.

If any of the constraints above fails at runtime, the script exits non-zero BEFORE the destructive op is issued; the audit-log records the failure mode (e.g., `outcome: refused-by-static-destructive-pattern-guard`) so the operator can re-route through the live-human Tier C path.

---

## §9 — Agent-specific binding

This protocol is mandatory for:

- `db-admin` (canonical owner; rejects ops that violate this protocol)
- `architect` when emitting migration commands
- `quality-engineer` when verifying DB state with destructive setup/teardown
- `ops-security` when running adversarial DB tests
- `conductor` MUST route any "destructive DB op" task through `db-admin` first
- All Tier 2 db-* agents (e.g., `db-agent.md`)
- Orchestrator (the lead agent in the session) when running raw `bash` / `node` against a DB URL

Agents MAY refuse to run if they observe a peer agent attempting a destructive op without sentinel-verify. The refusal lands in the audit trail.

---

## §10 — Cross-references

- `protocols/autonomous-ops-permissions.md` (Tier A/B/C tier definitions)
- `protocols/verification-before-completion.md` (the verify-claims-before-asserting principle this protocol extends)
- `agents/db-admin.md` (canonical owner of this protocol)
- `memory/lessons-learned.md` #9 (the 2026-05-06 incident — to be added when this protocol lands)
- `memory/incidents.md` (incident entry for the 2026-05-06 wipe)

---

## §11 — Activation

This protocol is binding effective 2026-05-06 (the date of the incident). Any agent that has read it once is bound. Conductor surfaces it on session start for any session that touches a DB URL.
