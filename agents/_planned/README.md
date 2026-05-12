# Planned Agents (not yet activated)

This directory holds **stub agents** — roles the Org Designer has identified as likely needs, but which aren't built yet. Each stub documents:

1. **Activation trigger** — what conditions would justify building this agent
2. **Provisional mandate** — what the agent would do
3. **Provisional inputs/outputs** — sketch of contract

When a trigger fires, Org Designer writes a proposal to activate. User approves → the file moves from `_planned/` to `agents/` and gets fleshed out into a full agent contract using the `agents/intake.md` (or other) format as reference.

## Why Stubs Instead of Full Agents

Real friction beats imagined need. Building 12 agents on day one means:
- 8 of them are mediocre because they haven't been pressure-tested
- Maintenance burden on prompts that may never fire
- Premature specialization (you might split wrong)

Better: ship 7 sharp agents, watch where the seams show, build specialists when evidence demands it.

## Current Stubs (10)

### Post-shipping roles
| Stub | Activation trigger |
|---|---|
| `gtm-strategist.md` | First project ships (handed-off → shipped) |
| `growth-analyst.md` | First project has measurable users (shipped → measured) |
| `feedback-synthesizer.md` | First project receives user feedback (reviews, support tickets, usage signals) |

### Depth-on-demand specialists
| Stub | Activation trigger |
|---|---|
| `customer-researcher.md` | Strategist's research consistently flagged as too shallow OR ICP definition repeatedly contested across projects |
| `industry-researcher.md` | Strategist's competitive scans consistently flagged as too shallow OR competitive context becomes load-bearing |
| `designer.md` | Critic flags missing design/UX decisions in 2+ projects, OR project requires non-trivial UX |
| `ops-security.md` | First project handling sensitive data, OR security gaps flagged repeatedly |
| `biz-finance.md` | First non-trivial pricing model OR unit economics becomes load-bearing |
| `biz-legal.md` | First regulated-domain project, content licensing, or multi-jurisdiction deployment |

### Review tier (HQ)
| Stub | Activation trigger |
|---|---|
| `quality-engineer.md` | First of — (a) next post-deploy incident with runtime/deploy/env root cause; (b) project handling paid users / payments / user-data writes; (c) project where Architect's tech-strategy cites runtime risk as one of 3 named risks. |

## Activation Process

1. Org Designer detects trigger condition met
2. Org Designer writes proposal to `workspace/_global/org-designer-proposals/`
3. EA surfaces to user under TEAM HEALTH
4. User approves → Org Designer:
   - Moves file from `_planned/` to `agents/`
   - Fills out full contract (mandate, inputs, outputs, authority, failure modes, triggers, wrong-agent rules)
   - Updates `memory/agent-changelog.md` with narrative
   - Updates `CHANGELOG.md` with technical entry
   - Adds slash command in `commands/` if appropriate
   - Adds template(s) in `templates/` if agent produces new artifact types

## Adding More Stubs

When Org Designer identifies *another* future need (beyond these 5), it writes a new stub here following the same format. Stubs themselves don't require user approval — only activations do.

## Why These 10 Specifically

**Post-shipping (3):** GTM, Growth, Feedback — can't usefully exist before something ships.

**Research depth (2):** Customer / Industry Researchers — Strategist handles first-line; split off when depth is needed.

**Design (1):** Designer — Strategist's PRD covers basics; activate when UX becomes load-bearing.

**Ops/Security (1):** Activate when handling sensitive data; basic security via Architect + Critic until then.

**Business/Finance + Legal (2):** Strategist handles light versions; activate when monetization or compliance gets complex.

**Quality Engineer (1):** Critic reviews artifacts (plan axis); QE reviews running systems (runtime axis). Stubbed 2026-05-05 in response to first post-deploy incident — the gap is structural (no agent currently exercises the deployed system), not statistical (N=1). Stub form chosen because layered defense via Architect audit-checklist patch + Critic pattern-library warning closes the immediate seed-incident class without a live agent.

**Not in stubs (intentionally):**
- DevOps, deployment, per-project unit-test authoring — belong to Tier 2 (per-project), not HQ
- Frontend/Backend/Mobile implementation — same; per-project execution
- Sales, BD, Investor relations — outside HQ's scope (you handle these directly)
- Support — outside HQ; downstream of customer feedback, handled per product

**Note on quality / QA boundary:** *implementation* QA (unit tests, integration tests inside one codebase) is owned by Tier 2 implementer + Tier 2 critic. *Cross-project quality strategy + smoke-test execution against deployed systems + runtime-pattern memory* is owned at HQ via the Quality Engineer stub. Two layers, one boundary: text-on-disk vs running process.
