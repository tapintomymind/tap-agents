---
name: queue
description: Show the cross-project decisions queue. Just the decisions waiting on you, sorted by priority.
---

# /queue

Decisions waiting on you, across all projects, sorted by priority.

## Usage

```
/queue
```

## What You Get

```
DECISIONS QUEUE (cross-project, sorted by priority)
1. <project>: <decision> — <since when>
2. <project>: <decision> — <since when>
3. ...
```

EA pulls from `workspace/_global/ea-feed.md` plus per-project queues. Sort order:
1. Project priority (`state.json.priority`)
2. Age (older first)
3. Dependency (blocking another project goes first)

To act on an item, just say what you decide ("approve #1", "let's discuss #2").

## See Also

- `/status` — full briefing including queue
- `/inbox` — flagged items + FYI (lower priority than decisions)
