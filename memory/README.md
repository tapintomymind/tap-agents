# Memory — The Team Brain

This directory holds **cross-project knowledge that compounds over time.** Project-specific facts live in `workspace/<slug>/`; this is for what generalizes across projects.

## Public / Private Layout

| File | Visibility | Purpose |
|---|---|---|
| `README.md` (this file) | Public | Documents the memory model |
| `_examples/*.example.md` | Public | Example formats for clones/forks |
| `agent-changelog.md` | Public | Narrative of structural team changes (no project specifics) |
| `agent-changelog-private.md` | **Private** | Project-specific narrative |
| `product-principles.md` | **Private** | What "good" means to user |
| `stack-preferences.md` | **Private** | Default stacks per project type |
| `audience-knowledge.md` | **Private** | Recurring ICPs |
| `patterns.md` | **Private** | Cross-project recurring decisions |
| `lessons-learned.md` | **Private** | Post-mortems with lessons |
| `intake-retros.md` | **Private** | Intake's self-retros after each project |

`.gitignore` excludes the private files. Examples ship publicly so anyone forking gets a working scaffold.

## Hygiene Rules

### 1. Cross-project facts only
Memory is for what generalizes. Project-specific lives in `workspace/`. If a "lesson" only applies to one project, it's not a lesson — it's a note.

### 2. Provenance required
Every entry traces to its source. Format:
```
- "Lesson text" — from <project-slug>, <date>
```

Without provenance, you can't audit:
- Whether the entry is still relevant (recent vs. stale)
- Whether the entry is safe to share (real-customer data vs. abstract pattern)

### 3. Memory expires
Org Designer reviews quarterly (or on `/grow-team`) and proposes retirements for stale patterns. Stale memory is worse than no memory because agents trust it and act on it.

## What Memory is NOT

- ❌ A journal — no "today I worked on..." entries
- ❌ A TODO list — active work lives in `workspace/`
- ❌ A documentation system — code documentation lives in code repos
- ❌ A substitute for artifacts — specific PRDs/scopes/tech-strategies stay in `workspace/`. Memory captures *patterns across them*.

## How Agents Use Memory

Each agent's prompt declares which memory files to read. Examples:

| Agent | Reads | Why |
|---|---|---|
| Intake | `product-principles.md`, `audience-knowledge.md`, `patterns.md`, `intake-retros.md` | Skip questions about audiences/patterns we already know |
| Strategist | `product-principles.md`, `audience-knowledge.md`, `patterns.md`, `lessons-learned.md` | Frame PRD with user's taste; avoid known failure patterns |
| Architect | `stack-preferences.md`, `patterns.md`, `lessons-learned.md` | Default stacks; cross-project conventions |
| Critic | `lessons-learned.md` | Cite known failure patterns when reviewing |
| Org Designer | All | It's the meta-layer; reads everything |
| Conductor, EA | None of the content files (just structural state) | Routing/reporting doesn't need product taste |

## Updating Memory

- **Intake** writes to `audience-knowledge.md` (on confirmed ICPs) and `intake-retros.md` (post-project)
- **Strategist + Architect** write to `audience-knowledge.md`, `stack-preferences.md` (after each project)
- **Critic + Org Designer** write to `lessons-learned.md` at retro phase
- **Org Designer** writes to `agent-changelog.md`, `agent-changelog-private.md`, `patterns.md` (with user approval for each entry)
- **You** write directly to any file when you have explicit knowledge to add

## Configurable Path

Agents read memory via `${MEMORY_ROOT}` (defaults to `memory/`). Override to point elsewhere if you need to:
- Run with a different memory set (e.g., for testing)
- Run multi-tenant (each tenant gets own memory root)
- Use a public/private fork mechanism

**`MEMORY_ROOT=memory.next/` is FORBIDDEN** per `protocols/dream-pass.md §2`. The `memory.next/` directory (created by `/consolidate-memory --dream-pass`) is a candidate-store the runtime explicitly does not read; setting `MEMORY_ROOT` to it would defeat the dream-pass safety property by promoting a candidate to active without user accept. The configurable-path mechanism is for *active-store relocation*; `memory.next/` is the *opposite* shape (candidate-store).

## Dream-pass cadence (per `protocols/dream-pass.md`)

Weekly (Sunday 23:00 local time per `mcp__scheduled-tasks__create_scheduled_task` cron-evaluation), the `/consolidate-memory` skill runs in `--dream-pass` mode against this directory. The pass produces a candidate `memory.next/` directory; EA surfaces accept/discard via Decision Packet; OD reviews `_diff.md` first and annotates with a recommendation. Active `memory/` is **never** mutated by the dream-pass; only the user's accept action atomically replaces it (`mv memory/ memory.prev.<ts>/ && mv memory.next/ memory/`).

Self-tuning relax: 3 consecutive no-op cycles → bi-weekly; 3 consecutive bi-weekly no-ops → monthly. User retains override via Decision Packet `pause-cadence` fork.

The legacy `/consolidate-memory` invocation (no `--dream-pass` flag) remains in-place mutation for ad-hoc reflective passes — backward-compatible with the original Anthropic skill behavior. Per BL-031 user Fork 3.

## Public Fork Strategy

The default approach (locked in by initial design):

- Public agent prompts ship as baseline
- Private overrides via `agents/_private/<agent>.override.md` (gitignored), loaded on top of baseline
- v1 default: no overrides; agents grow via public-safe changes
- One config flip away from full divergence if proprietary refinements ever need to land

## Onboarding to Your Own Memory

Starting fresh:
1. Read `_examples/*.example.md` for format
2. Copy each example to its real filename (e.g., `product-principles.example.md` → `product-principles.md`)
3. Replace example content with your real principles, taste, preferences
4. Don't worry about being complete — memory grows organically as you ship projects

The team works without populated memory (agents will simply have less context). It works *better* when you've seeded it with what you actually know.
