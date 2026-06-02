# Security Scanning Defaults

**Owner:** Ops/Security (Tier 1) — codification, enforcement across projects, per-stack appendix maintenance.
**Status:** Active 2026-05-07.

Modern SaaS deployments ship five automated security-scanning layers. This protocol fixes them as the default for every new project the agent company builds, regardless of stack. Builders coming from "I just want to ship" mindset commonly under-invest here — the framework's job is to make the default safe, not to leave the choice up to whoever's building this week.

The PRINCIPLE layer (§1–6) is universal. The INSTANTIATION layer (§Appendix) is per-stack and grows over time as the agent company onboards new client stacks.

---

## 1. The five required scanning layers

Every project ships with these enabled before its first deploy. Each layer is a CI gate, not advisory — failures block PR merge.

| # | Layer | Industry term | What it catches | Latency tolerance |
|---|---|---|---|---|
| 1 | **Static application security testing** | SAST | Injection, taint flow, dangerous patterns, dataflow vulnerabilities visible in source | Per-PR — should complete in <10 min |
| 2 | **Software composition analysis** | SCA / dependency scanning | Known CVEs in third-party packages | Daily + per-PR |
| 3 | **Secret scanning** | git-secrets / leak detection | Credentials, tokens, private keys committed to source | Pre-commit hook + CI gate |
| 4 | **License compliance scanning** | license scanning | GPL contamination in commercial code, attribution-required licenses, prohibited licenses | Per-PR |
| 5 | **Dynamic application security testing** *(when public surface exists)* | DAST | Runtime vulnerabilities a static analyzer can't see (auth bypass, business-logic flaws, server misconfig) | Pre-deploy + nightly |

**Layers 1–4 are mandatory at first deploy. Layer 5 activates when the project has a public-facing surface** (an authenticated marketing page, a public API, anything reachable from the open internet). Until that surface exists, DAST has nothing to scan.

---

## 2. Scope split — what each layer is responsible for

- **SAST** is offense-focused: "where could an attacker exploit our code?" Catches injection vectors, broken authn/authz patterns, unsafe deserialization.
- **SCA** is supply-chain focused: "what's already broken in code we didn't write?" Most production breaches in modern SaaS originate in dependencies, not in original code.
- **Secret scanning** is hygiene-focused: "did we commit something that, in isolation, would compromise the system?" Different from SAST — SAST looks at code shape; secret scanning looks at literal byte patterns matching credential formats.
- **License scanning** is legal-focused, not security per se, but lives here because the tooling overlaps with SCA.
- **DAST** is runtime-focused: "what does the deployed system actually expose?" Catches what static tools can't — server misconfigs, working but insecure endpoints, business-logic flaws.

These are NOT redundant — each layer catches things the others can't. A project that ships only SAST is incomplete; a project that ships only SCA is incomplete. The layers compose.

---

## 3. Activation timing in the project state machine

These layers are wired in at specific lifecycle stages, not all at once:

| Stage | Layer | Trigger |
|---|---|---|
| `briefed → stratego` | None — too early | Tech-strategy hasn't picked the stack yet; no concrete tools to wire |
| `scoping → planned` | All five **specified** in tech-strategy + threat-model | Architect picks the stack-specific tools; Ops/Security validates against this protocol |
| `planned → coding` | Layers 1, 2, 3, 4 **wired in** to the project's CI | First commit must already pass these gates |
| `handed-off → shipped` | Layer 5 (DAST) activated **if** the project has a public surface | Required before the `shipped` transition; hard gate |
| `shipped → measured` | All five running on cadence | Daily SCA / weekly DAST / per-PR SAST + secret + license |

A project transitioning to `coding` without layers 1–4 wired is a protocol violation. Conductor's preflight gate enforces.

---

## 4. Configuration discipline

Each layer has standard configuration choices that travel across stacks. The principles here are stack-agnostic; the tools that implement them are in the Appendix.

### SAST configuration

- **Rulesets:** baseline + security-focused ruleset for the stack. Don't ship a project on the default-only ruleset; defaults catch syntax errors, security rulesets catch vulnerabilities.
- **Severity thresholds:** Critical + High block PR merge. Medium reports to PR comments. Low/Info aggregate into a quarterly review by Ops/Security.
- **False-positive triage:** every suppression is reviewed, signed (commit message must explain), and re-evaluated quarterly. Default-suppress is a smell.

### SCA configuration

- **Severity thresholds:** Critical + High block PR merge OR are auto-PRed by the dependency-update bot if a fixed version exists. Medium reports to a triage queue. Low aggregates.
- **Update cadence:** dependency-update bot runs at least weekly. Auto-merge minor + patch security updates after CI passes. Major updates require human review.
- **Lockfile commitment:** every project commits its lockfile (the tools depend on it). No "we don't need a lockfile here" — that's a security regression.

### Secret scanning configuration

> **Posture (authoritative ordering):** the CI gate is the authoritative, non-bypassable checkpoint; the pre-commit hook is a best-effort fast-feedback convenience layered on top. Earlier revisions of this section described the pre-commit hook as "the primary guard" that "prevents the commit" with CI merely "catching what slipped." That overstated the local layer: a pre-commit hook can be bypassed (`--no-verify`), may be uninstalled, and — critically — can **silently fail to fire in fresh `git worktree` checkouts** (see *Worktree caveat*). Treat the two layers as: **CI = authoritative gate that must run on every PR; pre-commit = best-effort up-front catch.**

- **Pre-commit hook (best-effort):** runs locally as the *fast-feedback* guard so secrets are caught up-front, before they land in commit history (much harder to remove from history than to prevent up-front). It is **best-effort, not authoritative** — bypassable via `--no-verify`, absent if uninstalled, and (without the worktree fix below) silently inactive in fresh worktrees. Never rely on it as the sole gate.
- **CI gate (authoritative):** the CI secret scan is the *authoritative* checkpoint — it cannot be locally bypassed and **must run on every pull request before merge, on every protected target branch.** Because the normal feature flow targets an integration branch (here: `dev`), not `main`, the CI trigger MUST include `pull_request` to the integration branch — NOT only `main`. Otherwise a PR into the integration branch is unscanned at PR time and a committed secret is caught only *after* merge, on the branch `push` event — by which point it is already in shared history and already warrants rotation. The CI gate also runs on `push` to protected branches as a backstop for commits that arrive outside the PR flow (direct/admin push). *(<project>: `.github/workflows/gitleaks.yml` triggers on `pull_request: [dev, main]` and `push: [dev, main]`.)*
- **Worktree caveat (git + husky):** when the pre-commit hook is installed via husky (or any tool that sets `core.hooksPath` to a generated, git-IGNORED directory such as `.husky/_`), the hook will **silently NOT fire in fresh `git worktree` checkouts** that never ran `npm install`. `core.hooksPath` lives in the shared `.git/config` and is a relative path, so every worktree resolves it against its OWN root; the generated `_` dir is absent there, so git finds no hooks directory and runs no hook — no error, no `--no-verify` needed. Projects that do most implementation in worktrees MUST point `core.hooksPath` at a **git-TRACKED** hooks directory (e.g. `.husky` itself, with a self-contained hook script that does not depend on the generated `_` runtime) so the guard is present in every checkout. *(<project>: `scripts/setup-hooks.mjs` — the `prepare` script — pins `core.hooksPath=.husky`; `.husky/pre-commit` is self-contained and runs gitleaks as a system binary so the scan works even with no `npm install`.)* Even with this fix, the pre-commit hook remains best-effort and the **CI gate remains authoritative.**
- **History scan:** on first activation, scan the full git history. Any historic secret found is rotated before the project ships, even if its value isn't currently in HEAD.

### License scanning configuration

- **Allowlist, not denylist:** specify the licenses your project ACCEPTS (e.g., MIT, Apache-2.0, BSD-3-Clause, ISC). Anything outside the allowlist requires explicit justification per dependency.
- **GPL handling:** if the project is closed-source, GPL/AGPL/LGPL dependencies are blocked at the CI gate. If the project is open-source, the project's license must be GPL-compatible OR the dependency is rejected.

### DAST configuration

- **Authenticated and unauthenticated passes:** unauthenticated catches the public-surface vulnerabilities; authenticated (via a test account) catches authenticated-user vulnerabilities.
- **Test-account scope:** the DAST account has the same permissions as a typical user. It does NOT have admin/operator scope — those tests are manual.
- **Cadence:** pre-deploy on every release candidate; nightly against staging.

---

## 5. Ownership and escalation

- **Ops/Security (Tier 1)** owns this protocol, the per-stack appendix, and enforcement across all projects. Findings from any layer route to Ops/Security for triage.
- **Architect (Tier 1)** picks the stack-specific tools at scoping; Ops/Security validates the choices against the protocol.
- **Conductor (per-project)** wires the chosen tools into CI before `coding` starts; verifies via preflight gate.
- **Critic (Tier 1)** flags missing layers during PR review; treats absence of any of layers 1-4 as a blocking concern.
- **Quality Engineer (Tier 1)** verifies the gates fire correctly during smoke-test pass at `handed-off → shipped`.

When a finding fires:
1. **Critical:** halts the PR; routes to Ops/Security for same-day triage; resolves before merge.
2. **High:** halts the PR; routes to Ops/Security for triage within 48h; resolves before merge.
3. **Medium:** comments on the PR; Ops/Security reviews on a weekly cadence; resolves on the next sprint.
4. **Low/Info:** aggregates into a quarterly review.

---

## 6. Out of scope (deliberately)

- **Manual penetration testing.** Different beast — episodic, by humans, scoped to a specific risk model. Lives in Ops/Security's threat-modeling charter, not here.
- **Compliance frameworks** (SOC 2, ISO 27001, etc.). The scanning layers above are necessary infra for compliance but compliance attestation is a separate workstream.
- **Bug bounty programs.** Different category of finding — researcher-driven, payment-attached, requires a public disclosure policy.
- **Threat modeling.** Owned by Ops/Security at scoping; produces `threat-model.md`. Each threat in that doc should ideally have a test (per the incident-to-test protocol — pending). Scanning catches what threat modeling missed; threat modeling catches what scanning can't see.

---

## Appendix — Per-stack instantiations

Each row below is a concrete tool choice for a given stack family. The PRINCIPLE columns (what each tool does) match §1 above. Tools change over time; the principle layer doesn't. Update this appendix as the agent company onboards new stacks or as the tooling landscape shifts.

### A.1 Node.js / TypeScript (current <project> reference

| Layer | Tool | Wiring |
|---|---|---|
| SAST | **CodeQL** (GitHub-native, free for public repos, mature TS rules) | `.github/workflows/codeql.yml` (auto-generated by GitHub `Actions → New workflow`) |
| SCA | **Dependabot** (GitHub-native) + `npm audit` (CI) | `.github/dependabot.yml` for auto-PRs; `npm audit --audit-level=high` in CI |
| Secret | **gitleaks** (mature, fast, ships pre-built rules) | Pre-commit hook (`.husky/pre-commit`, fired via tracked `core.hooksPath=.husky` — see §4 Worktree caveat) + `.github/workflows/gitleaks.yml` (`pull_request: [dev, main]` + `push: [dev, main]`) |
| License | **license-checker** or **FOSSA** | Pre-build script that fails on disallowed licenses |
| DAST | **OWASP ZAP** (free) or **Burp Suite Professional** (paid) | Nightly scheduled GHA against staging URL |

**Reference implementation:** [<project>](<project>) (2026-05-07 onwards) — the empirical case study for this row.

### A.2 Python (Django, FastAPI, Flask)

| Layer | Tool | Notes |
|---|---|---|
| SAST | **bandit** + **Semgrep** with `r/python.security` ruleset | bandit for Python-idiom checks; Semgrep for the broader vulnerability ruleset |
| SCA | **pip-audit** + **Dependabot** | pip-audit reads requirements.txt / Pipfile.lock / uv.lock |
| Secret | **gitleaks** | Same tool, same config approach as Node |
| License | **pip-licenses** | `pip-licenses --fail-on=GPL` style |
| DAST | **OWASP ZAP** | Same as Node |

### A.3 Go

| Layer | Tool |
|---|---|
| SAST | **gosec** + **Semgrep** with `r/go.security` |
| SCA | **govulncheck** (official, queries the Go vuln DB) + **Dependabot** |
| Secret | **gitleaks** |
| License | **go-licenses** |
| DAST | **OWASP ZAP** |

### A.4 Ruby (Rails)

| Layer | Tool |
|---|---|
| SAST | **Brakeman** (Rails-specific, mature) |
| SCA | **bundler-audit** + **Dependabot** |
| Secret | **gitleaks** |
| License | **license_finder** |
| DAST | **OWASP ZAP** |

### A.5 Java / Kotlin (Spring, Micronaut, Quarkus)

| Layer | Tool |
|---|---|
| SAST | **SpotBugs + Find Security Bugs** plugin OR **Semgrep** with Java ruleset |
| SCA | **OWASP Dependency-Check** OR **Snyk Open Source** + **Dependabot** |
| Secret | **gitleaks** |
| License | **license-maven-plugin** |
| DAST | **OWASP ZAP** |

### A.6 Elixir (Phoenix)

| Layer | Tool |
|---|---|
| SAST | **Sobelow** (Phoenix-aware) + **Credo** (style + smaller security checks) |
| SCA | **mix deps.audit** + **Dependabot** |
| Secret | **gitleaks** |
| License | **hex_licenses** |
| DAST | **OWASP ZAP** |

### A.7 .NET (C#)

| Layer | Tool |
|---|---|
| SAST | **Roslyn Security Analyzers** + **Semgrep** with C# ruleset |
| SCA | **dotnet list package --vulnerable** + **Dependabot** |
| Secret | **gitleaks** |
| License | **dotnet-license-detector** |
| DAST | **OWASP ZAP** |

### A.8 Rust

| Layer | Tool |
|---|---|
| SAST | **cargo-audit** (limited SAST; supplement with **Semgrep** Rust ruleset) |
| SCA | **cargo-audit** + **Dependabot** |
| Secret | **gitleaks** |
| License | **cargo-deny** (also covers SCA + license + advisories in one tool) |
| DAST | **OWASP ZAP** |

### A.9 Stacks not yet codified

When the agent company onboards a new stack, Ops/Security adds a new appendix row with:
1. The five layers and the chosen tools for each
2. Wiring notes (CI workflow path, pre-commit integration, lockfile assumptions)
3. A reference implementation (the first project on that stack becomes the empirical case study)

If a stack genuinely lacks a tool for a layer (e.g., "no good free SAST exists for stack X"), document it explicitly with the rationale and a compensating control (typically: more invasive manual review by Ops/Security at handoff). Don't quietly drop a layer.

### A.10 AI-app specific layers (forward-looking — pattern not yet codified)

AI applications have testing/security concerns that traditional SaaS doesn't, and the scanning landscape for them is immature. Tracked here so the appendix grows when the agent company starts shipping AI-specific products:

- **Prompt-injection testing** — adversarial inputs against the project's prompts; libraries like `garak`, `promptfoo`, manual fuzzing
- **LLM output validation** — does the project sanitize what an LLM returns before persisting / displaying / executing?
- **AI-cost/budget testing** — runaway-token-loop detection, per-user/per-day budget caps tested in CI
- **Model-drift testing** — assertions on model behavior that may quietly change across model versions
- **PII at LLM boundaries** — does the project send user PII to a third-party LLM provider unintentionally?

This row will be filled in by Ops/Security + Quality Engineer when the first AI-application project enters scoping. Until then, treat it as a known-incomplete row.

---

## Cross-references

- `App Development/.claude/agents/ops-security.md` — the Tier 1 owner of this protocol
- `App Development/.claude/memory/security-patterns.md` — the pattern library this protocol's findings populate
- `App Development/.claude/memory/incidents.md` — where realized vulnerabilities (caught or shipped) get logged
- `App Development/.claude/protocols/incident-to-test.md` *(pending)* — when a finding ships before being caught, this is the loop that adds a regression
- `App Development/.claude/protocols/stack-portability-map.md` *(pending)* — the broader translation matrix this appendix participates in
