# Security Audit — <project-slug>

**Pass:** <YYYY-MM-DD HH:MM> — <handed-off → shipped gate | re-audit after fix | /ops-security direct invocation>
**Auditor:** Ops/Security
**Deployed URL audited:** <https://...>
**Threat model referenced:** `workspace/<slug>/threat-model.md` (mitigation map IDs cited inline)
**Tier 2 commit / branch:** <commit SHA + branch name from state.json.tier2_deployed_at>

---

## 0. Result envelope (per `protocols/outcome-grading.md`)

This block MUST appear at the top of each pass's section in `security-audit.md`. Conductor parses the LAST yaml-fenced block in the file when the iteration loop produces multiple passes within one cycle.

````yaml
result: satisfied  # one of: satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/threat-model.md  # mitigation map IDs
criteria_evaluated:
  - id: M-1
    description: oauth-state-validation enforces server-issued nonce on callback
    status: pass  # one of: pass | fail | partial | not_tested
    evidence: probed callback with hand-crafted state — got 401; src/app/api/auth/github/callback/route.ts:67 validates state
    severity: not_applicable  # one of: P0 | P1 | P2 | not_applicable
  - id: M-2
    description: session-cookie-signed (HMAC + httpOnly + sameSite=lax)
    status: pass
    evidence: curl + jq on Set-Cookie header confirmed all three flags; HMAC verified via tampered-cookie probe (401)
  - id: M-3
    description: secrets-not-in-error-responses
    status: partial
    evidence: forced 500 on /api/projects — error response includes stack trace with file paths; redaction layer present but doesn't strip stack
    severity: P1
findings_summary:
  P0: 0
  P1: 1
  P2: 2
  notes: 4
verdict: LAND-WITH-FOLLOWUPS  # human-readable; optional but recommended
followup_items_filed:
  - BL-NNN  # actual ID allocated by Backlog Curator at filing
````

If `result == unable_to_grade`, add `reason_class:` and `reason_detail:` fields and `criteria_evaluated:` may be empty. See `protocols/outcome-grading.md §2` for full schema + per-criterion semantics.

---

## 1. Project context

- **Project type:** <e.g., multi-user OAuth dashboard / public marketing site / single-user CLI>
- **Stack:** <from tech-strategy.md — auth choice, deployment target, secrets handling>
- **Sensitive surface:** <what's worth attacking — tokens, sessions, secrets, user data, integrity of writes, availability>
- **Threat model source:** `workspace/<slug>/threat-model.md` (mitigation map enumerated; criterion IDs in envelope reference these)

## 2. What was audited

Enumerated. One row per mitigation criterion, with result + evidence. Mirrors `criteria_evaluated[]` from the envelope but with prose detail.

| # | Mitigation (from threat-model) | Probe / verification | Result | Evidence |
|---|---|---|---|---|
| 1 | M-1: oauth-state-validation | crafted-state callback probe | pass | 401; route.ts:67 validates |
| 2 | M-2: session-cookie-signed | tampered-cookie probe | pass | 401 + Set-Cookie flag verification |
| ... | ... | ... | ... | ... |

## 3. What wasn't audited

Enumerated. Mitigations or surfaces explicitly out of scope for this pass.

- <criterion / surface> — <reason: out of scope, requires specialist, requires permission user hasn't granted>

## 4. What couldn't be audited

Enumerated. Where infrastructure / tooling blocked execution.

- <criterion / surface> — <reason: live load testing, formal cryptographic review, supply-chain analysis on transitive deps>

## 5. P0 findings — blocking

Any P0 = transition blocked. Auth bypass, leaked secret, RCE, SQL injection, IDOR with sensitive data, secret in error response. Maps to envelope `findings_summary.P0`.

If none: **None.**

For each P0:

```
### P0-1 — <one-line title>

- **Criterion:** <id from envelope>
- **Failing probe:** <exact command / URL / payload>
- **Observed:** <what was extracted / bypassed / leaked>
- **Threat-model reference:** <which mitigation should have prevented this>
- **Why blocking:** <one sentence on adversarial impact>
- **Recommended mitigation:** <implementation hint — Tier 2 fixes; ops-security re-audits>
```

## 6. P1 findings — backlog-filed

Maps to envelope `findings_summary.P1` and `followup_items_filed[]`. Missing rate-limit, missing audit-log on sensitive action, missing CSRF token on state-changing form, missing security headers (CSP, HSTS, X-Frame-Options).

```
### P1-1 — <one-line title> (filed as <BL-NNN>)

- **Criterion:** <id from envelope>
- **Failing probe:** <command / URL / payload>
- **Observed:** <what happened>
- **Recommended mitigation:** <implementation hint>
- **Backlog entry:** `workspace/<slug>/backlog.md §BL-NNN`
```

## 7. P2 findings — informational

Defense-in-depth recommendations, hardening opportunities. Logged for awareness; not auto-promoted to backlog. Maps to envelope `findings_summary.P2`.

- <surface / observation> — <hardening recommendation>

## 8. Adversarial probe pass

Beyond the planned audit. Document what was tried.

- Path traversal: `..` shapes
- SQL probe: `'` shapes
- Oversized payloads: <max body size attempted>
- Malformed JSON, unusual content-types, slowloris-shaped requests, prototype-pollution shapes, etc.

## 9. Mitigations applied since threat model

What landed since `threat-model.md` was authored. Maps mitigation map IDs → status.

| Mitigation ID | Implementation | Verified? |
|---|---|---|
| M-1 | Lands in src/app/api/auth/github/callback/route.ts:67 (commit SHA) | yes — probed |
| M-2 | Lands in src/lib/auth/session.ts (commit SHA) | yes — probed |

## 10. Outstanding mitigations

What was planned in threat-model but not implemented; user decision required to ship without.

- **<Mitigation ID>** — <name> — <why deferred> — <user-decision-needed: yes/no>

## 11. Anti-rubber-stamp log

Required when previous security-audit was fully clean. Document:
- **Cross-run trigger active:** <yes / no — count `last_result == 'satisfied'` across last N envelope history>
- **Forced-paranoid pass framing:** "What's the single attack vector I haven't probed? What does this stack typically fall to?"
- **Probes attempted:** <list>
- **What surfaced (or didn't):** <findings>
- **If second pass also clean:** "Two-pass clean security audit — probe coverage at [list]; flag for Org Designer if pattern repeats."

Omit this section if any P0 finding exists.

## 12. Sign-off

- **Pass result:** <ship-eligible | blocked on P0 | partial — see §4 for what couldn't be audited>
- **Coverage:** <N mitigations evaluated / N in threat-model.md>
- **Recommended next action:** <one sentence — e.g., "Approve ship; P1 findings filed as BL-NNN for next session">
- **Signal:** Conductor + EA notified.

---

_Append-only across passes within a deployment cycle. New passes append a new top-level "Pass: <ts>" header with fresh envelope; do not rewrite prior sections._
