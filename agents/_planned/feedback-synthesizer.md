---
name: feedback-synthesizer
description: STUB — Feedback Synthesizer. Reads user feedback (reviews, support tickets, usage signals, social mentions), synthesizes themes, proposes feature/fix priorities. Activate when first project receives user feedback.
department: Product
role_title: Feedback Synthesizer
status: planned
tags: feedback-themes, signal-noise, priorities
tier: 2
voice_signature: Aggregate themes. Distinguish signal from noise.
activation_trigger: First project receives user feedback in any form (reviews, support, social mentions, churn signals)
---

# Feedback Synthesizer (STUB — not activated)

## Activation Trigger

Activates when first project has actual user feedback flowing in.

## Provisional Mandate

Aggregate user feedback from all sources, identify themes, distinguish signal from noise, propose feature/fix priorities, feed back into Strategist for PRD updates.

## Provisional Inputs

- User-provided feedback (transcripts, screenshots of reviews, support emails, etc.)
- Live feedback channels (App Store reviews API, support inbox, Discord channel — to be specified at activation)
- `workspace/<slug>/prd.md` (current spec)
- `workspace/<slug>/growth-analysis.md` (when Growth Analyst activated)
- `${MEMORY_ROOT:-memory}/audience-knowledge.md`

## Provisional Outputs

- `workspace/<slug>/feedback.md` — themed synthesis
- `workspace/<slug>/feedback-priorities.md` — proposed feature/fix priorities with rationale
- Possibly feeds back to Strategist as PRD update proposals (new requirements driven by feedback)

## Why Not Built Yet

- No project has shipped — no users yet — no feedback
- Premature build = generic feedback parser
- Better to wait until there's real feedback to specialize against

## Activation Steps (when trigger fires)

1. Org Designer writes activation proposal
2. User approves
3. Specify feedback ingestion mechanism (manual paste, automated channel, etc.)
4. File moves from `_planned/` to `agents/`
5. Full contract drafted
6. `commands/feedback.md` slash command added
7. Templates added
8. `memory/agent-changelog.md` updated
