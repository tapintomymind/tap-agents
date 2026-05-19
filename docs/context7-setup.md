# Context7 MCP — Optional Setup

Context7 (by Upstash) provides version-pinned, up-to-date library/framework docs to AI agents via MCP. TapAgents treats it as an **opt-in capability accelerant**, not a dependency. Agents (primarily Architect, Strategist) prefer it for library-API questions when configured, and fall back to WebSearch/WebFetch when it is absent.

See `protocols/docs-research-protocol.md` for routing rules and citation form.

---

## Why you might want it

Token-efficiency primarily — see `protocols/docs-research-protocol.md §5` for the order-of-magnitude estimate and the open follow-up to replace it with measured figures.

Quality second: Context7 indexes hundreds of libraries directly from source repositories, so answers are not constrained by an LLM's training cutoff.

## What it is not

- Not a search engine — use WebSearch for landscape scans
- Not a replacement for canonical-URL reads — use WebFetch when you already have the URL
- Not a hard dependency — TapAgents works without it

---

## Install (one-time, on your local machine)

Per vendor docs at [github.com/upstash/context7](https://github.com/upstash/context7), the current install one-liner is:

```
npx ctx7 setup --claude
```

Treat the vendor-side command as canonical — if you see drift from the form above (Upstash renames the CLI, changes the install flow, or moves to a different setup mechanism), follow the vendor docs over this page. This setup doc is illustrative-current; the vendor README is authoritative.

The command authenticates via OAuth, generates an API key, and registers the Context7 MCP server in your Claude Code config. You do not need to edit anything in this repo.

If you prefer manual setup, the MCP server URL is `https://mcp.context7.com/mcp` with header `CONTEXT7_API_KEY: <your-key>`. Add it to your user-level Claude Code MCP config (not this repo's `settings.json` — keep team-wide defaults vendor-neutral).

## Verify

After install, in a fresh Claude Code session:

1. Confirm the MCP server appears in tool list (look for `mcp__context7__resolve-library-id` and `mcp__context7__query-docs`, exact names depend on the integration).
2. Sanity-check call: `resolve-library-id` with query "next.js" should return an ID like `/vercel/next.js`.
3. `query-docs` with that ID and a query like "App Router middleware runtime" should return doc chunks.

## Use it from a TapAgents session

No special invocation needed. With the MCP configured, Architect/Strategist will reach for it per the routing rules in `protocols/docs-research-protocol.md`. You can also nudge any agent explicitly by saying "use context7" in your dispatch, which is the trigger pattern Context7 recommends.

## Free tier and rate limits

A free API key from [context7.com/dashboard](https://context7.com/dashboard) provides higher rate limits than unauthenticated requests. For Tier 2 work with parallel implementers, a key is recommended. Check the vendor dashboard for current quota and pricing — these are vendor-controlled and not pinned here.

## Why this lives in `docs/`, not `settings.json`

`settings.json` is the team-wide committed config. Wiring Context7 there would imply every contributor needs to set up the API key before running the framework, which violates the opt-in principle and adds friction. Personal MCP integrations belong in your user-level Claude Code config or in a gitignored `settings.local.json` override. The framework reads the protocol; the protocol degrades gracefully if the MCP is absent.

## When to remove it

If Context7 stops being maintained, or if a better-fitting docs MCP emerges, swap by:

1. Updating `protocols/docs-research-protocol.md` §1 routing table
2. Updating the citation tag (`[context7]` → `[<new-source>]`) in §3
3. Updating the one-paragraph note in `agents/architect.md` and `agents/strategist.md`

No agent contract embeds Context7-specific tool names, so the swap is a docs-only change. This is the portability discipline from `protocols/framework-contract-discipline.md`.
