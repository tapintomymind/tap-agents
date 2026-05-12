<div align="center">

# TapAgents

**An opinionated AI product team for Claude Code.**

*Strategist, Architect, Designer, Critic, Quality Engineer, Ops/Security — drop them into any directory as `.claude/` and they act as your product company.*

[![npm version](https://img.shields.io/npm/v/%40tapintomymind%2Ftap-agents?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@tapintomymind/tap-agents)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-D97757?style=for-the-badge&logoColor=white&logo=anthropic)](https://github.com/tapintomymind/tap-agents)
[![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/tapintomymind/tap-agents?style=for-the-badge&logo=github&color=gold)](https://github.com/tapintomymind/tap-agents)

</div>

---

TapAgents is a small, opinionated set of agents that turn Claude Code into a working product team. Instead of one assistant trying to do everything, you get 14 curated agents with specific jobs — a VP of Product, a VP of Engineering, a Designer, an adversarial Critic, a Quality Engineer, plus operational roles. You stay in the CEO seat. They handle the work.

It is **deliberately narrow.** Where other agent frameworks ship 100+ agents and 300+ tools, TapAgents ships 14 agents and 15 slash commands. Less surface area, more discipline, no swarm topology to understand.

## Quick Start

Two install paths, depending on how you work:

### Path A — Claude Code marketplace (recommended)

```bash
/plugin marketplace add tapintomymind/tap-agents
/plugin install tapagents
```

That's it. Slash commands appear: `/team`, `/intake`, `/architect`, `/designer`, `/critic`, `/status`, `/briefing`. Run `/team` and describe what you want to build.

### Path B — npm dependency (programmatic consumers)

```bash
npm install @tapintomymind/tap-agents
```

Use this when you're building tooling on top of TapAgents — e.g. an internal dashboard that scaffolds new projects with the framework baked in. Exposes the agent + command + protocol definitions as a typed JavaScript module plus the raw `.md` files for filesystem-based access.

## The Founding Team

Seven core agents do the load-bearing work. The other seven (`db-admin`, `backlog-curator`, `ui-ux-reviewer`, `ops-security`, plus stubs) activate when their triggers fire.

| Agent | Role | Talks to |
|---|---|---|
| **Intake** | Director of Product Discovery — interviews you, briefs the team | You ⇄ Team |
| **Executive Assistant** | Chief of Staff — surfaces decisions, delivers briefings | Team → You |
| **Conductor** | CTO/CPO — routes work, enforces state machine, runs consistency checks | Team-internal |
| **Strategist** | VP Product — turns briefs into PRDs | Conductor-driven |
| **Architect** | VP Engineering — turns PRDs into scope + tech strategy + Tier 2 scaffold | Conductor-driven |
| **Critic** | Independent advisor — adversarial review of every artifact | Reads everything |
| **Org Designer** | Head of People — watches team performance, proposes splits & new roles | Slow cadence |

The team grows over time. `agents/_planned/` holds activation-trigger stubs for GTM Strategist, Growth Analyst, Customer Researcher, Test Engineer, and others. They live as stubs until real friction triggers their activation — no agent shows up until the work demands it.

## Claude Code with vs. without TapAgents

| Capability | Claude Code alone | With TapAgents |
|---|---|---|
| Routing requests | You decide which prompts go where | Conductor routes between Strategist, Architect, Designer, Critic based on project phase |
| Reviewing artifacts | You review your own work | Critic runs adversarial review on every artifact, automatically |
| Project state | Whatever's in your scrollback | 12-phase state machine with 5 hard checkpoints for your approval |
| Cross-project memory | Per-conversation only | `memory/` directory captures patterns, product principles, lessons learned across projects |
| Per-project teams | One Claude Code instance per repo | Tier 1 HQ generates Tier 2 stack-specific teams (Next.js architect, Python architect, etc.) per project |
| Decision surfacing | Mixed into long responses | EA dedicated to summarizing what needs your input, sorted by priority |

## How It Works

```
You (CEO)  ⇄  Intake  →  Strategist  →  Architect  →  Tier 2 (per-project team)
              + Critic     + Critic       + Critic        ↓
              + EA         + EA           + EA          MVP shipped
                                           ↓               ↓
                                      Conductor        Reportback to HQ
                                           ↓
                                     State Machine
                                           ↓
                                     Org Designer (watches, proposes splits)
```

You talk to **Intake** when you have new work, scope shifts, or want to interview yourself into clarity.
You hear from **Executive Assistant (EA)** when there's something to decide, summarize, or know.
Everything else happens behind the scenes.

## Commands

```
/team "I want to build a music discovery site"   # start new work
/intake                                          # start an interview
/feature "add real-time collaboration"           # ideate inside existing project
/status                                          # what's happening across all projects
/briefing                                        # full executive briefing
/queue                                           # decisions waiting on you
/inbox                                           # FYI items + flagged things
/critic                                          # force a review pass
/design-review                                   # UI/UX review on running code
/grow-team                                       # invoke Org Designer
/release                                         # cut a new framework version
```

Run `/team` to see the full list.

## The State Machine

Every project moves through 12 phases:

```
seed → intaking → briefed → stratego → prd-ok → scoping →
planned → scaffold → handed-off → shipped → measured → retro
```

Plus side-states: `paused`, `pivoted`, `abandoned`.

**5 hard checkpoints** stop for your approval: `briefed`, `prd-ok`, `planned`, `scaffold`, `shipped`. Everything else auto-advances. EA notifies you when something needs attention. Full contract: [`protocols/state-machine.md`](protocols/state-machine.md).

## Tier 1 vs Tier 2

- **Tier 1 (this `.claude/`):** Company HQ. Framework-agnostic. Strategy, planning, scaffolding.
- **Tier 2 (each project's own `.claude/`):** Product team. Generated by Architect. Framework-specific — Next.js agents for a Next.js project, Swift agents for an iOS app.

Tier 2 receives a charter (handoff package). Tier 2 reports up via reportback channel. Tier 1 owns the "what and why," Tier 2 owns the "how."

## Public / Private Split

TapAgents is open-source-ready by design. Two layers:

- **Public** (ships in the npm package + Claude Code plugin): agent prompts, protocols, templates, playbooks, examples, narrative changelogs.
- **Private** (`.gitignored`, never published from forks): your real `memory/` files (product taste, stack preferences, lessons), `workspace/` (every project you've run), private playbooks.

Anyone forking gets a working scaffold from `_examples/` directories. Your operational state stays on your machine.

## Memory

Cross-project knowledge that compounds:

- [`memory/product-principles.md`](memory/_examples/product-principles.example.md) — what "good" means to you
- [`memory/stack-preferences.md`](memory/_examples/stack-preferences.example.md) — default stacks per project type
- [`memory/audience-knowledge.md`](memory/_examples/audience-knowledge.example.md) — recurring ICPs
- [`memory/patterns.md`](memory/_examples/patterns.example.md) — recurring decisions
- [`memory/lessons-learned.md`](memory/_examples/lessons-learned.example.md) — post-mortems with lessons
- [`memory/agent-changelog.md`](memory/agent-changelog.md) — narrative log of team evolution

Hygiene rule: every memory entry needs provenance (which project, what date) so it can be audited for freshness and shareability.

## Versioning

TapAgents follows strict SemVer with a four-gate enforcement chain: AI-led `/release` command, mechanical `hooks/version-gate.py` pre-commit check, CI status check on PRs, and Critic adversarial review at release. Full spec: [`protocols/versioning-protocol.md`](protocols/versioning-protocol.md).

Cut a release with `/release`. The command walks through diff classification, version proposal, atomic commit + tag.

## The Distribution Pipeline

| | Source of truth | Goes to |
|---|---|---|
| Marketplace path | This repo's `.claude-plugin/marketplace.json` | Claude Code users via `/plugin marketplace add` |
| npm path | This repo's `package.json` | Programmatic consumers via `npm install` |
| Both | This repo (`tapintomymind/tap-agents`) | One source, dual egress |

Tagged releases (`v*.*.*`) trigger `.github/workflows/publish.yml`, which builds, verifies, publishes to npm with provenance, and creates a matching GitHub Release.

## Documentation

| Doc | What it covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Full team roster + activation triggers |
| [`docs/iteration-cadence.md`](docs/iteration-cadence.md) | How a project moves through the team |
| [`protocols/`](protocols/) | All canonical protocols (versioning, state machine, citation, dispatch-efficiency, etc.) |
| [`templates/`](templates/) | Templates for PRD, scope, tech-strategy, design-spec, etc. |
| [`CHANGELOG.md`](CHANGELOG.md) | Versioned release history |

## Status

Active development. v0.8.x series. Used in production at [tapintomymind.com](https://tapintomymind.com) to ship internal projects. The agent-dashboard project (separate repo) is the first Tier 2 consumer — it scaffolds new TapAgents projects from this framework as a dependency.

## License

MIT. See [`LICENSE`](LICENSE).

## Contributing

The framework is operator-tuned, not crowdsourced. PRs welcome for typos, doc clarifications, and small protocol fixes — but agent-prompt changes go through `/release` discipline (see [`protocols/framework-change-discipline.md`](protocols/framework-change-discipline.md)) which means proposal-review-ratify before landing. If you want to propose a structural change, open an issue first.

---

<div align="center">

[Install via Claude Code](https://github.com/tapintomymind/tap-agents) · [npm](https://www.npmjs.com/package/@tapintomymind/tap-agents) · [Issues](https://github.com/tapintomymind/tap-agents/issues)

</div>
