# Patterns — Example

Cross-project recurring decisions. The "we always do X" file. Read by all agents.

> **Format:** `- <Pattern>` followed by `Why:`, `When:`, provenance.
> Org Designer proposes additions; user approves.

---

## Authentication

- **Pattern:** OAuth-first when possible, magic-link fallback, never raw passwords.
  - Why: Reduces user friction + eliminates password storage liability.
  - When: Any project requiring auth.
  - Provenance: durable from `example-onboarding-rebuild`, 2025-11.

## Pricing

- **Pattern:** Validate willingness-to-pay before designing pricing tiers.
  - Why: Pricing tiers without willingness-to-pay signal are theater.
  - When: Any monetized project.
  - Provenance: from `example-tools-cli`, 2025-09 (we built tiered pricing for a free product — wasted effort).

## Launch

- **Pattern:** Always ship to a small named cohort first; never public launch as v1.
  - Why: Tight feedback loop > broad exposure for early signal.
  - When: Every project.
  - Provenance: durable from multiple projects.

## Onboarding

- **Pattern:** Less is more. Skip onboarding tutorials in v1; let users explore.
  - Why: Tutorials are abandoned; products that explain themselves win.
  - When: Any user-facing product.
  - Provenance: from `example-onboarding-rebuild`, 2025-11.

## Documentation

- **Pattern:** Code is the documentation; comments only for non-obvious WHY.
  - Why: Comments rot; well-named code self-documents.
  - When: All code.
  - Provenance: durable preference, 2024.

## Dev workflow

- **Pattern:** TDD only when business logic is non-trivial; integration tests for everything.
  - Why: TDD overhead doesn't pay off for CRUD-heavy code; integration tests catch regressions where they matter.
  - When: Any project with backend logic.
  - Provenance: durable preference, 2024.

## Analytics

- **Pattern:** One activation event + one retention event per product. No more.
  - Why: More events = more noise; can't tune what you can't see.
  - When: Any user-facing product.
  - Provenance: from `example-podcast-app`, 2025-08 (started with 12 events; only 2 mattered).
