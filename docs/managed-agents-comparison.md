# TapAgents ↔ Claude Managed Agents — Primitive Map

**Status:** Tier 1 framework doc. Public-safe.
**Authored:** 2026-05-07 (BL-026).
**Last updated:** 2026-05-07.
**Audience:** Anyone evaluating "should we use Managed Agents for X?" inside the TapAgents framework, plus future contributors orienting to where the two architectures align and diverge.

---

## Why this doc exists

Anthropic announced **Managed Agents** in May 2026 `[research https://claude.com/blog/new-in-claude-managed-agents]`. The shape overlaps with TapAgents in some primitives (multi-agent orchestration, structured outcome grading, persistent memory) but diverges sharply in others (where the loop runs, how state persists, what the human-in-the-loop surface looks like). Without an explicit map, the team risks two failure modes:

1. **Recurring re-evaluation cost** — every time a new feature lands ("dreams", "outcomes", "webhooks"), someone re-derives whether it should replace, augment, or be ignored by TapAgents. This doc pre-empts that work.
2. **Hidden coupling assumptions** — agents in TapAgents that carry implicit assumptions about local execution (filesystem persistence, deterministic routing, hard checkpoints) would silently break if naively migrated to Managed Agents. Codifying the boundary makes the gap forensically visible.

Scope: this is a **framework-level architectural map**, not a vendor evaluation. It tells you which primitive maps to which, where lifting a pattern is cheap, and where the architectures are genuinely incompatible. It does NOT recommend adoption — that's a per-decision call routed through Org Designer + user.

---

## 1. Primitive map

The table maps each TapAgents primitive to its closest Managed Agents counterpart (where one exists), plus the load-bearing differences.

| Concept | TapAgents | Managed Agents |
|---|---|---|
| **Where the loop runs** | User's machine via Claude Code `[inference: framework operates inside `.claude/` subtree of user's repo]` | Anthropic orchestration layer `[research https://platform.claude.com/docs/en/managed-agents/overview]` |
| **Tool execution** | Local filesystem, real bash, user's Neon branches `[inference: framework lives in user's repo]` | Per-session sandboxed container with `/workspace` mount `[research https://platform.claude.com/docs/en/managed-agents/overview]` |
| **Coordination** | Filesystem protocols — `protocols/session-coordination-protocol.md` rule 1 (manifest at `workspace/_global/active-sessions.md`), lane ownership, atomic-unit pairing | SSE events + `tool_confirmation` round-trips `[research https://platform.claude.com/docs/en/managed-agents/overview]` |
| **Specialization** | Pre-defined roles with bespoke prompts in `agents/*.md` (Conductor, Critic, Architect, QE, Designer, Ops/Security, ...) | One agent config per session; specialize via system prompt at session-create time `[research https://platform.claude.com/docs/en/managed-agents/multi-agent]` |
| **State** | Persistent files — `state.json`, `memory/`, `workspace/` — survive across sessions and across machines (git) | Session events + Memory stores (workspace-scoped, FUSE-mounted) `[research https://platform.claude.com/docs/en/managed-agents/dreams]` |
| **Lifecycle** | Multi-week project phases with hard checkpoints (`briefed → scoped → designed → built → handed-off → shipped → measured`) | Session statuses (running / idle / terminated) `[research https://platform.claude.com/docs/en/managed-agents/overview]` |
| **Multi-agent** | Native — Conductor → producer → critic → reviewer pipeline, arbitrary depth (Conductor → Architect → Critic → re-loop is routine) | One agent per session; coordinator pattern with **1-level depth, 20-roster cap** `[research https://platform.claude.com/docs/en/managed-agents/multi-agent]` |
| **Visibility** | Full — every prompt editable in `agents/*.md`, every transition interceptable via Conductor | Black-box loop; observe via events stream `[research https://platform.claude.com/docs/en/managed-agents/webhooks]` |
| **Cost shape** | Per-token (user's API key) | Per-token + container hours (after free tier) `[research https://claude.com/blog/new-in-claude-managed-agents]` |
| **Availability** | Anywhere Claude Code runs (local, CI, scheduled-tasks) | First-party only — not on Bedrock / Vertex / Foundry as of May 2026 announcement `[research https://claude.com/blog/new-in-claude-managed-agents]` |
| **Persistent memory** | `memory/MEMORY.md` (auto-memory) + `memory/*.md` (curated) + `consolidate-memory` skill (reflective merge pass) | Memory stores + **Dreams** (versioned, redactable, FUSE-mounted) `[research https://platform.claude.com/docs/en/managed-agents/dreams]` |
| **Quality grading** | Free-form Critic prose (BL-025 Phase 1 codified the rubric envelope; lifts the pattern from Outcomes — see §2.1) | **Outcomes** — explicit rubric of gradeable criteria + separate-context grader → structured result envelope `[research https://platform.claude.com/docs/en/managed-agents/define-outcomes]` |
| **Asynchrony** | Slash commands + scheduled tasks + parallel sessions coordinated via session-coordination protocol | **Webhooks** — push notifications on session events; long-running sessions `[research https://platform.claude.com/docs/en/managed-agents/webhooks]` |
| **Human-in-the-loop** | EA Decision Packets, hard checkpoints, dissent log; user is "CEO" interacting only at meaningful decision points | `tool_confirmation` round-trips per tool call `[research https://platform.claude.com/docs/en/managed-agents/overview]` |

---

## 2. Where Managed Agents patterns lift INTO TapAgents

These are patterns to borrow architecturally **without** taking on the Managed Agents API or runtime. The local-first, file-based, deterministic-routing TapAgents shape is preserved; only the *shape* of the pattern is lifted.

### 2.1 Outcome-grading rubric → BL-025 (in progress)

Anthropic's **Outcomes** feature `[research https://platform.claude.com/docs/en/managed-agents/define-outcomes]` codifies an explicit rubric of gradeable criteria + a separate-context grader returning a structured result enum. Anthropic reports **+8.4–10.1pt task-success delta** on docx/pptx generation versus unstructured "produce, ask the model if it looks good, iterate" loops `[research https://claude.com/blog/new-in-claude-managed-agents]` `[assumption: announcement-level summary; primary methodology / measurement conditions not separately published as of May 2026 — citation chain is shallow but the directional claim is consistent across Anthropic's announcement + the Outcomes documentation page]`.

**Status in TapAgents:** BL-025 Phase 1 LANDED 2026-05-07 `[memory/backlog.md §"Process — Adopt rubric-style outcome grading"]`. The team's own crystallized verdict shape (`0 P0 / 1 P1 / 3 P2 / 7 Note; LAND-WITH-FOLLOWUPS`-style — see Critic reviews of BL-019 / BL-027 in `workspace/_global/critic-review-*`) is structurally analogous; codification locks in observed practice and gives Conductor a parseable result.

**What was lifted:**
- Result envelope with explicit enum: `satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade` `[protocols/outcome-grading.md §3]`.
- Per-criterion findings (`id, description, status, evidence, severity`).
- Bounded iteration loop (`max_revision_attempts = 2` per user fork 1).

**What was NOT lifted:**
- The Managed Agents API itself — TapAgents stays local + file-based.
- Auto-iterate on Critic-on-Tier-2 review — gated behind Phase 3 dogfood validation `[memory/backlog.md BL-025 phase status]`.

### 2.2 Dream-pass → in-flight Org Designer design

Anthropic's **Dreams** feature `[research https://platform.claude.com/docs/en/managed-agents/dreams]` runs a reflective pass over a memory store, producing a new versioned output store with merge / redact / immutability semantics.

**Status in TapAgents:** Org Designer is drafting a design proposal in a parallel session `[inference: per BL-026 dispatch context]`. The structural fit:

- TapAgents already has `consolidate-memory` skill (reflective pass over user's memory files — merge duplicates, fix stale facts, prune the index — confirmed available in this session's skills list).
- The Dreams shape (immutable input store / new output store, versioned, optional review-mode) maps cleanly onto the team's existing convention of writing pattern-mining outputs to `workspace/_global/org-designer-proposals/<timestamp>-*.md` rather than mutating `memory/` directly.

**What could be lifted:**
- Versioned memory snapshots (input frozen, output diff-able).
- Optional "review mode" — dream output surfaces to user via EA Decision Packet before merging.
- Immutability semantics — pattern-mining never silently mutates the source.

**Open question:** does TapAgents need explicit dream-versioning, or does git already provide it? `[assumption: git history covers the versioning need; the load-bearing addition is the review-mode gate, not the version store]` — Org Designer's pending proposal answers this.

### 2.3 Decision-packet enum / iteration-counter pattern

The Managed Agents `tool_confirmation` round-trip pattern (sandbox asks user to confirm before each tool call) does NOT map cleanly to TapAgents (would shred the EA Decision Packet discipline that batches user-touch surfaces). But the **iteration-counter** pattern from Outcomes (`revision_attempts`, `max_revision_attempts`, `history`) DOES map — and BL-025 Phase 1 embedded it in the result envelope `[protocols/outcome-grading.md §3]`.

**What was lifted:** the explicit counter + history fields make cross-run anti-rubber-stamp triggers (Critic Devil's Advocate, QE two-clean-runs, UI/UX cross-run-N=5) mechanical instead of memory-based — see `agent-changelog.md` 2026-05-07 entry on Phase 1 landing for the operational shift.

---

## 3. Where hybrid hosting could make sense

These are use cases where Managed Agents could **host one TapAgents specialist** without disrupting the local-first framework. Hybrid means: TapAgents stays local + file-based; a single specialist agent runs on Managed Agents for a specific bounded task; results are copied back into the TapAgents file substrate.

### 3.1 Long-running QE smoke runs

Current state: QE smoke runs against prod URLs are bounded by the local session's lifetime + the user's machine being on. Managed Agents containers run in isolation `[research https://platform.claude.com/docs/en/managed-agents/overview]`, with webhook notifications on completion `[research https://platform.claude.com/docs/en/managed-agents/webhooks]`.

**Use case:** an overnight QE smoke that runs 50+ scenarios against prod, posts a completion webhook, and writes results to a memory store. TapAgents reads the results in the next session via webhook payload + writes them to `workspace/<slug>/test-plan-<id>.md`.

**Why hybrid not pure-local:** the cost shape (container hours + free tier `[research https://claude.com/blog/new-in-claude-managed-agents]`) is favorable for asynchronous bulk runs; the local-machine constraint disappears. The TapAgents architectural invariants are preserved — QE is still a TapAgents specialist, with the same prompt and contract; only the *runtime* moves.

### 3.2 Async research agents (planned activations)

The team's `agents/_planned/` roster includes `industry-researcher.md` and `customer-researcher.md` `[memory/backlog.md §Planned (not built day one) per Claude Team Design Spec at .claude/docs/specs/2026-05-04-<project>-design.md L43-46]`. **Note:** these agents currently sit in `agents/_planned/`; activating them implies an Org Designer activation contract per `protocols/framework-contract-discipline.md` (split from Strategist if research depth demands per the founding spec). Hosting them on Managed Agents is gated behind that activation, not a substitute for it. When activated, these agents do bulk research that runs cleanly without intermediate human gates.

**Use case:** activate `industry-researcher` on Managed Agents for an overnight "scan the competitive landscape for X feature" run, with webhook completion + result-fetch into TapAgents memory. The async-friendly nature of these roles (no real-time interruption needed) makes them a natural fit.

**Why hybrid:** the local-machine + always-on requirement disappears. Cost shape favors batched async runs.

### 3.3 Sandbox-required ops (untrusted code execution)

Some tasks require running code from external sources (e.g., evaluating a candidate dependency by running its example, sandbox-testing a security advisory's PoC). The Managed Agents sandboxed container is **more isolated** than the user's machine `[research https://platform.claude.com/docs/en/managed-agents/overview]`.

**Use case:** Ops/Security agent (or its future `dependency-auditor` split) needs to run an unfamiliar tool. Hosting that one specific invocation on Managed Agents preserves the user's machine's security posture.

**Why hybrid:** the only reason to use Managed Agents here is the sandbox isolation. Everything else (the agent's prompt, its review pipeline, its result format) stays in TapAgents.

---

## 4. What Managed Agents LACKS for TapAgents replacement

Replacement (rather than hybrid hosting) would require Managed Agents to provide every load-bearing primitive TapAgents currently uses. As of the May 2026 announcement, the gap is structural:

### 4.1 No phase machine

TapAgents runs project work through a hard-checkpoint state machine: `briefed → scoped → designed → built → handed-off → shipped → measured`. Each transition is gated; user-touch happens at meaningful decision points only `[memory/MEMORY.md "Always operate as the team" + "Iterate on user's behalf"]`.

Managed Agents has session statuses (running / idle / terminated) `[research https://platform.claude.com/docs/en/managed-agents/overview]` but no concept of multi-week project phases with deterministic transitions. Building this on top of Managed Agents would mean re-implementing the Conductor + state.json shape — at which point the local-first version is structurally simpler.

### 4.2 No deterministic routing

Conductor's routing is **state-machine driven** — given a current phase + an artifact change, the next agent fires deterministically per the contract in `agents/conductor.md`. Managed Agents' multi-agent orchestration is **LLM-driven** with a coordinator pattern `[research https://platform.claude.com/docs/en/managed-agents/multi-agent]`, which means routing is non-deterministic and probabilistic.

For high-stakes routing (e.g., destructive data ops MUST go through `db-admin` per `protocols/destructive-data-ops.md`; security work MUST be dispatched not inlined per `memory/MEMORY.md`), non-deterministic routing is unsafe. The Conductor pattern is load-bearing.

### 4.3 No file-based session-coordination protocol

`protocols/session-coordination-protocol.md` rule 1 mandates a session manifest at `workspace/_global/active-sessions.md`, atomic-unit pairing per rule 1, lane ownership across parallel sessions. The whole thing is filesystem-coordinated — an entry written by session A is readable by session B's first read.

Managed Agents has no equivalent — sessions are isolated, container-scoped, and don't share a coordinated manifest. Cross-session collision detection (which the team has hit and codified responses to — see `memory/agent-changelog.md` 2026-05-06 auto-seal entry) would have to be re-built on top of webhooks + a shared store.

### 4.4 No Critic adversarial-review-by-default discipline

TapAgents' Critic is "always-on" — every artifact written by Strategist or Architect triggers Critic per `agents/critic.md` trigger conditions. The discipline is **structural** — not a tool call, but a contract.

Managed Agents' Outcomes provides the *shape* of structured grading `[research https://platform.claude.com/docs/en/managed-agents/define-outcomes]` (which BL-025 lifts), but not the contract that Critic-style adversarial review fires on every artifact transition. That's a TapAgents convention codified across multiple agent contracts; Managed Agents leaves it to the orchestrator.

### 4.5 No `org-designer` continuous team-shape evaluation

Org Designer is the meta-agent that evaluates whether the team's shape itself needs changing — adds specialists, splits roles, retires stubs. The cadence is slow (post-project, on-demand) but the contract is load-bearing for the framework's evolution.

Managed Agents has no equivalent — the agent roster is configured at session-create time per session `[research https://platform.claude.com/docs/en/managed-agents/multi-agent]`, with no continuous evaluation contract.

### 4.6 1-level multiagent depth limit

Managed Agents' multi-agent orchestration uses a **flat coordinator pattern** (1-level depth, ~20-agent roster cap) `[research https://platform.claude.com/docs/en/managed-agents/multi-agent]` `[assumption: depth-limit terminology summarized from announcement + multi-agent doc; verify against Anthropic's exact phrasing on next re-evaluation pass — Org Designer Cadence 4]`. TapAgents routinely runs arbitrary depth (Conductor → Architect → Critic → Architect → Critic, with QE / UI-UX / Ops-Security trio firing in parallel — see BL-025 Phase 1 landing for an example with reviewer-trio + Architect recused-Critic review).

The depth limit isn't a count problem — it's an architectural one. Routing through "tier 3" specialists (e.g., `db-admin` underneath Architect underneath Conductor) requires arbitrary nesting. The 1-level constraint forces flattening, which loses the lane-ownership + dispatch-discipline that protocols/session-coordination depends on.

### 4.7 No hard checkpoints / human gates per phase

EA Decision Packets surface at hard checkpoints (`prd-ok`, `planned`, `designed`, `built`, `handed-off`, `shipped`); user approves OR sends back. The cadence is deliberate — `feedback_iterate_on_users_behalf.md` codifies "iterate on user's behalf most of the time", with Decision Packets as the primary user-touch surface (BL-029 codifies this principle explicitly).

Managed Agents' `tool_confirmation` round-trips operate per-tool-call `[research https://platform.claude.com/docs/en/managed-agents/overview]` — a different cadence model. Fine for some workflows; incompatible with the EA Decision Packet discipline that batches user-touch into meaningful checkpoints.

---

## 5. Decision matrix — when to evaluate Managed Agents adoption

For each new Managed Agents feature or use case, walk this matrix:

| If you want to... | Then... |
|---|---|
| Lift a *pattern* (rubric, dream, iteration-counter) into TapAgents | Open a Tier 1 backlog item; Org Designer drafts proposal; user approves via Decision Packet; pattern lands in `protocols/` + `agents/*.md` (BL-025 is the reference shape) |
| Run *one specialist* in a sandbox (long QE smoke, async research, untrusted code eval) | Hybrid hosting per §3; TapAgents architecture invariants preserved; webhook → file-substrate result-fetch |
| *Replace* TapAgents with Managed Agents | Rejected as of May 2026 — see §4 for the structural gaps; revisit when Anthropic ships phase-machine + deterministic-routing + file-coordination primitives |
| *Augment* with webhooks for async notifications | Possible — Managed Agents webhooks `[research https://platform.claude.com/docs/en/managed-agents/webhooks]` could notify TapAgents-via-scheduled-task that a hybrid-hosted run completed; not yet adopted (no use case requires it as of BL-026 landing) |

---

## 6. Open questions / re-evaluation triggers

Re-evaluate this map when:

- Anthropic ships **arbitrary-depth multi-agent** (would close §4.6).
- Anthropic ships **deterministic routing primitives** for multi-agent (would close §4.2).
- Anthropic ships a **phase-machine / project-state primitive** (would close §4.1 + §4.7).
- TapAgents activates `industry-researcher` or `customer-researcher` and the async-research use case (§3.2) becomes concrete enough to spike.
- The team hits a load-bearing scaling limit (parallel sessions exceed local-machine capacity, sandboxed-ops requirement becomes routine).

Re-evaluation owner: Org Designer (monthly pattern-mining cadence per `protocols/team-rhythm.md`; cadence number current as of authoring — verify on next OD invocation if numbering has drifted). Surface findings via standard `workspace/_global/org-designer-proposals/` channel.

Critic's Devil's Advocate pass on this doc surfaced an additional re-evaluation lens for Org Designer: this doc implicitly frames the comparison adversarially against Managed Agents adoption (TapAgents primitives = correct; Managed Agents deviations = gaps). A symmetric "TapAgents may be over-engineered" review belongs in Org Designer's continuous team-shape evaluation lane rather than this doc, but the framing question is captured here for visibility — see `workspace/_global/critic-review-bl026-managed-agents-comparison.md` Devil's Advocate section.

---

## 7. References

**Primary sources (Anthropic):**
- `https://claude.com/blog/new-in-claude-managed-agents` — May 2026 announcement (the +8.4-10.1pt Outcomes delta is sourced here).
- `https://platform.claude.com/docs/en/managed-agents/overview` — Overview, runtime model, sandboxing.
- `https://platform.claude.com/docs/en/managed-agents/dreams` — Dreams (reflective memory pass).
- `https://platform.claude.com/docs/en/managed-agents/define-outcomes` — Outcomes (rubric + grader pattern).
- `https://platform.claude.com/docs/en/managed-agents/multi-agent` — Multiagent orchestration (1-level + 20-roster + LLM-driven coordinator).
- `https://platform.claude.com/docs/en/managed-agents/webhooks` — Webhooks (event push).

**TapAgents internal references:**
- `protocols/outcome-grading.md` — BL-025 Phase 1 codification; the in-tree reference shape that lifts the Outcomes pattern.
- `protocols/session-coordination-protocol.md` — file-based parallel-session coordination (gap §4.3).
- `protocols/changelog-protocol.md` — atomic-cadence rule that informs how lift decisions land.
- `protocols/backlog-protocol.md` — how new comparison-driven proposals enter the team.
- `agents/conductor.md` — deterministic routing contract (gap §4.2).
- `agents/critic.md` — adversarial-review-by-default contract (gap §4.4).
- `agents/org-designer.md` — continuous team-shape evaluation (gap §4.5).
- `memory/backlog.md` BL-025 + BL-026 + BL-029 — the in-flight backlog items this doc references.
- `memory/agent-changelog.md` 2026-05-07 — Phase 1 outcome-grading landing narrative.
- `.claude/docs/specs/2026-05-04-<project>-design.md` — founding team design spec.
