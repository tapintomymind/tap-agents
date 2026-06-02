# Autonomous Operations Permissions Protocol

How the team decides what to execute on its own, what to log for audit, what to escalate as a "board meeting" with the CEO, and what to never touch. Read by Conductor on every ops action; read by EA when preparing Ops Decision Packets.

> **One-line rule:** Autonomy with audit beats permission asks. User gates exist only for catastrophic or irreversible operations, framed as "board meeting with the CEO" Decision Packets surfaced via EA.

---

## 1. Why This Protocol Exists

The team is built to be autonomous — that is the whole point of having a CTO/CPO + VP Engineering + Chief of Staff plus a Tier 2 implementation pod. Each "may I run this command?" prompt that fires on a routine action is a tax on autonomy. The user's directive is explicit: **"I want autonomy with auditing and, if we really deem necessary, user gates where we get more inputs in the form of a board meeting with the CEO himself."**

This protocol replaces ad-hoc permission asks with a four-tier doctrine:

- Routine actions execute silently (Tier A).
- Reversible-but-meaningful actions execute with an audit log entry (Tier B).
- Material-but-not-catastrophic actions escalate via a tightly-scoped board-meeting Decision Packet (Tier C).
- Irreversible / destructive / data-touching actions are never agent-driven — EA gives the user the exact command to run themselves (Tier D).

The friction baseline is: **the user should rarely see a permission prompt for routine work, and should never be surprised by what the team did or did not do.**

---

## 2. The Four Tiers

### Tier A — Fully Autonomous (no audit entry required)

The team executes immediately, no logging beyond the normal transition-log / routing-log churn.

| Action | Why Tier A |
|---|---|
| Code commits in any project repo (Tier 1 framework or Tier 2 application) | Reversible via git history; commit message is its own audit. |
| Framework memory writes (`memory/patterns.md`, `memory/lessons-learned.md`, `memory/agent-changelog.md`, `memory/incidents.md`) | Append-only doctrine; reversible. |
| Internal logs (`transition-log.md`, `routing-log.md`, `dissent-log.md`, `conflict-log.md`) | Append-only; reversible. |
| File scaffolds inside an active project's workspace or `.claude/` | Reversible; no external side effects. |
| Scaffold-source rebuilds (`scripts/snapshot-claude.sh` and similar bundling for Tier 2) | Reversible; deterministic from source. |
| Local file reads / greps / lints / type-checks / unit test runs | Read-only or local-only. |
| Workspace state.json updates (Conductor's normal job) | Internal accounting. |

### Tier B — Autonomous with Audit (entry to `agent-changelog.md` required)

The team executes immediately, **AND appends an audit entry** to `memory/agent-changelog.md` (or `memory/incidents.md` if the action failed or produced an unexpected result).

| Action | Why Tier B |
|---|---|
| `git push` to `main` on any project repo (including this framework) | External effect, but reversible via revert-and-push. |
| `npm run db:push` against a **non-prod** Neon branch (dev / test / preview) | Schema applied to a branch user does not consider production-of-record. |
| Vercel auto-deploys triggered by a `git push` (the push itself is the audit hook — no separate entry needed unless deploy fails) | Push is already logged; deploy is a downstream artifact. |
| Dependency upgrades within `^` semver range (semver-minor and patch only) | Backwards-compat by SemVer contract; lockfile diff is the audit. |
| Generation of new Tier 2 agent contracts inside an existing `.claude/` set | Reversible by deleting the file. |
| Creating a new project workspace (`workspace/<slug>/`) and scaffolding the standard files | Reversible by deletion; no external surface. |
| Calling a documentation MCP, web search, or a read-only API to gather research | No side effects. |

**Audit entry minimum content:** date, project (if applicable), action, command run, outcome. One paragraph at most. The point is grep-ability, not narrative.

### Tier C — Gated via "Board Meeting" Decision Packet

The team **does not execute**. Conductor signals EA to deliver an `Ops Decision Packet — Board Meeting Format` (see `agents/executive-assistant.md`). User decides explicitly. On approval, the team runs the command and logs to `agent-changelog.md` with the user's verbatim approval text attached.

| Action | Why Tier C |
|---|---|
| `npm run db:push` (or any drizzle-kit migration) against the **prod** Neon branch | Production schema change; user must consciously consent. |
| Production environment variable changes (Vercel prod scope, GitHub App secrets, any prod credential) | Affects live system; mistakes are user-visible. |
| GitHub App scope expansions (adding a new permission to the registered App) | Increases blast radius; should be a deliberate trust call. |
| New npm dependencies with material transitive surface (anything that pulls in >5 transitive packages, or anything that ships native code) | Supply-chain risk; user should know what's being added. |
| Custom domain changes (registering a new subdomain, changing DNS records, swapping SSL providers) | Affects discoverability and trust posture of the brand. |
| Any code touching payments, billing, refunds, or financial reconciliation | Financial blast radius; CEO sign-off doctrine. |
| Major version dependency upgrades (semver-major) | Breaking-change risk; user should know what may break. |
| Renaming or restructuring a public-facing API, route, or URL path | Could break external integrations. |

The Decision Packet is short by design (250–400 words, same envelope as other Decision Packets) and ranks one recommended action first.

### Tier D — Always User, Never Agent

The team **does not execute under any circumstance**, even with explicit user approval delivered via chat. EA's job is to produce the exact command, hand it to the user, and confirm completion afterwards. Reason: the audit trail of "user pressed enter on this command at this time" matters more than convenience.

| Action | Why Tier D |
|---|---|
| `git push --force` to `main` (any repo) | Destroys history; user must execute. |
| Payment refunds, chargebacks, or any money-moving action | Financial action; agent never moves money (cf. computer-use MCP doctrine). |
| Repository deletion (any repo, public or private) | Irreversible; GitHub UI action. |
| Secret rotation without an existing backup of the prior secret | Risk of locking the team out; user verifies backup before rotation. |
| Anything that touches **real, production user data** in an irreversible way and CANNOT be sentinel-verified | Default to user-executes-it. |
| `rm -rf` on anything outside a known-temp directory | Filesystem blast radius; user verifies path. |
| GitHub repo visibility changes (private → public or vice versa) | Privacy posture; user owns. |
| Disabling 2FA, removing collaborators, transferring repo ownership | Account security; user owns. |

**Note on destructive SQL (`TRUNCATE`, `DROP TABLE`, `DELETE`):** these were formerly classified Tier D in this protocol. **As of 2026-05-06** they are classified per `protocols/destructive-data-ops.md §2` — Tier B (non-prod) agents may execute after `db-admin` sentinel-verification + per-op user "go"; Tier C (prod) requires sentinel-verification + a typed confirmation phrase that names the operation and target. Standing pre-authorization for Tier C does NOT exist; sessions that received "you can run X" earlier do NOT inherit authorization for Y. The verification + per-command discipline replaces the former Tier D blanket prohibition for destructive SQL specifically. All other Tier D categories (force-push, money-moving, repo-delete, secret rotation, rm -rf, account security) remain Tier D unchanged.

This change resolves the doctrinal contradiction caught by Critic 2026-05-06 (`workspace/_global/critic-review-destructive-data-ops-protocol.md` P0-2); ratified by Org Designer §F-1 Option A (`workspace/_global/org-designer-proposals/20260506-db-admin-ratification.md`). The user explicitly approved Option A 2026-05-06.

EA's hand-off format for Tier D:

```
TIER D — USER ACTION REQUIRED

Action: <description>
Why this is Tier D: <one line — irreversibility / data / money / security>
Exact command:
  <copy-pasteable command>
After running: <what to look for, what to send back to confirm>
```

---

## 3. Per-Neon-Branch Logic for `db:push`

The `db:push` command is the canonical case where the **same command** is Tier B against one branch and Tier C against another. Detection mechanism, in order of preference:

### 3.1 Recommended: explicit `NEON_BRANCH` env var (explicit > implicit)

The Tier 2 project's `.env.local` (or runtime env) declares `NEON_BRANCH=<branch-name>`. Conductor reads this when classifying a `db:push` action.

- `NEON_BRANCH=production | prod | live` → Tier C (board meeting).
- `NEON_BRANCH=dev | test | preview | local | <anything not the above>` → Tier B (autonomous + audit).

**Note on actual branch names:** Neon allows arbitrary branch names per project. The classifier checks the *role* the branch plays, not just literal name. For <project> (the canonical example, formerly <project-legacy>), the user's branches are named `production`, `dev`, `local` — all three exist with isolated data, mapped one-per-Vercel-scope. See `memory/project_db_topology.md` for the verified mapping.

**Migration application by branch (canonical pattern):**
- Local branch first (validate against the developer's checkout)
- Dev branch second (QA / preview deploys)
- Production branch last (Tier C — user Decision Packet required)

**Important caveat — `vercel env run` is unreliable for verifying prod values locally.** It layers `.env.local` on top of the Vercel-API env, so sensitive Production/Preview values come back masked by whatever is in `.env.local`. For explicit branch targeting in CLI work, use `DATABASE_URL="$(npx neonctl connection-string <branch> --pooled)" npx drizzle-kit push`. To verify the *actual* Vercel-side value, observe live deployment behavior (write a synthetic capture, query the expected branch's row count) — never trust `vercel env run` output for sensitive vars.

### 3.2 Fallback: `DATABASE_URL` hostname parsing

If `NEON_BRANCH` is absent, Conductor parses the `DATABASE_URL` hostname for known prod patterns. Heuristics:

- Hostname contains `prod`, `production`, `live`, or matches a project-specific prod pattern declared in `.claude/settings.local.json` → Tier C.
- Hostname contains `dev`, `test`, `staging`, `preview`, `branch`, or `pr-` → Tier B.
- **Ambiguous match → escalate to Tier C.** Better to over-escalate.

### 3.3 Why `NEON_BRANCH` is recommended

- Survives Neon dashboard renames that don't propagate to the URL string.
- Trivially auditable in the project's env file.
- Removes the ambiguity case entirely.
- Adds one line to `.env.local`; cost is near zero.

The team should encourage every Tier 2 project to declare `NEON_BRANCH` from day one. Architect's stack templates should include this in the env scaffold.

---

## 4. How to Grant New Permissions (Settings Mechanism)

Permission grants live in `~/.claude/settings.local.json` (global, per-user) or `<project>/.claude/settings.local.json` (project-local). Both honor an `allow` array. Project-local takes precedence for that project's session.

### 4.1 Format

```json
{
  "permissions": {
    "allow": [
      "Bash(git push:*)",
      "Bash(npm run db:push:*)",
      "Bash(npx drizzle-kit:*)",
      "Bash(vercel:*)",
      "Bash(gh pr create:*)",
      "Bash(gh pr view:*)"
    ]
  }
}
```

### 4.2 Common patterns

| Need | Allow entry |
|---|---|
| Push to any git remote | `Bash(git push:*)` |
| Run db:push for any flavor | `Bash(npm run db:push:*)` |
| Run drizzle-kit migrations directly | `Bash(npx drizzle-kit:*)` |
| Vercel CLI (deploy, env, link, etc.) | `Bash(vercel:*)` |
| GitHub CLI for PR flow | `Bash(gh pr create:*)`, `Bash(gh pr view:*)`, `Bash(gh pr list:*)` |
| Specific neon CLI subcommand | `Bash(neonctl branches:*)` |

### 4.3 When to add a permission vs. ask user every time

- **Add to global allow** if the action is Tier A or Tier B and recurs across projects (e.g., `git push:*`).
- **Add to project-local allow** if the action is Tier B and project-specific (e.g., `vercel:*` for the dashboard project).
- **Never add to allow** anything that is Tier C or Tier D — those should always trigger a fresh ask, because the gating IS the user value.

### 4.4 Use the `update-config` skill

Permission changes are mechanical edits to settings JSON. Use the `update-config` skill when the user asks to grant a new permission — it knows the JSON shape and the precedence rules.

---

## 5. Escalation Rule: Conductor MAY Promote a Tier B to Tier C

A Tier B action that **smells risky** in context should escalate to Tier C rather than auto-execute. The rule: **better to over-escalate than under-escalate.** A spurious Decision Packet costs 30 seconds of user attention; a silent destructive action costs trust.

### 5.1 Escalation triggers (non-exhaustive)

- Schema change touches `user_id`, foreign-key constraints, or any column in a table named like `users`, `accounts`, `sessions`, `payments`, `subscriptions`.
- Schema change drops, renames, or retypes an existing column (vs. adding a new one).
- Dependency upgrade includes a known-CVE remediation (treat as material — user should know what changed and why).
- Code commit modifies any file under `payments/`, `billing/`, or anything matching `**/*payment*` / `**/*billing*`.
- Push to main happens after a series of failing CI runs that were skipped or worked-around.
- Multiple Tier B actions stack within a short window (>3 distinct Tier B actions in <10 minutes) — promote the next one to Tier C as a checkpoint.

### 5.2 How escalation is recorded

When Conductor escalates, the audit entry in `agent-changelog.md` notes "ESCALATED to Tier C" plus the trigger reason. This is how Org Designer tracks whether the escalation rule is well-calibrated (too few escalations = under-cautious; too many = annoying).

---

## 6. What "Audit" Means in Practice

Every Tier B (and every Tier C after approval) action gets a single appended entry to `memory/agent-changelog.md`. If something went wrong, the entry instead lands in `memory/incidents.md` per `protocols/incident-protocol.md`.

### 6.1 Audit entry format (Tier B / Tier C)

Append below the most recent dated entry. Format:

```
## YYYY-MM-DD HH:MM — Ops: <one-line action description>

**Tier:** B (or C — approved)
**Project:** <slug or "framework">
**Command:** `<exact command run>`
**Outcome:** <one line — pass/fail/partial + a sentence>
**Approval (Tier C only):** "<verbatim user approval text>"
**Notes:** <any caveats, follow-ups, related artifacts>
```

The point of the format is grep: `grep "Tier: C" <changelog-file>` returns every board-meeting decision; `grep "Tier: B" <changelog-file>` returns every audit-only execution. The user can scan their full operational history with one command.

#### 6.1.1 Audit-routing destination (per `protocols/changelog-protocol.md` scope split)

Tier B and Tier C audit entries route by scope, not by uniform default:

- **Project-scoped Tier B / C actions** (e.g., env-var rotation on a Tier 2 project, custom-domain cutover, schema migration, dev/main promotion) — append to the **project's** `agent-changelog.md`: `<project>/.claude/memory/agent-changelog.md`. Project slug appears in the entry's `**Project:** <slug>` line.
- **Framework-scoped Tier B / C actions** (e.g., framework template change, protocol patch, agent contract edit, framework memory file initialization) — append to the **framework** `agent-changelog.md`: `.claude/memory/agent-changelog.md`. The `**Project:** framework` line marks scope.
- **Cross-cutting actions with both framework and project consequences** — append BOTH atomically per `protocols/changelog-protocol.md §3` ("both files updated when a team-shape change has project-specific consequences"). The two entries cross-reference each other; neither stands alone.

**Why route by scope:** the framework changelog audience is anyone reading framework history (future contributors, governance, marketing release notes). The project changelog audience is implementers + the user reviewing one project's history. Mixing project-scoped audit entries into framework changelog (the prior implicit default) bleeds Tier 2 deployment narrative into framework release notes — caught by Org Designer leakage audit 2026-05-06 and migrated retroactively per `changelog-protocol.md §7.1`.

**Default rule on ambiguity:** when scope is genuinely unclear, append to the project changelog (narrower scope, catches the audit) AND signal Org Designer in the next briefing for routing review. Org Designer can promote project-scoped lessons to framework via the standard proposal flow if they generalize.

### 6.2 Failure → incidents.md instead

If the action returned non-zero exit, produced unexpected output, or revealed a real bug, the entry goes in `memory/incidents.md` per the existing incident protocol. The agent-changelog can carry a one-line breadcrumb pointing at the incident (`See: incidents.md §<N>`), but the meat lives in incidents.md so Org Designer's mining loop catches it.

### 6.3 What does NOT need an audit entry

- Tier A actions (would drown the changelog in noise).
- Routine state.json updates (already in transition-log).
- Local-only computation (lints, type-checks, unit tests).
- Reads of any kind.

---

## 7. Forbidden Behaviors

- ❌ Executing a Tier C action without the Decision Packet round-trip, even when user approval seems "obvious from context."
- ❌ Executing any Tier D action under any circumstance, even with explicit chat approval. *(Note: destructive SQL — `TRUNCATE`/`DROP`/`DELETE` — was reclassified out of Tier D on 2026-05-06 per `protocols/destructive-data-ops.md §2`. The forbidden-list applies to Tier D as defined in §2 of THIS protocol post-amendment. Destructive SQL is now governed by the destructive-data-ops protocol's Tier B/C discipline — sentinel-verify + per-command authorization — not by this ❌-bullet.)*
- ❌ Adding a Tier C or Tier D pattern to the `allow` array in any settings file.
- ❌ Skipping the audit entry for a Tier B action because "it worked fine." The audit IS the value.
- ❌ Promoting a single Tier C action into a "while we're at it..." bundle of multiple unrelated Tier C actions in one Decision Packet.
- ❌ Demoting a Tier B action to Tier A by adding it to `allow` AND skipping the audit. Allow controls permission; audit is a separate doctrinal requirement.
- ❌ Running a Tier B action against ambiguous-tier infrastructure (e.g., `db:push` against a branch whose role isn't declared). Default to Tier C in ambiguity.

---

## 8. References

- `agents/conductor.md` — `## Operations Routing` section; classifier lives there.
- `agents/executive-assistant.md` — `## Ops Decision Packet — Board Meeting Format` variant.
- `protocols/checkpoint-protocol.md` — hard-checkpoint mechanism that Tier C borrows from (don't duplicate).
- `protocols/incident-protocol.md` — where failed Tier B / Tier C actions land.
- `memory/agent-changelog.md` — where the Tier B / Tier C audit entries live.
- `memory/incidents.md` — where failed ops land (with breadcrumb in changelog).
- The `update-config` skill — for editing settings.local.json safely.
