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

## Current Stubs (11)

### Post-shipping roles
| Stub | Activation trigger |
|---|---|
| `gtm-launch-strategist.md` | Project reaches `shipped` AND has identifiable buyer surface — paid tier exists, OR B2B angle is concrete, OR multi-user surface ships, OR user explicitly requests launch coordination. Renamed + narrowed from prior `gtm-strategist.md` on 2026-05-11 (positioning + content production moved to active `product-marketing-manager`; pricing, channels, campaign coordination, conversational/outbound assets, demo scripts stay here). |
| `growth-analyst.md` | First project has measurable users (shipped → measured) |
| `feedback-synthesizer.md` | First project receives user feedback (reviews, support tickets, usage signals) |

### Framework operations
| Stub | Activation trigger |
|---|---|
| `release-coordinator.md` | Activates v0.25.0+ per `workspace/_global/release-coordinator-proposal-2026-05-19.md` (Option Y staged, post-v0.24.0). Owns `/release` execution arc, parallel-session coordination at the release boundary, trunk-state attestation post-publish, KNOWN_ORPHANS map appends, and Gate 5 failure response. Operates within the mechanical floor that v0.24.0 codified (Layer A in `publish.yml`, Layer B in `commands/release.md`, invariant 4 in `hooks/version-gate.py`, fifth channel in `version-parity-audit.ts`). Activates when v0.24.0 has shipped clean AND at least one post-v0.24.0 release has happened under the new Layer B flow without operator-side ambiguity AND Critic clears the stub's full contract AND user approves. Per Critic W5 (2026-05-19), user re-validation gates the timing. |

### Depth-on-demand specialists
| Stub | Activation trigger |
|---|---|
| `customer-researcher.md` | Strategist's research consistently flagged as too shallow OR ICP definition repeatedly contested across projects |
| `industry-researcher.md` | Strategist's competitive scans consistently flagged as too shallow OR competitive context becomes load-bearing |
| `biz-finance.md` | First non-trivial pricing model OR unit economics becomes load-bearing |
| `biz-legal.md` | First regulated-domain project, content licensing, or multi-jurisdiction deployment |
| `technical-writer.md` | First of — (a) PMM's documentation output flagged by Critic as too marketing-voiced for technical readers in 2+ projects; (b) project exposes public API, SDK, or developer-facing integration surface; (c) Tier 2 reportback flags downstream consumers (developers, integrators, partners) need reference-grade docs; (d) explicit user request. Sibling to active `product-marketing-manager` — PMM owns marketing-voiced user-facing content; TW owns reference-voiced developer content. |
| `test-engineer.md` | (See file for activation trigger.) |
| `knowledge-curator.md` | First of — (a) first project crosses a phase-transition cadence boundary with >=5 Decision Packets accumulated (today: <project>, is approaching this with ~6 packets in `workspace/<project>/`); (b) user explicitly invokes `/knowledge-curate <slug>` and expects a curation pass to happen — the invocation IS the trigger; (c) a second active Tier 2 project ships its first artifact (knowledge-base across two projects becomes net-valuable for cross-project comparison). Sibling to active `backlog-curator` (curator-lite shape). Owns per-project narrative-grade context — `workspace/<slug>/knowledge-base.md` (goals + decisions+rationale + stakeholders/constraints/deadlines + glossary + story-so-far + parked-unresolved). Distinct from EA (event-shape vs. narrative-shape seam) and Backlog Curator (mechanical work-item state vs. narrative). Source-of-truth proposal: `workspace/_global/org-designer-proposals/20260513T0026-knowledge-curator.md`. |

## Activated agents (formerly stubs)

These roles were activated and moved to the live roster. The original stub files are preserved under `_archive/` with the `<role>-promoted-YYYY-MM-DD.md` naming convention; see `agents/_archive/README.md`. Activation narrative is in `memory/agent-changelog.md`.

| Activated agent | Activated on | Archived stub |
|---|---|---|
| `designer` | 2026-05-?? | (live `agents/designer.md`; original stub absorbed pre-archive convention) |
| `ops-security` | 2026-05-06 | `_archive/ops-security-promoted-2026-05-06.md` |
| `quality-engineer` | 2026-05-06 | `_archive/quality-engineer-superseded-2026-05-06.md` (the pre-activation stub was reshaped via merge, not a clean promotion — see `memory/agent-changelog.md`) |
| `product-marketing-manager` | 2026-05-11 | (activated as a new role rather than a stub promotion; partial supersession of prior `gtm-strategist.md`, renamed to `gtm-launch-strategist.md` on the same date) |

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

## Why These 11 Specifically

**Post-shipping (3):** GTM Launch Strategist, Growth, Feedback — can't usefully exist before something ships. `gtm-launch-strategist` renamed and narrowed from prior `gtm-strategist` on 2026-05-11: positioning + content production (release notes, feature briefs, user-facing docs) moved to active `product-marketing-manager`; pricing, channel mix, campaign timing, conversational/outbound assets, demo scripts stay in this stub.

**Research depth (2):** Customer / Industry Researchers — Strategist handles first-line; split off when depth is needed.

**Business/Finance + Legal (2):** Strategist handles light versions; activate when monetization or compliance gets complex.

**Content (1):** Technical Writer — sibling specialization to active `product-marketing-manager`. PMM owns marketing-voiced user-facing content (release notes, feature briefs, user docs); TW owns reference-voiced developer content (API specs, SDK reference, integration guides). Activate when PMM's marketing voice is flagged as wrong-register in 2+ projects, OR when a project exposes a developer-facing surface.

**Test Engineer (1):** See `test-engineer.md` for activation context.

**Knowledge Curator (1):** Sibling-to-Backlog-Curator (curator-lite). Owns user-narrative-grade project context — the file the cold-resume reader (or product UI surface) reads when answering *"why does this project exist and what's been decided that can't be re-litigated?"* The split is two-axis: Backlog Curator owns mechanical work-item state; Knowledge Curator owns narrative-grade synthesis. Activate when the first project hits the phase-transition + Decision-Packet inflection (imminent for <project> OR user invokes `/knowledge-curate` OR a second Tier 2 project lands. See `knowledge-curator.md` for full charter, triggers, sink schema, and read/write boundaries.

**Release Coordinator (1):** Framework operations role. Owns the `/release` execution arc and the judgment-layer decisions that surround the v0.24.0 mechanical floor (Layer A in `publish.yml`, Layer B in `commands/release.md`, invariant 4 in `hooks/version-gate.py`, fifth channel in `version-parity-audit.ts`). Lives at the seam where parallel framework sessions, override-token justification, Gate 5 failure-mode routing, and KNOWN_ORPHANS map governance need single-owner adjudication. Stubbed-not-active in v0.24.0 per architect sequencing rationale — the mechanical floor doesn't need the agent; the agent does need the floor. Activation in v0.25.0+ pending user re-validation per Critic W5 (2026-05-19).

**Previously listed, now activated:** `designer`, `ops-security`, `quality-engineer` — see "Activated agents" table above and `_archive/`.

**Not in stubs (intentionally):**
- DevOps, deployment, per-project unit-test authoring — belong to Tier 2 (per-project), not HQ
- Frontend/Backend/Mobile implementation — same; per-project execution
- Sales, BD, Investor relations — outside HQ's scope (you handle these directly)
- Support — outside HQ; downstream of customer feedback, handled per product

**Note on quality / QA boundary:** *implementation* QA (unit tests, integration tests inside one codebase) is owned by Tier 2 implementer + Tier 2 critic. *Cross-project quality strategy + smoke-test execution against deployed systems + runtime-pattern memory* is owned at HQ via the Quality Engineer stub. Two layers, one boundary: text-on-disk vs running process.
