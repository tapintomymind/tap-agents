# Competitor Deep Dive — {{competitor name}}

**Profiled:** {{ISO date}}
**Profiler:** industry-researcher
**Source-grade distribution:** {{primary count}} primary | {{secondary count}} secondary | {{tertiary count}} tertiary
**Re-verification deadline:** {{ISO date + 90 days}}
**Composes with:** `workspace/{{slug}}/prd.md` rev {{N}}, `workspace/{{slug}}/research-industry.md` (if exists), `workspace/{{slug}}/competitive-positioning-{{ISO-date}}.md` (Strategist addendum if any)

---

## §1. Snapshot

- **Vendor / origin:** {{company / project name + origin}}
- **Founded / launched:** {{year}}
- **Funding / funding stage:** {{if disclosed; cite source}}
- **Market segment focus:** {{B2B / B2C / enterprise / SMB / specific vertical}}
- **Geographic reach:** {{regions / markets}}
- **Why they are in this analysis:** {{one-line rationale — what makes this competitor relevant to `{{our product}}`'s positioning}}

Cite every claim in this section per `protocols/citation-protocol.md`. Source-quality tags `[primary]` (official site, regulatory filings, official press, GitHub releases for OSS) / `[secondary]` (news coverage, analyst reports with named author) / `[tertiary]` (unverified blog posts, Reddit threads, anonymous reviews — use sparingly; explicitly tag).

---

## §2. Feature matrix vs `{{our product}}`

| Feature | `{{our product}}` | {{competitor}} | Notes |
|---|---|---|---|
| {{feature 1}} | {{Y / N / partial}} | {{Y / N / partial}} | {{differentiator + citation}} |
| {{feature 2}} | {{Y / N / partial}} | {{Y / N / partial}} | {{differentiator + citation}} |
| {{feature 3}} | {{Y / N / partial}} | {{Y / N / partial}} | {{differentiator + citation}} |
| ... | ... | ... | ... |

Author 5–15 feature rows depending on competitive surface depth. Keep rows aligned to `{{our product}}`'s MVP-IN list + V-roadmap; do not enumerate competitor-only features that have no analogue in our scope unless they signal a strategic threat.

---

## §3. Moat decomposition

**Lead with WHY the competitor wins or loses in their segment — feature parity is supporting evidence, not the headline.** For each moat dimension, write one line of assessment + the citation grade tag.

- **Network effects:** {{assessment}} `[primary | secondary | tertiary]`
- **Switching costs:** {{assessment}} `[primary | secondary | tertiary]`
- **Brand / mindshare:** {{assessment}} `[primary | secondary | tertiary]`
- **Distribution channel:** {{assessment}} `[primary | secondary | tertiary]`
- **Data network / aggregation:** {{assessment}} `[primary | secondary | tertiary]`
- **Regulatory moat (if applicable):** {{assessment}} `[primary | secondary | tertiary]`
- **Pricing power:** {{assessment}} `[primary | secondary | tertiary]`
- **Implementation friction (workflow lock-in):** {{assessment}} `[primary | secondary | tertiary]`

**Composite moat verdict:** {{one line — what is the strongest moat the competitor has? What is the weakest? Where can `{{our product}}` enter without colliding with the strongest moat?}}

---

## §4. Pricing (if disclosed)

- **Pricing model:** {{per-seat / per-event / tiered / freemium / per-API-call / other}}
- **Tier shape:** {{list tiers + price points if public, e.g., "Starter $X/mo, Pro $Y/mo, Enterprise $contact"}}
- **Disclosed customer list:** {{if any — name customers from official case studies / press}}
- **Comparison to `{{our product}}` pricing:** {{competitive position — lower / higher / different model}}

If pricing is NOT disclosed publicly: state explicitly + cite the lack-of-disclosure as a signal (private pricing usually = enterprise sales motion + custom contracts).

**Note for pricing-related OQs:** any OQ this profile surfaces about `{{our product}}`'s own pricing carries `decision_class: commercial` per `protocols/decision-class-taxonomy.md` §3 (resolver is C-level, NOT operator). Industry-researcher does NOT propose `{{our product}}`'s prices — surfaces the competitive context only.

---

## §5. Public-roadmap signal

Where the competitor has published roadmap signals (changelogs, blog posts, conference talks, GitHub releases for OSS competitors, earnings calls for public companies), summarize what's coming in the next 1–2 quarters and the strategic read.

- {{signal 1}} — source: {{link}} `[primary | secondary]` — strategic implication for `{{our product}}`: {{one-line read}}
- {{signal 2}} — source: {{link}} `[primary | secondary]` — strategic implication for `{{our product}}`: {{one-line read}}
- ... (3–6 signals typical depending on roadmap visibility)

If the competitor publishes nothing — state explicitly + treat the silence as a signal (private development cadence; harder to monitor; watch-list events §6 do more work).

---

## §6. Watch-list events

Enumerate events that would shift competitive position. Industry-researcher monitors these monthly per `agents/industry-researcher.md` monitor-watch sub-flow. Each event composes with one of the project's `R-*` competitive risks (in Architect's risk register).

| Event | Detection mechanism | If triggered: strategic implication | Composes with risk |
|---|---|---|---|
| {{event 1, e.g., "competitor launches feature X"}} | {{detection — e.g., "monthly grep of competitor blog feed + changelog"}} | {{shift to MVP-IN priority / V-roadmap / new risk}} | `R-{{N}}` |
| {{event 2, e.g., "competitor changes pricing tier"}} | {{detection}} | {{implication}} | `R-{{N}}` |
| {{event 3, e.g., "competitor announces partnership with vendor Y"}} | {{detection}} | {{implication}} | `R-{{N}}` |
| ... | ... | ... | ... |

Author 3–8 events. Each event must be empirically detectable — "vibes" or "general competitive pressure" are not watch-list events; named, monitorable, public signals are.

---

## §7. Sources cited

| Source | Type | Grade | Date accessed |
|---|---|---|---|
| {{URL or citation}} | {{official site / news / analyst / customer review / GitHub / SEC filing / conference talk}} | `[primary]` / `[secondary]` / `[tertiary]` | {{ISO date}} |
| {{URL or citation}} | {{...}} | `[primary]` / `[secondary]` / `[tertiary]` | {{ISO date}} |
| ... | ... | ... | ... |

**Source-grade distribution check:** the header field at top of this artifact must match the count in this table. Industry-researcher's Operating Principles enforce a minimum primary-source count per profile — re-verification is gated on grade distribution.

**Dead-link check:** every URL listed must be live at the access date. If a URL has gone dead during a re-verification pass, mark the row `[dead-link {{ISO date}}]` and re-source if possible; if not, note as a research debt for next pass.

---

## §8. Open Questions (if any)

Per `protocols/decision-class-taxonomy.md` §4, every OQ carries `decision_class`. Industry-researcher's OQs typically classify `operational` (data not findable, source disputed) or `commercial` (escalates pricing questions to C-level). Author per schema:

### OQ-{{id}}: {{one-line question}}

- **Decision class:** `operational | strategic | commercial | clinical | legal`
- **Resolver:** {{Operator | C-level | Clinical advisor | Legal}}
- **Recommendation:** {{one-line preferred answer + reasoning}}
- **Blocks:** {{list — what downstream agent waits on this; for ESCALATED classes, name the workaround that lets dispatch proceed}}
- **Decision class reasoning (one line if non-obvious):** {{...}}

Omit this section entirely if no OQs (cardinal-zero rule per other framework artifacts).

---

## §9. Composes with

- `workspace/{{slug}}/research-industry.md` synthesis when ≥2 competitors are profiled (industry-researcher's roll-up artifact)
- `workspace/{{slug}}/competitive-positioning-{{ISO-date}}.md` (Strategist addendum per `protocols/prd-addendum-pattern.md`)
- `workspace/{{slug}}/scope.md` V-roadmap items per `protocols/v2-roadmap-anchoring.md` (this profile feeds the V-anchor `Wrong-path risk` field for competitor-facing V-items)
- `workspace/{{slug}}/tech-strategy.md` §"Architecture-now V-anchors" per `protocols/v2-roadmap-anchoring.md` §5 (competitor watch-list events trigger re-evaluation of anchored V-items)
- `workspace/{{slug}}/workstream-index.md` per `protocols/workstream-index.md` (this profile is a Reading-order entry under the competitive-positioning workstream)

---

*Template version 1.0 (introduced 2026-05-18 via framework-feedback-2026-05-18 Phase C). Cites `agents/industry-researcher.md` Operating Principles for source-quality grading + watch-list-event monthly cadence. Profile re-verification deadline at top + dead-link check in §7 enforce the framework's "monitor, not just snapshot" discipline.*
