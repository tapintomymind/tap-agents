# Framework Metrics

**Owner:** Org Designer (Tier 1) — taxonomy maintenance, rollup cadence, anomaly thresholds.
**Co-owners:** Quality Engineer (qe.* events), Critic (critic.* events), Conductor (gate.* events).
**Status:** Active 2026-05-07.

The framework can't improve itself if it can't see itself. This protocol fixes the canonical event taxonomy + emit primitive + rollup cadence so questions like "how often does QE catch a real issue?" or "which Tier 2 agent fires most?" or "what's the per-project agent-invocation cost trend?" become answerable from data, not anecdote.

The PRINCIPLE layer (§1–7) is universal. The TAXONOMY (§8) is where the agent company's specific events are enumerated.

---

## 1. Goals

1. **Make the framework self-observable.** Without metrics, every improvement decision is anecdote vs anecdote. With them, Org Designer's quarterly review becomes data-driven.
2. **Surface anomalies proactively.** "Project X hasn't seen a QE smoke in 30+ days" or "Agent Y is invoked 10× more often than peers but never produces an artifact" — these are detectable from the event stream.
3. **Enable cost / performance accountability.** Per-agent token consumption, per-project wall time, per-milestone agent count — all queryable.
4. **Support track-record building.** When other users adopt TapAgents, "this agent has handled N projects with M outcomes" comes from this data, not from gut feeling.

---

## 2. Architecture

```
┌──────────────────┐
│  Any agent fires │  → emits a structured event via the emit primitive
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ .claude/scripts/emit-metric.py               │  → appends ONE JSON line to:
│  (Python stdlib only, no deps, append-only)  │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────┐
│ .claude/memory/framework-metrics.jsonl     │  ← gitignored (privacy boundary)
└────────┬───────────────────────────────────┘
         │  (read on cadence)
         ▼
┌────────────────────────────────────────────┐
│ .claude/scripts/rollup-metrics.py          │  → produces:
│   --window 7d  → EA's weekly briefing      │     - markdown rollup tables
│   --window 90d --full → Org Designer       │     - JSON for further processing
│                         quarterly review   │
└────────────────────────────────────────────┘
```

**The JSONL log is gitignored.** Events may contain project context that's project-private. Aggregated rollups (sanitized, no per-event details) can be committed as `memory/framework-metrics-rollup-<period>.md` artifacts.

---

## 3. The emit primitive

Any agent (Tier 1 or Tier 2) emits an event by calling:

```bash
python3 <framework-root>/.claude/scripts/emit-metric.py \
    --event <event-type> \
    --agent <agent-name> \
    --project <project-slug-if-applicable> \
    --field key1=value1 \
    --field key2=value2
```

**Reserved keys** (always set by the script, never via `--field`):
- `ts` — ISO 8601 UTC timestamp with millisecond precision
- `event` — the event type (canonical taxonomy in §8)
- `agent` — emitting agent's name (when applicable)
- `project` — project slug (when project-scoped)

**Field values are JSON-typed.** The script attempts `json.loads` on each value; falls back to bare string. So:
- `--field duration_ms=1234` → `1234` (number)
- `--field verdict=block` → `"block"` (string)
- `--field blocking='["a","b"]'` → `["a","b"]` (list)
- `--field enabled=true` → `true` (boolean)

**Failure mode:** the script exits non-zero if the JSONL can't be written, but never throws. Agents that emit-and-continue should treat a non-zero exit as a warning, not a failure.

---

## 4. Privacy discipline

Events MUST NOT include:
- User PII (names, emails, IPs beyond the request-ID correlation)
- Secrets, tokens, OAuth codes, encryption keys, session IDs
- Full request bodies or full artifact contents
- Free-form text from user messages or PRDs

Events DO include:
- Structural metadata: agent name, project slug, phase, timestamp, event type
- Counts and aggregates: blocking findings, files produced, milestones advanced
- Category labels: verdict, status, severity, outcome
- Stable identifiers that are NOT credentials: request-IDs, milestone names, artifact paths (relative)

**The script doesn't enforce sanitization.** Caller is responsible. Critic's review checklist (per `agents/critic.md`) flags emit-metric calls that look like they might leak.

---

## 5. Reading + rollup cadence

| Consumer | Cadence | Window | Command |
|---|---|---|---|
| **EA** | Weekly briefing | 7d | `rollup-metrics.py --window 7d --group-by agent,event` |
| **Org Designer** | Monthly trigger sweep | 30d | `rollup-metrics.py --window 30d --full` |
| **Org Designer** | Quarterly review | 90d | `rollup-metrics.py --window 90d --full` |
| **EA** | On-demand for incident triage | last 24h | `rollup-metrics.py --window 24h --project <slug>` |
| **Quality Engineer** | At handed-off → shipped gate | project lifetime | `rollup-metrics.py --window 365d --project <slug>` |

EA's weekly rollup goes into `briefing.md` artifacts. Org Designer's monthly + quarterly rollups go into `memory/framework-metrics-rollup-YYYY-MM.md` (committed, sanitized). Per-project lifetime rollups feed into the project's smoke-report and post-mortem.

---

## 6. Anomaly detection (Org Designer's monthly sweep)

The `--full` rollup surfaces these signals automatically. Org Designer reviews and decides whether to act:

| Signal | What it means | Typical action |
|---|---|---|
| Agent X invocations dropped > 50% week-over-week | Agent may be silently broken; trigger pulled; or its work shifted to another agent | Verify the agent's contract still fires on its declared triggers; check transition logs |
| Agent X invocations are 5×+ higher than peer agents | Possible overload (agent is doing too much); possible runaway loop | Review what the agent's actually doing; consider split or scope reduction |
| Project Y hasn't seen a `qe.smoke` event in 30+ days | QE may have lost coverage of that project; or project is paused without flag | Verify project state; if active, schedule QE smoke pass |
| `critic.review` events with verdict=block exceed 30% of total | Critic is over-blocking (calibration off) OR the team is shipping low-quality work | Sample 5 recent blocks; assess; adjust Critic's calibration if needed |
| `critic.review` verdict=block fell to 0% over 30+ days | Critic is rubber-stamping (calibration off in the other direction) | Sample 5 recent passes; verify they would have caught the gotchas the framework's case-study memory documents |
| `gate.blocked` count rising at conductor checkpoints | Multiple agents are bypassing a gate; the gate might be miscalibrated, or the agents need re-prompted | Per-gate review; trace which agents bypass; decide gate vs agent fix |

These thresholds are starting heuristics, not hard rules. Org Designer adjusts them based on observed false-positive / false-negative rates in early months.

---

## 7. Activation timing in the project state machine

Per-project events emit at these checkpoints (minimum). Agents may emit additional structured events as their contracts dictate.

| Stage | Event | Emitter |
|---|---|---|
| `briefed` (start) | `project.created` | Conductor |
| Any phase start | `agent.invoked` | The invoked agent |
| Any phase end | `agent.completed` | The completed agent |
| `scoping → planned` | `gate.passed` or `gate.blocked` | Conductor |
| `coding → review` | `gate.passed` or `gate.blocked` | Conductor |
| Critic review pass | `critic.review` | Critic |
| QE test-plan | `qe.test_plan` | Quality Engineer |
| QE smoke | `qe.smoke` | Quality Engineer |
| Ops/Security audit | `ops.security_audit` | Ops/Security |
| Memory update | `memory.entry_added` | Whoever wrote the entry |
| Incident logged | `incident.opened` | Whoever logged it |
| Incident resolved | `incident.closed` | Whoever closed it (with regression-test path) |
| `handed-off → shipped` | `project.shipped` | Conductor |

Tier 2 agents emit project-scoped variants: `tier2.agent.invoked`, etc. The same script handles them.

---

## 8. Canonical event taxonomy

Events use dot-separated namespaces. The first segment is the broad category; the second + third refine. Add new event types deliberately — once an event is in the taxonomy, downstream rollups assume the shape.

### project.* — project lifecycle

| Event | Required fields | Optional fields |
|---|---|---|
| `project.created` | `project` | `intake_brief_path`, `phase=briefed` |
| `project.shipped` | `project`, `live_url` | `milestone`, `total_duration_days`, `total_events` |
| `project.paused` | `project` | `reason` |
| `project.abandoned` | `project` | `reason`, `lessons_learned_path` |

### agent.* — agent lifecycle

| Event | Required fields | Optional fields |
|---|---|---|
| `agent.invoked` | `agent` | `project`, `trigger`, `phase` |
| `agent.completed` | `agent` | `project`, `duration_ms`, `outcome=success\|partial\|failed`, `artifacts_produced` (number) |
| `agent.activated` | `agent` | `triggered_by`, `proposal_path` |
| `agent.retired` | `agent` | `reason`, `archive_path` |

### gate.* — state-machine transitions

| Event | Required fields | Optional fields |
|---|---|---|
| `gate.passed` | `project`, `gate` (e.g., `coding-to-review`) | `phase_from`, `phase_to`, `validators` |
| `gate.blocked` | `project`, `gate`, `reason` | `blocker_count`, `blocker_categories` |

### critic.* — review axis

| Event | Required fields | Optional fields |
|---|---|---|
| `critic.review` | `project`, `verdict` (`pass\|revise\|block`) | `artifact_path`, `blocking_concerns` (number), `severity_distribution` |

### qe.* — quality engineering axis

| Event | Required fields | Optional fields |
|---|---|---|
| `qe.test_plan` | `project` | `tests_planned`, `coverage_targets` |
| `qe.smoke` | `project`, `result` (`pass\|fail\|partial`) | `tests_run`, `tests_passed`, `tests_failed`, `blocking_findings` |
| `qe.exploratory` | `project`, `findings_count` | `severity_distribution` |

### ops.* — security / ops axis

| Event | Required fields | Optional fields |
|---|---|---|
| `ops.threat_model` | `project`, `threats_enumerated` | `mitigations_required` |
| `ops.security_audit` | `project`, `verdict` | `critical_findings`, `high_findings`, `medium_findings` |

### memory.* — framework knowledge growth

| Event | Required fields | Optional fields |
|---|---|---|
| `memory.entry_added` | `file`, `entry_type` (`principle\|case_study\|incident\|pattern`) | `agent`, `project`, `cross_references_count` |
| `memory.curation` | `file`, `action` (`merged\|archived\|pruned`) | `entries_affected` |

### incident.* — production incidents

| Event | Required fields | Optional fields |
|---|---|---|
| `incident.opened` | `incident_id`, `project`, `severity` | `category`, `detection_source` |
| `incident.closed` | `incident_id`, `regression_test_path \| "untestable_with_reason"` | `duration_minutes`, `customer_impact` |

### tokens.* — cost accountability (when measurable)

| Event | Required fields | Optional fields |
|---|---|---|
| `tokens.consumed` | `agent`, `tokens_input`, `tokens_output` | `project`, `phase`, `model` |

---

## 9. Discipline rules

1. **Every emit goes through the script.** Don't append to the JSONL by other means; the script handles formatting + reserved-key protection. (Direct append is fine in dev/debug, but agent contracts call the script.)
2. **Don't emit speculatively.** Events should reflect things that ACTUALLY happened. A `qe.smoke` event should never be emitted unless QE actually ran a smoke pass.
3. **Don't double-emit.** If an agent's work spans multiple invocations (it was paused and resumed), use `agent.invoked` once at start and `agent.completed` once at end. Intermediate progress is a separate event type if needed.
4. **Sanitize before emitting.** Per §4. Critic flags suspect emit calls in PR review.
5. **Stable identifiers.** Don't include random UUIDs that aren't traceable elsewhere. Request-IDs, milestone names, project slugs are stable; "task-1234" minted ad-hoc isn't.
6. **One event = one fact.** If you have two facts to emit, emit two events. Don't pack multiple facts into one event with optional fields.

---

## 10. Cross-references

- `App Development/.claude/scripts/emit-metric.py` — the emit primitive
- `App Development/.claude/scripts/rollup-metrics.py` — the rollup tool
- `App Development/.claude/memory/framework-metrics.jsonl` — the JSONL log (gitignored)
- `App Development/.claude/agents/org-designer.md` — owner of cadence + anomaly thresholds
- `App Development/.claude/agents/executive-assistant.md` — owner of weekly rollups in briefings
- `App Development/.claude/protocols/observability-defaults.md` — sibling protocol; this file is the framework's analog of what observability-defaults is for projects
- `App Development/.claude/protocols/security-scanning-defaults.md` — sibling protocol
- `App Development/.claude/protocols/stack-portability-map.md` — the bigger picture
