# Citation Protocol

**Every claim in every agent artifact must be cited.** Untagged claims are hallucinations by definition. Critic enforces this on every review pass.

## Tags

| Tag | Meaning | Required attribute |
|---|---|---|
| `[seed]` | Direct from the original brief (`seed.md`) | None |
| `[user]` | Stated by user in conversation | Line reference: `[user @ conversation-log L42]` |
| `[brief]` | From `intake-brief.md` | Section name: `[brief: Problem Clarity]` |
| `[research]` | Found via WebSearch / WebFetch | URL: `[research https://example.com/foo]` |
| `[inference]` | Agent's reasoning from cited inputs | At least one preceding cited input within same section |
| `[assumption]` | Agent guessed; explicitly flagged for user review | Brief reason: `[assumption: typical industry baseline, no source]` |

## Format

Cite **at the end of the sentence** containing the claim, before the period:

> "Spotify Web API has a rate limit of 1000 requests per minute per app `[research https://developer.spotify.com/documentation/web-api/concepts/rate-limits]`."

Multiple citations are allowed and encouraged when claims combine sources:

> "MVP target users are music fans aged 18-34 `[brief: Users and Distribution]`, which Strategist sized at ~50M in the US `[research https://example.com/demographics]` `[inference]`."

## When Tags Combine

- `[inference]` requires at least one *other* cited input in the same paragraph or section. Pure inference with no source is `[assumption]`.
- `[assumption]` items should always be enumerated in the artifact's "Open questions / assumptions" section so user can address them at the next checkpoint.
- `[research]` URLs must be live at time of writing. Critic flags dead links on next review.

## What MUST be cited

- All factual claims (numbers, market sizes, technical specs, competitive landscape)
- All product decisions tied to user input ("user said X")
- All technical recommendations tied to constraints ("PRD requires browser support, hence web-first")
- All risk assessments ("this could break because…")
- All references to past projects or memory entries

## What does NOT need a tag

- Section headers
- Pure structural language ("This document covers...", "Next section...")
- Templated boilerplate
- Lists where each item is individually cited

## Critic's Citation Audit

Critic's **first review pass on any artifact** scans for:
1. Untagged claims → flagged as `blocking` until cited or downgraded to `[assumption]`
2. `[research]` without URL → `blocking`
3. `[user]` without line reference → `warning` (encouraged but not strict)
4. Dead `[research]` URLs → `warning`
5. Excessive `[assumption]` density → `fyi` ("artifact is >30% assumptions; consider re-engaging Intake")

## Examples

### Good

> "Target users are music fans aged 18-34 in the US `[brief: Users and Distribution, confirmed]`. Strategist estimates this at ~50M people `[research https://www.census.gov/data/tables/2024/demo/age-and-sex.html]` `[inference]`. Distribution channels validated by user as TikTok and Reddit `[user @ conversation-log L23]`. Initial cohort: 50 named beta users from user's Twitter network `[user @ conversation-log L31]`."

### Bad

> "Target users are music fans 18-34. There are about 50M of them in the US. They use TikTok and Reddit. We'll start with 50 beta users."

(No citations. Critic blocks until each claim is tagged.)

### Marginal — fixable

> "Target users are music fans 18-34 `[brief: Users and Distribution]`. Strategist estimates ~50M `[assumption: typical industry baseline, no source]`."

(`[assumption]` is acceptable but should be enumerated for user review. Better: replace with `[research]` + URL when verified.)

## Citation Discipline as Anti-Drift

Citations are the system's primary defense against hallucination. The discipline is:

1. **Producers cite** as they write
2. **Critic audits** before transitions
3. **Conductor's consistency check** verifies cross-artifact citation consistency (e.g., PRD's `[brief]` references match brief content)
4. **User sees** all `[assumption]` items in Decision Packets

Without citations, the team gradually drifts away from ground truth. With strict citations, drift is visible and recoverable.
