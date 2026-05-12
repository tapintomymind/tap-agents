# Playbook (STUB) — Pivot From Feedback

Structured workflow for when user feedback warrants a meaningful product pivot.

## Build When

First feedback-driven pivot occurs. Likely after Feedback Synthesizer is activated.

## Provisional Purpose

Different from `seed-to-mvp` (greenfield) and `validate-feature-idea` (additive). This handles meaningful direction changes driven by feedback that contradicts the original PRD.

## Provisional Steps

1. Feedback Synthesizer surfaces pivot signal
2. Strategist evaluates: is this a feature add, or a real pivot?
3. If real pivot:
   - Side-state existing project to `pivoted`
   - Spawn new project with `pivoted_from` reference
   - Intake re-engages with new context (carries forward lessons)
   - Strategist writes new PRD
   - Architect writes new scope
4. Decision: continue old in parallel, deprecate, or migrate users

## Prerequisites

- Feedback Synthesizer activated
- Project at `measured` or beyond
- Real feedback that signals pivot (not just complaints)

## Status: Not Yet Built

Wait until first real pivot. Don't speculate the playbook in advance.
