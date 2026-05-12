# Question Bank — 09: Compliance and Legal

**Reserved 9th dimension. Activate when projects start hitting compliance/legal issues that should have been caught at intake.** Org Designer codifies activation; this file holds starter questions.

## Status: stub

This dimension is not yet activated by default. Intake activates it when:
- The seed mentions regulated domains (finance, health, legal, education-with-minors, gambling, etc.)
- The product handles user-generated content with redistribution
- The product depends on third-party APIs with restrictive ToS
- Org Designer recommends activating based on prior project misses

## Starter Questions

### Regulatory / industry compliance

- "Is this regulated by a specific body — SEC, FDA, FCC, GDPR authorities, something industry-specific?"
- "Do you need licenses or certifications to operate (financial services, medical, legal advice, real estate)?"
- "Are you handling personal data of children under 13 (COPPA implications)?"

### Third-party ToS

- "Are you scraping, aggregating, or redistributing data from another service? Is that within their ToS?"
- "If you're using an API, are there usage restrictions — non-commercial only, attribution required, no derivative works?"
- "Music / video / image content — do you have rights to use it the way you're planning?"

### Data privacy

- "What user data are you collecting? Why?"
- "Where do users live? GDPR (EU), CCPA (California), PIPEDA (Canada), other regional rules?"
- "How long are you retaining data? What's the deletion mechanism?"
- "Are you sharing data with third parties (analytics, error reporting, marketing)? Disclosed how?"

### Payments

- "Are you taking money? PCI considerations?"
- "Are you a marketplace (handling money between parties)? Significantly more complex regulatorily."
- "Are you a SaaS? Tax considerations vary by jurisdiction."

### Content moderation

- "If users can post content, what's your moderation strategy?"
- "Section 230 (US) protections — do they apply to your model?"
- "Are you potentially hosting illegal or harmful content (CSAM, defamation, IP infringement)?"

### Liability

- "What's the worst case if your product gives bad output (medical, financial, legal advice)? Are there liability disclaimers needed?"
- "Are you OK being sued if a user misuses the product?"

## Pushback Triggers

If user gives:
- "We don't need to worry about that" → push for which jurisdiction users are in
- "I'll get a lawyer later" → push: this can affect PRD scope, so flag now
- A regulated industry without compliance plan → flag as `[open]` for explicit user override

## Activation Note

When this dimension is activated for a project, mark in `intake-brief.md`:
> Compliance & Legal dimension activated for this project (reason: <X>).

When activation becomes routine, Org Designer proposes elevating it from "reserved" to "always-on."
