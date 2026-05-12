---
name: critic
description: Direct invocation of Critic. Force a review pass on a specific artifact, or do an unscheduled review of a project's current state.
---

# /critic

Force Critic to review.

## Usage

```
/critic [optional: project slug or artifact path]
```

Without args: Critic reviews the most-recently-updated artifact across active projects.
With slug: Critic reviews all artifacts in that project.
With path: Critic reviews that specific artifact.

## When to Use

- You want a fresh review pass before approving a checkpoint
- You suspect Critic missed something in last review
- You're testing the agent

## What You Get

Critic appends to `workspace/<slug>/critic-notes.md`. EA surfaces relevant findings.

## See Also

- `/status` — see Critic flags as part of full briefing
- `/queue` — Critic's blocking concerns appear here as decisions
