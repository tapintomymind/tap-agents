# Question Bank — 05: Technical Assumptions

## Riskiest technical bet

- "What's the ONE technical assumption that, if wrong, kills the project?"
- "What technology in your stack have you NOT used before? That's almost certainly the riskiest bet."
- "Have you confirmed the riskiest piece works at the scale and shape you need it to? Not 'in theory' — confirmed?"
- "What part of the build are you most nervous about? Trust that nervousness — it's signal."

## Hidden complexity

- "What part of this are you assuming will be 'easy'? Easy is a yellow flag. Auth is rarely easy. Billing is rarely easy. Real-time is rarely easy. Multi-tenant is rarely easy."
- "If you sketched the data model right now, how many entities would there be? How many relationships? Anything >5 entities for an MVP needs justification."
- "What's the failure mode if your third-party API rate-limits, goes down, or changes its terms?"

## Data access

- "What data does this product need? Where does it come from? Do you have rights to use it that way?"
- "If you're scraping or aggregating from another service, is that compliant with their ToS?"
- "If you need user-generated data, what's the cold-start problem? How does the product feel when there's no data?"

## Third-party dependencies

- "List every external API, SaaS, or service this product depends on. For each: pricing, rate limits, ToS implications, and what breaks if they go away."
- "Is any third-party dependency a single point of failure? What's the fallback?"
- "Are you relying on free tiers that won't scale with usage? When does that bite?"

## Auth, payments, hosting baseline

- "Is auth in v1? Magic-link, OAuth, password? Pick one or argue for none."
- "Are payments in v1? Stripe Checkout for subscriptions? One-time? None?"
- "Hosting decision — Vercel/Fly/AWS/self-host? This is often deferred to scaffold but worth noting if you have a strong preference."

## Performance and scale

- "What's the expected concurrent user count for v1? 10? 100? 10,000? Each requires different choices."
- "Is there a real-time component (chat, live updates, websockets)? That's a substantial complexity adder."
- "Is there a batch/background-job component (scheduled crawls, data processing)? Need a queue?"

## What you've already built

- "Have you tried any of this before? What worked, what didn't?"
- "Is there code, designs, or a prototype to start from?"

## Pushback Triggers

If user gives:
- "Should be straightforward" → push for the riskiest bet
- "I'll figure it out" → push for which library / API / approach specifically
- A stack they've never used + an ambitious MVP → flag risk explicitly
- "Just use AI to do it" → push for what specifically and what failure mode
