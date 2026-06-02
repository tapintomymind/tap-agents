# Dispatch Efficiency Protocol

How EA / Conductor (and any agent that spawns subagents) should dispatch work to keep token spend lean. Read by Conductor + EA on every dispatch decision.

> **One-line rule:** A dispatch prompt is a *pointer*, not a *payload*. Send the smallest brief that lets the subagent fetch what it needs.

---

## 1. Dispatch Template (the lean default)

Target: **~500–800 bytes**. If a brief grows past ~1.2KB, ask whether you're re-stating context the subagent can read for itself.

```
You are <Tier> <Agent>. Contract: <absolute path>.

Task: <one sentence — the actual job>.

Inputs (read only what you need):
- <abs/path>.md §<section>     ← <one-line why>
- <abs/path>.md §<section>     ← <one-line why>

Output: <where to write | what to return inline>.
Budget: <time / token cap, e.g. "~10 min, lean prose">.
```

Required slots: **task, file pointers (with section refs), output expectation, budget.** Everything else is overhead.

Anti-pattern: pasting PRD/scope/handoff content *into* the brief when the file is on disk and the agent can Read it.

---

## 2. Section-Level Pointing Rules

Never hand a subagent a 60KB file when you can hand them a 4KB section.

| Wrong | Right |
|---|---|
| "Read handoff-package.md (64KB)" | "Read handoff-package.md §1.4 (Brief excerpts) and §2.2 (MVP cuts)" |
| "Read the PRD" | "Read prd.md §3 (Goals) and §5 (Out of scope)" |
| "Here's the full critic-notes inline: <60 lines>" | "Read critic-notes.md L41–L67 (the auth flag thread)" |

Rules:
1. **Cite sections by header or line range.** Files have headers — use them. `§1.4`, `§Goals`, `L41–L67` are all fine.
2. **Don't inline what's on disk.** If the subagent has Read access to the path, point at the path.
3. **List inputs as a bullet, not a paragraph.** Each bullet = one file + one reason.
4. **If the subagent needs everything in a long file, say so explicitly** — and reconsider whether the task is too big for one dispatch.

---

## 3. Model Selection by Task Complexity

Default: **Sonnet**. Escalate to Opus only when the task genuinely needs reasoning depth. Drop to Haiku for mechanical work.

| Model | Use for | Examples |
|---|---|---|
| **Opus** | Reasoning-heavy: strategy, architecture, multi-artifact synthesis, taste calls, adversarial review of large work | Strategist drafting PRD, Architect picking stack, Critic reviewing scope, Org Designer cross-project review, Intake interviewing |
| **Sonnet** | Routing, summarization, focused implementation, code review of bounded changes, single-file edits, structured writes (changelog entries, log appends) | Conductor routing, EA briefing, Tier 2 implementer on a focused task, generating a single component, writing a config update |
| **Haiku** | Mechanical: file moves, log appends, format conversions, "is X present in Y" checks, regex / find tasks, single-line patches | Verifying a file exists, appending a timestamped entry, splitting a paragraph, renaming a symbol across known files |

**Heuristics:**
- If you'd ask a senior engineer → Opus.
- If you'd ask a competent mid-level → Sonnet.
- If you'd ask a script → Haiku (or just do it inline; see §4).
- **Model mismatch is a top waste vector.** Opus on a Haiku task = ~10x cost for no quality lift.

---

## 4. When to NOT Dispatch (handle inline)

Dispatch overhead is real: a system prompt, context window setup, tool-schema load, reportback. For small tasks the overhead exceeds the work.

**Handle inline when:**
- The task is **a single file edit** you can do in <30 seconds.
- The task is **a fact lookup** (one Read + one sentence reply).
- The task is **a status check** (read state.json, return one line).
- The task is **a log append** (one Edit on a known file, known format).
- The task is **a single bash command** (ls, mv, mkdir, grep across <5 files).
- The brief itself would be longer than the work.

**Dispatch when:**
- The task **needs >3 files** read and synthesized.
- The task **produces a substantive artifact** (PRD section, code module, review document).
- The task **runs for >2 minutes** of real work.
- The task **needs adversarial separation** (Critic must not be the producer).
- The task **needs a different model** than the parent.
- Parallel dispatch lets you run 2+ independent tasks concurrently.

**Borderline test:** if the dispatch brief would be longer than the patch, do it inline.

---

## 5. Anti-Patterns (the things we've been doing)

These are the recurring waste shapes flagged in the dispatch-efficiency audit. Avoid them.

### 5.1 Overlong prompts
Pasting PRD / scope / full file contents into the brief. The subagent has Read access — point at the path with section refs (§2).

### 5.2 Redundant context across parallel dispatches
Three subagents each get the same 64KB handoff-package inlined. Instead: each gets a pointer to the file + its specific section.

### 5.3 Model mismatch
Opus on a 30-second Haiku task. Sonnet on a multi-file synthesis that needs Opus. Default Sonnet, escalate or drop with intent (§3).

### 5.4 Dispatch-for-tiny-fixes
Spinning up a subagent to add one line to a changelog. Inline it (§4).

### 5.5 No budget specified
"Do this thing" with no scope cap. Subagent goes long, reads more than needed, produces more than needed. Always include a budget line.

### 5.6 No output expectation
Subagent doesn't know if it should write to disk, return prose, return JSON, or signal another agent. Wastes a round trip clarifying. Always specify.

### 5.7 Re-stating the contract
"You are Strategist. You write PRDs. PRDs have these sections..." The contract file has all of this. Just point at it: `Contract: <path>`.

### 5.8 Reading-and-re-summarizing in the brief
"The PRD says X, the scope says Y, here's a summary..." If the subagent needs the source-of-truth, send them to the source. Summaries drift.

### 5.9 Sequential dispatch when parallel is fine
Three independent subagents fired one after another instead of in one round of parallel calls. Round-trips cost real time.

---

## 6. Quick Self-Check Before Every Dispatch

Five questions, ~5 seconds:

1. **Is this >2 min of real work?** If no → inline.
2. **What's the smallest section I can point at?** Not the whole file.
3. **What model fits the task?** Default Sonnet.
4. **What's the output target?** Disk path, inline reply, signal.
5. **What's the budget?** Time + token cap.

If you can't answer all five quickly, the dispatch isn't ready.

---

## 7. Constrained Implementation Mode — Dispatch Contract

**When to use.** Narrow-slice implementation work where worker drift would be costly. The mode is OFF by default; enable it explicitly when the brief calls for `Mode: constrained`. Common triggers:

- **UI-shell slices.** Worker is supposed to wire AppShell / route layouts / responsive smoke and stop. Adjacent surfaces (sim engine, DB schema, business logic) are off-limits unless the slice explicitly lists them.
- **Hotfixes.** One-line bug fix or one-file patch. Worker has no business touching anything else.
- **"Do only this" requests.** User has said "constrained manner," "boxed," "narrow slice," "fix only this," or equivalent.
- **Re-dispatch after drift.** A prior worker on this milestone drifted off-contract; Conductor reissues a smaller slice with explicit boundaries.
- **High-drift surfaces named in `memory/patterns.md`** (e.g., monorepo with cross-package edits one slice over).

Constrained mode is NOT for broad multi-surface milestones (e.g., "ship M-A1: sim engine + DB schema + UI demo"). Those use default dispatch. The cost of constrained-mode ceremony is real (allowlist authoring, preflight echo, heartbeat parsing); spend it where drift risk justifies it.

### 7.1 Constrained dispatch template (canonical reusable block)

Embed the following block — verbatim, all fields populated — at the bottom of any dispatch brief that should run in constrained mode. The worker's preflight must echo back the Mode + Allowed/Denied + First-proof-by lines before its first Edit/Write call.

```markdown
Mode: constrained
Slice ID: <milestone>.<subtask> (e.g., M-A2.1 AppShell+BottomNav)
Outcome: <one visible or testable result — a localhost route renders, a test goes green, a specific diff lands>
Allowed paths:
  - <path/glob>           ← <one-line why>
  - <path/glob>           ← <one-line why>
Denied paths:
  - <path/glob>           ← <one-line why off-limits this slice>
  - <path/glob>           ← <one-line why off-limits this slice>
First proof by minute <N>: <localhost URL the worker opens / test command that goes green / diff that lands / screenshot path>
Heartbeat every <N> minutes (default 5):
  - files touched since last heartbeat
  - current blocker (or "none")
  - next file the worker will touch (concrete path, not "next I'll work on routing")
Stop and report (do NOT proceed) if:
  - any denied path is about to be touched
  - a package / dependency / framework / .claude/ file change is needed
  - first-proof deadline is missed
  - verification command cannot run (env missing, dev server won't start, test runner crashes)
  - scope change is needed (slice contract is wrong or incomplete)
Verification:
  - commands: <exact bash commands the worker runs before reporting done>
  - browser routes: <localhost URLs the worker opens, with viewport sizes if responsive>
  - screenshot evidence: <path(s) where the worker saves proof>
Reportback fields:
  - changed_files: <list — must be subset of allowed paths>
  - denied_paths_checked: <list — explicit "I did not touch these" confirmation>
  - first_proof_result: <URL opened / test output / screenshot path>
  - verification_evidence: <command output snippets, browser screenshots, test results>
  - heartbeats_emitted: <count>
  - stop_conditions_triggered: <none | list>
```

### 7.2 Preflight discipline (worker side)

Before the worker's first Edit/Write, it MUST emit a preflight echo as its first assistant turn:

```
Preflight (constrained mode — Slice ID <id>):
- I read the slice contract.
- I will touch only these files: <list, copied from Allowed paths>
- These denied paths are off-limits: <list, copied from Denied paths>
- First visible proof will be: <route|test|diff> by minute <N>.
```

No preflight echo means the worker is not in constrained mode and its first edit may land outside the allowlist. The Tier 2 conductor and the worker prompt itself both enforce this. See `templates/stacks/_baseline/tier2-implementer.md` section "Constrained mode preflight" for the worker-side mechanics; see `templates/stacks/_baseline/tier2-conductor.md` section "Constrained-Mode Routing" for the dispatcher-side mechanics.

### 7.3 Heartbeats and kill switches

Constrained mode prefers fast failure over long drift. Conductor parses each heartbeat and triggers a kill if any of these fire:

- **Denied path touched.** Worker's last reportback or heartbeat names a file outside the allowlist.
- **First-proof miss.** Wall clock passed the "First proof by minute N" deadline without the worker emitting the named proof artifact.
- **Two consecutive heartbeats with no next-file mention.** The worker is wandering, not building. Concrete file paths in `next file` are required; "next I'll finish the routing" is not concrete.
- **Worker requests scope/dependency/framework/architecture change.** Constrained mode does not amend its own contract. Kill the run, surface the change request to the user via EA, reissue a smaller slice if the request is legitimate.
- **Verification cannot run.** Worker reports the verification command crashes or the dev server won't start. Kill — the slice is unverifiable as-specified; conductor needs to amend.

Kill is not punitive. It is a process control: stop the drifting context, preserve its partial diff (worker should write `kill-handoff.md` in the workspace before exiting), and reissue a smaller, more boxed contract. The kill action itself is Tier B per `protocols/autonomous-ops-permissions.md` — log to `agent-changelog.md` with the kill reason.

### 7.4 Post-completion changed-file self-check

When the worker claims done, it MUST run a changed-file self-check before its final reportback:

```bash
git status --porcelain    # list every modified/added/deleted path
```

The worker compares each path against its Allowed paths glob list. **If any changed file is outside the allowlist, the worker refuses completion** and reports back with `stop_conditions_triggered: [out-of-scope-edit-detected]` plus the offending paths. The Tier 2 conductor or human reviewer decides whether to roll back the out-of-scope edits, amend the slice contract, or accept the deviation as a dissent.

This self-check is what closes the loop: the contract is mechanically inspectable before, during, and after the run.

### 7.5 Execution liveness vs drift detection — open investigation item

The heartbeat + kill-switch mechanics in section 7.3 target **drift** (worker is making tool calls, but the wrong ones). They do NOT target **execution stalls** (worker has stopped making tool calls entirely — process is hung, model is looping internally, harness is waiting for input that never comes).

The 2026-05-15 `db-admin` incident in `<project>` was an execution-stall, not a drift incident. The worker was not editing the wrong files; it was not editing at all. The constrained-mode contract as currently designed does not catch this class.

**Liveness gap, deferred.** A heartbeat field like `last_tool_call_at` (worker timestamps each tool call; conductor or an external watchdog kills the run if the worker has produced no tool calls for N minutes) would catch execution stalls. This is not yet specified here because:

1. The watchdog needs an out-of-band timer (Conductor doesn't poll subagents during their run; the harness owns that boundary).
2. The right home for this may be a harness-level setting (`subagent_max_idle_seconds`) rather than a per-dispatch contract field.
3. Pattern requires 2-3 more incidents to confirm the right control surface (per-dispatch field vs harness setting vs per-agent ceiling).

**Action.** Future work — investigation item, not blocking this protocol's rollout. When the next execution-stall incident lands, raise here and decide the control surface. Tracked via `memory/lessons-learned.md` (constrained-mode + execution-liveness entry) for cross-project pattern detection.

---

## 8. References

- `agents/conductor.md` — primary dispatcher; cross-references this protocol.
- `agents/executive-assistant.md` — secondary dispatcher (briefings).
- `protocols/handoff-protocol.md` — separate concern (Tier 1 → Tier 2 packaging is a one-time large transfer; this protocol is about live subagent dispatch).
- `templates/stacks/_baseline/tier2-conductor.md` section "Constrained-Mode Routing" — dispatcher-side enforcement of section 7 contract.
- `templates/stacks/_baseline/tier2-implementer.md` section "Constrained mode preflight" — worker-side enforcement of section 7 contract.
- `templates/stacks/nextjs/react-component-agent.md` — first stack-specific frontend worker; canonical constrained-mode consumer for UI-shell slices.
- `memory/patterns.md` — "Dispatch efficiency" + "Model selection by task complexity" + "Constrained Implementation Mode" entries.
