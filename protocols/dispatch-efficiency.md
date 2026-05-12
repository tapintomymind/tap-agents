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

## 7. References

- `agents/conductor.md` — primary dispatcher; cross-references this protocol.
- `agents/executive-assistant.md` — secondary dispatcher (briefings).
- `protocols/handoff-protocol.md` — separate concern (Tier 1 → Tier 2 packaging is a one-time large transfer; this protocol is about live subagent dispatch).
- `memory/patterns.md` — "Dispatch efficiency" + "Model selection by task complexity" entries.
