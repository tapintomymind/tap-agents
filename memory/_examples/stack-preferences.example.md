# Stack Preferences — Example

Default tech picks per project type. Architect consults this as starting point. Override only with citation.

> **Format:** `- <Project type>: <stack> — <reasoning>` with provenance noted.

---

## Web app, solo build, fast iteration

- Frontend: Next.js (latest stable) + Tailwind
- Backend: Next.js API routes (or tRPC if API contracts complex)
- DB: Postgres + Drizzle ORM (or SQLite + Drizzle for very small projects)
- Auth: Clerk for MVP; NextAuth if cost matters or self-host required
- Hosting: Vercel
- — Established in `example-onboarding-rebuild`, 2025-11. Worked well.

## Mobile-first consumer

- React Native + Expo for cross-platform
- Native (Swift / Kotlin) only if specific platform features needed beyond Expo's reach
- — Established in `example-podcast-app`, 2025-08. Expo's restrictions on background audio became blocker; ejected to native.

## AI / LLM-heavy

- Backend: Python + FastAPI
- Frontend: Next.js (separate)
- LLM: Anthropic SDK directly (Claude API), not a wrapper framework
- DB: Postgres + pgvector if embeddings needed
- — Established in `example-tools-cli`, 2025-09. Anthropic SDK > LangChain for direct control.

## CLI tool

- Bun (TypeScript) for speed of development + single-binary distribution
- Or Python if data-science-heavy
- — Established in `example-tools-cli`, 2025-09.

## Anti-patterns (cite when avoiding)

- ❌ Firebase for anything serious — vendor lock-in, hard to migrate. Use only for prototypes I'll throw away.
- ❌ GraphQL for solo work — overhead doesn't pay off below team-size N.
- ❌ Microservices for v1 — until you have a team and a scaling problem, monolith.
- ❌ MongoDB for relational data — Postgres is the default unless there's specific reason.

## Fresh research required

- Stacks I haven't used before
- AI/ML infrastructure beyond direct LLM SDK
- Mobile native (less recent experience)
- — Architect should `[research]` rather than draw from this file when stack is unfamiliar.
