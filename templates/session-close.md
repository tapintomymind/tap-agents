# Session-Close Summary

**Format used by EA at end of session** (when user signals done, signs off, or after extended idle). Word budget: 200-300.

---

```
─────────────────────────────────────────────
SESSION CLOSE — <YYYY-MM-DD HH:MM>

WHAT ADVANCED
- <Project-slug>: <X → Y phase>
- <Project-slug>: <X → Y phase>
- (or "no transitions this session")

WHAT WAS DECIDED
- <Decision and project>
- <Decision and project>
- (or "no decisions this session")

WHAT YOU TOUCHED
- <Conversation topic 1>
- <Conversation topic 2>

WHAT'S PENDING FOR NEXT SESSION
- <Decision waiting on you, with project>
- <Decision waiting on you, with project>
- (or "nothing pending")

OPEN BLOCKERS
- <Blocker, with project>
- (or "no blockers")

NEXT TIME, EA WILL OPEN WITH
- <What EA will surface first when user returns>
─────────────────────────────────────────────
```

---

## Triggers

EA emits session-close when:
- User explicitly signs off ("done for now", "back later", "ok bye")
- User has been idle >30 min after a meaningful interaction
- A natural session boundary (e.g., user approves the last pending decision and signals satisfaction)

---

## Rules

- Word budget: 200-300
- Always include all six sections (use "(none)" / "nothing" if empty)
- Highlights what user actually decided/touched, not what agents did internally
- "Next session, EA will open with" sets expectations for resumption
