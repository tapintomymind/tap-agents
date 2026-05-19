# Docs Research Protocol

**Owner:** Architect + Strategist (primary users). Tier 2 implementers and any agent doing library-API research follows.
**Status:** Active 2026-05-18.
**Complements:** `protocols/citation-protocol.md` (citation tags), `protocols/framework-contract-discipline.md` (vendor neutrality).

This protocol routes docs-research tool calls between three sources — Context7 MCP, WebSearch, and WebFetch — so agents spend the fewest tokens to produce well-cited claims. It does not mandate any single tool; agents fall back gracefully when a preferred tool is unavailable.

---

## §1. The three sources

| Source | Best for | Token profile |
|---|---|---|
| **Context7 MCP** (`resolve-library-id`, `query-docs`) | Version-pinned library/framework API surface, configuration, current setup steps for indexed libraries | Low — curated chunks, ~1-3k per query |
| **WebSearch** | Landscape scans, market sizing, multi-source comparison, anything not in Context7's index | Medium — search-result snippets |
| **WebFetch** | A specific known URL (official docs page, RFC, vendor announcement) | High when pages are long — full HTML→markdown |

---

## §2. Routing rule

Pick the source by the *shape* of the question, not by habit.

1. **"How do I use library X (version Y)?"** → Context7 first. Call `resolve-library-id` for X, then `query-docs` with the returned ID. If Context7 returns nothing or the library is not indexed, fall back to WebFetch against the official docs URL.
2. **"What's the current landscape of X / who competes with Y / what's typical for Z?"** → WebSearch. Context7 is not a search engine.
3. **"What does *this exact page* say?"** → WebFetch. Use when you already have a canonical URL.
4. **Mixed questions** → split them. Use Context7 for the library-specific part and WebSearch/WebFetch for the rest.

When Context7 is not configured in the session, skip step 1 entirely and use WebFetch against the official docs URL. Do not block on Context7 availability.

---

## §3. Citation form

The `[context7]` tag is registered in `protocols/citation-protocol.md §Tags`. Form:

| Tag | Meaning | Required attribute |
|---|---|---|
| `[context7]` | Retrieved via Context7 `query-docs` | Library ID: `[context7 /vercel/next.js — "App Router routing"]` |

Examples:

> "Next.js 15 App Router middleware runs on the Edge runtime by default `[context7 /vercel/next.js — "middleware runtime"]`."

> "Drizzle v0.30 migrations use `drizzle-kit push` rather than a separate migration file `[context7 /drizzle-team/drizzle-orm — "migrations push"]` `[inference]`."

Treat `[context7]` claims with the same scrutiny as `[research]`: verify against the canonical source for high-stakes decisions (security review, license compliance, financial calls).

---

## §4. When to escalate to WebFetch even if Context7 returned something

- Security-sensitive APIs (auth, crypto, payment integrations)
- License or pricing claims
- Anything where being one minor version off would silently produce wrong code
- Critic flagged a `[context7]` claim as suspect on a prior pass

In these cases cite both: `[context7 …]` `[research https://…]`.

---

## §5. Token discipline

The reason this protocol exists. Order-of-magnitude estimates from a typical research task:

- WebSearch + 2-3 WebFetch calls to answer "how does library X work today": ~8-15k tokens of fetched content `[inference: order-of-magnitude per docs-research-call telemetry §8 follow-up; measured median replaces this once N≥5 calls logged]`.
- One Context7 `query-docs` for the same question: ~1-3k tokens `[inference: order-of-magnitude per docs-research-call telemetry §8 follow-up; measured median replaces this once N≥5 calls logged]`.

Net savings of 5-12k tokens per docs-research call when the question is in Context7's wheelhouse `[inference]`. Multiply across a session of an Architect picking a stack or a Tier 2 implementer building features, and the savings compound. Use Context7 when the routing rule says so; do not stack redundant sources.

These estimates should be replaced with measured figures once the `docs-research-call` telemetry event (see `protocols/telemetry-events.md`) has accumulated N≥5 sessions — track in §8 follow-ups.

---

## §6. Availability and graceful degradation

Context7 is an **opt-in MCP server**. Setup is documented in `docs/context7-setup.md`. The framework does not bundle credentials, mandate the integration in any agent contract, or fail when the MCP is absent.

If Context7 is unavailable in a session:
- Agents log the gap once (not per query) in their reportback
- All docs-research falls back to WebSearch + WebFetch
- No artifact is blocked

This preserves `framework-contract-discipline.md`'s portability principle — TapAgents remains vendor-neutral; Context7 is a capability accelerant, not a dependency.

---

## §7. What this protocol does NOT cover

- Internal-codebase search (use Grep/Glob)
- Reading files in the project workspace (use Read)
- Memory lookups (use the `${MEMORY_ROOT:-memory}/` paths each agent already reads)
- Landscape research beyond library APIs (Strategist's domain via WebSearch)

---

## §8. Open follow-ups

- **Replace §5 `[inference]` estimates with measured median from `docs-research-call` telemetry events** (see `protocols/telemetry-events.md`) once N≥5 sessions have logged the event. Critic flags any `[context7]` claim's token rationale as P2 on review until §5 has measured figures. The telemetry hook implementation is a separate dispatch — this protocol pins only the measurement source and the trigger condition.
- Decide whether Tier 2 implementer templates should call Context7 by default for the chosen stack's primary libraries on first invocation. Hold until protocol earns its keep at Tier 1.
- Audit whether `db-admin`, `quality-engineer`, and `ops-security` benefit from Context7 routing. Deferred per minimal-scope decision on the activation PR.
