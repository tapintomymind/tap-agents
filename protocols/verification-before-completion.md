# Verification-Before-Completion Protocol

**Never claim work is "complete," "done," "shipped," "passing," or "ready" without paste-able evidence.** Pattern adapted from `obra/superpowers`, layered into our citation discipline.

## The Rule

Before any agent — Tier 1 OR Tier 2 — claims a piece of work is complete:

1. **Run the verification command(s)** appropriate to the claim
2. **Capture the actual output** (not a summary, not a paraphrase)
3. **Cite the output in the completion claim**

Untyped "I think it's done" claims are forbidden. They're how systems silently regress.

## Verification by Claim Type

| Claim | Required verification |
|---|---|
| "Brief is complete" (Intake) | All 8 dimensions tagged; critical dimensions not `[open]`; user confirmed |
| "PRD is ready" (Strategist) | All citations present; Critic review pass complete; consistency check pass |
| "Scope is approved" (Architect) | Scope vs PRD diff shows no unjustified delta; Critic review pass; consistency check pass |
| "Tech-strategy is approved" | Stack picks cited; ≥3 risks identified with mitigation; consistency check pass |
| "Tier 2 scaffold complete" (Architect) | Mechanical checklist passed (8 items); semantic Critic-on-Tier-2 pass complete |
| "MVP shipped" (Tier 2 → Tier 1) | Live URL accessible (test ping); PRD acceptance criteria met (per-criterion confirmation); deployment artifacts present |
| "Tests passing" (Tier 2) | `<test command>` output pasted; pass count = expected count; no skipped tests without justification |
| "Build succeeds" (Tier 2) | `<build command>` output pasted; binary/artifact exists at expected path |
| "Deploy successful" (Tier 2) | Live URL responds 200; key endpoint smoke-test passed; rollback procedure documented |

## What "Paste-able Evidence" Means

NOT acceptable:
- "Tests passed" (no command output)
- "I ran the build and it worked" (no log)
- "URL is live" (no ping response)
- "Critic approved" (no reference to critic-notes.md entry)

Acceptable:
```
Verification: bun test
Output:
  ✓ 47 tests passing
  ✓ 0 tests failing
  ✓ 0 tests skipped
  Time: 1.2s
```

```
Verification: curl -I https://tools-cli.example.dev
Output:
  HTTP/2 200
  content-type: text/html
  date: 2025-09-21T18:25:03Z
```

```
Verification: cat workspace/<slug>/critic-notes.md | grep "BLOCKING"
Output: (empty — no blocking concerns)
```

## Per-Agent Application

### Conductor
Before advancing any state machine transition, requires the artifacts the contract demands. Verification = "the contract check returned PASS, here's the contract output."

### Critic
Before signing off a review, must reference specific lines/sections of the artifact. "Looks good" is forbidden — must be "I checked sections X, Y, Z; concerns logged at lines a, b, c."

### Strategist / Architect
Before dropping `[WIP]` from any artifact, must complete a self-check:
- All citations tagged
- All sections present
- All Critic concerns addressed or explicitly deferred

### Tier 2 (all agents)
Before signaling milestone-complete to Tier 2 conductor, must paste verification output for the relevant claim type above.

## Stop-Hook Integration

The Stop hook (`hooks/stop-critic-check.py`) enforces this protocol at session boundaries:
- Won't allow the session to end if a project has unresolved blockers, contested artifacts, or BLOCKING Critic concerns
- Forces the agent to either resolve OR explicitly mark the issue as accepted-with-override in `dissent-log.md`

## Anti-Sycophancy Connection

Verification-before-completion catches a *different* failure than Critic's Devil's Advocate:
- **Devil's Advocate** prevents Critic from being too agreeable in *review*
- **Verification-before-completion** prevents agents from claiming *completion* without evidence

Both are needed. Both compound.

## Forbidden Behaviors

- ❌ Claiming "done" / "complete" / "passing" without paste-able evidence
- ❌ Paraphrasing test output instead of pasting
- ❌ Marking transitions complete based on "should work" reasoning
- ❌ Tier 2 marking MVP shipped without live URL verification
- ❌ Critic signing off a review without specific section references
- ❌ Architect marking scaffold complete without checklist output
