# Stack Portability Map

**Owner:** Architect (Tier 1) — codification, per-stack column maintenance.
**Co-owners:** Quality Engineer (test/security rows), Ops/Security (security-scanning rows).
**Status:** Active 2026-05-07.

The agent company supports multiple client stacks. Most of the framework's value lives at the **principle layer** (universal); concrete implementations live at the **instantiation layer** (per-stack). This document is the translation matrix between the two — when a new client engages the company, this map is the single artifact that answers "what does this client's stack look like in our framework's terms?"

---

## How to use this map

### When starting a new project on a known stack

1. Read the **principle layer** (§1) — these are the framework concepts every project lands.
2. Read the **per-stack column** for the client's stack (§3) — copy the concrete tools and patterns for each row.
3. If the column is incomplete, the project's first task is to fill it. The Architect agent owns this; Ops/Security and Quality Engineer review.

### When starting a new project on an unknown stack

1. Architect adds a new column for the stack with the rows from §1 mapped to the stack's idioms.
2. The first project on that stack becomes the reference implementation; subsequent projects copy from it.
3. After the column lands, the agent-changelog records the activation so future onboarding is faster.

### When a tool in a column changes (a CVE, a deprecation, a better alternative)

1. Ops/Security or Architect (depending on the row) updates the cell.
2. Document the migration path in the cell's footnote.
3. Each active project in that stack receives a `capability-request` reportback proposing the migration; the project's Conductor decides timing.

---

## §1. Principle layer — what's universal

Every project the agent company builds lands the rows below. The implementation differs per stack, but **the row's existence is non-negotiable** unless explicit waiver from Architect + Ops/Security at scoping.

### A. Test infrastructure

| # | Row | Principle |
|---|---|---|
| A1 | **CI test gate** | Every PR runs the test suite; failures block merge. Wall time budget: 5-10 min for fast suite, can be longer for integration / e2e in separate gates. |
| A2 | **Pre-commit hook** | Local feedback loop. Runs typecheck + secret scan + fast unit tests. Wall time budget: < 10s (above which commit habit erodes). |
| A3 | **Unit tests** | Test the function under test against its boundaries. Mock at the LIBRARY boundary (the boundary-mock pattern), never at the database/network. |
| A4 | **Integration tests** | Run against a real instance of the system's persistent layer (DB / queue / etc.) on an isolated test environment. Hostname-based safety guards refuse to run against prod. |
| A5 | **End-to-end tests** | Drive the deployed surface as a user would. Uses the test-only auth-bypass pattern for headless authentication. |
| A6 | **Property-based tests** | For pure parsers, validators, regexes, and any function with a wide input space. Catches edge cases hand-written examples miss. |
| A7 | **Performance benchmarks** | For hot-path security primitives (HMAC, crypto, hashing) and any latency-budgeted code path. Informational baseline; not a CI gate by default. |
| A8 | **Mutation testing** | For security-critical primitives. Run on-demand (heavyweight). Score >= 80% target for security primitives. |
| A9 | **Visual regression** | For UI-bearing projects. Runs at design-spec finalize and at handed-off → shipped. |
| A10 | **Coverage thresholds with ratchet** | Set 3pp below baseline at first test landing. Ratchet upward whenever a PR raises coverage. Never lower to make a PR pass. |

### B. Security scanning (the five layers per `protocols/security-scanning-defaults.md`)

| # | Row | Principle |
|---|---|---|
| B1 | **SAST** | Per-PR; severity Critical+High blocks merge. |
| B2 | **SCA / dependency scanning** | Per-PR + weekly auto-PRs for security updates. |
| B3 | **Secret scanning** | Pre-commit hook (primary) + CI gate (defense-in-depth). |
| B4 | **License compliance** | Allowlist, not denylist. Block merge on disallowed licenses. |
| B5 | **DAST** | Pre-deploy + nightly. Activates when public surface exists. |

### O. Observability (the five layers per `protocols/observability-defaults.md`)

| # | Row | Principle |
|---|---|---|
| O1 | **Request-ID propagation** | Every request gets a stable correlation ID flowing through logs, traces, errors, audit rows. |
| O2 | **Structured logging** | JSON-line shape with stable fields (ts, level, msg, requestId, env). Queryable, never throws. |
| O3 | **Distributed tracing (OTel)** | Auto-instrumentation by default. Spans for routes, fetch, DB, queues. No-op when endpoint absent. |
| O4 | **Error tracking** | Captures every uncaught exception + 5xx response. Sanitized; correlated to request-ID; never throws on capture failure. |
| O5 | **Real-user monitoring (RUM)** | Activates when UI surface exists. Privacy-respecting; cookie-less by default. Captures Core Web Vitals + page views. |

### C. Org / process

| # | Row | Principle |
|---|---|---|
| C1 | **Test-required gate at coding → review** | Conductor refuses milestone advancement until new source files have spec coverage. |
| C2 | **Incident → regression test** | Every incident in `memory/incidents.md` has a paired regression test path (or explicit "untestable — manual review only" justification). |
| C3 | **Threat-model → test** | Every threat in `threat-model.md` has a paired test (or explicit "manual review only" justification). |
| C4 | **Quality Engineer's two insertion points** | Test-plan at scoping; smoke-report at handed-off → shipped. |
| C5 | **Ops/Security's two insertion points** | Threat-model at scoping; security audit at handed-off → shipped. |

---

## §2. The case-study layer — what doesn't travel

These bind to a specific stack's idioms. They live in project memory + as case studies under principle-layer entries in `memory/test-patterns.md` / `memory/runtime-gotchas.md`. **They're load-bearing for the projects that hit them, but they don't become part of the framework template.**

Examples (from <project>'s empirical record:
- Drizzle's `db.batch` vs `db.transaction` runtime semantics on neon-http
- Drizzle's table-name accessor (`getTableName(table)` vs `table._.name`)
- Vitest's `Promise.all` racing a sync `shift()` queue (the principle is universal; the empirical case is Vitest-specific)
- Next.js's `cookies()` async signature in v15 (case study under "test-only auth-bypass pattern")

The discipline rule: **before a finding lands as a new principle, ask "would this pattern apply to a different language/stack?" If yes, write the principle entry first; the finding is its first case study. If no, it's a case study under an existing principle.**

---

## §3. Per-stack instantiations

Each column below maps the principle-layer rows to concrete tools/libraries/code-shapes for a specific stack. Cells can read "—" (not applicable to this stack) or "*see footnote*" (non-trivial enough to warrant a longer explanation).

### Test infrastructure

| Row | Node/TS (current reference) | Python | Go | Ruby (Rails) | Java/Kotlin | Elixir (Phoenix) | .NET (C#) | Rust |
|---|---|---|---|---|---|---|---|---|
| **A1 CI test gate** | GitHub Actions + Vitest | GHA + pytest | GHA + `go test` | GHA + RSpec | GHA + JUnit / Spock | GHA + ExUnit | GHA + xUnit / NUnit | GHA + `cargo test` |
| **A2 Pre-commit hook** | husky + lint-staged | pre-commit (framework, [pre-commit.com](https://pre-commit.com)) | pre-commit + `go test -short` | overcommit gem | pre-commit + Maven/Gradle | pre-commit + `mix test --stale` | pre-commit + dotnet-test on changed projects | pre-commit + `cargo test` |
| **A3 Unit tests** | Vitest / Jest | pytest + unittest | `testing` package | RSpec / Minitest | JUnit 5 / Spock | ExUnit | xUnit / NUnit / MSTest | `#[test]` + `#[cfg(test)]` |
| **A4 Integration tests** | Vitest with `@vitest-environment node` against test DB | pytest with `pytest-django` / fixtures + test DB | testcontainers-go | `database_cleaner` + RSpec system specs | testcontainers-java | ExUnit + Ecto.Adapters.SQL.Sandbox | xUnit + Testcontainers .NET | testcontainers-rs |
| **A5 E2E tests** | Playwright | Playwright (Python) / Selenium | rod / chromedp | Capybara + Selenium | Selenium / Playwright | Wallaby / Hound | Playwright | thirtyfour |
| **A6 Property-based tests** | fast-check | hypothesis | gopter / quick-go | rantly / propcheck-rb | jqwik / kotest | StreamData / propcheck | FsCheck | proptest / quickcheck |
| **A7 Performance benchmarks** | `vitest bench` / mitata / tinybench | pytest-benchmark / asv | `go test -bench` | benchmark-ips | JMH | Benchee | BenchmarkDotNet | criterion-rs |
| **A8 Mutation testing** | StrykerJS | mutmut / mutpy / cosmic-ray | gremlins-go | mutant gem | PIT (PIT mutation testing) | mutator | Stryker.NET | mutagen-rs |
| **A9 Visual regression** | Playwright + screenshot diff | Playwright (Python) screenshot | rod screenshot diff | Capybara screenshot diff | Selenium / Playwright screenshot | Wallaby screenshot | Playwright screenshot | thirtyfour screenshot |
| **A10 Coverage thresholds** | `coverage.thresholds` in vitest.config.ts | `[tool.coverage.report] fail_under = N` | `go test -cover` + custom CI parser | SimpleCov `minimum_coverage` | JaCoCo plugin thresholds | ExCoveralls + minimum_coverage | coverlet.collector + threshold | tarpaulin + threshold |

### Security scanning

| Row | Node/TS | Python | Go | Ruby | Java/Kotlin | Elixir | .NET | Rust |
|---|---|---|---|---|---|---|---|---|
| **B1 SAST** | CodeQL | bandit + Semgrep | gosec + Semgrep | Brakeman | SpotBugs+FSB / Semgrep | Sobelow + Credo | Roslyn Security Analyzers / Semgrep | cargo-audit + Semgrep |
| **B2 SCA** | Dependabot + `npm audit` | Dependabot + pip-audit | govulncheck + Dependabot | bundler-audit + Dependabot | OWASP Dependency-Check | mix deps.audit + Dependabot | dotnet list package --vulnerable | cargo-audit |
| **B3 Secret scanning** | gitleaks | gitleaks | gitleaks | gitleaks | gitleaks | gitleaks | gitleaks | gitleaks |
| **B4 License compliance** | license-checker | pip-licenses | go-licenses | license_finder | license-maven-plugin | hex_licenses | dotnet-license-detector | cargo-deny |
| **B5 DAST** | OWASP ZAP | OWASP ZAP | OWASP ZAP | OWASP ZAP | OWASP ZAP | OWASP ZAP | OWASP ZAP | OWASP ZAP |

(B5 is the same tool everywhere because DAST operates on the deployed HTTP surface, not on source code.)

### Observability

| Row | Node/TS (Vercel) | Node/TS (other hosting) | Python | Go | Ruby | Java/Kotlin | Elixir | .NET | Rust |
|---|---|---|---|---|---|---|---|---|---|
| **O1 Request-ID** | Custom Next.js middleware | `cls-hooked` or framework-built-in | `django-correlation-id` / FastAPI middleware | `chi/middleware.RequestID` | Rails `ActionDispatch::RequestId` (built-in) | Spring Sleuth / built-in MDC | Phoenix `Plug.RequestId` (built-in) | ASP.NET Core `TraceIdentifier` (built-in) | `tower-http` SetRequestId |
| **O2 Structured logging** | Custom logger over console (Vercel parses JSON) | `pino` | `structlog` | `slog` (stdlib) or `zap` | `lograge` or Logger JSON formatter | Logback JSON layout | `LoggerJSON` backend | Serilog JSON | `tracing` + JSON subscriber |
| **O3 Distributed tracing** | `@vercel/otel` | `@opentelemetry/sdk-node` + auto-instrumentations | `opentelemetry-python` + auto-instrumentations | `go.opentelemetry.io/otel` + auto-instrumentations | `opentelemetry-ruby` | OpenTelemetry Java + Spring autoconfigure | `opentelemetry_phoenix` + `opentelemetry_ecto` | OpenTelemetry .NET | `tracing-opentelemetry` |
| **O4 Error tracking** | DB-backed (`bug_reports` table) OR Sentry | Sentry / DB-backed | Sentry / DB-backed | Sentry / custom | Sentry / Honeybadger / Bugsnag | Sentry | Sentry / AppSignal | Sentry / Application Insights | Sentry Rust SDK |
| **O5 RUM** | `@vercel/analytics` + `@vercel/speed-insights` | PostHog / Cloudflare Web Analytics / Plausible | (stack-independent — same row) | (stack-independent) | (stack-independent) | (stack-independent) | (stack-independent) | (stack-independent) | (stack-independent) |

### Boundary-mock harness shape (the per-stack instantiation of the boundary-mock pattern)

| Stack | Mock at this boundary | Library pattern |
|---|---|---|
| Node/TS + Drizzle (any driver) | `db.select() / .insert() / .update() / .delete() / .batch() / .transaction()` chain | record into structured state; mirror atomic primitives. See [<project> fake-db.ts](<project>/tests/unit/_helpers/fake-db.ts) (path reflects post-2026-05-14 BL-059 cascade-rename; was `<project>/`). |
| Node/TS + Prisma | `prisma.<model>.<method>` | per-model mock object with method-spies |
| Node/TS + Kysely | `db.selectFrom() / .insertInto()` chain | same shape as Drizzle |
| Python + SQLAlchemy | `session.query(Model)` / `session.execute()` | `MagicMock` chains |
| Python + Django ORM | `Model.objects.<method>` | patch per-test or use `pytest-django` test DB |
| Ruby + ActiveRecord | (atypical — use real test DB via `database_cleaner`) | RSpec + transactional fixtures |
| Java + JPA / Hibernate | `EntityManager` / `JpaRepository` interface | Mockito on the repository interface |
| Elixir + Ecto | `Repo.<method>` | swap Repo via `Mox` (behaviour-based mocks) |

### Auth-bypass pattern (per-stack instantiation)

| Stack / auth shape | Bypass instantiation |
|---|---|
| Node/TS + OAuth + session cookie | `getSession()` returns dummy session when `TEST_AUTH_BYPASS=1 && NODE_ENV !== 'production'`. (current <project> reference |
| Node/TS + JWT-only | Verify resolver short-circuits a test-signed JWT with reserved `iss=test-bypass` claim |
| Node/TS + API key | Test resolver accepts a `Bearer test-bypass-key` token in non-prod |
| Python + Django | `request.user` returns a `TestUser` instance via middleware that checks `settings.TEST_AUTH_BYPASS and not settings.IS_PROD` |
| Ruby + Rails + Devise | Override `authenticate_user!` in test env to return a fixture user; `Rails.env.production?` blocks |
| Magic link / passwordless | Bypass the email step — directly mint the post-link session/JWT for the test user |
| WebAuthn | Test-only credential preregistered; or mock the credential-store boundary |
| SAML / SSO | SAML responses are signed by the IdP — for tests, either run a test IdP (heavy) or short-circuit the assertion validation in non-prod |

---

## §4. AI-application specific rows (forward — pattern row not yet codified)

The agent company increasingly builds AI applications. AI apps have testing/security concerns traditional SaaS doesn't, and the tooling landscape is immature. Tracked here so the rows are filled when the first AI-application project enters scoping.

| Row | Principle | Tooling status |
|---|---|---|
| **AI1 Prompt-injection testing** | Adversarial inputs against the project's prompts | `garak`, `promptfoo`, manual fuzzing — landscape evolving fast |
| **AI2 LLM output validation** | Sanitize / validate LLM outputs before persisting / displaying / executing | depends on output type — JSON schema validators, output parsers |
| **AI3 AI-cost / budget testing** | Per-user / per-day / per-project budget caps tested in CI; runaway-token-loop detection | DIY (no standard tool) |
| **AI4 Model-drift testing** | Assertions on model behavior that may quietly change across model versions | DIY or `promptfoo` |
| **AI5 PII at LLM boundaries** | Don't accidentally send user PII to a third-party LLM provider | DIY pre-flight checks; prompt-injection-style scans on outbound payloads |

This row will be filled in by Ops/Security + Quality Engineer when the first AI-application project enters scoping. Until then, treat it as a known-incomplete row.

---

## §5. Cross-references

- `App Development/.claude/protocols/security-scanning-defaults.md` — the five-layer security protocol this map's row B references
- `App Development/.claude/memory/test-patterns.md` — pattern entries this map's rows reference
- `App Development/.claude/memory/runtime-gotchas.md` — case-study entries this map's columns reference
- `App Development/.claude/agents/architect.md` — Tier 1 owner of this map; per-stack column maintenance
- `App Development/.claude/agents/ops-security.md` — co-owner for security rows
- `App Development/.claude/agents/quality-engineer.md` — co-owner for test/quality rows
- `App Development/.claude/agents/_planned/test-engineer.md` — when activated, takes over fake-DB harness column maintenance

---

## §6. Maintenance discipline

- **Every cell with content has an empirical case study OR a deliberate-untested mark.** No speculative "I think this would work" cells. If the cell is unverified, mark it `[unverified]` and the next project on that stack verifies it.
- **When a tool deprecates / a CVE drops / a better alternative emerges**, the cell is updated by Ops/Security or Architect. The agent-changelog records the migration.
- **When a new stack is added**, the column is initially populated by the project's Architect; QE and Ops/Security review at the project's scoping → planned transition.
- **When a row is added** (a new framework concept, e.g., AI-app testing rows above), Architect proposes; Org Designer reviews; Ops/Security + QE validate the security/quality dimensions.
- **Annual review**: Org Designer surfaces the matrix at year-end. Stale cells, missing rows, deprecated tools — all get triaged.

---

## §7. What this map deliberately does NOT do

- It doesn't tell you HOW to wire each tool — that's per-project work, with the cell pointing to the canonical reference implementation.
- It doesn't pre-judge stack choices — Architect picks the stack at tech-strategy; this map informs, doesn't dictate.
- It doesn't include all stacks — it includes the stacks the agent company has empirical experience with, plus rows for the most common asks. New stacks land as new columns when needed.
- It doesn't replace per-project documentation — each project's `.claude/docs/` still owns its own setup walkthroughs. This map answers "what tools" not "how to wire them in our specific project."
