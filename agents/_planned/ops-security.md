---
name: ops-security
description: PROMOTED 2026-05-06 — stub retained as historical record. Live contract at `agents/ops-security.md`.
status: promoted
promoted_on: 2026-05-06
promoted_to: agents/ops-security.md
promotion_proposal: workspace/_global/org-designer-proposals/20260506-1533-ops-security.md
activation_trigger: First project handling sensitive data (PII, financial, health), OR Critic flags repeated security gaps in tech-strategy across projects
---

# Ops/Security — PROMOTED 2026-05-06

**This stub is retained as historical record only. The live operating contract lives at `agents/ops-security.md`.**

**Promotion proposal:** `workspace/_global/org-designer-proposals/20260506-1533-ops-security.md`

**Why promoted:** All three stub-activation triggers fired simultaneously on 2026-05-06, at the category level:

1. **Sensitive-data threshold crossed** — encrypted-at-rest credential storage, secrets-in-env-vars, session-cookies-as-bearer-tokens combination.
2. **User-accounts-at-scale threshold crossed** — backlog-tracked migration from owner-only beta to multi-user production.
3. **User explicit activation request** — direct dispatch authorizing concurrent activation + scoped first-dispatch.

> *Implementation pattern as deployed for the activating Tier 2 project:* sensitive-data evidence (encrypted UAT storage, GitHub App private key + client secret in env vars, session cookies as bearer tokens), multi-user-scale evidence (backlog item taking the project from owner-only beta to multi-user production GitHub App), user-explicit-request evidence (verbatim dispatch). Project-attributable detail lives in `memory/agent-changelog-private.md` — *2026-05-06 entry on Ops/Security activation*. The promotion proposal at `workspace/_global/org-designer-proposals/20260506-1533-ops-security.md` records the full activation-decision context. Future activations on other projects may surface different specific evidence — the category-level triggers are stable; the implementation evidence is project-attributable.

**Activation level:** LIVE (not stub-first). Stub-first calculus inverts when the trigger has already fired AND the first dispatch is already scoped AND blast radius is high. See promotion proposal §"Activation level: LIVE (not stub)" for detail.

**First dispatch scope (separate from this activation):** Security audit of the activating Tier 2 project's OAuth + session + idempotency + secrets surface, including concurrency + multi-user testing. Project-specific scope detail in `memory/agent-changelog-private.md` — *2026-05-06 entry on Ops/Security activation*. Generally produces `workspace/<slug>/threat-model.md` then `workspace/<slug>/security-audit.md`.

**Three-axis review tier completed:** Critic (plan axis) + Quality Engineer (runtime functional axis) + Ops/Security (runtime adversarial axis). Each axis fires in parallel at scoping; each holds independent blocking authority at handed-off → shipped.

---

## Original Stub Content (preserved below — refer to live contract for operating doctrine)

# Ops/Security (STUB — not activated)

## Activation Trigger

Activates when:
- A project handles sensitive data (PII, payments, health, regulated)
- A project requires real auth/authz beyond magic-link or OAuth basics
- Critic flags security gaps in 2+ projects' tech-strategy

## Provisional Mandate

Threat modeling, auth/authz patterns, OWASP Top 10 audit, secrets handling, vulnerability assessment. Reviews Architect's tech-strategy for security implications before scaffold.

## Provisional Inputs

- `workspace/<slug>/prd.md` (data handled, user model)
- `workspace/<slug>/tech-strategy.md` (stack picks, dependencies)
- `${MEMORY_ROOT:-memory}/lessons-learned.md` (prior security issues)

## Provisional Outputs

- `workspace/<slug>/threat-model.md`
- `workspace/<slug>/security-review.md` — flags + recommendations
- Updates to `tech-strategy.md` via Architect after collaboration

## Why Not Built Yet

- Most early-stage projects don't have material security exposure beyond table-stakes (TLS, hashed passwords, OAuth)
- Critic catches the basics already
- Specialize when projects start handling regulated or sensitive data

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves
3. File moves from `_planned/` to `agents/`
4. State machine `scoping → planned` adds Ops/Security parallel review
5. Templates added as needed
6. `commands/ops-security.md` slash command added
7. `memory/agent-changelog.md` updated
