# Question Bank

Intake's question library. Organized by the 8 dimensions of the intake brief (+ a reserved 9th).

## Why a Bank, Not a Long Prompt

If all questions lived in `agents/intake.md`, the prompt would bloat past 1000 lines and lose focus. Instead, Intake reads only the dimensions it needs to interrogate based on what's missing in the seed.

## How Intake Uses This Bank

1. Intake scores each dimension as `clear / partially clear / missing` based on the seed and memory
2. For `missing` and `partially clear` dimensions, Intake reads the matching dimension file
3. Intake selects 1-3 questions per turn from the dimension files
4. Questions are picked for *what's missing*, not exhaustively

## Hard-Hitting Style Reminder

Generic questions get generic answers. Specific, evidence-demanding questions force concrete thinking. Each dimension file holds questions in **the hard-hitting style** — specific, named-things-not-categories, evidence-required.

Bad: "Who is your target user?"
Good: "If you had to text the launch link to 50 specific people on day one, who are they — name a real persona, not a demographic."

## Files

- `01-problem-clarity.md` — who has the problem, why it persists
- `02-scope-discipline.md` — MVP definition, explicit cuts
- `03-success-definition.md` — concrete metrics, win condition
- `04-users-and-distribution.md` — first 10 users, channels
- `05-technical-assumptions.md` — riskiest bets, dependencies
- `06-constraints.md` — budget, platform, compliance
- `07-existing-state.md` — prior work, lessons
- `08-decision-rights.md` — approvers, reversibility
- `09-compliance-and-legal.md` — reserved 9th dimension (activate when patterns warrant)

## Growing the Bank

After every project, Intake's self-retro (`memory/intake-retros.md`) may surface new questions worth adding. Org Designer reviews proposals and adds to the appropriate dimension file. New dimensions (a 10th, 11th) require explicit Org Designer + user approval.
