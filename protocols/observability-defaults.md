# Observability Defaults

**Owner:** Architect (Tier 1) — codification, per-stack appendix maintenance.
**Co-owners:** Quality Engineer (smoke-correlation rows), Ops/Security (audit-trail rows).
**Status:** Active 2026-05-07.

You can't fix what you can't see. Every project the agent company ships lands an observability layer before its first deploy — not as a nice-to-have, but as the minimum-viable platform without which production debugging becomes guesswork. This protocol fixes the layers as the default, regardless of stack.

The PRINCIPLE layer (§1–6) is universal. The INSTANTIATION layer (§Appendix) is per-stack and grows as the agent company onboards new client stacks.

---

## 1. The five required observability layers

Every project ships with these enabled before its first deploy. Layers 1, 2, and 3 are wired in CI; layers 4 and 5 are wired in the runtime.

| # | Layer | Industry term | What it answers | When to enable |
|---|---|---|---|---|
| 1 | **Request-ID propagation** | correlation IDs / trace IDs | "show me everything that happened during this one request" | First commit |
| 2 | **Structured logging** | JSON-line / semantic logs | "find all events matching <field=X> in the last <window>" | First commit |
| 3 | **Distributed tracing** | OpenTelemetry / spans | "where did this request spend its time?" | First commit |
| 4 | **Error tracking** | Sentry-equivalent OR DB-backed | "what's broken in production right now?" | First deploy |
| 5 | **Real-user monitoring (RUM)** | Vercel Analytics / Datadog RUM / PostHog | "what does my actual user experience look like?" | First deploy with a UI surface |

**Layers 1–3 are mandatory at first commit.** They cost ~30 min to wire and pay back the first time prod misbehaves.
**Layer 4 is mandatory at first deploy.** Catch errors before users report them.
**Layer 5 activates when there's a UI surface.** Headless services skip RUM.

---

## 2. Request-ID propagation (layer 1)

**Principle.** Every incoming HTTP request gets a stable identifier. The identifier flows through ALL downstream calls (logs, traces, errors, audit rows) so an operator can pivot from any one of them to the others.

**Lifecycle:**

```
1. Edge / proxy / load-balancer sets x-request-id IF a known one exists
   (AWS ALB, GCP Cloud Run, Vercel Edge — most modern infra does this).
2. The app's middleware:
   a. Reads x-request-id from the incoming request.
   b. Validates the shape (regex check — defends against log-poisoning).
   c. Generates a UUID v4 if missing or malformed.
   d. Forwards the resolved ID into the downstream request headers.
   e. Echoes it on the response headers so clients can correlate.
3. Every log line emitted during the request includes the ID.
4. Every span / trace emitted during the request is tagged with the ID.
5. Every error captured during the request stores the ID alongside.
6. Every audit row written during the request records the ID.
```

**Defensive validation is required at step 2b** — an attacker can supply an arbitrary `x-request-id` header. If your log format is JSON, a malicious header containing quote chars or curly braces could spoof additional fields on the line. Regex-validate to a known character set + max length; mint fresh on rejection.

**Storage shape across artifacts:**
- **Logs:** top-level `requestId` field on every JSON line
- **Traces:** span attribute `request.id` on the root span
- **Errors:** stored alongside the error record (e.g., `bug_reports.request_id` column or top-level field on the payload)
- **Audit rows:** same as errors

---

## 3. Structured logging (layer 2)

**Principle.** Logs are queryable data, not free text. Every log line is a JSON object with stable fields. Free-text in `msg`; everything else is named structured fields.

**Required fields on every line:**

```json
{
  "ts":        "2026-05-07T14:30:00.123Z",  // ISO 8601 UTC
  "level":     "info" | "warn" | "error" | "debug",
  "msg":       "human-readable summary, present tense or past tense",
  "requestId": "<uuid or undefined outside request context>",
  "env":       "production" | "preview" | "test" | "development"
}
```

**Per-event meta fields go alongside** — typed, named, queryable:
- ✅ `{ msg: "project_created", projectId: "abc-123", repoFullName: "user/repo" }`
- ❌ `{ msg: "Project abc-123 created at user/repo" }` (forces regex parsing on the consumer side)

**Discipline rules:**
1. **Never log secrets, tokens, OAuth codes, encryption keys, full request bodies.** The framework's sanitizer (or its per-stack equivalent) is what writes the log; never bypass it.
2. **Use `msg` as a topic key, not as a sentence.** `project_created` is searchable; `"Created project successfully!"` is not.
3. **Stream routing:** info/debug to stdout; warn/error to stderr. The platform's log collector cares about the JSON's `level` field MORE than the stream, but local dev benefits from the split.
4. **Logs NEVER throw.** If the logger itself fails (circular meta, non-serializable value), it falls back to a safe shape and emits the original message. Crashing because of a logging bug is unacceptable.

---

## 4. Distributed tracing (layer 3)

**Principle.** Every request produces a trace — a tree of timed spans showing where the request spent its time. Spans capture: route handlers, fetch / HTTP client calls, DB queries, queue operations, external service calls.

**The standard:** OpenTelemetry (OTel). Multi-language, multi-vendor, multi-backend. Every modern observability platform speaks OTel natively. Choose OTel; don't roll your own.

**Auto-instrumentation > manual instrumentation.** OTel ships SDKs for every major language that auto-wrap the standard library + popular HTTP clients + popular DB drivers. Use the auto-instrumentation as the default; add manual spans only for code paths the auto layer can't see (custom RPC, business-logic operations, etc.).

**Where the spans go:**
- **Free option for hosted projects:** the platform's native tracing surface (Vercel Observability, Cloud Run + Cloud Trace, etc.)
- **Cross-platform:** an OTLP endpoint pointing at Honeycomb / Datadog / Grafana Cloud / Tempo / SigNoz / etc.
- **Self-hosted:** Tempo or SigNoz running on your infra

**Sampling:** start at 100% sampling in dev; reduce in prod to control cost. 1-10% is typical for high-traffic services. Always-sample on errors (every error trace is captured even if the rest of the cohort is sampled out).

**No-op in dev/test.** When the OTLP endpoint isn't configured, the SDK emits nothing. This makes tracing safe to leave on in every environment without polluting logs or burning egress.

---

## 5. Error tracking (layer 4)

**Principle.** Every uncaught exception or 5xx response generates a structured error record with: error message, stack trace, request context (sanitized), request-ID, timestamp, environment.

**Two acceptable architectures:**

| Architecture | When to choose |
|---|---|
| **Third-party** (Sentry, Highlight, Rollbar, Bugsnag) | When you want a polished triage UI, alerting, deduplication, release-tracking out of the box |
| **DB-backed** (in-app `bug_reports` / `error_logs` table) | When data residency matters (regulated industries, on-prem deploys), or when you want errors as first-class data the rest of the app can act on |

The <project> reference uses the DB-backed pattern (the `bug_reports` table) because errors there need to be: queryable by ops, exposable to admin users, promotable to incidents, and never leave the project's data perimeter.

**Discipline rules:**
1. **Error records MUST include the request-ID.** Without it, you can't pivot to the matching trace or the matching log lines.
2. **Capture sanitizes BEFORE storing.** Strip Authorization / Cookie / x-* headers; redact secret-named body keys. The same sanitizer the logger uses.
3. **Best-effort writes; never throw.** If the DB insert fails (DB outage, network blip), the original error MUST still propagate to the user. The capture failure logs as a secondary error and the system stays correct.
4. **Capture status >= 500 only by default.** 4xx responses are user errors, not system errors. Capturing 4xx floods the table during normal operation.

---

## 6. Real-user monitoring (layer 5)

**Principle.** Synthetic monitoring tests one geo / one network condition / one user agent. Real users are everywhere, on every network, on every device. RUM samples the actual user experience.

**Two metric families:**

| Family | What it captures |
|---|---|
| **Page-view + custom events** | Where users go, what they do, conversion funnels |
| **Core Web Vitals** (LCP, INP, CLS, TTFB) | Real-user perceived performance |

**Privacy posture:** opt for cookie-less, privacy-respecting tools (Plausible, Vercel Analytics, Cloudflare Web Analytics, PostHog with no-cookie config). RUM doesn't need PII to be useful; the page paths + Core Web Vitals percentiles are sufficient signal. Don't use cookies-based analytics unless your privacy policy explicitly covers it AND your jurisdiction allows it.

**Activation timing.** Layer 5 activates when the project has a UI surface. Headless services (webhook receivers, internal APIs, daemons) skip RUM entirely.

---

## 7. Activation timing in the project state machine

| Stage | Layer | Trigger |
|---|---|---|
| `briefed → stratego` | None — too early | Tech-strategy hasn't picked the stack yet |
| `scoping → planned` | All layers **specified** in tech-strategy | Architect picks the stack-specific tools; QE validates the choices |
| `planned → coding` | Layers 1, 2, 3 **wired in** | First commit must already emit structured logs + propagate request-IDs + register OTel |
| `handed-off → shipped` | Layer 4 **active**; Layer 5 if UI exists | Required before the `shipped` transition |
| `shipped → measured` | All layers running on cadence | RUM dashboards reviewed weekly; trace samples reviewed during incidents |

A project transitioning to `coding` without layers 1–3 wired is a protocol violation. Conductor's preflight gate enforces.

---

## 8. Ownership and escalation

- **Architect (Tier 1)** picks the stack-specific tools at scoping; this protocol's appendix is the menu.
- **Conductor (per-project)** wires the chosen tools before `coding` starts; verifies via preflight gate.
- **Quality Engineer (Tier 1)** validates that smoke runs at `handed-off → shipped` actually exercise the layers — a smoke that passes but produces no traces / no logs is a layer regression.
- **Ops/Security (Tier 1)** owns the privacy review of what's logged + what's traced + what's RUM'd. Sanitizer review at scoping; periodic re-review.
- **Critic (Tier 1)** flags missing layers during PR review; treats absence of any of layers 1-3 as a blocking concern.

When a finding fires:
- **Layer 1 broken (request-IDs not propagating):** halts the next deploy; routes to Architect or assigned auth-axis agent for same-day triage.
- **Layer 2 schema regression** (a log line missing required fields): halts the next deploy; routes to whoever introduced the regression.
- **Layer 3 silent failure** (no spans emitted under load): warning; routes to Ops/Security for triage within 24h. Often a config issue (sampler dropped to 0%, OTLP endpoint stale).
- **Layer 4 silent failure** (errors happening but not captured): blocking. Routes to Ops/Security same-day.
- **Layer 5 silent failure:** advisory. Investigate within the week.

---

## 9. What this protocol deliberately does NOT do

- It doesn't replace **APM** for performance profiling. APM tools (Datadog APM, New Relic, Grafana Pyroscope) are profilers; OTel is a trace producer. The two compose; APM consumes OTel.
- It doesn't replace **incident response runbooks**. When prod breaks, observability is the data; the runbook is the procedure. Different artifact, different owner.
- It doesn't include **business analytics** (DAU/MAU, retention curves, funnel conversion). Those are GTM / Growth-Analyst territory; this protocol covers the engineering observability axis only.
- It doesn't include **uptime monitoring** (StatusPage / UptimeRobot / Pingdom). Different category — synthetic external probes vs internal instrumentation.

---

## Appendix — Per-stack instantiations

### A.1 Node.js / TypeScript on Vercel (current <project> reference)

| Layer | Tool | Wiring |
|---|---|---|
| 1. Request-ID propagation | Custom middleware | [src/middleware.ts](<project>/src/middleware.ts) — UUID v4 mint + regex validation + header echo |
| 2. Structured logger | Custom (no library — Vercel logs auto-parse JSON from console.log/error) | [src/lib/observability/logger.ts](<project>/src/lib/observability/logger.ts) |
| 3. Distributed tracing | `@vercel/otel` + `@opentelemetry/api` | [src/instrumentation.ts](<project>/src/instrumentation.ts) — auto-loaded by Next.js 15+ |
| 4. Error tracking | DB-backed via `bug_reports` table + `withErrorCapture` wrapper | [src/lib/error-capture.ts](<project>/src/lib/error-capture.ts) |
| 5. RUM | `@vercel/analytics` + `@vercel/speed-insights` | [src/app/layout.tsx](<project>/src/app/layout.tsx) — `<Analytics />` + `<SpeedInsights />` |

**Reference implementation:** [<project>](<project>) (2026-05-07 onwards; project formerly slugged <project>, renamed 2026-05-14 BL-059) — the empirical case study for this row.

### A.2 Node.js / TypeScript on AWS / GCP / non-Vercel hosting

| Layer | Tool |
|---|---|
| 1. Request-ID | Custom middleware (same shape as A.1) OR `cls-hooked` for cross-async-boundary propagation |
| 2. Logger | `pino` (fast, JSON-by-default, structured-by-default) |
| 3. Tracing | `@opentelemetry/sdk-node` + auto-instrumentations (`@opentelemetry/auto-instrumentations-node`) |
| 4. Errors | Sentry SDK OR `@opentelemetry/instrumentation` + custom DB write |
| 5. RUM | PostHog OR Cloudflare Web Analytics OR self-hosted Plausible |

### A.3 Python (Django, FastAPI, Flask)

| Layer | Tool |
|---|---|
| 1. Request-ID | `django-correlation-id` (Django) / FastAPI middleware / Flask `g.request_id` |
| 2. Logger | `structlog` (de-facto standard; emits JSON) |
| 3. Tracing | `opentelemetry-python` + auto-instrumentations |
| 4. Errors | Sentry SDK |
| 5. RUM | PostHog / Plausible / native if hosted on a platform that provides it |

### A.4 Go

| Layer | Tool |
|---|---|
| 1. Request-ID | `chi/middleware.RequestID` (chi router) / custom middleware (other routers) |
| 2. Logger | `slog` (stdlib since 1.21 — JSON handler is built in) OR `zap` |
| 3. Tracing | `go.opentelemetry.io/otel` + auto-instrumentations |
| 4. Errors | Sentry SDK OR custom |
| 5. RUM | (stack-independent — see A.2) |

### A.5 Ruby (Rails)

| Layer | Tool |
|---|---|
| 1. Request-ID | Rails built-in `ActionDispatch::RequestId` middleware |
| 2. Logger | `lograge` (JSON output) OR Rails `Rails.logger` with `Logger::Formatter::JsonFormatter` |
| 3. Tracing | `opentelemetry-ruby` + auto-instrumentations |
| 4. Errors | Sentry / Honeybadger / Bugsnag — Ruby has the broadest selection here |
| 5. RUM | (stack-independent) |

### A.6 Java / Kotlin (Spring, Micronaut)

| Layer | Tool |
|---|---|
| 1. Request-ID | Spring Sleuth / Spring Boot 3+'s built-in MDC integration |
| 2. Logger | Logback or Log4j 2 with JSON layout |
| 3. Tracing | `opentelemetry-java` + the Spring autoconfigure starter |
| 4. Errors | Sentry SDK |
| 5. RUM | (stack-independent) |

### A.7 Elixir (Phoenix)

| Layer | Tool |
|---|---|
| 1. Request-ID | Phoenix built-in `Plug.RequestId` |
| 2. Logger | `Logger` with `LoggerJSON` backend |
| 3. Tracing | `opentelemetry_phoenix` + `opentelemetry_ecto` |
| 4. Errors | Sentry / AppSignal |
| 5. RUM | (stack-independent) |

### A.8 .NET (C#)

| Layer | Tool |
|---|---|
| 1. Request-ID | ASP.NET Core's built-in `IHttpContextAccessor.HttpContext.TraceIdentifier` |
| 2. Logger | Serilog with JSON formatter |
| 3. Tracing | OpenTelemetry .NET + auto-instrumentations |
| 4. Errors | Sentry / Application Insights |
| 5. RUM | (stack-independent) |

### A.9 Rust (axum / actix-web)

| Layer | Tool |
|---|---|
| 1. Request-ID | `tower-http`'s `SetRequestId` + `PropagateRequestId` |
| 2. Logger | `tracing` + `tracing-subscriber` with JSON formatter |
| 3. Tracing | `tracing-opentelemetry` |
| 4. Errors | Sentry Rust SDK |
| 5. RUM | (stack-independent) |

### A.10 AI-app specific layers (forward — not yet codified)

AI applications need observability concerns traditional SaaS doesn't:
- **LLM call tracing** — every prompt + every model response logged with: model version, token counts, latency, cost
- **Cost telemetry** — cumulative per-user / per-project / per-day spend, surfaced as a real metric not just a billing line
- **Output quality monitoring** — sample of outputs scored for hallucination / off-topic / refusal patterns
- **Prompt-injection alerts** — known-bad-prompt-pattern matches in inbound user content

This row will be filled in by Architect + Quality Engineer when the first AI-application project enters scoping.

---

## Cross-references

- `App Development/.claude/protocols/security-scanning-defaults.md` — sibling protocol; observability + security scanning together form the operational backbone
- `App Development/.claude/protocols/stack-portability-map.md` — translation matrix this protocol's appendix participates in
- `App Development/.claude/agents/architect.md` — Tier 1 owner of this protocol
- `App Development/.claude/agents/quality-engineer.md` — co-owner for smoke-correlation rows
- `App Development/.claude/agents/ops-security.md` — co-owner for sanitizer + audit-trail rows
