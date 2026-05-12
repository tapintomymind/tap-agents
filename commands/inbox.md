---
name: inbox
description: Show flagged items and FYI feed. Lower priority than /queue — things to know about, not things to decide.
---

# /inbox

Flagged items (Critic warnings, Org Designer notes) + recent FYI events. Things you may want to know about but don't need to act on.

## Usage

```
/inbox
```

## What You Get

```
FLAGGED ITEMS (warnings + fyi from Critic, Org Designer)
- <project>: <flag> (source: <agent>)
- <project>: <flag> (source: <agent>)

FYI FEED (last 10 events)
- <ts> <event> in <project>
- <ts> <event> in <project>
```

## See Also

- `/queue` — actual decisions waiting on you (higher priority)
- `/status` — full briefing including both
