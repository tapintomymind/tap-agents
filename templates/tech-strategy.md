# Tech Strategy — <project-name>

**Date:** <ISO timestamp>
**Author:** Architect (agent invocation reference)
**Source PRD:** `workspace/<slug>/prd.md`
**Source scope:** `workspace/<slug>/scope.md`
**Status:** `[WIP]` | draft | approved
**Approved at:** <timestamp + verbatim approval, or blank>

---

## 1. Stack Pick

| Layer | Technology | Reasoning |
|---|---|---|
| Frontend | <e.g., Next.js 15 / SwiftUI / vanilla HTML> | <why this matches PRD constraints + memory/stack-preferences> |
| Backend | <e.g., Next.js API routes / FastAPI / Rails> | <why> |
| Database | <e.g., Postgres + Drizzle / SQLite / Firestore> | <why> |
| Auth | <e.g., Clerk / NextAuth / OAuth direct> | <why> |
| Hosting | <e.g., Vercel / Fly / self-hosted> | <why> |
| Third-party APIs | <e.g., Spotify Web API / Stripe> | <why and what licensing/access required> |

**Cited inputs:** `[prd §9 constraints]` `[memory/stack-preferences.md]` `[brief: Technical Assumptions]`

---

## 2. Architecture Style

<Pick one: monolith / modular monolith / microservices / serverless / static-first / etc.>

**Why this style for this project:**
<Specific reasoning grounded in PRD constraints and scope. Brief — 2-3 sentences.>

**Anti-pattern to avoid:**
<What you specifically don't want — e.g., "we're not building a microservices platform; we're building a v1 app">

---

## 3. Riskiest Technical Bets

Per the brief and the chosen stack, the top risks where mitigation must be planned now.

### Risk 1: <Description>
- **Severity:** high | medium | low
- **First exercised at:** Milestone X
- **What breaks if it doesn't work:** <Concrete impact>
- **Mitigation:** <Strategy — typically prototype-first, fallback path, or scope-cut option>
- **Detection:** <How we'll know early if this is going wrong>

### Risk 2: <Description>
- **Severity:** ...
- **First exercised at:** ...
- **What breaks:** ...
- **Mitigation:** ...
- **Detection:** ...

### Risk 3: <Description>
...

---

## 4. Data Model (high level)

<Sketch of primary entities and relationships. Not full schema — that's Tier 2's job.>

```
<Entity1>
  - field
  - field
  → relation to <Entity2>

<Entity2>
  - field
  - field
```

---

## 5. External Dependencies

| Dependency | Version | Access required | Cost (est.) | License compatibility |
|---|---|---|---|---|
| <SaaS / API> | <version or "latest"> | <key, OAuth, partner agreement> | <free/paid> | <yes/no/check> |
| <Library> | <version> | <none / npm / etc.> | <free> | <license> |

**Cited inputs:** `[research <URL>]` for each external service.

---

## 6. Defaults Tier 2 May Adjust

Tier 2 has authority to swap these without re-approval:
- Specific libraries within chosen stack (e.g., date library, validation library)
- ORM specifics if Drizzle picked
- Test framework
- Local dev tooling

Tier 2 must escalate before changing:
- Top-level stack layer (DB, hosting, auth provider)
- Architecture style
- Adding/removing external API dependency
- Changing the agreed risk-mitigation approach

---

## 7. Tier 2 Agent Set (to be generated)

Based on chosen stack, Architect will generate these Tier 2 agents at scaffold time:

- `tier2-conductor.md` — project state machine
- `<stack>-architect.md` — implementation-level architecture decisions
- `<component-framework>-agent.md` — component/UI work (if frontend)
- `<db>-agent.md` — database work
- `deployment-agent.md` — release / deploy
- `<other>-agent.md` — additional roles per stack template

Generated from `templates/stacks/<chosen-stack>/`. If the stack has no template, Architect notes the gap and generates a baseline set.

---

## 8. Open Questions

<Items Architect couldn't resolve at planning time — flagged for Tier 2 or for re-engaging Strategist>

- <Question>: <context, deferral target>

---

## 9. Out of Scope for THIS Document

- Specific implementation patterns within the chosen stack (Tier 2)
- File structure / repo layout (Tier 2)
- Specific test cases (Tier 2)
- CI/CD pipeline specifics (Tier 2 + deployment agent)

---

## Sign-off

- Architect self-check complete: <yes>
- Critic review pass complete: <yes/no, see critic-notes.md>
- Citations verified: <yes/no>
- Stack pick justified vs `memory/stack-preferences.md`: <yes/no>
- User approved: <yes/no, timestamp, verbatim approval>
