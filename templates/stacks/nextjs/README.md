# Next.js Stack Template (Partial)

**Status:** Partial population. Currently contains one stack-specific worker; full Next.js Tier 2 set is deferred per the v1.0 release plan.

## What's here

| File | Role |
|---|---|
| `react-component-agent.md` | First stack-specific frontend worker; canonical Constrained-Mode Implementation consumer for UI-shell slices |

## What's NOT here yet

A full Next.js stack template would include:

- `tier2-conductor.md` — project state machine for Next.js routing/build phases
- `nextjs-architect.md` — App Router vs Pages Router, RSC boundaries, edge/serverless trade-offs
- `drizzle-postgres-agent.md` — Drizzle ORM + Postgres (Neon, RDS, Supabase) schema work
- `deployment-agent.md` — Vercel deploy specifics (env splits, branch protection, preview SSO, `maxDuration`)

These are deferred to v1.1+ multi-host arc per `workspace/_global/codex-integration-1.0-roadmap.md` (Codex-host adapter foundation needs to land first to validate the template doubles as runtime-adapter input).

## Architect inheritance contract

When Architect scaffolds a Next.js Tier 2 set against this directory:

1. **For roles present here** (currently only `react-component-agent.md`) — overlay from `templates/stacks/nextjs/`.
2. **For roles NOT present here** (tier2-conductor, nextjs-architect, drizzle-postgres-agent, deployment-agent) — fall back to `templates/stacks/_baseline/` per the empty-directory fallback logic in `agents/architect.md` "Scaffold phase" step 2.
3. **Log to `memory/agent-changelog-private.md`** at scaffold time: "Project on partial-template stack nextjs — baseline used for tier2-conductor + tier2-critic + tier2-deployment + tier2-implementer; codify full nextjs template after this project ships." This matches the baseline-promotion workflow documented in `templates/stacks/README.md`.

The inheritance is implicit-but-documented (this file). Architect does NOT need to special-case `nextjs/` — the existing fallback logic handles partial templates correctly so long as each missing role exists in `_baseline/`.

## Cross-references

- `workspace/_global/v1.0-release-plan.md` — defers full nextjs template population to v1.1+ per backlog item BL-CIM-FU-2.
- `workspace/_global/codex-integration-1.0-roadmap.md` — multi-host adapter arc that informs full template shape.
- `workspace/_global/framework-hygiene-audit-2026-05-17.md` — surfaced this partial-population state as audit item C-15 / BL-CIM-FU-2.
- `templates/stacks/README.md` — global template conventions (naming, file structure).
- `templates/stacks/_baseline/README.md` — fallback kit Architect uses for roles missing from a partial template.
- `protocols/dispatch-efficiency.md` section 7 — Constrained Implementation Mode contract that `react-component-agent.md` consumes.

## When to complete this template

Promote from partial to full when:

1. A Next.js project ships v1 with a baseline-augmented Tier 2 set, AND
2. Org Designer reviews what worked / what was missing in the baseline + react-component-agent overlay, AND
3. The multi-host adapter foundation (v1.1+) clarifies whether `tier2-conductor.md` and `deployment-agent.md` need runtime-adapter awareness baked in at the template layer.

Until then, treat this directory as a known partial. The fallback to `_baseline/` is the supported path.
