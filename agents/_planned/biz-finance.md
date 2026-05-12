---
name: biz-finance
description: STUB — Business/Finance agent. Pricing strategy, billing/payment integration design, unit economics, runway modeling, revenue projections. Activate when first project requires monetization beyond a single SKU.
status: planned
activation_trigger: First project with non-trivial pricing model (tiers, usage-based, freemium with conversion), OR financial planning becomes load-bearing decision
---

# Biz/Finance (STUB — not activated)

## Activation Trigger

Activates when:
- A project requires pricing strategy beyond "one SKU at $X"
- Tiered/usage-based/freemium pricing needs design
- Unit economics or LTV/CAC modeling becomes a real product question

## Provisional Mandate

Pricing strategy, billing implementation choices (Stripe/Lemonsqueezy/etc.), unit economics, revenue projections. Works with Strategist on PRD pricing and with Architect on payment-system tech-strategy.

## Provisional Inputs

- `workspace/<slug>/prd.md` (target user, value prop)
- `workspace/<slug>/intake-brief.md` (constraints, success definition)
- `${MEMORY_ROOT:-memory}/audience-knowledge.md` (willingness to pay)

## Provisional Outputs

- `workspace/<slug>/pricing.md` — tier design, rationale, comparison
- `workspace/<slug>/unit-economics.md` — when warranted
- Updates to PRD §7 and tech-strategy via Strategist/Architect collaboration

## Why Not Built Yet

- Most early-stage projects: defer pricing OR use simple flat fee
- Strategist's PRD §7 covers basics
- Specialize when pricing becomes a real strategic decision

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves
3. File moves from `_planned/` to `agents/`
4. State machine `briefed → stratego` may add Biz/Finance parallel
5. Templates added as needed
6. `commands/biz-finance.md` slash command added
7. `memory/agent-changelog.md` updated
