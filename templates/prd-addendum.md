# {{addendum title}}

**Status:** Draft addendum to `prd.md` rev {{N}}; not a PRD rewrite
**Date:** {{ISO date}}
**Author:** {{strategist | architect | other}}
**Relationship to PRD:** This document supplements PRD §{{X}} ({{section name}}), §{{Y}} ({{section name}})... It does not modify the live PRD text; downstream feature briefs may cite either.
**Trigger:** {{which addendum trigger fires — parallel frame / decision-packet trail / time-stamped moment, per `protocols/prd-addendum-pattern.md` §3}}

---

## §1. Citation index

| PRD §  | Section name        | This addendum's relationship |
|--------|---------------------|------------------------------|
| §{{X}} | {{section name}}    | Supplements with {{frame}}   |
| §{{Y}} | {{section name}}    | Supplements with {{frame}}   |

---

## §2. {{First body section — e.g., "Market context" / "Competitive landscape" / "Regulatory situation"}}

<Cite every claim per `protocols/citation-protocol.md`. Use `[research <URL>]`, `[seed]`, `[user]`, `[brief]`, `[inference]`, `[assumption]` tags as appropriate.>

---

## §3. {{Second body section — e.g., "Implications for product" / "Quick-wins to seed scope" / "Risks for Architect"}}

<Body content. If the addendum surfaces Open Questions, classify each per `protocols/decision-class-taxonomy.md` §3 (`operational | strategic | commercial | clinical | legal`). Addendum OQs do NOT inherit from the PRD's OQ list — they are a parallel decision surface per `protocols/prd-addendum-pattern.md` §3-addendum-2 trigger.>

---

## §4. {{Additional body sections as needed}}

...

---

## §N. Open Questions (if any)

<Use the OQ schema per `protocols/decision-class-taxonomy.md` §4:>

### OQ-{{id}}: {{one-line question}}

- **Decision class:** `operational | strategic | commercial | clinical | legal`
- **Resolver:** {{Operator | C-level | Clinical advisor | Legal}}
- **Recommendation:** {{one-line preferred answer + reasoning}}
- **Blocks:** {{list — which downstream work is gated on this OQ; for ESCALATED classes, list the engineering workaround that unblocks instead}}
- **Decision class reasoning (one line if non-obvious):** {{...}}

---

## §N+1. Composes with

- `prd.md` rev {{N}} (canonical product narrative — NOT modified by this addendum)
- {{other addenda this composes with, if any}}
- {{relevant Architect or Designer artifacts, e.g., `scope.md`, `tech-strategy.md`, design specs}}
- {{relevant Decision Packets, e.g., `decision-packet-{{addendum-topic}}-{{ISO-date}}.md`}}

---

*Authored per `protocols/prd-addendum-pattern.md` v1.0. Header conventions, classification rule, and forbidden behaviors specified in that protocol. Critic reviews the addendum-vs-revision choice per `agents/critic.md` Phase B `addendum_vs_revision` axis.*
