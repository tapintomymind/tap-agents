# Runtime Adapters

This directory holds package-local planning metadata for TapAgents runtime adapters.
It is an input surface for a future renderer, not a live migration of dashboard
routes or provider integrations.

## Scope

- Claude remains the compatibility baseline through existing generated package
  files and the legacy plugin manifest shape.
- Codex starts as a generated-files-only target. Codex plugin mode is tracked as
  beta metadata and must be explicitly enabled by a future renderer.
- Other runtimes and local model providers are post-1.0 placeholders and are not
  represented here as executable adapters.

## Contract

Shared files in `runtime-adapters/shared/` define the stable planning vocabulary:

- `adapter-contract.json` is the local JSON Schema for `adapter.json` files.
- `manifest-v2.schema.json` defines the future generated manifest shape.
- `telemetry-fields.json` lists runtime-aware telemetry fields for downstream
  planning and dashboard work.

Provider directories contain `adapter.json` plus declarative `.tpl` files. These
templates intentionally avoid runtime SDK imports, network behavior, and secret
material. They are raw inputs only; no package consumer should treat them as
rendered, ready-to-install files yet.

## Namespace Separation

Runtime adapter templates must not cross runtime ownership boundaries. Claude
artifacts stay in Claude namespaces such as `.claude/**`, `.claude-plugin/**`,
or an explicitly owned root `CLAUDE.md`; Codex artifacts stay in Codex
namespaces such as `.codex/**`, `.agents/skills/tapagents-*/SKILL.md`, or the
root `AGENTS.md` instruction special case. The only shared metadata path is
`.tapagents/manifest.json`.

See
`workspace/_global/planning/tapagents-1-0-multi-runtime-provider-platform/m3-runtime-namespace-contract.md`
for the full no-commingling contract and dashboard evidence gate.
