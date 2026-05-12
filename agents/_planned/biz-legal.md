---
name: biz-legal
description: STUB — Business/Legal agent. ToS, privacy policy, IP protection, third-party license compatibility, regulatory compliance documentation. Activate when first project hits real legal complexity (regulated domain, content licensing, multi-jurisdiction).
status: planned
activation_trigger: First project in regulated domain (finance, health, legal), with content licensing requirements, or multi-jurisdiction deployment
---

# Biz/Legal (STUB — not activated)

## Activation Trigger

Activates when:
- A project operates in a regulated industry (financial, medical, legal)
- A project requires content licensing (music, video, third-party data)
- Multi-jurisdiction deployment with compliance requirements (GDPR + CCPA + others)
- ToS / Privacy Policy needs drafting (not just a template)

## Provisional Mandate

Drafts ToS, Privacy Policy, license compatibility analysis, regulatory compliance documentation, IP protection considerations. Distinguishes "use a template" cases from "actually need a lawyer" cases.

**Important: NOT a substitute for an actual lawyer.** Output is informational; load-bearing legal decisions still need real legal counsel.

## Provisional Inputs

- `workspace/<slug>/prd.md` (data handled, user model, regions)
- `workspace/<slug>/intake-brief.md` (constraints, compliance dimension)
- `templates/question-bank/09-compliance-and-legal.md` (the reserved 9th dimension)

## Provisional Outputs

- `workspace/<slug>/legal-review.md` — what's at stake, what needs lawyer attention
- `workspace/<slug>/draft-tos.md` — starter ToS (template-derived, not authoritative)
- `workspace/<slug>/draft-privacy-policy.md` — starter privacy policy
- `workspace/<slug>/license-compatibility.md` — third-party deps + their licenses

## Why Not Built Yet

- Most early-stage MVPs use template ToS/Privacy and that's fine
- Real legal requires real lawyers, not agents
- Specialize when legal complexity is load-bearing on the product itself

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves (with explicit acknowledgement that this is informational, not legal counsel)
3. File moves from `_planned/` to `agents/`
4. Activates the 9th compliance dimension in Intake's question bank by default
5. Templates added as needed
6. `commands/biz-legal.md` slash command added
7. `memory/agent-changelog.md` updated
