# Playbook (STUB) — Legacy Rebuild / Healing

Workflow for working with an existing codebase rather than greenfield. Modernizing, refactoring, or extracting from legacy.

## Build When

First time the team is invoked on an existing codebase rather than a new project. Likely use cases:
- Rebuilding `<project>` (or a section of it)
- Extracting a feature from an existing project into its own product
- Modernizing legacy code without losing institutional knowledge

## Provisional Phases

Inspired by `loki-mode`'s healing pattern, adapted to our HQ structure:

1. **Archaeology** — read existing code, identify business rules, document institutional knowledge before any change
2. **Stabilize** — characterization tests for current behavior (so we can tell what we break)
3. **Isolate** — pull the target area into a clear boundary
4. **Modernize** — Tier 2 rebuilds within the boundary
5. **Validate** — behavioral baseline match; institutional knowledge preserved

## Why Different From `seed-to-mvp`

- Greenfield assumes nothing exists; legacy assumes prior decisions are load-bearing
- Critic gets a new flag: "removing institutional knowledge without documenting"
- Architect's tech-strategy must include adapter/migration patterns
- Intake must capture: what hurts now? what works that we MUST preserve?
- Strategist's PRD must distinguish "want to change" vs "must preserve" behaviors

## Provisional New Artifacts

- `workspace/<slug>/archaeology.md` — what exists, why, who depends on it
- `workspace/<slug>/institutional-knowledge.md` — business rules, hidden constraints, "this is here because"
- `workspace/<slug>/characterization-tests.md` — tests proving current behavior

## Prerequisites

- Founding team active
- User identifies an existing repo / codebase as input
- Critic prompt updated with legacy-mode flags

## Status: Not Yet Built

Wait until first legacy/rebuild project. Promote then with concrete shape informed by that real workflow.
