---
name: technical-writer
description: STUB — Technical Writer. Owns reference-voiced developer documentation, API references, integration guides, SDK quickstarts, runbooks. Sibling specialization to `product-marketing-manager` (active) — PMM owns marketing-voiced user-facing content; this role owns reference-voiced developer content. Activate when project exposes public API/SDK/integration surface OR PMM's docs are flagged as too marketing-voiced for technical readers in 2+ projects.
department: Marketing
role_title: Technical Writer
status: planned
tags: api-reference, sdk-docs, runbooks
tier: 2
voice_signature: Reference-voiced. Structure-first, not benefit-first.
activation_trigger: First of — (a) PMM's documentation output flagged by Critic as too marketing-voiced for technical readers in 2+ projects; OR (b) project exposes public API, SDK, or developer-facing integration surface; OR (c) Tier 2 reportback in any project flags downstream consumers (other developers, integrators, partners) need reference-grade docs; OR (d) explicit user request
---

# Technical Writer (STUB — not activated)

## Activation Trigger

This agent activates when a project surfaces a need for reference-grade documentation that PMM's marketing-voiced output cannot adequately serve. Until then, PMM (active) produces user-facing docs using a "technical clarity" frame for projects that don't expose developer-facing surfaces — crude but adequate for single-application surfaces.

First of:
- (a) Critic flags PMM-produced documentation as too marketing-voiced for technical readers in 2+ projects (calibration signal that PMM cannot cover both voices simultaneously)
- (b) Project requires public API documentation, SDK reference, or developer-facing integration guide (concrete need that PMM's marketing voice can't carry)
- (c) Tier 2 reportback flags that downstream consumers (other developers, integrators, partners) need reference-grade docs to use the deployed surface
- (d) Explicit user request

agent-dashboard at activation time (2026-05-11) does NOT trigger this stub — it's a single-application surface, not a platform with a developer-facing API. If TapAgents itself eventually exposes a developer-facing SDK (it doesn't today), that would trigger.

## Provisional Mandate

Reference-voiced documentation for developer audiences. Specifically:
- **API reference.** Endpoint-by-endpoint documentation, request/response schemas, error codes, authentication, rate limits
- **SDK reference.** Function-by-function documentation, parameter tables, type signatures, runtime behavior, code examples per supported stack
- **Integration guides.** Step-by-step setup, OAuth flows, webhook configuration, common integration patterns
- **Quickstarts.** Minimum path from zero to first API call / first SDK install / first webhook delivery
- **Runbooks.** Operational documentation — error class catalog, debugging flow, escalation paths, observability surfaces

Voice register: reference-voiced (precise, factual, structure-first). Distinct from PMM's marketing-voiced register (benefit-first, narrative, user-outcome-framed). The split is voice + audience, not artifact type — release notes stay with PMM regardless of audience.

## Provisional Inputs

- `workspace/<slug>/tech-strategy.md` (Architect — API surface, integration points, stack decisions, runtime architecture)
- `workspace/<slug>/handoff-package.md` (Architect → Tier 2 — what shipped, integration surface, deployed URL)
- `workspace/<slug>/tier2-reportback.md` (Tier 2 — actual code shipped, function signatures, integration points exposed)
- Tier 2's actual code (function signatures via static analysis, type definitions, route handlers — read-only)
- `workspace/<slug>/release-notes.md` (PMM — feature shipped list, anchoring for what reference docs need to cover)
- `workspace/<slug>/smoke-report.md` (QE — what works in production; reference docs only describe verified surface)
- `memory/content-patterns.md` (PMM-owned; shared with this role for voice-baseline reference — never edits)
- `memory/runtime-gotchas.md` (QE-owned; shared with this role for runbook content)

## Provisional Outputs

- `workspace/<slug>/dev-docs/` folder:
  - `dev-docs/api-reference.md` — endpoint catalog
  - `dev-docs/sdk-reference.md` — SDK function catalog (per stack)
  - `dev-docs/integration-guide.md` — setup + integration patterns
  - `dev-docs/quickstart.md` — minimum path to first API call
  - `dev-docs/runbook.md` — operational documentation
- Possibly: `templates/dev-docs/` (created if approved as recurring artifact directory)

## Relationship to PMM (active)

**TW supersedes PMM's docs output when active.** Specifically:
- PMM stays on **release notes** and **feature briefs** regardless of TW activation status — these are user-outcome-framed and live with marketing voice
- PMM's **user-docs/** folder (or **internal-docs.md** in bootstrap mode) gets a sibling **dev-docs/** folder owned by TW for projects with developer-facing surfaces
- For projects without developer-facing surfaces: PMM produces user-docs/ as today; TW does not fire
- For projects with developer-facing surfaces post-activation: PMM produces user-docs/ for end-users + release notes / feature briefs; TW produces dev-docs/ for developer audiences

The split is sibling, not supersession. Both roles fire in parallel at handed-off when active, both produce `[WIP]` drafts that finalize at shipped, both consume the same upstream artifacts but apply different voice registers.

## Why Not Built Yet

- No project currently exposes a developer-facing surface that requires reference-grade documentation
- PMM (active) handles user-facing docs adequately for single-application surfaces using a "technical clarity" frame when needed
- Premature build = a generic technical-writer prompt against no concrete API to write against — same anti-pattern as `_planned/README.md` warns about ("8 of them are mediocre because they haven't been pressure-tested")
- Better: wait until first developer-facing surface ships OR PMM gets flagged for voice-mismatch in 2+ projects; then specialize with concrete pressure

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal citing the specific developer-surface event OR the 2+ projects with marketing-voice flag from Critic
2. User approves
3. File moves from `_planned/` to `agents/`
4. Full contract drafted using `agents/product-marketing-manager.md` as structural reference (closest sibling — both fire parallel-with-QE at handed-off)
5. `commands/tech-docs.md` slash command added for direct invocation
6. `templates/dev-docs/` template directory created with placeholders for api-reference.md, sdk-reference.md, integration-guide.md, quickstart.md, runbook.md
7. State machine `handed-off → shipped` phase eligibility table updated: TW joins the parallel review-tier fan-out alongside PMM (only for projects with developer-facing surfaces — TW does not fire on every project)
8. PMM contract updated: explicit cross-reference to TW as sibling for developer-facing docs; PMM's user-docs/ scope clarified to end-users only when TW is active
9. `memory/agent-changelog.md` updated with narrative
10. `CHANGELOG.md` updated with technical entry per `protocols/changelog-protocol.md`
