# External Ecosystem Typology

**Status:** Draft 2026-05-18. Promote to `protocols/` once the typology earns adoption in a second evaluation pass.
**Purpose:** A reusable routing test for "should TapAgents leverage external repo X, and if so, how?" Captures the classification thinking from the 2026-05-18 evaluation pass (Context7, awesome-ios-design-md, claude-night-market) so future contributors can apply the same discipline without re-deriving it.

---

## §1. Why this exists

TapAgents lives inside a growing ecosystem of external repos, plugins, MCP servers, and curated reference sets that *could* enhance the framework. Without a consistent evaluation rubric, each "should we use this?" call becomes ad-hoc — sometimes leading to vendor lock-in, sometimes to missed token-savings, sometimes to integrations that violate `protocols/framework-contract-discipline.md` portability.

This typology classifies external resources by **shape** (what kind of thing they are) and **integration mode** (how TapAgents should consume them). The shape determines the mode. The mode determines the discipline.

A 10-minute classification up front saves hours of integration work that turns out to be the wrong shape.

---

## §2. The three shapes

| Shape | What it is | Example repo | How TapAgents consumes |
|---|---|---|---|
| **Capability accelerant** | A service or tool that answers narrow, factual questions better and cheaper than the framework can on its own. Replaces ≥3 stale-data tool calls with ≤1 fresh-data call. | `upstash/context7` (version-pinned library docs via MCP) | Tool integration (MCP, CLI, programmatic call). Routes through a docs/research protocol; agent contracts cite the protocol, never the vendor. |
| **Reference library** | A curated set of static content (markdown, specs, designs, examples) consumed on-demand as inspiration or grounding. Answers taste-shaped or pattern-shaped questions, not factual ones. | `Meliwat/awesome-ios-design-md` (~200 production iOS app design specs as DESIGN.md files) | Prompt-for-it via WebFetch on demand. Conversational selection ("which references do you want?"); explicit citation trail; routes to specialist agents (e.g., `biz-legal`) when licensing posture matters. |
| **Peer ecosystem** | A parallel framework, marketplace, or plugin set that overlaps with TapAgents in structure or concern. Not a service to call; a body of ideas to study. | `athola/claude-night-market` (23 Claude Code plugins covering TDD enforcement, code review, multi-LLM routing, etc.) | Idea borrowing only — no integration. Read selectively for patterns worth porting. Co-install is a user-side decision, not a framework recommendation; flag hook-interaction risks if relevant. |

---

## §3. The routing test

For any candidate external repo, answer in order:

### §3.1 Is it a tool, a library, or a peer?

- **Does it answer factual questions (what's the current API, what's the rate limit, what does this config field mean)?** → Capability accelerant.
- **Does it answer taste/pattern questions (what does a polished version of X look like, how do similar projects structure Y)?** → Reference library.
- **Does it solve problems TapAgents itself solves (orchestration, review, governance, agent dispatch)?** → Peer ecosystem.

If the answer crosses categories, split the resource by its parts and route each separately.

### §3.2 Does it earn the integration cost?

Different bars for different shapes:

- **Capability accelerant:** does it replace ≥3 stale-data tool calls with ≤1 fresh-data call? If yes, integrate. If it just gives you a different way to do what existing tools do, skip.
- **Reference library:** is there at least one TapAgents agent whose contract benefits from on-demand access? One paragraph in that agent's contract is enough. If two or more agents would benefit, promote to a protocol.
- **Peer ecosystem:** is there at least one pattern or mechanic worth studying and porting? Read selectively. Do NOT co-install or wire in.

### §3.3 What's the licensing posture?

- **Open-source library docs** (Context7-shape) → low risk. Standard attribution.
- **Curated specs of proprietary products** (design-md-shape) → moderate risk. Reference, do not clone. Route to `agents/biz-legal.md` when commercial positioning competes with the referenced source.
- **MIT-licensed peer framework** (night-market-shape) → low risk for idea-borrowing; verbatim prose ports need attribution.

### §3.4 What's the framework-contract-discipline posture?

Any integration MUST preserve `protocols/framework-contract-discipline.md` portability:

- Vendor names live in protocols and docs, never as mandates in agent contracts.
- Removal path is a docs-only or protocol-only change (no agent-contract rewrites required).
- Framework degrades gracefully when the external resource is absent.

If the integration would require embedding a vendor name in an agent contract's `tools:` allowlist, `fires_when`, or output contract, **the shape is wrong — re-classify or skip**.

---

## §4. Worked examples (from the 2026-05-18 evaluation pass)

### §4.1 upstash/context7 — capability accelerant

- **Shape:** Capability accelerant (version-pinned library docs via MCP).
- **Earns the cost?** Yes — replaces WebSearch + multiple WebFetches with one `query-docs` call. Order-of-magnitude estimate in `protocols/docs-research-protocol.md §5` (pending production measurement).
- **Licensing:** Low risk — indexes open-source library docs.
- **Contract discipline:** Vendor name lives in `protocols/docs-research-protocol.md` + `docs/context7-setup.md`. Agent contracts cite the protocol, not the vendor. Removal = update protocol §1 routing table + citation tag.
- **Integration:** `protocols/docs-research-protocol.md` (new) routes between Context7, WebSearch, WebFetch. `agents/architect.md` and `agents/strategist.md` reference the protocol from "Read on Every Invocation."

### §4.2 Meliwat/awesome-ios-design-md — reference library

- **Shape:** Reference library (production iOS app design specs as static markdown).
- **Earns the cost?** Yes for Designer when project has matching UI scope. One agent benefits — one paragraph in `agents/designer.md` is right-sized; no protocol yet.
- **Licensing:** Moderate risk — proprietary product designs. Routes to `agents/biz-legal.md` for commercial-positioning or trade-dress concerns.
- **Contract discipline:** Curated reference set named as one example in `agents/designer.md` Operating Principle 7 ("or equivalent reference set"). Removal = edit the OP#7 paragraph; no other contracts touched.
- **Integration:** `agents/designer.md` Operating Principle 7 establishes prompt-for-references discipline with biz-legal routing.

### §4.3 athola/claude-night-market — peer ecosystem

- **Shape:** Peer ecosystem (parallel Claude Code plugin marketplace, 23 plugins).
- **Earns the cost?** Not as integration. Three patterns identified as worth studying and possibly porting as separate TapAgents work: (a) their CONSTITUTION.md top-level-rules pattern, (b) imbue's PreToolUse TDD gate, (c) scribe's AI-slop detection + additive-bias audit. Each port is its own scoping PR with TapAgents-native shape.
- **Licensing:** MIT — idea-borrowing freely allowed; verbatim prose ports need attribution.
- **Contract discipline:** N/A for direct integration. For idea-ports: standard `framework-change-discipline.md` Tier 1 doctrinal-change discipline applies.
- **Integration:** None. Co-install is a user-side decision; if the user pairs both marketplaces, hook-interaction risks (TapAgents `orchestrator-dispatch-gate.py` + `version-gate.py` vs Night Market `imbue` PreToolUse hooks) should be evaluated by the user, not assumed safe.

---

## §5. When this typology should be revised

- **New shape emerges.** If a candidate repo fits none of the three categories cleanly, add a fourth shape with its own integration mode and discipline. Do NOT force-fit.
- **Bar adjustments.** If §3.2 thresholds (≥3 tool calls for capability accelerant, ≥2 agents for reference-library protocol promotion) prove wrong in practice, tighten or loosen them based on accumulated evidence.
- **Discipline failures.** If an integration following this typology produces a contract-discipline violation in production (e.g., vendor lock-in surfaces despite the routing test passing), audit the typology — likely a §3.4 gap.

---

## §6. Promotion path

This document lives in `docs/` while the typology is on its first deployment. Promote to `protocols/external-ecosystem-typology.md` once:

1. A second evaluation pass uses the typology (not just the 2026-05-18 pass).
2. The §3 routing test has been applied to ≥1 candidate that scored as "skip" — i.e., the typology has demonstrably prevented an integration, not just shaped one.
3. Critic has reviewed the typology against `protocols/framework-contract-discipline.md` and confirmed alignment.

Until then, this is a thinking artifact: useful as a reference, not yet load-bearing on Critic enforcement.

---

## §7. Related discipline

- `protocols/framework-contract-discipline.md` — portability rules this typology operationalizes
- `protocols/docs-research-protocol.md` — concrete instance of capability-accelerant integration
- `protocols/citation-protocol.md` — citation tags for external sources (`[research]`, `[context7]`)
- `protocols/framework-change-discipline.md` — Tier 1 gate that applies to any contract edit prompted by external-repo integration
- `agents/designer.md` Operating Principle 7 — concrete instance of reference-library integration with `agents/biz-legal.md` routing
