# Critic Review

**Format used by Critic in `workspace/<slug>/critic-notes.md`** — append-only log of all Critic reviews with severity-tagged concerns. Each pass starts with a YAML envelope per `protocols/outcome-grading.md`; structured prose follows.

---

## Pass: <YYYY-MM-DDTHH:MM:SSZ>

````yaml
result: satisfied  # one of: satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade
revision_attempts: 0
max_revision_attempts: 2
rubric_source: workspace/<slug>/<artifact.md>  # the artifact section under review
criteria_evaluated:
  - id: CR-1
    description: <one-line criterion description — extracted from the artifact's section structure>
    status: pass  # one of: pass | fail | partial | not_tested
    evidence: <file:line OR cited section>
    severity: not_applicable  # one of: P0 | P1 | P2 | not_applicable
findings_summary:
  P0: 0
  P1: 0
  P2: 0
  notes: 0
verdict: GREEN-LAND-NOW  # one of: GREEN-LAND-NOW | LAND-WITH-FOLLOWUPS | BLOCK
followup_items_filed: []  # populated when verdict == LAND-WITH-FOLLOWUPS
````

[Structured prose review continues below the YAML envelope.]

```
─────────────────────────────────────────────
CRITIC REVIEW — <YYYY-MM-DD HH:MM>
Artifact reviewed: <path/to/artifact.md>
Trigger: <new-artifact | artifact-updated | consistency-check-flagged | user-requested>
Reviewer: <Critic agent invocation reference>

CITATION AUDIT
✓ All claims tagged
✓ All [research] tags have URLs
✓ All [user] tags have line references
[OR list violations]

GROUND-TRUTH CHECK
✓ No contradictions vs seed.md
✓ No contradictions vs intake-brief.md (approved)
[OR list contradictions]

CROSS-ARTIFACT CHECK
✓ No contradictions with <other artifact 1>
✓ No contradictions with <other artifact 2>
[OR list contradictions]

CONCERNS (<count>)

⚠ BLOCKING — "<concern>"
  Where: <file:section>
  Reason: <why this is blocking>
  Suggested resolution: <what would clear it>

⚠ WARNING — "<concern>"
  Where: <file:section>
  Reason: <why this matters>
  Suggested resolution: <what would address>

ⓘ FYI — "<concern>"
  Where: <file:section>
  Note: <observation>

[Repeat per concern]

OVERALL ASSESSMENT
<One sentence — "Artifact ready for transition", "Producer revision required", "User decision required for blocking concerns">

CITED LESSONS-LEARNED PATTERNS
<If a known failure pattern from memory/lessons-learned.md applies, cite it>
─────────────────────────────────────────────
```

---

## Severity Reference

| Severity | Behavior |
|---|---|
| **Blocking** | Transition is blocked. Producer revises OR user explicitly overrides (logs to dissent-log.md). |
| **Warning** | Transition can proceed; surfaced in next Decision Packet under "CRITIC FLAGS". |
| **FYI** | Logged here; not surfaced unless user requests. |

## Severity Calibration

Critic must self-check severity assignment. Default rule:

- **Blocking** = "if this isn't addressed, the project will fail OR contradict ground truth OR violate a load-bearing constraint"
- **Warning** = "this likely costs us something later — quality, time, scope clarity — but doesn't break the project"
- **FYI** = "minor observation, may inform future decisions, doesn't require action"

If everything is `blocking`, calibration is broken. If nothing is, Critic is asleep.

---

## Rules

- Append-only — never edit prior reviews (subsequent reviews can supersede or close concerns)
- Always run citation audit FIRST before content concerns
- Never produce primary content — only critique
- Use `[WIP]` artifacts as input but distinguish them from finalized artifacts in the review header
- Cite lessons-learned where applicable; this is what makes Critic compound across projects
- Severity must be defensible — Org Designer reviews calibration over time
