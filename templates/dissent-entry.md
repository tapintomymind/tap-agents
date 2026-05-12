# Dissent Log Entry

**Format used in `workspace/<slug>/dissent-log.md`** — append-only log of user overrides, agent disagreements, and rejected alternatives.

---

```
─────────────────────────────────────────────
<YYYY-MM-DD HH:MM>
Type: <critic-override | conductor-routing-override | architect-stack-override | conflict-resolution-override | flag-dismissed-without-addressing>
Project: <project-slug>
Source: <agent or system that raised concern>

ORIGINAL CONCERN
"<verbatim concern from agent>"

USER DECISION
<accept / override / pick alternative>

USER REASONING
"<verbatim user explanation, or "no reason given">"

AGENT AGREED?
<yes — issue resolved | no — agent maintains concern>

WILL REVISIT AT
<state-machine phase that auto-checks this, OR "user-triggered review", OR "never">

CONSEQUENCE IF AGENT WAS RIGHT
<one sentence — what bites if this concern materializes>
─────────────────────────────────────────────
```

---

## Type Reference

| Type | When |
|---|---|
| `critic-override` | User dismisses Critic blocking concern at any point |
| `critic-override-at-checkpoint` | User dismisses Critic concern as part of hard checkpoint approval |
| `conductor-routing-override` | User specifies different agent than Conductor recommended |
| `architect-stack-override` | User picks different stack than Architect recommended |
| `architect-cut-restored` | User adds back feature Architect cut from MVP |
| `conflict-resolution-override` | User accepts contradiction rather than resolving it |
| `tier2-promotion-rejected` | User rejects Tier 2's promotion-request reportback |
| `flag-dismissed-without-addressing` | User dismisses agent flag without resolution |
| `org-designer-proposal-rejected` | User rejects Org Designer's proposed team change |

---

## Rules

- Append-only — never edit prior entries (corrections go in new entries)
- Verbatim where possible — paraphrasing loses signal
- "Will revisit at" — be specific; "never" is allowed but Org Designer reviews patterns of "never" entries
- "Consequence" — write the actual bad outcome, not "may cause issues"
- Org Designer reads this log periodically; recurring override patterns trigger team-shape proposals
