# Changelog

All notable structural changes to the Claude Team are recorded here. Project-specific work and agent prompt-narrative live in `memory/agent-changelog.md`. Scope split codified at `protocols/changelog-protocol.md`.

Format: see [Common Changelog](https://common-changelog.org/).

## [0.28.0] — 2026-06-02 — `tapagents login` CLI bin (M-D Slice U2) + public-mirror privacy sweep

**Minor release. Staged, not yet published** — no tag, no push-to-publish, no `npm publish` (same held posture as v0.25.0/v0.26.0/v0.27.0 pending the operator's distribution decision). The MINOR classification is driven by the package's **first `bin` entry** (a net-new export surface — `protocols/versioning-protocol.md §3.2`); the bundled privacy-sweep doc changes, PATCH-grade on their own, are absorbed into this MINOR. **Additional client-go-live gate on the CLI:** its device-flow endpoints (`POST /api/auth/device/code`, `POST /api/auth/device/token`) do **not exist in production yet** — they are U1 in `tapagents-app` (a `device_codes` table + 3 endpoints + the `/device` approve page, held to sprint close, behind an ops-security gate). Cutting the CLI before U1 deploys would ship a `tapagents login` that calls non-existent endpoints, so the release must only be tagged after U1 deploys and an integration round-trip is green. See `workspace/_global/tapagents-login-device-auth-contract-2026-06-02.md` (the frozen wire contract this implements) §4–§5.

Two same-session changes land together: the device-auth CLI (the feature that earns the minor bump) and a public-mirror documentation sweep.

### `tapagents login` CLI bin — one-time device-flow onboarding (M-D Slice U2)

**The change in one sentence.** The framework package gains its **first `bin` entry** — a `tapagents` CLI whose `tapagents login` runs the OAuth 2.0 Device Authorization Grant (RFC 8628) client, then writes the credential file (`${XDG_CONFIG_HOME:-~/.config}/tapagents/credentials.json`, 0600) that the **already-live** v0.27.0 telemetry read-path (`hooks/_telemetry.py:_resolve_credentials()`) consumes fresh on every flush — closing the operator's "clients shouldn't run any command to sync telemetry" requirement with a one-time `gh auth login`-style step and zero further commands thereafter.

**The round-trip is verified against the live A0 reader.** A credential file written by the CLI's writer is resolved byte-for-byte by the actual `_resolve_credentials()` function: the `token` + `ingest_url` keys match exactly, the provenance keys (`account`/`issued_at`/`machine`) are ignored as designed, and the 0700-dir / 0600-file / atomic-rename posture holds. After `tapagents login` the next hook fire mirrors telemetry to the cloud with no `export`, no restart, no further command.

**First `bin` ⇒ new export surface ⇒ MINOR.** `tap-agents` had no `bin` key through v0.27.0; adding one is a net-new capability of the npm package with no removal of any existing capability — MINOR per `protocols/versioning-protocol.md §3.2`. The bin points at a committed raw `cli/tapagents.mjs` (with a `#!/usr/bin/env node` shebang), mirroring how `hooks/*.py` ship as raw runnable files — it does **not** depend on the `dist/` build output (which `build.ts` wipes + regenerates on every run), so the CLI is runnable straight from the published tarball with no build step.

**Billing: Pool A.** Every CLI↔endpoint call is plain HTTPS to `tapagents.ai` via Node stdlib (`node:https`/`node:http`). No `claude` invocation, no `@anthropic-ai/sdk` import, no `api.anthropic.com`. Confirmed against the contract §6.

#### Added

- **`package.json` — first `bin` entry** `{ "tapagents": "./cli/tapagents.mjs" }`, plus `cli` added to the `files` allowlist (so the directory ships) and a `test:cli` script (`node --test scripts/test-tapagents-cli.mjs`). No new runtime or dev dependency — the CLI and its tests are pure Node stdlib (the test suite uses Node's built-in `node:test` runner, consistent with the package's zero-new-devDeps discipline).
- **`cli/tapagents.mjs`** — the bin entry. Subcommands (contract §3.3): `login [--url <ingest>]` (run the device flow, write the 0600 credential file; `--url` writes a non-default `ingest_url` for self-host/preview), `logout [--revoke]` (delete the local credential file — stops emission immediately; `--revoke` additionally opens the dashboard tokens page since server-side revoke is cookie-session-only by design), `whoami` (print `account`/`machine`/`issued_at`/`ingest` from the local file, no network), `token list` / `token revoke <id>` (open the dashboard tokens page — list/revoke are privileged browser-session actions, not bearer-callable), `--version`, `--help`. IO + side-effects are threaded through a `ctx` object so the whole CLI is unit-testable without patching globals. Auto-runs `main()` only when invoked as the entry point (import-safe for the test harness).
- **`cli/lib/device-flow.mjs`** — the RFC-8628 device-flow client: E1 `POST /api/auth/device/code` → print `Open <verification_uri> and enter code: <user_code>` (+ optional `verification_uri_complete`) → poll E3 `POST /api/auth/device/token` at the server `interval`, honoring `authorization_pending` (keep polling), `slow_down`/429 (interval += 5s per §1.5), `expired_token`/`access_denied`/`invalid_grant` (terminal with contract-exact messages), `rate_limited` (honor `retry_after_seconds`), and a defensive client-side ceiling at `expires_in` + 15s grace. The clock/sleep/http/out are injectable for deterministic testing.
- **`cli/lib/credentials.mjs`** — the credential writer/reader/deleter. `writeCredentials()` creates the config dir **0700** (honoring `XDG_CONFIG_HOME`, else `~/.config`), writes a same-dir temp file created **0600**-from-birth, then **atomically renames** it onto `credentials.json` so a concurrent reader never sees a partial or world-readable file (contract §3.1). Shape: `{token, ingest_url, account, issued_at, machine}` — `token`+`ingest_url` are the load-bearing keys the Python reader pulls; `ingest_url` defaults to the byte-identical `_DEFAULT_INGEST_URL`. `readCredentials()` is fail-soft (null on absent/malformed). `deleteCredentials()` is idempotent.
- **`cli/lib/http.mjs`** — a minimal stdlib JSON-POST helper (`node:https`/`node:http`) that returns `{status, json, raw}` for ANY completed response (including the 400s carrying the RFC error vocabulary), rejecting only on transport failure. Supports `http://` for the localhost mock-server tests and `https://` for production.
- **`scripts/test-tapagents-cli.mjs`** — 26 `node:test` cases against a **mock** E1/E3 server implementing the frozen contract (no live-endpoint dependency): happy path; `authorization_pending`/`slow_down`/`expired_token`/`access_denied`/`invalid_grant`; `rate_limited` on E1 and E3; client-side timeout ceiling; the credential file's 0600/0700 perms + exact §3.1 shape + the `token`/`ingest_url` round-trip key contract; server-echoed-vs-`--url` ingest precedence; the bound-account display (§2.8 session-fixation mitigation); and `whoami`/`logout`/`logout --revoke`/`token` browser-routing. Deterministic (fake clock — full suite runs in ~150ms).
- **`.claude-plugin/marketplace.json`** — plugin description extended to note the v0.28.0 `tapagents` CLI bin + one-time `tapagents login` device flow.

### Public-mirror privacy sweep + agent-changelog backfill

The deferred v0.23.1 brand-integrity sweep, bundled into this release. Genericizes private project slugs (`<project>` placeholders) across all public narrative and framework-doc files: 17 protocols, 14 agent definitions, commands, templates, playbooks, scripts (comment/docstring lines only), and CI workflow comments. Removes personal-username and home-directory path segments from CHANGELOG and agent-changelog narrative prose. `notify-adopters.yml` refactored to read the downstream consumer repo from a repository variable (`vars.ADOPTER_REPO`) rather than a hardcoded org/slug — private project name no longer embedded in public source. Additionally backfills the previously-missing v0.26.0 and v0.27.0 narrative entries in `memory/agent-changelog.md`, and de-annotates the now-stale "Held/unpublished" markers on the v0.25.0–v0.27.0 entries.

#### Changed

- 17 protocol files, 14 agent definition files, 3 command files, 5 script files, 1 hook, 1 template, 1 playbook, 1 spec doc — project-slug genericization (comment and narrative text only; no functional logic changed).
- `memory/agent-changelog.md` — v0.26.0 and v0.27.0 narratives backfilled; older narrative prose genericized; stale held/unpublished annotations removed.
- `CHANGELOG.md` — five previously-missing entries (v0.22.0, v0.23.0, v0.25.0, v0.26.0, v0.27.0) back-synced from the published mirror to the authoring root; stale "Held/unpublished" annotations updated to reflect published status.
- `.github/workflows/notify-adopters.yml` — downstream consumer repo moved from hardcoded slug to `vars.ADOPTER_REPO` repository variable.
- `README.md` — stale project-slug reference genericized.
- `CHANGELOG.md` + `memory/agent-changelog.md` — scrubbed internal infra identifiers from changelog history: Neon endpoint IDs (prod/dev/local branches → `<prod-neon-branch>`/`<dev-neon-branch>`/`<local-neon-branch>` placeholders, incl. the full pooler host), the production Vercel alias (→ `<prod-vercel-alias>`), and a residual internal project slug/codename in narrative prose. Also genericized two operator home-path code comments (`scripts/sync-src/secret-patterns.ts`, `scripts/sync-src/sync.ts`) to `/Users/<user>/`. Narrative-only; no functional logic changed. (The `changelog_project_slugs` sanitizer denylist in `scripts/sync-src/manifest.json5` intentionally retains historical slugs — that list is the source of truth the sync genericizer matches against.)

### Packaging fix — keep compiled-Python bytecode out of the tarball

#### Fixed

- **`package.json` `files` allowlist** — added `!**/__pycache__`, `!**/*.pyc`, and `!**/*.pyo` negation entries so stale Python bytecode caches never ship in the published tarball. `npm pack` packs from the working tree (not git), and the allowlist admitted `hooks`/`scripts` as whole directories, so any `__pycache__/*.pyc` present at pack time was swept in (e.g. `hooks/__pycache__/*.cpython-314.pyc`) even though those caches are gitignored. A root `.npmignore` does **not** override the `files` allowlist for paths inside allowlisted directories (verified — it left the bytecode in the tarball), so the load-bearing fix is the `files`-array negations, which take precedence. Verified via `npm pack --dry-run`: the six leaking `.pyc` files are gone (tarball 225 → 219 files) while every legit file (the four `cli/*` files, all `hooks/*.py` + `hooks/README.md`, `scripts/*.py`, `agents/`, etc.) remains. Durable — the rule holds even after the caches regenerate on the next Python-hook run. No version bump (folded into the unpublished 0.28.0).

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2`: the package gains a net-new `bin` export surface (`tapagents`) + a new `cli/` source tree + a new test script. Every existing consumer at v0.27.0 continues to function unchanged — no agent/command/protocol/template/hook removed or renamed, no `settings.json` change, no programmatic export (`dist/index.mjs`) shape change, no `live_events` schema change. The `bin` is purely additional capability, which is the MINOR trigger. The bundled privacy-sweep doc changes (project-slug genericization + agent-changelog backfill) are PATCH-grade per §3.1 (pure text-content corrections in existing files) and are absorbed into this MINOR rather than cut as a separate PATCH, because they shipped in the same session as the bin and no separate release window opened.

### Provenance + cross-references

- CLI: frozen wire contract `workspace/_global/tapagents-login-device-auth-contract-2026-06-02.md` (§1 endpoint/polling contract, §2.8 bound-account display mitigation, §3 credential write, §4 release sequencing, §6 Pool A); builds directly on the v0.27.0 A0 credential read-path (`hooks/_telemetry.py:_resolve_credentials()`) — the CLI is the writer for that already-live reader; companion app-side unit (NOT in this repo) is U1 (`device_codes` table + E1/E2/E3 + `/device` approve page) in `tapagents-app`, behind an ops-security gate, plus the SEC-1/OD-L2 `framework_events` user-scoping hard gate that must close before any client-facing exposure of this login path. See the matching v0.28.0 narrative in `memory/agent-changelog.md`.
- Privacy sweep: deferred from the v0.23.0 entry's "brand-integrity sweep planned within ~48h as v0.23.1."

### Release-hold note (read before cutting)

This entry is authored and the three version channels (`package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`) are at 0.28.0, but the release is **staged, NOT tagged or published**. The CLI's endpoints (U1) are not deployed; cutting now would ship a CLI that calls 404s. Sequence: U1 deploys → ops-security gate clears → integration round-trip green (a real `tapagents login` → approve → file written → a subsequent session emits to `live_events`) → then cut v0.28.0 via `/release` → then adopt into `tapagents-app` through the dedicated `sync-tapagents` branch per `protocols/sync-tapagents-protocol.md` (NOT directly through `dev`).

## [0.27.0] — 2026-05-29 — Credential-file read in `_telemetry.py`: onboarding-enablement (M-D Slice A0)

**Minor release.** The onboarding-enablement prerequisite that sits *just before* the cloud-mirror Slice A: the credential model defined in `workspace/_global/frictionless-telemetry-sync-onboarding-2026-05-29.md` (folded into the M-D track as **Slice A0**), responding to the operator directive *"if this is live to clients, they shouldn't need to run commands just to sync it to the dashboard."*

**The change in one sentence.** `emit_event_http()`'s token + ingest-URL resolution now reads FRESH on every flush from a precedence chain — **env (`TAPAGENTS_LIVE_TOKEN` / `TAPAGENTS_LIVE_INGEST_URL`) → credential file `~/.config/tapagents/credentials.json` → built-in default URL** — instead of from the environment alone.

**Why this removes the restart (the load-bearing reasoning).** Env vars are inherited at process launch, so changing `TAPAGENTS_LIVE_TOKEN` previously required relaunching the whole Claude Code tree. A file read inside the flush path has no such constraint: each hook subprocess is a fresh `python` process that reads the file directly on its own threshold/atexit flush, so a token written mid-session (by a future `tapagents login`, or by the operator demo, or by hand) is picked up by the **very next hook fire — no `export`, no restart**. This extends the existing fresh-read-at-flush-time discipline (the env var was already read at flush, not import); it does not change that timing.

**Fully backward-compatible.** Env wins: when `TAPAGENTS_LIVE_TOKEN` is set, behavior is byte-identical to v0.26.0 (the resolver short-circuits and never stats the file). The credential file is purely the new default for humans who never want to touch env; existing operator setups + CI overrides are unchanged. **Fail-open preserved** end-to-end: a missing file, unreadable file, malformed JSON, wrong-shape JSON, or non-string `token`/`ingest_url` field all degrade to the exact no-op behavior of a missing env var today (warn-once to stderr, cloud mirror disabled, local `emit_event()` continues as source of truth). `Path.home()` raising is also swallowed. The resolver never raises.

**Billing: Pool A.** Pure stdlib file `stat`/`read` + the existing app→app `emit_event_http()` HTTP. No `claude` invocation, no Anthropic SDK, no `api.anthropic.com`.

### Added

- **`hooks/_telemetry.py` — `_resolve_credentials() -> tuple[str | None, str]`** — module-level helper resolving `(token, ingest_url)` via the env→file→default precedence chain. Honors `XDG_CONFIG_HOME` (falls back to `~/.config`); reads JSON `{"token": "tap_local_…", "ingest_url": "https://…/ingest", …}` (`token` is the only load-bearing key; `ingest_url` co-located so a self-host/preview target needs zero env vars). Wrapped in a catch-all fail-open. `_flush_batch_locked()` replaces its two `os.environ.get(...)` reads with one `token, url = _resolve_credentials()` call; the warn-once branches now fire only when *neither* env nor file yields a credential.
- **`scripts/test-credential-resolution.py`** — 13 stdlib `unittest` cases (zero new devDeps): the full precedence matrix (env-token-wins, file-token-used, mixed env-token+file-url, env-url-wins, default-url-when-no-file-url, none-anywhere), the fail-open contract (malformed JSON, non-object JSON, non-string fields, missing file, `Path.home()` raising), and an end-to-end flush that POSTs to the file's `ingest_url` with the file's bearer token when NO env var is set (the "no export, no restart" guarantee). Each case isolates `XDG_CONFIG_HOME` to a tmp dir so the operator's real credential file is never read.

### Changed

- **`scripts/test-emit-event-http.py`** — hardened the two env-clearing fail-open tests (`test_no_token_is_silent_noop`, `test_default_url_used_when_only_token_set`) to isolate `XDG_CONFIG_HOME` to an empty tmp dir. A0's new credential-file read means these tests would otherwise pick up a real `~/.config/tapagents/credentials.json` (e.g. one written by the `<project>` operator demo) and read a token where the test asserts "no token", silently breaking the suite on a dev machine that has run the demo. Also updated the missing-token warn-string assertion to match A0's reworded stderr line. No behavior change to `emit_event_http()`.

### Provenance + cross-references

- Slice A0 design + credential model: `workspace/_global/frictionless-telemetry-sync-onboarding-2026-05-29.md` (§2 credential model, §2.4 read-path spec — implemented verbatim).
- Builds on the `emit_event_http()` cloud-mirror helper (v0.24.0) + the dual-emit slices (v0.25.0 phase-transitions + session lifecycle, v0.26.0 work-output).
- The companion `<project>` operator demo (`npm run dashboard:demo`) writes a real `credentials.json` pointing at the local ingest, exercising this exact read path; it lands in the app repo, not here.

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2`:

- **Additive only.** A new internal helper + a new precedence tier inside an already-wired hook. Every existing consumer at v0.26.0 continues to function unchanged: with `TAPAGENTS_LIVE_TOKEN` set the resolution is byte-identical; with it unset the prior no-op fail-open is preserved (now additionally satisfiable by a file).
- **No file removed or renamed** in any §3.2/§3.3-governed directory (`agents/`, `commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/`). One modified hook (`hooks/_telemetry.py`) + one new test script (`scripts/test-credential-resolution.py`).
- **No public API or export shape change**; no `settings.json` change (the emitter is already wired into every hook that mirrors). No `live_events` schema change.

### Sync-tapagents note

The HQ copy `.claude/hooks/_telemetry.py` was mirrored surgically in the same change (the live HQ copy is what the operator's running session executes, so A0 is **live-local immediately** — the operator's current-session hooks read the credential file now). Framework adoption into `<project>` (if/when this release is published + the dep bumped) flows through the dedicated `sync-tapagents` branch per `protocols/sync-tapagents-protocol.md`, not directly through `dev`.

## [0.26.0] — 2026-05-29 — Session work-output telemetry: product files + committed LOC at seal (M-D slice B)

**Minor release.** The third slice of the M-D telemetry track (`workspace/_global/m-d-track-scope-sequencing-2026-05-28.md` Addendum Rev 2). Where v0.25.0 *mirrored existing events* (phase-transitions + session lifecycle), this slice *captures NEW data* — what a session actually **produced**: product files touched + lines-of-code — and emits it at session seal. It is a distinct capability, so it is a clean semantic version split from v0.25.0 rather than a retroactive widening of that release's scope.

**The new stream.** A new `session-work-output` / `summary` / `seal` event triple, flipped from reserved → **LIVE** in `protocols/telemetry-events.md §2.4` and fully documented in the new **§2.6**. The producer is `hooks/session-tracking-seal.py` (`_emit_work_output`) — the same Stop hook that already emits the session-lifecycle events — using the exact S1/slice-A dual-emit shape: local `emit_event()` (source of truth) then best-effort cloud-mirror `emit_event_http()` (fail-open, no-op without `TAPAGENTS_LIVE_TOKEN`).

**Deliberately a SEPARATE stream — the cross-cutting collision manifest is NOT widened.** `active-sessions.md` / `is_cross_cutting_path()` / `files_in_flight` exist for session-collision avoidance across concurrent sessions touching shared *framework* files, and stay framework-files-only. "What did this session produce" is a different question with a different consumer (the dashboard user), so product `src/` work-output rides its own stream. The matcher is untouched.

**LOC honesty.** The only LOC number the framework emits is the **committed-to-main** figure computed at seal by a new `loc_landed_on_main_since()` git helper in `hooks/_session_tracking.py` — the `git log --since=<started> --numstat … main` sibling of the existing `--name-only` `files_landed_on_main_since()`. "This session's work" = files committed to `main` since the sidecar's `started` timestamp, the same committed-to-main definition the auto-seal contract already uses. Binary files (which report no line count) are excluded; counts are summed across all commits in the window. A mid-session/uncommitted figure is **provisional and is NOT emitted** by this `seal` event (`payload.loc_provisional` is always `false`; the key is reserved so a future provisional per-edit enhancement is schema-compatible). Where git/`main` is unavailable — e.g. the framework-HQ orchestrator context, whose root is not a git repo — the figure is unmeasurable and **no event is emitted** (no-emit-when-no-work); the stream only carries data for sessions running inside a product git repo. Re-emit is idempotent across resumes: the producer records the committed-SHA it last emitted against on its own sidecar bookkeeping and re-emits only when genuinely-new commits land.

**Additive-only** (`telemetry-events.md §6`): a new `source` value + new `type`/`subtype` is MINOR; the `payload.*` keys (`files_touched`, `files_count`, `files_truncated`, `loc_added`, `loc_deleted`, `loc_provisional`, `committed_sha`) are PATCH-grade additive. No existing triple mutated; the frozen top-level schema is untouched; no `live_events` column add (everything rides the existing `jsonb` payload). New wired-hook behavior emitting a newly-live reserved triple ⇒ framework MINOR per `protocols/versioning-protocol.md §3.2`. The §2.6 spec also records the Slice-C dashboard-render contract (field names + shapes for the `/dashboard/live` per-session "work done" panel) so the render extension can be built later without re-deriving shapes — the render itself is NOT built here.

**Billing: Pool A.** Pure git + file-stat + the existing app→app `emit_event_http()` HTTP. No `claude` invocation, no Anthropic SDK, no `api.anthropic.com`.

### Added

- **`hooks/_session_tracking.py` — `loc_landed_on_main_since(started_iso)`** — the `--numstat` sibling of `files_landed_on_main_since()`. Returns `{added, deleted, files: {path: {added, deleted}}, files_count, available}`; sums per-file deltas across all commits on `main` in the window; excludes binary files; fails open to the `available: False` zero-shape on any git failure (no repo / no `main` / git missing / timeout). `available` distinguishes "couldn't measure" from "measured zero."
- **`hooks/session-tracking-seal.py` — `_emit_work_output()` + `WORK_OUTPUT_TOP_N_FILES` (=50)** — computes work-output at seal and dual-emits the `session-work-output`/`summary`/`seal` event. Rolls the file list up to a representative top-N (by churn) to respect the ingest per-event ~4 KB cap, with `files_count`/`files_truncated` signalling truncation. Wired into `main()` before the existing lifecycle branches (so it fires for sessions that touched only product `src/`); the lifecycle branches are unchanged.
- **`protocols/telemetry-events.md §2.6`** — full schema for the now-LIVE `session-work-output` triple: event shape, reserved `payload.*` keys, the LOC reliable-vs-provisional table, the "this session's work" definition, the no-emit-when-no-work emission rule, the ingest field-length caveat, and the Slice-C dashboard-render contract. §2.4 reservation flipped reserved → LIVE.
- **`scripts/test-session-work-output.py`** — 16 stdlib `unittest` cases (zero new devDeps): LOC computation (sum-across-commits, binary exclusion, git-failure fail-open, measured-zero), dual-emit local+cloud parity, committed-vs-provisional (`loc_provisional` always false at seal), no-emit-when-no-work (unavailable / zero-files / no-sidecar), idempotency across resumes (re-emit only on SHA change), top-N truncation, and a guard that the existing lifecycle seal events are unaffected.

### Provenance + cross-references

- M-D track scope/sequencing + Slice B design: `workspace/_global/m-d-track-scope-sequencing-2026-05-28.md` (Addendum Rev 2 §"Slice B"; OD-B1 triple grammar; OD-B3 final-only-first).
- Builds on v0.25.0's dual-emit pattern (`hooks/stop-phase-transition.py`) and the shipped `emit_event_http()` cloud-mirror helper (v0.24.0).

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2`:

- **Additive only.** New wired-hook behavior (a new emitter within the already-wired seal hook) emitting a newly-live reserved telemetry triple + a new git helper. Every existing consumer at v0.25.0 continues to function unchanged (the new event is purely additional; consumers ignore unknown sources per `telemetry-events.md §5`).
- **No file removed or renamed** in any §3.2/§3.3-governed directory (`agents/`, `commands/`, `protocols/`, `templates/`). One new test script added under `scripts/`. No `settings.json` change (the seal hook is already wired).
- **No public API or export shape change**; no `live_events` schema change (new datum rides the existing `jsonb` payload).

## [0.25.0] — 2026-05-29 — Telemetry cloud-mirror: phase-transitions (M-D slice S1) + session lifecycle (M-D slice A)

**Minor release.** Two same-theme slices of the M-D telemetry track (`workspace/_global/m-d-track-scope-sequencing-2026-05-28.md`), bundled into one release because both are additive, cloud-mirror-only work on the frozen telemetry schema:

1. **Slice S1 — state-machine phase-transition Stop hook.** A Stop hook that emits the `state-machine` / `transition` / `<from>-<to>` event triple reserved in `protocols/telemetry-events.md §2.4`. This is the live feed the dashboard's 12-step PhaseIndicatorTrack consumes.
2. **Slice A — session-lifecycle cloud-mirror.** The three existing BL-055 session-tracking hooks (`session-tracking-register.py` SessionStart, `session-tracking-files.py` PreToolUse, `session-tracking-seal.py` Stop) now mirror their existing `fire`-type events to the dashboard via `emit_event_http()` alongside each existing local `emit_event()` call — the exact dual-emit pattern S1 introduced. These are **existing reserved events, newly mirrored**: no new `source`/`type`/`subtype` surface is invented.

Both slices are **additive, backwards-compatible** changes on the frozen telemetry schema — for S1 a new producer of an already-reserved triple; for slice A a best-effort cloud replica of events the hooks already emitted locally. No schema surface invented (`telemetry-events.md §6`). New wired hook (S1) ⇒ framework MINOR per `protocols/versioning-protocol.md §3.2`; slice A's added `emit_event_http()` calls are PATCH-grade on their own (`§3.1` internal hook-script change that preserves the gate/emit pass-fail semantics), absorbed into the MINOR.

Dispatch-outcome (`subagent-dispatch` / `outcome` / `<verdict>`, the other §2.4-reserved triple) is **deliberately deferred** to follow-up slice S1b. A Stop hook has no reliable, non-heuristic signal for per-dispatch verdicts (the Stop payload does not enumerate Task tool calls or their return shapes); emitting it here would require transcript-scraping guesswork. Per the S1 directive ("honesty over completeness — do NOT ship a guessing emitter"), only the phase-transition half of S1 ships.

### Added

- **`hooks/stop-phase-transition.py` — state-machine phase-transition emitter** (NEW Stop hook). Observational; never blocks Stop (exit 0 always, like `stop-dispatch-monitor.py`). On each Stop it diffs every project's `state.json.current_phase` against a private sidecar snapshot at `<workspace>/_global/.phase-snapshot.json` and emits one `state-machine` / `transition` / `<from>-<to>` event per genuine phase change — to both the local `emit_event()` (source of truth) and the cloud-mirror `emit_event_http()` (fail-open; no-op without `TAPAGENTS_LIVE_TOKEN`). Detection contract: first-seen project bootstraps **silently** (no trustworthy "from"); unchanged phase emits nothing; reversions (e.g. `planned`→`scoping`) and side-state moves (e.g. `planned`→`paused`) ARE legitimate transitions and emit; vanished projects are pruned from the snapshot without emitting. Multi-project: every `workspace/<slug>/state.json` (skipping `_`-prefixed buckets) is diffed independently in one pass. Anti-loop guard on `stop_hook_active`. Top-level misfire capture on uncaught exceptions (mirrors `stop-dispatch-monitor.py`). Pure stdlib; fail-open snapshot read/write (atomic `mkstemp` + `os.replace`).
  - **Why a snapshot diff:** a Stop hook sees only the CURRENT phase, but the reserved subtype needs `<from>-<to>`. `state.json.history[]` is Conductor-authored prose with heterogeneous shapes, so parsing it for "the prior phase" is brittle. The sidecar is the hook's own private bookkeeping — NOT part of the telemetry schema and NOT read by any `events.jsonl` consumer (`telemetry-events.md §3.1`).

- **`scripts/test-phase-transition.py`** — stdlib `unittest` coverage (17 tests, `tempfile`-sandboxed workspace + monkey-patched emit hooks) for: first-seen silent bootstrap, no-change silence, single transition with correct `<from>-<to>` subtype (local + cloud mirror), reversion, side-state transition, multi-hop sequence, multi-project independence, malformed `state.json` skip, `_`-bucket skip, phase_status-only drift (no emit), missing-`slug` dirname fallback, vanished-project pruning, anti-loop guard, corrupt-snapshot re-bootstrap, real-emit-path-writes-to-sandbox, and misfire capture. No devDeps added; runs via `python3 scripts/test-phase-transition.py`.

- **`scripts/test-session-tracking-http.py`** (slice A) — stdlib `unittest` coverage (13 tests, `tempfile`-sandboxed workspace + monkey-patched emit hooks) for the session-lifecycle cloud-mirror: register (fresh-stub / resume / no-workspace / unknown-source / local-emit-shape-unchanged guard), files (cross-cutting edit mirrored, subagent-attribution crosses to cloud, non-cross-cutting edit emits nothing), seal (noop / auto-sealed / partial-seal / left-in-progress all mirrored), and an end-to-end real-emit-path test (unmocked `emit_event` + `emit_event_http`, no `TAPAGENTS_LIVE_TOKEN` so the mirror is a guaranteed no-op, asserting the local row still lands in the sandbox `events.jsonl`). A shared parity helper asserts, for every site, that the cloud-mirror count equals the local count and that `source`/subtype/`agent_context`/`agent_type`/`agent_id`/`session_id`/`payload` cross-mirror faithfully. No devDeps added; runs via `python3 scripts/test-session-tracking-http.py`.

### Changed

- **`settings.json` — Stop chain extended from three stages to four** (slice S1). `stop-phase-transition.py` slots after `stop-dispatch-monitor.py` (the two observational telemetry hooks) and before `session-tracking-seal.py`. `stop-critic-check.py` remains the sole Stop-blocking gate; the new hook is bookkeeping/telemetry only.

- **`hooks/session-tracking-register.py`, `hooks/session-tracking-files.py`, `hooks/session-tracking-seal.py` — cloud-mirror added to every emit site** (slice A). Each existing `emit_event()` call now has a sibling `emit_event_http()` call (local first as the source of truth per `telemetry-events.md §4`, then the best-effort cloud mirror — fail-open, a no-op without `TAPAGENTS_LIVE_TOKEN`). Sites mirrored: register × 3 (no-workspace / resume / fresh-stub), files × 1 (cross-cutting file-touch, preserving the subagent `agent_context`/`agent_type`/`agent_id` attribution), seal × 4 (noop / auto-sealed / partial-seal / left-in-progress). The local emits are **unchanged** — this is purely additive (the same dual-emit pattern `stop-phase-transition.py` shipped in S1). No new schema: these are existing `fire`-type events on `source: "session-tracking-register" | "session-tracking-files" | "session-tracking-seal"`, now also replicated to the cloud feed.

### Migration notes

**No breaking changes.** Both feeds are additive — consumers reading `events.jsonl` see a new `source: "state-machine"` row class on phase changes (S1), and the existing `session-tracking-*` `fire` rows are unchanged locally while now also reaching the cloud feed (slice A); readers already pattern-match `source`/`type` defensively per the producer contract. Consumers who do not set `TAPAGENTS_LIVE_TOKEN` see no cloud-side behavior; the local feed is the source of truth in every case. No agent removed, no command removed, no protocol removed, no existing function signature changed. The session-lifecycle POST is an app→app telemetry mirror (Pool A — not an LLM call).

## [0.24.1] — 2026-05-19 — Layer A override-regex defense-in-depth (always-compute ancestry + trailer-only placement)

**Patch release.** Closes a defect surfaced on v0.24.0's own dogfood publish. The trunk-discipline override mechanism shipped in v0.24.0 carried a regex that searched the entire commit message body for the override token; the v0.24.0 release commit happened to *document* the token form inline in its CHANGELOG body (where the feature was being introduced), and the regex matched the placeholder text — short-circuiting Layer A's hard `git merge-base --is-ancestor` check via the early-exit override path on the very first canary the feature was meant to validate.

The v0.24.0 publish was incidentally ancestrally correct (tag = main HEAD), so no operational harm. But Layer A's first live run did not actually exercise the ancestry check it exists to enforce — the prose match silently bypassed it. Any future release commit similarly documenting the override syntax would bypass Layer A again.

This patch closes the defect with two complementary tightenings, applied symmetrically in CI (`.github/workflows/publish.yml`) and operator hook (`hooks/version-gate.py` invariant 4):

1. **Always compute ancestry; never early-exit on override.** The ancestry check ALWAYS runs. Override presence no longer skips the check; instead it skips the check's *failure*. The two computations (override extraction + ancestry check) run independently, and the joint outcome decides the verdict (silent pass / "override unused" warning / "override allows publish" warning with reason / hard error). Prose false-positives surface as informational warnings, not silent bypasses.

2. **Trailer-only placement enforcement.** Override token recognition is restricted to the commit message's TRAILER BLOCK — the lines after the last blank line in the message, mirroring git's `Co-authored-by:` convention. The line-pattern is whole-line anchored; reason text rejects angle brackets at the regex level + a `_PLACEHOLDER_REASONS` denylist rejects bare placeholder words ("reason", "todo", "...") case-insensitively. Prose mentions in the body are now correctly treated as documentation, not as operator-issued overrides.

Both fixes verified against the actual v0.24.0 release commit message: replayed under the new code, the v0.24.0 self-bypass does NOT occur (the trailer block is the `Co-authored-by:` line; the body prose mentions are excluded). Legitimate trailer-placed overrides continue to work for genuine hotfix scenarios.

### Changed

- **`.github/workflows/publish.yml` — Layer A control-flow restructure** — `Validate tagged commit is an ancestor of origin/main` step rewritten around the always-compute pattern. New trailer-extraction bash uses awk to find the last blank-line index, tail to slice the trailer block, grep with the tightened whole-line-anchored regex `^[[:space:]]*\[trunk-discipline-override:[[:space:]]*[^]<>]+\][[:space:]]*$`, then a case-folded placeholder-reason denylist. The hard ancestry check (`git merge-base --is-ancestor`) always runs; override status is consulted only to decide the verdict when ancestry fails. The duplicate-fork diagnostic and the full remediation error block are preserved verbatim, now only emitted on the genuine hard-error path. New cross-reference to `workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md` in the step comments.

- **`hooks/version-gate.py` — invariant 4 trailer-only restriction** — `TRUNK_OVERRIDE_PATTERN` regex rewritten with whole-line anchoring + `[^\]<>]+` reason character class. New `_has_trailer_override()` helper locates the trailer block (last blank line + everything after; one-line fallback for messages without blank lines) and runs the regex per-line against `.match()`. New `_PLACEHOLDER_REASONS` denylist rejects bare placeholder words case-insensitively. `_extract_trunk_override_reason()` preserved as a back-compat shim delegating to `_has_trailer_override()` — `_check_tag()` call sites unchanged. Module-level docstring and `_check_tag()` inline comment updated to document the trailer-only constraint + cross-reference the v0.24.1 spec.

- **`protocols/versioning-protocol.md §4.2`** — invariant 4 description amended in-place to document the trailer-only placement constraint, the placeholder-reason rejection, and the cross-reference to the v0.24.1 spec. Prior reference to `hooks/sync-discipline-gate.py OVERRIDE_PATTERN` shape-matching dropped — the two patterns diverge here because the sync-discipline-gate token uses a different shape and the trailer-only restriction is specific to the trunk-discipline token.

### Provenance + cross-references

- v0.24.0 incident report: `workspace/_global/v0.24.0-ship-reportback-2026-05-19.md` §7 anomaly 1.
- v0.24.1 tech-strategy spec: `workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md`.
- v0.24.1 impl reportback: `workspace/_global/v0.24.1-impl-reportback-2026-05-19.md`.

### SemVer classification: PATCH

Per `protocols/versioning-protocol.md §3.1`:

- **No public API change.** `_extract_trunk_override_reason()` keeps the same `(str) -> str | None` signature; only its decision logic narrows via the trailer-only restriction.
- **No file added or removed** in any §3.2/§3.3-governed directory. No new agent, command, protocol, or template. No removed agent, command, protocol, or template.
- **Defect closure.** Fixes a bug where the override mechanism could be silently triggered by documentation prose; restores intended behavior. The override-via-prose-match path was new in v0.24.0 (less than 24 hours of consumer exposure); no downstream consumer had time to land a release that relied on it.
- **Protocol prose tightening, not amendment.** §4.2 invariant 4 stays the same invariant; the trailer-placement constraint is a sub-clarification of the existing rule, not a new rule.
- **Internal hook script change preserves the gate's pass/fail semantics for legitimately-placed overrides.** Per §3.1 ("Internal hook script changes that don't change the gate's pass/fail semantics") — the authoritative semantic is the ancestry check, which now runs every time.

### Meta-note for future CHANGELOG authors

CHANGELOG entries discussing the override mechanism should refer to the token *by name* (e.g., "the trunk-discipline override token" or `[trunk-discipline-override:]` *shape* without inline placeholder reason) — embedding the literal placeholder string `[trunk-discipline-override: <placeholder>]` inline in CHANGELOG prose was exactly what triggered the v0.24.0 self-bypass. After v0.24.1, the trailer-only restriction means even an accidental prose mention won't fire Layer A or invariant 4 — but treating this as discipline rather than relying on the gate is forward-compatible. Quote the token in backticks or describe it structurally; do not embed the bracketed form as a paragraph token.

### Files-array audit

All modified files fall under existing `package.json#files` entries — no new top-level entry required:

- `hooks/version-gate.py` — under `hooks/`
- `protocols/versioning-protocol.md` — under `protocols/`
- `memory/agent-changelog.md` — under `memory/`
- `.github/workflows/publish.yml` — NOT in files (workflow ships in repo, not in tarball)

## [0.24.0] — 2026-05-19 — Trunk-discipline mechanical floor + `emit_event_http()` cloud-mirror helper

**Minor release.** Two themes bundle into one ship. (1) **Trunk-discipline mechanical floor** — codifies the previously-soft rule "trunk must reflect published state" into a CI gate (Layer A in `publish.yml`) and an operator-side ceiling (`/release` Layer B + `hooks/version-gate.py` invariant 4). The publish workflow now refuses to publish unless the tagged commit is an ancestor of `origin/main`, with an `[trunk-discipline-override: <reason>]` escape hatch for genuine hotfixes. (2) **`emit_event_http()` cloud-mirror helper** — adds a new sibling to the existing local `emit_event()` telemetry helper that lets projects scaffolded against this framework ship local agent telemetry to a configurable cloud ingest endpoint. Composes alongside the local helper (does NOT replace it); fails open on every error path so a cloud-side disruption never affects the local agent execution path.

Both themes are additive and backwards-compatible; no agent removed, no command removed, no protocol removed, no existing function signature changed.

### Added

#### Trunk-discipline mechanical floor

- **`.github/workflows/publish.yml` — Layer A ancestry guard** — new step `Validate tagged commit is an ancestor of origin/main` slots between the existing `Validate tag matches package.json version` step and the `Publish to npm` step. Resolves the tagged commit SHA via `git rev-parse "${GITHUB_REF_NAME}^{commit}"` (invariant to lightweight vs annotated tags), fetches `origin/main` (without `--depth`; the checkout step uses `fetch-depth: 0` so the repo is already unshallow), then runs `git merge-base --is-ancestor "${TAG_SHA}" "${MAIN_SHA}"`. Failure short-circuits the workflow non-zero **before** `npm publish` runs — orphan-trunk releases become impossible by construction. Includes a diagnostic that detects the **duplicate-fork pattern** (main HEAD has tree-identical content under a different SHA, the v0.23.0 incident shape) and prints a distinct remediation hint covering both the linear-merge and tag-move recovery paths. Override token `[trunk-discipline-override: <reason>]` in the release commit message bypasses the check with a logged warning; reason must be non-empty after whitespace strip. (Workflow file is NOT in `package.json#files` — operator-side change only; consumers see no behavioral change.)

#### emit_event_http() cloud-mirror helper

- **`hooks/_telemetry.py` — `emit_event_http()` sibling helper** (+255 lines). New all-keyword Python function that mirrors the `emit_event()` argument surface (with two additive optional fields: `event_type`/`event_subtype` in place of `type`/`subtype`, plus `project_slug` and `ts`) and emits events to a configurable HTTP endpoint instead of (in addition to) the local `events.jsonl`. Behaviors:

  - **Configurable via two environment variables** (read at flush time, not import time, so operators can set them after process start):
    - `TAPAGENTS_LIVE_TOKEN` — per-machine bearer token. Required; if absent, every call is a silent no-op (one stderr warning per process, never per call).
    - `TAPAGENTS_LIVE_INGEST_URL` — endpoint URL. Optional; defaults to `https://tapagents.ai/api/account/tapagents-live/ingest`.

  - **In-process batching** (threadsafe via `threading.Lock`):
    - Accumulates events in a module-level list.
    - Flushes on whichever fires first: every 20 events OR every 5 seconds since the first event in the current batch.
    - On process exit, an `atexit` hook drains any remaining batch (registered lazily on first use so importing the module remains side-effect-free for consumers who never call the new helper).

  - **`flush_pending()` companion** — public synchronous-drain API for test harnesses and graceful-shutdown paths that need explicit drain semantics rather than waiting for the timer or size threshold.

  - **Fail-open on every code path** — network error, 4xx, 5xx, timeout, missing env var, internal exception: all swallowed silently. The local `emit_event()` write path is never affected by HTTP failures; the local file remains the source of truth and the HTTP path is a best-effort cloud mirror.

  - **Pure stdlib** — uses `urllib.request` with a 5-second default timeout. Zero new runtime dependencies; works in every framework consumer regardless of their installed packages.

- **`scripts/test-emit-event-http.py`** — stdlib `unittest` coverage (`urllib.request.urlopen` monkey-patched) for size-threshold flush, time-threshold flush, explicit `flush_pending()`, auth header propagation, default URL fallback, missing-env-var no-op (with single-warn semantics), HTTP-5xx fail-open, network-unreachable fail-open, and local-`emit_event()`-still-fires when the HTTP mirror fails. Mirrors the runner pattern of `scripts/test-permission-denial-telemetry.py`: no devDeps added, runs via `python3 scripts/test-emit-event-http.py`.

### Migration notes

**No breaking changes.**

- **Trunk-discipline** is enforced at publish-time, not consumer-time. Adopters scaffolding the framework into their projects see no consumer-visible change — the workflow file ships in the `tap-agents/` repo but NOT in the npm tarball (`.github/` is not in `package.json#files`). The corresponding operator-side `/release` flow + `hooks/version-gate.py` invariant 4 + parity-audit fifth channel ship via the HQ-side framework (consumer-visible in the HQ `.claude/` tree but not in the npm tarball's `commands/release.md` exec path — operator-only).

- **`emit_event_http()`** is purely additive. Existing `emit_event()` callers continue to work unchanged. Consumers who do not set `TAPAGENTS_LIVE_TOKEN` see no behavior change at all; the new helper, if called, becomes a silent no-op.

To opt into the cloud mirror:

1. Obtain a per-machine bearer token from the cloud surface the consumer chooses to target (the framework does not bundle a token-issuance UI; that lives in the consumer-side surface).
2. Set `TAPAGENTS_LIVE_TOKEN=<token>` and optionally `TAPAGENTS_LIVE_INGEST_URL=<override>` in the shell environment the hooks run under.
3. Hooks that wish to mirror local emits to the cloud call `emit_event_http()` after their existing `emit_event()` call. Local-first ordering ensures the cloud mirror failing never affects the on-disk audit trail.

To use the trunk-discipline override token:

1. Land the release commit on a non-main branch carrying message `release: v<version> — ... [trunk-discipline-override: <reason>]`. Reason must be non-empty after whitespace strip (an empty bracket like `[]` or `[ ]` falls through to the hard ancestry check).
2. Tag the commit and push. Layer A logs `::warning::Trunk-discipline override present: <reason>` and proceeds with publish; the reason is recorded in the workflow log AND visible in `gh release view` because the release body includes the commit message via `softprops/action-gh-release@v2`.

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2`:

- **`hooks/_telemetry.py` `emit_event_http()` + `flush_pending()` additions** → MINOR: new public functions added to an active framework module; additive to existing behavior, no prior function removed or narrowed.
- **`commands/release.md` Layer B rewrite + `hooks/version-gate.py` invariant 4 + `scripts/version-parity-audit.ts` fifth channel** → MINOR: additive branch-discipline contract; existing /release flow continues to work via `[trunk-discipline-override:]` token for hotfix scenarios. The version-gate hook adds an invariant (additional check), not a narrowed contract. The parity-audit adds a channel (additional check). No prior caller of `/release` relied on tagging from a non-main branch (the case was unmodelled, not supported).
- **`.github/workflows/publish.yml` Layer A insertion** → operator-only; not tarball-shipped; alone this would be PATCH. Bundled with Layer B, the bundle floor is MINOR.

MAJOR rejected: no function removed, no module removed, no signature changed, no existing `/release` caller's contract narrowed. The override token preserves prior workflows for genuine hotfix scenarios.

### Files-array audit

All modified files fall under existing `package.json#files` entries — no new top-level entry required:

- `hooks/_telemetry.py` — under `hooks/`
- `scripts/test-emit-event-http.py` — under `scripts/`
- `.github/workflows/publish.yml` — NOT in files (workflow ships in repo, not in tarball; precedent: `publish.yml` and `notify-adopters.yml`)
- HQ-side files (`commands/release.md`, `hooks/version-gate.py`, `scripts/version-parity-audit.ts`, `protocols/versioning-protocol.md`, `agents/_planned/release-coordinator.md`, `memory/agent-changelog.md`) — sync from HQ `.claude/` to `tap-agents/` via `scripts/sync-src/sync.ts`; each lives under an existing files-array entry on the consumer side.

### Provenance + cross-references

- Trunk-discipline tech-strategy: `workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md` (architect spec; sealed pending Critic + user approval).
- Critic review (CLEAR-WITH-REVISIONS, 5 warnings + 4 FYIs all folded in): `workspace/_global/critic-trunk-discipline-2026-05-19.md`.
- Release-coordinator agent stubbed at `agents/_planned/release-coordinator.md` per org-designer proposal `workspace/_global/release-coordinator-proposal-2026-05-19.md` with staged activation post-v0.24.0 (W5 of Critic).
- Memory note `feedback_trunk_must_reflect_published_state.md` (originally caught 2026-05-13 during auto-adoption Phase 2b base verification) now annotated as **codified as Layer A + B in tap-agents v0.24.0** — historical reference, with mechanical floor authoritative.
- Recurrence record: v0.15.0 (2026-05-13) — tag-never-pushed-to-origin; v0.23.0 (2026-05-19) — tag-pushed-from-feature-branch-and-main-never-back-merged. Both incident classes covered by Layer A's ancestry check.


## [0.23.0] — 2026-05-19 — Framework expansion: Context7 + four new protocols + two new Tier 1 agents + multi-host architecture

**Minor release.** A multi-theme framework expansion. Adopters scaffolding this framework into their projects gain two new active Tier 1 agents (Marketing Designer + Industry Researcher), four new protocols (decision-class taxonomy, V2 roadmap anchoring, PRD addendum pattern, workstream index), a Context7 capability accelerant with `[context7]` citation tag, the canonical Constrained Implementation Mode dispatch contract, a new runtime-adapters metadata subsystem for multi-host targeting, permission-denial telemetry capture, the Critic 4-axis review architecture (depth assessment + decision class + V-anchor + addendum-vs-revision), and a first stack-specific Next.js template. Eight existing active-tier agents pick up prompt-version bumps to wire the four new protocols into their algorithms. No agent removed, no command removed, no protocol removed.

### Added

- **`docs/context7-setup.md`** + **`protocols/docs-research-protocol.md`** + **`[context7]` citation tag** — Context7 MCP capability accelerant for Strategist + Architect. The protocol codifies a single-call docs lookup contract for inline library/framework reference queries with graceful degradation when the MCP server is unavailable. Citation protocol gains a `[context7]` row in §Tags so docs-research-sourced claims are auditably distinct from `[research <URL>]` claims sourced via WebSearch / WebFetch. Spec for `docs-research-call` telemetry event reserved in `protocols/telemetry-events.md §2.5` — SPEC ONLY in this release; hook implementation deferred.

- **`docs/external-ecosystem-typology.md`** — Reference taxonomy that maps the framework's relationship to adjacent agent-shaped tooling (Claude Code's own subagents, third-party agent libraries, IDE-bound shells). Cited by Org Designer and Architect for routing decisions when ambiguity arises about whether a capability belongs inside the framework or as an external integration.

- **`protocols/decision-class-taxonomy.md`** — Five-class enum (`operational | strategic | commercial | clinical | legal`) for classifying every Open Question by who has authority to resolve. Operator-blocking classes (`operational | strategic`) gate engineering dispatch; ESCALATED classes (`commercial | clinical | legal`) do NOT gate dispatch — they escalate out of operator authority while engineering proceeds with a named workaround. Strategist and Architect classify each OQ in scope, PRD, and tech-strategy artifacts; EA renders the two surfaces in separate Decision Packet sections (with a cardinal-zero rule that omits empty ESCALATED sections).

- **`protocols/v2-roadmap-anchoring.md`** — Classification rule Architect applies to every V-item in a V2 roadmap. `architecture-now` (when all three triggers hold: composes with shipped interface + non-trivial wrong-path risk + boundary spec under ~40 lines) anchors a four-field entry in a reserved `tech-strategy.md §"Architecture-now V-anchors"` section at roadmap-creation time. `architecture-deferred` (any one trigger fires) defers the boundary write with a one-line reason. Critic Phase B `V-anchor` axis verifies the classification + anchor presence.

- **`protocols/prd-addendum-pattern.md`** + **`templates/prd-addendum.md`** — Binary classification for PRD revisions: in-place rewrite (rev N → rev N+1) when any of three triggers fires (semantics shift / new major story-or-risk / canonical-indefinite-answer) vs. parallel-artifact addendum citing the PRD when any of three triggers fires (parallel frame / different cadence / time-stamped moment). Default-when-uncertain is revision. Strategist's revision-pass algorithm classifies first; Critic's `addendum_vs_revision` axis reviews the choice. Template provides the addendum's citation-index + body-sections + trigger-reference shape.

- **`protocols/workstream-index.md`** — Per-project reading-order map at `workspace/<slug>/workstream-index.md` listing canonical artifacts + reading order for cold-resume. Conductor maintains the index on phase transitions per a new "Workstream Index Rebuild" algorithm section. Backlog Curator carries a `WORKSTREAM-INDEX-DRIFT-CANDIDATE` flag in Phase B.2 review.

- **`agents/marketing-designer.md`** + **`commands/marketing-design.md`** — Marketing Designer is a new active Tier 1 agent (sibling to product-flavored Designer). Owns visual + IA + conversion design for public marketing surfaces: hero composition, feature blocks, CTA hierarchy, scroll narrative, footer/meta, and competitor-as-conversion-machine evaluation. Three trigger lanes: briefed/scoping phase for projects with marketing surfaces, `/marketing-design <slug> [<page>]` direct invocation, post-launch conversion-rate iteration. Cross-referenced from Designer, PMM, and UI/UX Reviewer redirect tables.

- **`agents/industry-researcher.md`** + **`commands/industry-research.md`** — Industry Researcher is a new active Tier 1 agent. Owns deep competitive analysis, market sizing, trend monitoring, regulatory landscape, per-competitor moat decomposition, and source-quality grading. Supplements — never replaces — Strategist's first-pass competitive scan. Three-lane activation: Critic-signal portfolio recurrence, operator-driven single-project, project-class default. `/industry-research <slug> [--deep-dive=<competitor>]` direct invocation.

- **`commands/pmm.md`** — New `/pmm <slug> [--full]` slash command for direct invocation of the existing Product Marketing Manager agent. Ships PMM into command-direct mode for the first time.

- **`runtime-adapters/`** — New declarative-only metadata subsystem for multi-host runtime targeting. `shared/adapter-contract.json` is the JSON Schema for `adapter.json` files (`m2-runtime-adapters.v1`). `shared/manifest-v2.schema.json` is the schema for future generated manifest shape (`tapagents.manifest` v2.0). `shared/telemetry-fields.json` adds runtime-aware telemetry fields (`runtime.adapter_id`, `runtime.mode`, `runtime.plugin_beta_enabled`, `runtime.generated_file_count`). `claude/adapter.json` ships the Claude adapter with `legacy-manifest` mode (status `stable-existing`). `codex/adapter.json` ships the Codex adapter with `generated-files` default mode + `plugin-beta` non-default mode (status `planning-placeholder`). Per-host templates accompany each adapter (`legacy-manifest.json.tpl` for Claude; `AGENTS.md.tpl` + `agent.toml.tpl` + `config.toml.tpl` + `skill.SKILL.md.tpl` for Codex). Provider SDK imports, network calls, secrets, and inline bearer tokens are forbidden in adapter files by audit guard.

- **`scripts/render-runtime-adapter.ts`** + **`scripts/test-runtime-adapters.ts`** + **`scripts/sync-src/sync-codex.ts`** — Three new operator scripts. `render-runtime-adapter.ts` reads `runtime-adapters/<host>/adapter.json`, validates against `adapter-contract.json` schema, and emits files per the selected mode (`legacy-manifest` for Claude; `generated-files` for Codex). `test-runtime-adapters.ts` is the audit-discipline guard — refuses any provider SDK import, REST endpoint, credential-like field, or inline bearer token in adapter files. `sync-codex.ts` is the interim Claude → Codex agent + skill regeneration path planned for absorption into `render-runtime-adapter.ts` post-architecture-flip.

- **`hooks/permission-denial-capture.py`** + **`scripts/test-permission-denial-telemetry.py`** — Observational PostToolUse + PostToolUseFailure + PermissionDenied hook chain. Captures tool calls whose response indicates a permission denial (Claude Code permission mode, settings.json deny rules, framework hook blocks) and emits a `harness-or-permission` block event to `events.jsonl`. **Purely observational — exit 0 always; never blocks.** Primary capture surface for framework-hook firings (PreToolUse exit-2 from `orchestrator-dispatch-gate.py` / `pre-tool-gate.py` / `version-gate.py`). Test script provides focused coverage for telemetry privacy + classification.

- **`templates/competitor-deep-dive.md`** + **`templates/competitor-eval.md`** + **`templates/marketing-design-spec.md`** + **`templates/knowledge-base.md`** — Four new authoring-surface templates. `competitor-deep-dive.md` is per-competitor (snapshot / feature matrix / moat decomposition / source-quality grading) and used by industry-researcher. `competitor-eval.md` is competitor-as-conversion-machine evaluation (open-core business-model analogs prioritized over visual-polish-only references) used by marketing-designer. `marketing-design-spec.md` is the marketing design-spec template (brand posture / hero composition / feature blocks / CTA hierarchy / scroll narrative / footer + meta) used by marketing-designer. `knowledge-base.md` is the user-narrative-grade project context template (goals / decisions+rationale / stakeholders / glossary / story-so-far) used by `agents/_planned/knowledge-curator.md`.

- **`templates/stacks/nextjs/`** — First stack-specific template subtree. `README.md` declares the partial-stack baseline-fallback contract. `react-component-agent.md` is the first stack-specific frontend worker — the canonical Constrained-Mode Implementation consumer for UI-shell slices. Denies sim engine, DB schema, migrations, and framework files unless slice explicitly allows. Future Architects scaffolding Next.js Tier 2 sets now overlay this template's roles before falling through to baseline.

- **`agents/_planned/knowledge-curator.md`** — New planned-stub agent. Sibling-to-Backlog-Curator (curator-lite). Owns user-narrative-grade project context — `workspace/<slug>/knowledge-base.md`. Activation triggers: first project crosses phase-transition with ≥5 Decision Packets / user invokes `/knowledge-curate <slug>` / second active Tier 2 project lands. **Not yet activated** — stub only.

- **`protocols/dispatch-efficiency.md §7` — Constrained Implementation Mode (canonical dispatch contract)** — Full dispatch-contract spec: when-to-use (narrow slices, high-drift surfaces, post-drift re-dispatch), the canonical reusable template (`Mode: constrained` + `Slice ID:` + `Outcome:` + `Allowed paths:` + `Denied paths:` + `First proof by minute N:` + `Heartbeat every N minutes:` + `Stop and report if:` + `Verification:` + `Reportback fields:`), preflight echo requirement, drift-detection contract, and re-dispatch shape. Architect emits constrained-mode fields per the new "Implementation-brief constrained-mode requirement" section in `agents/architect.md`. Tier 2 conductor enforces the routing + preflight-echo contract; Tier 2 implementer emits the preflight echo before the first Edit/Write.

- **`protocols/backlog-protocol.md §3a — Acceptance-gate sub-state`** — New `awaiting-acceptance` status added to the backlog-item vocabulary. Transitions: `in-progress → awaiting-acceptance` on impl-landed-pre-user-signoff; `awaiting-acceptance → done` on user signoff; `awaiting-acceptance → in-progress` on user-rejected. Counts in BACKLOG SUMMARY split "engineer is coding" from "queue is waiting on user signoff."

### Changed

- **`agents/architect.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-2`. Adds: (a) docs-research-protocol routing reference + Context7 graceful-degradation pointer; (b) new V2-roadmap-anchoring algorithm step (classifies every V-item; anchors `architecture-now` entries in tech-strategy); (c) new decision-class-taxonomy algorithm step (classifies every OQ); (d) full "Implementation-brief constrained-mode requirement" section + capability constraint clause on Bash usage.

- **`agents/strategist.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-4`. Adds: (a) docs-research-protocol routing reference; (b) Operating Principle 8 — defer-deep to industry-researcher when active; (c) new decision-class-taxonomy algorithm step; (d) PRD-revision-vs-addendum classification on the revision-pass algorithm.

- **`agents/designer.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-1` (catching six days of staleness). Adds Operating Principle 7 (reference apps with biz-legal routing) + marketing-designer redirect-table entry for marketing-surface design.

- **`agents/conductor.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-1`. Adds the Workstream Index Rebuild algorithm section — Conductor now maintains `workspace/<slug>/workstream-index.md` on phase transitions per the new protocol.

- **`agents/critic.md`** — `prompt_version` bumped `2026-05-13-1 → 2026-05-18-1`. Adds the Phase B.1 four-axis bundle: `depth_assessment` axis (verdict shallow / adequate / deep for research-class artifacts), `decision_class` axis (verifies OQ classification), `V-anchor` axis (verifies V-item classification + anchor presence), `addendum_vs_revision` axis (verifies PRD revision-pass classification).

- **`agents/backlog-curator.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-1`. Adds Phase B.2 flag patterns: `STATE-DRIFT-CANDIDATE` (mechanical work-item drift) + `WORKSTREAM-INDEX-DRIFT-CANDIDATE` (per workstream-index protocol).

- **`agents/org-designer.md`** — `prompt_version` bumped `2026-05-12-1 → 2026-05-18-1`. Adds Phase B.3 — operator-driven activation checklist (the 4-question gate at 3-of-4 threshold) + `project_class` enum docs per decision-class-taxonomy composition.

- **`agents/executive-assistant.md`** — `prompt_version` bumped `2026-05-13-1 → 2026-05-18-1`. Adds Phase A.1 ESCALATED-OQ rendering split — `/briefing`, `/queue`, `/inbox`, and Decision Packets all split operator-blocking OQs from ESCALATED OQs into separate sections per decision-class-taxonomy §5.

- **`agents/product-marketing-manager.md`** — Adds marketing-designer cross-reference to the upstream-visual-asset list + redirect-table entry. No `prompt_version` bump (cross-reference additions are not semantic edits per `framework-change-discipline.md §9`).

- **`agents/ui-ux-reviewer.md`** — Adds marketing-designer redirect-table entry + marketing-class memory-append authority. No `prompt_version` bump (cross-reference additions only).

- **`agents/_planned/customer-researcher.md`** — Activation trigger rewritten as the same three-lane structure (Critic-signal portfolio / operator-driven / project-class default). Aligns with industry-researcher's trigger shape. Stub remains planned — no behavior change today; the activation gate now matches the portfolio-recurrence-driven pattern instead of impressionistic.

- **`agents/_planned/README.md`** — Stub count updated (9 → 10); knowledge-curator entry added; sibling-to-backlog-curator rationale appended.

- **`templates/decision-packet.md`** — Adds the ESCALATED-OQ rendering contract — splits `▸ OPEN QUESTIONS (operator-blocking)` from `▸ ESCALATED OQs (NOT operator-blocking; engineering proceeds with workaround)` per decision-class-taxonomy §5. Cardinal-zero rule for empty ESCALATED sections (omit entire section).

- **`templates/tech-strategy.md`** — Adds §8 `Architecture-now V-anchors` reserved section per v2-roadmap-anchoring §5. Per `architecture-now` V-item: four required fields (Composes with / Wrong-path risk this prevents / Boundary shape / Open question if any). Cardinal-zero rule for absence. Pre-existing §8 (Open Questions) renumbered.

- **`templates/stacks/_baseline/tier2-conductor.md`** — Adds the Constrained-Mode Routing section. Tier 2 conductor enforces the dispatch contract: constrained vs. default routing rules, preflight-echo enforcement at the conductor seat, rejection-without-preflight contract.

- **`templates/stacks/_baseline/tier2-implementer.md`** — Adds the Constrained Mode Preflight section. Implementer emits the preflight echo before the first Edit/Write call; full template embedded. Tier 2 conductor rejects reportback without preflight.

- **`protocols/citation-protocol.md`** — Adds `[context7]` row to §Tags table.

- **`protocols/telemetry-events.md`** — Adds §2.5 reserved next-slice `docs-research-call` event spec (SPEC ONLY pending hook implementation) + reserves the `harness-or-permission` event source from the permission-denial-capture hook (now active).

- **`hooks/_telemetry.py`** — Adds `emit_harness_block()` helper for the new permission-denial-capture hook. Backwards-compatible additive change.

- **`settings.json`** — Wires `permission-denial-capture.py` into PostToolUse + PostToolUseFailure events. Both wirings use the same script with a `*` matcher.

- **`scripts/build-src/build.ts`** + **`scripts/emit-metric.py`** + **`scripts/rollup-metrics.py`** + **`hooks/prompt-router.py`** + 13 protocols — Project-slug rename only (`<project>` → `<project>`) cascading from a prior internal cascade-rename event. No semantic content changes. See `Known follow-ups` below — these slug-rename phrasings ship to npm consumers and will be genericized in a future patch sweep.

- **`agents/_planned/test-engineer.md`** + **`agents/db-admin.md`** — Single + double project-slug rename only. No semantic changes.

### Known follow-ups

- **Brand-integrity sweep deferred to v0.23.1.** Thirteen protocols + three scripts contain `<project>` phrasing — load-bearing project-slug references with internal IDs and internal dates that ship verbatim to npm-tarball consumers. Per `feedback_framework_changelog_audience_discipline` (2026-05-17): public artifacts shipping in the tarball should avoid project slugs and internal user-decision dates. Sweep planned within ~48h as a patch release.

- **Interim `scripts/sync-src/sync-codex.ts` planned for absorption** into `scripts/render-runtime-adapter.ts` post architecture-flip. Both ship in this release. The renderer is the long-term path; the sync script keeps Codex consumers working today.

- **`docs-research-call` telemetry hook implementation deferred.** The event spec is reserved in `protocols/telemetry-events.md §2.5` (SPEC ONLY); the hook + helper land in a future release.

### Migration notes

**No breaking changes.** Two new active agents add new dispatch paths but no existing path is removed or narrowed. Four new protocols are referenced by other agents' algorithms within this same release — adopters running the framework gain the new behaviors automatically on the next dispatch. Eight existing agents bump `prompt_version`; Critic flags staleness on dependent artifacts produced under the prior version per `framework-change-discipline.md §9` (re-run-or-justify recommendation).

The `awaiting-acceptance` backlog status is additive — existing `in-progress` items continue to function unchanged; the new transition fires only when the implementer signals impl-landed-pre-user-signoff.

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2` ("new capability without removing any existing capability"):

- Two new agents under `agents/` → MINOR per §3.2.
- Three new commands under `commands/` → MINOR per §3.2.
- Four new protocols under `protocols/` → MINOR per §3.2.
- Six new templates + one new stack subtree under `templates/` → MINOR per §3.2.
- One new hook under `hooks/` wired additively → MINOR per §3.2.
- New `runtime-adapters/` subsystem + new scripts → MINOR (additive).
- Eight `prompt_version` bumps on active agents — all additive (new algorithm steps, new sections); no responsibility removed or narrowed → MINOR per §3.2.

MAJOR rejected: no agent removed, no command removed, no protocol removed, no hook authenticity marker removed, no `fires_when` trigger narrowed, no existing field removed from `settings.json` schema.

PATCH rejected: substantially more than doc edits — two new active Tier 1 agents, four new protocols, a new runtime-adapters subsystem, a canonical dispatch-contract protocol section, a new hook chain, eight `prompt_version` bumps with substantive algorithm changes.

### Cross-channel sync

All three channel-version fields update atomically:
- `package.json` `0.22.0 → 0.23.0`
- `.claude-plugin/plugin.json` `0.22.0 → 0.23.0`
- `.claude-plugin/marketplace.json` `plugins[0].version` `0.22.0 → 0.23.0`

### Files-array audit

- **`runtime-adapters/`** is a new top-level directory introduced in this release. The `runtime-adapters` entry is added to `package.json#files` so the metadata subsystem ships in the npm tarball.
- All other modified or added paths fall under existing `package.json#files` entries — `agents/`, `commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/`, `docs/`, `.claude-plugin/`, `settings.json`, `memory/`. No additional files-array changes required.
- Step 6d tarball-completeness probe (codified v0.18.0) confirms `runtime-adapters/` + the four v0.11.0-regression-class directories (`playbooks/`, `memory/`, `docs/`, `settings.json`) all surface in the published tarball.

### Provenance

PR [#5](https://github.com/tapintomymind/agents/pull/5) bundles the Context7 + external-ecosystem typology dispatch with intervening framework drift that accumulated on the authoring tree since v0.22.0 — the full Phase A.1 + Phase B framework-feedback rollout. The full categorized scope reference lives in the internal release inventory consulted at release time.

## [0.22.0] — 2026-05-17 — Operator infrastructure + framework discipline: sync reliability, HQ topology, Strategist OP#7

**Minor release.** This is an operator-facing infrastructure and framework-discipline release. Operators running the framework publish pipeline see direct behavioral changes. Pure consumers scaffolding this framework into their projects see no behavioral change in shipped agent prompts, protocols, hooks, or templates — the indirect benefit is a more reliable publish pipeline going forward. One exception: `agents/strategist.md` gains a new Operating Principle 7 (anchor-grep pre-flight) that affects all future Strategist dispatches in consumer environments.

The release has four components: (1) `scripts/sync-src/sync.ts` gains fail-loud guards and a `--source-mode` flag; (2) `scripts/sync-src/manifest.json5` gains a `lint_exemptions` config surface; (3) `protocols/sync-tapagents-protocol.md §10` canonicalizes the HQ filesystem-only topology; (4) `agents/strategist.md` adds Operating Principle 7.

### Added

- **`agents/strategist.md` — Operating Principle 7 (anchor-grep pre-flight).** New framework discipline rule: before sealing any PRD or PRD revision, Strategist must grep or Read every cited file path, function name, table name, schema column, route, or infrastructure-status claim against the live codebase. Empirical anchors only — aspirational anchors must be explicitly labeled `planned per <roadmap citation>`, never stated as live infrastructure. A companion bullet in "Read on Every Invocation" reinforces the rule at the top of every Strategist invocation. Affects all future Strategist dispatches in consumer environments. See `agents/strategist.md §Operating Principles` for the full text.

- **`--source-mode <auto|git|filesystem>` flag on `scripts/sync-src/sync.ts`** — explicit CLI override for source enumeration mode. `auto` (default) detects by `.git/` presence at the source root; `git` forces `git ls-files` enumeration; `filesystem` forces a manifest-glob directory walk. Every run prints the active mode to stderr as `[sync] source enumeration: <mode>`. Useful when the source tree is intentionally not git-tracked, or when the operator needs to override auto-detection without modifying the source tree.

- **`lint_exemptions` block in `scripts/sync-src/manifest.json5`** — new top-level config key consumed by `lintPropagatedBody()` in sync.ts. Structure: `{ "<rule-code>": ["<path1>", "<path2>"] }` — exact relative-POSIX path matching, rule-scoped. A path exempted from one rule is still scanned by all other rules. Initial population exempts three paths from the `project-slug-ref` rule: `agents/_planned/README.md`, `workspace/_registry.md`, and `agents/_planned/knowledge-curator.md` — each contains slug references that are load-bearing content, not lint targets. Header comment in the file documents the "when to add an entry" contract and explains why exact-path (not glob) was chosen for exemption auditability.

- **`protocols/sync-tapagents-protocol.md §10` — HQ filesystem-only topology canonicalized** (+67 lines). Documents the topology change effective 2026-05-17: HQ becomes a filesystem-only authoring surface (no local git layer); `tap-agents/` is the git-tracked publish surface; `scripts/sync-src/sync.ts` is the one-way propagation bridge. Six subsections cover: what changed and why, the topology table, how sync auto-detects enumeration mode against a filesystem-only source, the editing discipline (author at HQ, dry-run, apply, commit at tap-agents — no HQ commit step), risk and mitigation (including the `.git.archived-2026-05-17/` tombstone for one-command rollback), and cross-references. See `protocols/sync-tapagents-protocol.md §10` for the canonical spec.

### Changed

- **`scripts/sync-src/sync.ts` — two behavioral additions** (+223 lines):

  1. **Fail-loud source-equals-target guard.** At flag-resolution time, sync resolves both `--source` and `--target` to real paths via `realpathSync`. If they resolve to the same directory, sync emits a clear error and exits non-zero. Prior behavior: invoking sync from inside the publish target resolved source and target to the same tree, causing a silent self-sanitization pass rather than a propagation error. The guard makes this class of mistake loud rather than silent.

  2. **Filesystem-walk fallback in `computeSyncSet()`.** When the resolved source has no `.git/` directory, `computeSyncSet()` enumerates files via a recursive filesystem walk matched against the manifest's `include[]` / `exclude[]` globs, instead of calling `git ls-files`. Auto-mode selects the walk automatically when `.git/` is absent. Prior behavior: on a non-git source, `git ls-files` returned an empty set — sync appeared to succeed while propagating nothing.

- **`.claude-plugin/plugin.json` — hooks count corrected.** Description previously said "thirteen instrumented hooks"; actual count is fifteen. Now matches the hook wiring count in `settings.json`.

### Migration notes

**No breaking changes.** All additions are optional and auto-detect preserves prior invocation semantics.

- **Operators syncing from a non-git source** no longer need workarounds; filesystem-walk engages automatically.
- **Operators where source and target share a path** will now receive a fail-loud error rather than a silent no-op pass. Adjust the `--source` flag to point at the authoring tree, not the publish target.
- **Strategist OP#7** is additive; existing PRD artifacts are unaffected. The discipline applies on the next Strategist dispatch forward.

### Forward-pointer to v0.22.1

The feature payload ships in v0.22.1 through the pipe this release establishes: Constrained Implementation Mode (`protocols/dispatch-efficiency.md §7`), permission-denial telemetry activation (`hooks/permission-denial-capture.py`), multi-host scaffolding foundation (`runtime-adapters/`), marketing-designer agent, Next.js stack templates, 14-protocol prose refresh, and knowledge-curator stub.

### SemVer classification: MINOR

Per `protocols/versioning-protocol.md §3.2`:

- **`agents/strategist.md` OP#7** → MINOR: new operating principle added to an active agent contract; additive to existing behavior, no prior responsibility removed.
- **`--source-mode` flag** → MINOR: new optional CLI flag on a tarball-shipped operator-facing tool.
- **`lint_exemptions` config surface** → MINOR: new optional top-level key; additive config contract, no narrowing.
- **Filesystem-walk fallback** → MINOR: behavioral change to the source enumeration path in `computeSyncSet()`. Auto-mode now branches on `.git/` presence; operators invoking sync against a non-git source tree will see different (correct) behavior.

Additionally PATCH-class in the same ship: protocol §10 addition (additive documentation), plugin.json hooks-count correction (metadata; no capability change).

MAJOR rejected: no agent removed, no command removed, no protocol removed, no hook authenticity marker removed, no `fires_when` trigger narrowed.

### Files-array audit

All modified files fall under existing `package.json#files` entries — no new top-level entry required:

- `agents/strategist.md` — under `agents/`
- `scripts/sync-src/sync.ts` — under `scripts/sync-src/**/*`
- `scripts/sync-src/manifest.json5` — under `scripts/sync-src/**/*`
- `protocols/sync-tapagents-protocol.md` — under `protocols/`
- `.claude-plugin/plugin.json` — under `.claude-plugin/**/*`

### Provenance

Triggered by an internal framework discipline pass that identified two classes of silent failure in the publish pipeline (empty propagation set on non-git sources; no guard on source-equals-target invocations) and a recurring pattern of aspirational anchors in Strategist-produced PRDs being stated as live infrastructure. v0.22.0 closes both gaps: the sync tool fails loud where it was previously silent, and Strategist gains a mandatory anchor-grep discipline before PRD sign-off. SemVer reclassified from PATCH to MINOR on Critic review (new `--source-mode` flag + `lint_exemptions` config surface + `agents/strategist.md` OP#7 are all additive consumer-visible surfaces per §3.2).

## [0.19.0] — 2026-05-13 — Gate 5 defense-in-depth: verify-publish.yml + version-parity-audit

**Minor release** completing the Gate 5 amendment (started v0.18.0) by adding the deferred defense-in-depth layer: an independent CI workflow that verifies the npm publish from a cold pull, and a parity-audit script that EA runs daily across four version channels. v0.18.0's operator-side coverage remains primary; v0.19.0 adds independent verification + periodic safety-net.

### Added

- **`tap-agents/.github/workflows/verify-publish.yml`** (publish-pipeline asymmetry — tap-agents/-only) — `workflow_run`-triggered on `publish` workflow completed-success. Verifies all three §4.5 invariants (registry presence, tarball completeness, GitHub Release parity) from a cold npm pull, independent of `publish.yml`'s own attestation. Pre-release versions (any hyphen-containing version, e.g., `v1.0.0-rc.1`) skipped via POSIX `case "$VERSION" in *-*) skip ;; esac` filter — mirrors `notify-adopters.yml` shape. Auto-files a GitHub issue titled `Gate 5 §4.5 verification failed for v<version>` with `gate-5-failure` label on any failure (idempotent — appends a comment if an issue already exists for the same tag rather than opening a duplicate). Retry budgets sized for the ~30-120s workflow_run dispatch lag (e.g., invariant 1: 4 × 30s = 2-min vs operator-side 8 × 30s = 4-min). End-to-end verification target: completion within 5 min of publish-success. Permissions: `contents: read`, `issues: write`, `actions: read`. (454 lines)

- **`scripts/version-parity-audit.ts`** — tsx-based audit script (mirrors `scripts/test-changelog-format.ts` style — no vitest devDep). Audits 4 channels for `@tapintomymind/tap-agents`: local tags (`git -C <repo> tag -l 'v*'`), remote tags (`git -C <repo> ls-remote --tags origin 'v*'` with `^{}` peel-pointer filtering), npm versions (`npm view <pkg> versions --json`), and GitHub Releases (`gh release list --repo tapintomymind/tap-agents --limit 50 --json tagName`). Subset-bounded `KNOWN_ORPHANS` map annotates v0.15.0 (missing from remote+npm+releases) and v0.8.3 (missing from npm+releases) as `[ANNOT]` rather than `[WARN]`; a known-orphan version unexpectedly losing a NEW channel still surfaces as unknown divergence. CLI flags: `--repo-path <dir>` (default `../tap-agents/` resolved via `import.meta.url` — cwd-independent), `--json` (machine-readable output for EA/dashboard ingestion), `--help`. Wired into `package.json#scripts` as `audit:version-parity`. Exit codes: `0` parity / `1` unknown divergence / `2` environment error. Empirically validated 2026-05-13: ran live, output `PASS (2 known annotations; 0 unknown divergences)`. (646 lines)

### Changed

- **`protocols/versioning-protocol.md §4.5`** — verify-publish.yml lane finalized. Removed "DEFERRED to v0.19.0" marker. Prose now describes the actual implementation: workflow_run trigger, three invariants from cold pull, pre-release POSIX case filter, GitHub-issue auto-file with `gate-5-failure` label + idempotent comment-append, ~30-120s dispatch lag, 5-min end-to-end verification target, publish-pipeline-asymmetric placement (tap-agents/-only — not mirrored to `.claude/`). The "What each checkpoint catches" section's verify-publish.yml lane tightened to enumerate: publish-workflow-self-attestation bias mitigation, CDN-propagation race against operator-side timing (independent runner network), claim-vs-reality drift between publish.yml's exit code and actual npm state.

- **`protocols/versioning-protocol.md §4.6`** — `[PARTIAL — full implementation deferred to v0.19.0]` marker removed. Prose now describes the actual `scripts/version-parity-audit.ts` implementation: 4 channels read via `git -C <repo>`, `npm view`, `gh release list --json`; subset-bounded `KNOWN_ORPHANS` map with v0.15.0 + v0.8.3 entries; divergence-shape remediation table (mirrors audit's `remediationHint` mapping); exit codes 0/1/2; EA daily invocation via `npm run audit:version-parity`. Documents the exit-code-driven surface treatment EA applies (silent on parity, FYI on annotated orphans, P1 on unknown divergence, environment-error flagging on exit 2).

- **`agents/executive-assistant.md`** — `prompt_version` bumped to `2026-05-13-1`. New section "Version-Parity Daily Sweep (per `protocols/versioning-protocol.md §4.6`)" added between "Stale Detection" and "Session-Tracking Drift Sweep". Documents the daily-cadence invocation, the exit-code-driven surface table (silent / FYI / P1-immediate / environment-error), the do-NOT list (no auto-remediate, no silencing `[WARN]`, no unilateral `KNOWN_ORPHANS` mutation — that's an Org Designer route). Read-list addition: `protocols/versioning-protocol.md §4.6`.

- **`.claude/package.json`** — adds `audit:version-parity` script entry (`tsx scripts/version-parity-audit.ts`). No new devDeps (tsx already present).

### Provenance + acknowledgments

- Built on v0.18.0's operator-side Gate 5 (Steps 6a-6f in `commands/release.md`). v0.18.0 was empirically dogfooded at ship time (~42s tag-push to publish.yml success during the v0.17.0 dogfood; npm view returned on attempt 1; tarball probe confirmed all four v0.11.0-regression-class directories present).
- The v0.15.0 orphan that originally motivated Gate 5 is now machine-detectable by both `verify-publish.yml` (would have caught the missing tag's publish-day absence — though v0.15.0's specific failure mode was tag-never-pushed, which is operator-side Step 6a's beat, not CI-side; CI-side catches the cases where the tag DID reach origin) and `version-parity-audit.ts` (which surfaces v0.15.0 as `[ANNOT]` today — present in [local, remote], missing from [npm, releases]).
- v0.8.3 (workflow-failed-after-tag-push, pre-OIDC migration) is now annotated as a known orphan in the parity audit's `KNOWN_ORPHANS` map.
- Critic adversarial review 2026-05-12 (1st pass on Gate 5 amendment proposal) and 2026-05-13 (subsequent passes on v0.18.0 ship) flagged the operator-side ↔ CI-side split. v0.18.0 shipped operator-side per N2 deferral; v0.19.0 completes the design.

### Empirical evidence from v0.19.0 Step A live audit run

Before this CHANGELOG entry was drafted, `scripts/version-parity-audit.ts` was executed live against the v0.18.0-state repo. Output:

```
[ANNOT] v0.8.3 — present in [local, remote], missing from [npm, releases] (KNOWN ORPHAN)
[ANNOT] v0.15.0 — present in [local], missing from [remote, npm, releases] (KNOWN ORPHAN)
PASS (2 known annotations; 0 unknown divergences)
```

This validates: (1) the four-channel read paths work end-to-end (`git tag`, `git ls-remote`, `npm view`, `gh release list` all returned successfully); (2) the subset-bounded `KNOWN_ORPHANS` annotation logic correctly classifies both documented orphans; (3) `present_in` calculation correctly distinguishes v0.8.3 (local+remote, missing npm+releases) from v0.15.0 (local-only, missing remote+npm+releases) per their distinct underlying incident classes; (4) exit code 0 fires on `(0 unknown, N known)`, not on `(0 unknown, 0 known)` — so the audit usefully surfaces annotated state without false-failing.

### SemVer classification

**Minor** (per `protocols/versioning-protocol.md §3.2`):

- Adds new workflow file (`verify-publish.yml`) + new audit script (`scripts/version-parity-audit.ts`) + new package.json script entry (`audit:version-parity`) — additive surface.
- Updates protocol prose to remove deferral markers — codification-after-implementation matches the doctrinal-change-discipline that prose follows implementation (per `protocols/framework-change-discipline.md`).
- Updates EA contract additively — new daily-sweep responsibility; existing EA behavior preserved (briefings still 250-400 words; Decision Packets unchanged; no responsibility removed).
- No existing gate removed; no consumer-facing field removed; no marketplace plugin renamed.

PATCH rejected: more than a doc-edit. New CI workflow file + new operational script + new EA responsibility + new test surface.

MAJOR rejected: no downstream consumer (<project> Vercel build, marketplace users) breaks at the prior version. `verify-publish.yml` runs in the publish-pipeline and produces issues; it doesn't change the published artifact. `version-parity-audit.ts` is internal-discipline tooling; downstream consumers don't read it. EA's new responsibility is internal-cadence; the agent's user-facing output contract (briefings, Decision Packets) is unchanged.

### Cross-channel sync

All version-surface fields update atomically:
- `package.json` `0.18.0 → 0.19.0`
- `.claude-plugin/plugin.json` `0.18.0 → 0.19.0`
- `.claude-plugin/marketplace.json` `plugins[0].version` `0.18.0 → 0.19.0`

### Files-array audit

- `tap-agents/.github/workflows/verify-publish.yml` lives under `.github/workflows/` which is NOT in `package.json#files` (workflows ship in the GitHub repo, not the npm tarball — same precedent as `publish.yml` and `notify-adopters.yml`). No files-array change required.
- `.claude/scripts/version-parity-audit.ts` lives under `scripts/` (already in files-array). No files-array change required.
- `agents/executive-assistant.md` lives under `agents/` (already in files-array). No files-array change required.
- `protocols/versioning-protocol.md` lives under `protocols/` (already in files-array). No files-array change required.

Step 6d tarball-completeness probe (codified in v0.18.0) will confirm the established files-array entries remain present in the v0.19.0 tarball during the release flow.

## [0.18.0] — 2026-05-13 — Gate 5: post-publish verification + /release flow tightening

**Minor release** closing the publish-side gap exposed by the v0.15.0 incident (tag created locally, never pushed; publish.yml never fired; npm never received). Adds **Gate 5** to the version-honesty enforcement chain — operator-side verification that the tagged release actually reached npm before `/release` declares the release done.

### Added

- **`protocols/versioning-protocol.md §4.5`** — new Gate 5 (post-publish artifact verification). Three invariants: registry presence (`npm view <pkg>@<v>`), tarball completeness (`dist.tarball` + tar -tzf vs package.json#files), GitHub Release parity. Operator-side coverage live in v0.18.0; independent CI workflow (`verify-publish.yml`) deferred to v0.19.0.
- **`protocols/versioning-protocol.md §4.6`** — cross-channel parity audit clause (codified intent; implementation `[PARTIAL — deferred to v0.19.0]`).

### Changed

- **`commands/release.md` Step 6** — expanded from "`git push origin v<new>` and walk away" to a six-sub-step verification flow (6a-6f). Each sub-step has a single responsibility: tag-on-origin poll (6a, 120s timeout), publish.yml run resolution via headSha + watch (6b, B1-corrected filter), npm registry poll with backoff (6c), tarball completeness probe (6d, via `dist.tarball` + curl + tar -tzf), GitHub Release verification (6e), final all-channels-confirmed banner (6f). All FAIL paths have paste-safe heredoc remediation (B2-corrected).

### Provenance + acknowledgments

- Triggered by user observation 2026-05-12 of v0.15.0 missing from npm registry.
- Empirically validated 2026-05-13 by manual dogfood shipping `tap-agents/v0.17.0` to npm (42s tag-push to publish-success; npm view returned 0.17.0 on attempt 1; tarball probe confirmed all four v0.11.0-regression-class directories present).
- Critic adversarial review 2026-05-12 → CHANGES-REQUESTED (3 blocking + 6 non-blocking). All blocking resolved (B1 filter correction, B2 heredoc rewrite, B3 structural-pattern reframing). N1+N4+N5+N6 applied. N2+N3 deferred to v0.19.0.

### Note on v0.15.0 (orphan)

`v0.15.0 — BL-055 auto-register session-tracking hooks` was tagged locally in `tap-agents/` on 2026-05-12 but never pushed to origin; publish.yml never fired; npm never received. npm history shows `v0.14.0 → v0.16.0 → v0.17.0 → v0.18.0` with a gap at v0.15.0. (The `.claude/` framework HQ checkout DID tag and ship v0.15.0 at commit `a640efc`; the orphan is npm-channel-only — see v0.17.0 CHANGELOG entry for the full chain.) Functionally non-impactful (v0.15.0's content is fully present in v0.16.0+, so downstream consumers are unaffected). Treated as permanent absent contrary signal — if a future incident makes republishing strictly cleaner, the framework reserves the right to revisit; until then, the gap stays. This v0.18.0 Gate 5 amendment closes the operator-flow loophole that caused the orphan.

### Note on v0.17.0 reconciliation

Prior to v0.18.0 ship, two reconciliations landed in commits before this release:
- `tap-agents/afa41bf` (release: v0.17.0 — Auto-adoption producer pipeline) was tagged + pushed + published manually 2026-05-13 (this acted as the empirical dogfood for the Gate 5 design).
- `.claude/c5f86ed` (sync: tap-agents v0.17.0 back-merged into .claude/) brought the producer-pipeline content into the canonical authority. `notify-adopters.yml` stays tap-agents/-only (publish-pipeline asymmetry per established precedent).

### SemVer classification

**Minor** (per `protocols/versioning-protocol.md §3.2`):

- Adds new gate (§4.5) and new section (§4.6) to the enforcement chain — additive surface contract.
- Expands `commands/release.md` Step 6 with new sub-steps (6a-6f) — existing tag-push behavior preserved as a substep; additive verification.
- No existing gate removed or narrowed; no consumer-facing field removed; no marketplace plugin renamed.

PATCH rejected: more than a doc-edit. Release authors now must satisfy new operator-side verification before `/release` declares success. That's a contract change for release authors.

MAJOR rejected: no downstream consumer (<project> Vercel build, marketplace users) breaks at the prior version. The amendment is internal release discipline; nothing in §4.5 or §4.6 retroactively invalidates v0.16.0 or v0.17.0 already-published versions.

### Cross-channel sync

All version-surface fields update atomically:
- `package.json` `0.17.0 → 0.18.0`
- `.claude-plugin/plugin.json` `0.17.0 → 0.18.0`
- `.claude-plugin/marketplace.json` `plugins[0].version` `0.17.0 → 0.18.0`

### Files-array audit

The two modified surfaces both fall under existing `package.json#files` entries:
- `protocols/versioning-protocol.md` — under `protocols/` (already in files-array)
- `commands/release.md` — under `commands/` (already in files-array)

No `package.json#files` change required. Step 6d tarball-completeness probe (newly codified in this release) will confirm the four v0.11.0-regression-class entries (`playbooks/`, `memory/`, `docs/`, `settings.json`) remain present in the published tarball.

## [0.17.0] — 2026-05-13 — Auto-adoption producer pipeline

**Minor release** mirroring `tap-agents/v0.17.0` (npm-published 2026-05-13). Brings the producer-pipeline content into `.claude/` as the canonical authority per `protocols/versioning-protocol.md §2`. Reverse-direction sync: the producer-pipeline feature was authored in `tap-agents/` directly (feature branch `feat/auto-adoption-producer`); this release back-merges the appropriate subset into `.claude/`. Asymmetric file set per established publish-pipeline precedent: `notify-adopters.yml` lives only in `tap-agents/` (publish-pipeline-only, fires on `publish.yml` workflow_run completion); the CHANGELOG-format test + version-check step + package script mirror into `.claude/` so `.claude/CHANGELOG.md` benefits from the same drift-prevention guard.

### Added

- **`scripts/test-changelog-format.ts`** — tsx-based integration test asserting every `## [X.Y.Z] — YYYY-MM-DD` heading in `CHANGELOG.md` matches the canonical regex (`/^## \[\d+\.\d+\.\d+\] — \d{4}-\d{2}-\d{2}( .+)?$/`). Mirrored byte-for-byte from `tap-agents/v0.17.0`. Uses `node:assert/strict` — no vitest dependency. The regex is the same one the consumer's awk extractor in `<project>/.github/workflows/adopt-tap-agents.yml` relies on; if a heading drifts, the consumer silently emits an empty CHANGELOG section in adoption PRs. This test catches drift before merge.

### Changed

- **`.github/workflows/version-check.yml`** — adds `Run CHANGELOG format test (CR-13 / NF-9)` step after the existing `Run version-check` step. Gates PR merges on CHANGELOG format correctness. Mirrored from `tap-agents/v0.17.0`. The `paths:` filter already covers `CHANGELOG.md` + `scripts/**` + `package.json` so the new step fires whenever it can usefully fire.
- **`package.json`** — adds `test:changelog-format` script (`tsx scripts/test-changelog-format.ts`). `tsx` is already a devDependency at `^4.19.0`, so no new dependency was introduced.

### Files explicitly NOT mirrored

- **`.github/workflows/notify-adopters.yml`** — publish-pipeline-only file (fires on `publish.yml` workflow_run completion). Has no function in `.claude/` because `.claude/` does not publish to npm. Stays in `tap-agents/` exclusively. This asymmetry mirrors the pre-existing `publish.yml` asymmetry: `tap-agents/` has it, `.claude/` does not.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `0.16.0 → 0.17.0`, `.claude-plugin/plugin.json` `0.16.0 → 0.17.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.16.0 → 0.17.0`. Matches `tap-agents/v0.17.0` npm-published version.

### SemVer classification

Per `protocols/versioning-protocol.md §3.2` ("new capability without removing any existing capability"): **MINOR.** Additive new test script + new CI step + new package script. No file removed, no agent contract changed.

### Notes on v0.15.0 (orphan from prior release flow)

`tap-agents/v0.15.0` (BL-055 auto-register session-tracking hooks) was tagged locally in `tap-agents/` on 2026-05-12 but the tag was never pushed to origin, so `publish.yml` never fired. npm shows `v0.14.0 → v0.16.0 → v0.17.0` (gap at v0.15.0). The functional content of v0.15.0 is present in v0.16.0 and onwards on npm, so downstream consumers are not affected. The `.claude/` tree DID tag and ship v0.15.0 (commit `a640efc`) — the gap exists only in the public `tap-agents/` channel. The forthcoming Gate 5 amendment (queued in `workspace/_global/org-designer-proposals/20260512-2330-gate-5-post-publish-verification.md`, scheduled for v0.18.0) closes the operator-flow gap that caused the missed tag-push.

### Provenance

Back-merged from `tap-agents/afa41bf` (release: `v0.17.0 — Auto-adoption producer pipeline`). Original feature work landed on `feat/auto-adoption-producer` branch in `tap-agents/`. This `.claude/` commit syncs the appropriate subset back into the canonical authority. The marketing-designer working-tree content (`agents/marketing-designer.md`, `commands/marketing-design.md`, supporting templates, related agent edits) remains uncommitted in `.claude/` and is queued for a separate release after the Gate 5 amendment ships as v0.18.0.

---

## [0.16.0] — 2026-05-12 — BL-056 CI-bot authorization path for sentinel-bound migration scripts (ratify-with-conditions)

**Minor release** opening a third authorization source in `protocols/destructive-data-ops.md` — a named sentinel-bound CI script on push-to-branch can perform Tier A/B destructive ops, with the merge commit SHA + author + timestamp serving as `user_confirmation.verbatim`. Drives the BL-056 (`<project>`) auto-sync workflow for Drizzle migrations to Vercel Preview's Neon branch — empirically motivated by the 2026-05-11 + 2026-05-12 same-class drift incidents. Ratified by Org Designer 2026-05-12 with ten binding conditions (C-1 through C-10).

**Motivation.** Vercel Preview deployments connect to a different Neon branch than `.env.local` resolves to. Until this release, applying a migration to one branch via the local-resolved URL silently failed to reach the Preview branch, surfacing as `column "..." does not exist` on `/dashboard` queries. Manual two-branch discipline failed twice in 48 hours (2026-05-11 BL-034 redispatch warning ignored → 2026-05-12 outage recurrence). The CI-bot path closes the latency-failure surface that human discipline cannot reliably close.

### Added

- **`protocols/destructive-data-ops.md` §4.1 — Authorization sources.** New table codifying the three authorization paths: live operator typing (Tiers A/B/C), pre-approved batch (A/B), and CI-bot sentinel-bound script on push-to-branch (A/B only — never Tier C). The CI-bot row carries six binding constraints (named-script-in-register, sentinel-verify, static destructive-pattern guard, branch-ID provenance, audit-log writeback, Tier-C-refused-unconditionally) and a `[Ratified by Org Designer 2026-05-12]` marker. Existing authorization paths (live operator, batch-approved) continue to function unchanged.

- **`protocols/destructive-data-ops.md` §8 #6 — Carve-out for sentinel-bound CI scripts.** New subsection codifying that a NAMED script registered in the per-project `db-register.md` MAY perform destructive ops in deferred-execution context provided all six binding constraints hold on every invocation. The carve-out is narrow by design: only named scripts, only Tier A/B, only with the guard chain intact. Marked `[Ratified by Org Designer 2026-05-12 — conditions per §4.1 ratification block]`.

- **`protocols/destructive-data-ops.md` §4.1 — Ratification conditions (C-1 through C-10).** Org Designer's ten binding conditions on the carve-out, including: register-growth-gate (C-1), Tier C absolute floor (C-2), branch-ID probe HARD-required by 2026-06-11 (C-3 — closes the host-prefix-fallback hole), branch-protection probe by 2026-07-11 (C-4), mid-flight failure handling (C-5), audit-commit-failure escalation (C-6), script-hash versioning to close the swap-script-keep-name attack (C-7), 6-month sunset clause (C-8 — 2026-11-12), monthly OD audit lane (C-9), no expansion to non-migration ops without re-ratification (C-10).

- **`memory/agent-changelog.md`** — public-safe narrative entry documenting the OD ratification trigger, the as-shipped amendment's gap surfaces, the ten-condition mitigation, and the team-shape recommendation (no `ci-ops` role; existing four-pass review chain is the right cardinality). Cross-references this CHANGELOG entry per `protocols/changelog-protocol.md §5`.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:

- **MINOR.** New authorization-source path added (CI-bot) — additive per §3.2 ("new capability without removing any existing capability"). Existing operator-typing and batch-approved authorization paths continue to function unchanged. New §8 #6 carve-out is additive — non-carve-out destructive ops still bound by the pre-existing §8 #6 strict prohibition. No file removed/renamed; no agent contract changed.
- **PATCH rejected.** New authorization-source path is more than a doc-edit — it codifies a new capability that downstream consumers (the first being `<project>/scripts/migrate-preview-branch.mjs` per its `db-register.md`'s Named-CI-scripts section) materially rely on.
- **MAJOR rejected.** No public-surface removal or rename. Pre-existing authorization sources continue unchanged.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `0.15.0 → 0.16.0`, `.claude-plugin/plugin.json` `0.15.0 → 0.16.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.15.0 → 0.16.0`.

### Files-array audit

No new file paths added to the framework root. `protocols/destructive-data-ops.md` is already under `protocols/` in `package.json#files`. `memory/agent-changelog.md` is under `memory/` in `files[]`. Verify both surface via `npm pack --dry-run` per `runtime_tap_agents_files_array_regression.md` discipline.

### Downstream consumer notes

- **`<project>`** is the first consumer of the new authorization path via `scripts/migrate-preview-branch.mjs` (committed separately on `<project>@dev` at SHA `799753e`). The script implements all six binding constraints + closes C-3's 30-day window early (token HARD-required, no host-prefix fallback).
- Future consumers must register every named CI script in their per-project `db-register.md` "Named CI Scripts" section per C-1 + C-7. Joint `db-admin` + `org-designer` review is binding before any new named script runs in CI.

### Provenance

- BL-056 P1 Tier 2 (`<project>`) — full audit chain in `<project>/.claude/audits/destructive-ops.log` + `<project>/.claude/scope/migration-auto-sync.md`.
- Two-class same-day recurrence: 2026-05-11 BL-034 preview redispatch warning ignored → 2026-05-12 /dashboard outage. Cleared 2026-05-12 by manual SQL against the dev Neon branch (`<dev-neon-branch>`).
- Critic-reviewed twice (REWORK→REWORK→ship-ready); Org-Designer-ratified with ten conditions, all operationally enforced as of this release.

---

## [0.15.0] — 2026-05-12 — BL-055 auto-register session-tracking hooks (graduate §247 from Future to Current)

**Minor release** landing the three-hook stack that auto-registers, materializes, and seals `active-sessions.md` entries WITHOUT manual operator action. Graduates `protocols/session-coordination-protocol.md §247` from "Future enforcement (hooks)" to "Current enforcement (hooks)." Closes BL-055 (P1 Tier 1).

**Motivation.** The May 6 manual-discipline version of Rule 1 demonstrably failed. Six days passed (2026-05-06 → 2026-05-12) with zero new `active-sessions.md` entries despite four concurrent feature branches colliding on the v0.13.1 version slot AND two parallel sessions independently dispatching architect to fix the same backlog item (BL-049 sync transformer field-merge nearly redispatched as BL-053, ultimately reconciled into BL-051 via Path A reconciliation). The friction the protocol exists to eliminate persisted because the entrance fee — open `active-sessions.md`, append a YAML block, remember to seal it — wasn't paid. User directive 2026-05-12: *"session tracking should be defaulted, and almost always added on session start hook or something."* This release makes it default.

### Added

- **`hooks/session-tracking-register.py`** — SessionStart hook. Fires on `startup` / `resume` / `clear` / `compact` alongside the existing `session-start-brief.py` (briefing emits stdout JSON; registration writes to disk — independent effects). Writes a per-session sidecar at `<workspace>/_global/sessions/<cc_session_id>.json` keyed by Claude Code's `payload.session_id`, and upserts a stub entry into `active-sessions.md` with `scope: <auto — pending first cross-cutting edit>` and empty `files_in_flight: []`. Resume/compact bumps `last_updated` + increments `resume_count`, preserving accumulated state.

- **`hooks/session-tracking-files.py`** — PreToolUse hook. Fires on Edit / Write / NotebookEdit AFTER the existing three-gate chain (`pre-tool-gate.py` → `version-gate.py` → `orchestrator-dispatch-gate.py`) so a gate-blocked edit never pollutes the manifest. Matches the target path against the cross-cutting scope list in `protocols/session-coordination-protocol.md §31-46`; on match, appends the path to the active session's `files_in_flight` (set-semantics — no duplicates) and upgrades the stub's `-pending-<hash>` suffix to a scope label (e.g., `2026-05-12T15-22-protocol`). Non-cross-cutting paths (project `src/`, single-project workspace artifacts) are noops. ALWAYS exits 0 — observational only, never blocks.

- **`hooks/session-tracking-seal.py`** — Stop hook. Fires after `stop-critic-check.py` (the actual gate) and `stop-dispatch-monitor.py`. Reads the sidecar; compares `files_in_flight` against `git log main` since `started`. Three outcomes: (1) all merged → `status: sealed` + `auto_sealed: <ts>` + `auto_seal_merge: <SHA>` + `auto_seal_files: [list]` + `completion_note: AUTO-SEALED via Stop hook — shipped via <SHA> at <ts>; N of N claimed files merged.` (matches the existing `<project>/scripts/promote-to-prod.sh` auto-seal shape per protocol Rule 1 §A); (2) some merged, some not → `status: partial` with the unmerged subset noted; (3) none merged → leave `status: in-progress`, bump `last_updated` (the session may resume). Empty stubs (no cross-cutting work) seal as `status: noop` with a clear completion note. NEVER blocks Stop.

- **`hooks/_session_tracking.py`** — shared helpers module imported by all three hooks. Underscore-prefixed (convention from `_telemetry.py`) so the build-script's frontmatter-listing logic doesn't pick it up as a top-level hook. Owns: sidecar I/O (atomic temp-file + rename), `is_cross_cutting_path()` matcher with regex-based protocol §31-46 patterns, `render_entry()` / `upsert_entry()` for the active-sessions.md projection, `files_landed_on_main_since()` + `latest_main_sha()` git helpers for the Stop hook's auto-seal decision, and `normalize_for_manifest()` for the path-format contract (repo-relative paths only — never basenames; the protocol's Rule 1 path-format contract is load-bearing for cross-monorepo false-positive avoidance).

- **`scripts/test-session-tracking.py`** — integration test harness. Spawns each hook as a subprocess with synthetic Claude Code JSON payloads against a temp workspace + temp git repo. Eight scenarios: fresh SessionStart writes stub; non-cross-cutting edit is noop; cross-cutting edit materializes `files_in_flight` + upgrades id; duplicate edit is idempotent; distinct `cc_session_id` writes a separate sidecar (parallel-session isolation); Stop after full merge writes `auto_sealed`; partial-merge case writes `status: partial`; empty stub seals as `status: noop`. All 8 scenarios pass on v0.15.0 commit.

### Changed

- **`settings.json` (internal + public, byte-identical per the sync transformer's pass-through sanitizer)** — three new hook wirings, escape-quoted paths per `runtime_claude_code_hook_path_quoting.md` (the workspace path has a space; unquoted `$CLAUDE_PROJECT_DIR/hooks/foo.py` silently fails exit 127). `SessionStart` chain becomes 2 hooks (briefing + register). `Stop` chain becomes 3 hooks (critic-check + dispatch-monitor + seal). `PreToolUse` chain becomes 4 hooks (safety + version + dispatch + tracking). Order matters in all three chains; documented in each chain's `_purpose` annotation.

- **`scripts/sync-src/manifest.json5` (internal + public)** — four new entries in the `sanitize:` block routing the three new hook scripts + the shared lib through `sanitize-passthrough`. Discipline matches the existing hook entries; verify-sync now covers the new files.

- **`protocols/session-coordination-protocol.md §247`** — rewritten from "Future enforcement (hooks)" to **"Current enforcement (hooks) — landed v0.15.0"**, documenting the three hooks' guarantees + the empirically-verified subagent-attribution decision (path b, not path a). Three Known Limitations enumerated explicitly: (1) future Claude Code semantics change could fragment session_id across subagents — forensic-detectable via the auto-emitted HTML-comment sentinels; (2) Stop-hook seal only fires on Stop — abrupt session ends leave `in-progress` entries (long-tail handlers unchanged); (3) auto-seal git-log query targets `main` only — non-main integration branches don't auto-seal. A separate "Future enforcement" block lists three further hardening hooks not landed in this release (CHANGELOG-collision pre-edit, atomic-cadence pre-commit, lane-ownership pre-edit). The manual fallback path (Rule 1's hand-authored entries) remains valid for sessions outside Claude Code.

- **`.claude-plugin/marketplace.json` (both trees)** — `plugins[0].description` updated to reflect "ten instrumented enforcement + telemetry hooks" (up from "seven") with "v0.15.0 adds auto-registration of cross-cutting sessions" provenance.

### Subagent-attribution decision (the load-bearing design choice)

Two paths considered for binding subagent-context PreToolUse hook calls back to their parent's session manifest entry:

- **(a) Env inheritance** — SessionStart sets `TAPAGENTS_SESSION_ID`; PreToolUse in subagent context reads it.
- **(b) File-based binding** — SessionStart writes a sidecar keyed by Claude Code's `payload.session_id`; PreToolUse looks it up.

Empirical finding from the v0.15.0 architect dispatch (2026-05-12): hook scripts run as subprocesses; their `os.environ` mutations don't propagate to Claude Code's main process. Claude Code hooks have no documented `additionalEnv` field. Even if SessionStart sets the env, Claude Code's main process never sees the mutation; the subsequent subagent dispatch inherits Claude Code's environment, NOT the SessionStart subprocess's. **Path (a) is structurally impossible.**

Path (b) was therefore chosen. `payload.session_id` is Claude Code's own session identifier, present in every hook's stdin JSON, stable across orchestrator + subagent dispatches inside one Claude Code instance — `hooks/stop-dispatch-monitor.py` has relied on this primitive across v0.10.0–v0.14.0 (it thresholds dispatch-gate blocks within a single session counting orchestrator + subagent events that share `session_id`). A subagent dispatch's PreToolUse reads the SAME sidecar SessionStart wrote at the parent's startup — automatic correct attribution to the parent session. Subagent attribution falls out of the design for free.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:

- **MINOR.** Three new hook script files + one new shared lib file under `hooks/` — additive per §3.2 (severity floor for additions in `hooks/`). New file `scripts/test-session-tracking.py`. New protocol prose in `protocols/session-coordination-protocol.md` (graduates §247 from "Future" to "Current" — additive enforcement, no removals). Manifest sanitize-list additions. Three settings.json `_purpose` block edits + chain extensions (additive hook entries). No agent contract changes; no agent's authority narrowed; no removed/renamed files.
- **PATCH rejected.** Three new hooks at the `hooks/` directory severity-floor; new public protocol enforcement surface.
- **MAJOR rejected.** No public-surface removal or rename. The manual fallback path documented in Rule 1 remains valid.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `0.14.0 → 0.15.0`, `.claude-plugin/plugin.json` `0.14.0 → 0.15.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.14.0 → 0.15.0`. Both internal and public trees updated byte-identically.

### Files-array audit

Per memory note `runtime_tap_agents_files_array_regression.md`, every release that touches `tap-agents/` must verify new content surfaces via `npm pack --dry-run`. v0.15.0 additions:

- `hooks/_session_tracking.py` — `hooks/` already in `package.json#files`. Verified included.
- `hooks/session-tracking-register.py` — `hooks/` already in `files[]`. Verified included.
- `hooks/session-tracking-files.py` — `hooks/` already in `files[]`. Verified included.
- `hooks/session-tracking-seal.py` — `hooks/` already in `files[]`. Verified included.
- `scripts/test-session-tracking.py` — `scripts/` already in `files[]`. Verified included.
- `protocols/session-coordination-protocol.md` (modified body) — `protocols/` already in `files[]`. Verified included.

### Provenance

- BL-055 P1 Tier 1 filed 2026-05-12T15:00 via curator dispatch (commit `71c5291` on branch `backlog-bl054-bl055-filing`). Source: four-branch v0.13.1 collision incident; user-confirmed *"session tracking should be defaulted."*
- Empirical subagent-attribution verification: v0.15.0 architect dispatch 2026-05-12 (this release). The empty `CLAUDE_PROJECT_DIR` + absent `TAPAGENTS_*` vars in the architect subagent context confirmed env-inheritance was structurally impossible BEFORE writing the hooks.
- Implementation: branch `bl055-session-tracking-hooks` off `main` post-v0.14.0. Eight integration-test scenarios passing.
- Related-but-out-of-scope (surfaced for OD): BL-018 may be an earlier formulation of BL-055 — OD to evaluate `wontfix-in-favor-of-BL-055`. Curator-notes entry 2026-05-12T15:00 carries the audit trail of the harness-vs-framework distinction in this filing.

---

## [0.14.0] — 2026-05-12 — Framework-Hardening Wave 1 + BL-046 subagent execution context discipline

**Minor release** bundling two coordinated framework-quality lifts on the same 14 agent contract surface — combining them avoids a rebase since both touch the same files. Each independently MINOR per `protocols/versioning-protocol.md §3.2` (additive frontmatter, additive Authority-section prose, additive protocol file); bundled here because they ship on the same coordinated edit pass.

### BL-046 — Subagent execution context discipline

**Motivation.** On 2026-05-12, three Tier 1 subagent dispatches in one session self-reported that `orchestrator-dispatch-gate.py` blocked their tool calls. Telemetry confirmed ZERO matching block events — the gate worked correctly (it bypasses subagents by design via `agent_id` / `agent_type` PreToolUse payload detection). The misdiagnosis was class-shaped: 0 of 14 framework agent contracts mentioned the gate by name or taught the harness-vs-framework distinction. Each misdiagnosis surfaced an "override the hook" recommendation — accepting one would erode the audit-trail mechanism the gate is here to maintain. Full forensic trace in `workspace/_global/org-designer-proposals/20260512-1500-subagent-misdiagnosis-pattern.md`.

Three coordinated interventions:

#### Added

- **`## Subagent execution context` block in 14 framework agent contracts** — template-uniform ~14-line block at the top of every contract, between the H1 intro paragraph and `## Your Job in One Sentence`. Codifies: (a) every agent IS a subagent; (b) `orchestrator-dispatch-gate.py` bypasses subagent calls by design; (c) canonical signature of an actual gate firing is `Orchestrator-dispatch gate BLOCKED:` plus the authenticity marker `TAPAGENTS_DISPATCH_GATE_FIRED_V1`; (d) the harness-level `Permission to use Bash` prompt is SEPARATE from any framework hook; (e) agents NEVER propose disabling/allowlisting/overriding the gate. Block is intentionally template-uniform across all 14 files so the rule stays grep-able.
- **`TAPAGENTS_DISPATCH_GATE_FIRED_V1` authenticity marker in `hooks/orchestrator-dispatch-gate.py` stderr** — when the gate blocks a tool call on the main orchestrator thread, the stderr message now embeds the literal token. Agents can only claim the gate fired if they can quote the token from their tool result. Training-data priors cannot synthesize the token; only the actual stderr message contains it. Versioned (`V1` suffix) for forward-compat if the gate is replaced.
- **`protocols/hook-misdiagnosis-discipline.md` (NEW)** — single canonical reference cited from every agent contract's new `## Subagent execution context` block. Six sections: (1) framework hooks inventory with per-hook canonical authenticity markers; (2) per-hook subagent-bypass status; (3) harness-vs-framework distinction; (4) mandatory citation rule (quote the canonical marker verbatim or do not claim the hook fired); (5) optional fallback verification path (Read events.jsonl filtered by own session_id); (6) escalation rule (report literal stderr + session_id + tool call, then stop).

### Framework-Hardening Wave 1 — tools allowlist + tier metadata + capability constraints

**Motivation.** Prior to v0.14.0, zero of 14 framework agent contracts declared a `tools:` allowlist — every agent inherited the full tool set with no harness-layer least-privilege enforcement. Critic (review-only by design) could in principle Edit any artifact; the framework wouldn't stop it. The audit-trail integrity story relies on semantic role boundaries being enforced at the harness layer, not just the prompt layer. Per `workspace/_global/framework-hardening-proposal.md §7` (Wave 1 greenlit 2026-05-12) and the per-agent prompt-walk in `workspace/_global/framework-hardening/wave1-agent-updates.md`.

#### Added

- **`tools:` bare-array allowlist in all 14 agent frontmatter** — derived per-agent from prompt-walk methodology (read body, cite by `path:line`, aggregate, capability-sufficiency check). Bare Claude Code tool-name array per the forthcoming `protocols/agent-prompt-shape.md §2.1` (Wave 2). No bounded forms (`Bash(read-only)`, `Write(<path-glob>)`, etc.) — capability narrowing lives in the agent's prompt prose as a Capability constraint sentence.
- **`tier: 1` declaration in all 14 agent frontmatter** — explicit declaration of framework-tier identity. Tier 2 baseline templates retain `tier: 2` when retargeted (Wave 1 deliverable scoped to `.claude/agents/`; Tier 2 propagation is a separate downstream step per the rollout plan).
- **`prompt_version` bump on all 14 agents** — to `2026-05-12-1` for 13 agents; Critic carries both Wave 1 + the forthcoming Wave 2 agent-contract-review addendum, bumped to `2026-05-13-1` so the two land together.
- **Capability constraint prose sentence added to 9 capability-widened agents** (Architect, Backlog Curator, Conductor, Critic, EA, Ops-Security, Org Designer, Quality Engineer, UI/UX Reviewer) — narration-layer counterpart to the bare-array tools field. Each constraint enumerates the agent's actual Bash/Write/Edit purposes (e.g., Critic's Bash is bounded to `emit-metric.py` invocation + read-only verification; UI/UX Reviewer's Bash is bounded to Playwright runner + screenshot capture + read-only). Per the B1 reconciliation 2026-05-12 — prior parenthetical-bounded form was retired; intent moved to prose.

#### Fixed

- **`agents/conductor.md` Phase 3 auto-iterate gate stale xref** — cited `templates/stacks/_baseline/agents/tier2-conductor.md` (the `agents/` segment was spurious). Verified actual file at `templates/stacks/_baseline/tier2-conductor.md`. Corrected so the gate condition resolves.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:

- **MINOR.** Additive frontmatter fields (`tier`, `tools`, `prompt_version` where previously absent) — schema additive, no field removed. Additive prose sentences in Authority sections — no narration removed. New protocol file `protocols/hook-misdiagnosis-discipline.md` in the public surface. New authenticity marker emitted by the existing block path (additive stderr content). No agent's prior authority narrowed beyond what the harness allowlist now declares.
- **PATCH rejected.** Frontmatter schema gains three new required-going-forward fields. The Critic Agent-contract-review addendum (forthcoming Wave 2 bumped already at `prompt_version: 2026-05-13-1`) adds an enforcement surface that did not previously exist.
- **MAJOR rejected.** No public-surface removal or rename. No agent's existing capability narrowed — the prior implicit-full-tool-set is replaced by an explicit allowlist that intersects each agent's actual usage per the prompt-walk.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `version` `0.13.2 → 0.14.0`, `.claude-plugin/plugin.json` `version` `0.13.2 → 0.14.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.13.2 → 0.14.0`.

### Files-array audit

Per memory note `runtime_tap_agents_files_array_regression.md`, every release that touches `tap-agents/` must verify new content surfaces via `npm pack --dry-run`. v0.14.0 additions:

- `protocols/hook-misdiagnosis-discipline.md` — new file under `protocols/` (already in `package.json#files`). Verified included.
- All 14 modified `agents/*.md` — `agents/` already in `package.json#files`. Verified included.
- `hooks/orchestrator-dispatch-gate.py` — `hooks/` already in `package.json#files`. Modified body verified included.

### Provenance

- BL-046 carved out of `workspace/_global/org-designer-proposals/20260512-1500-subagent-misdiagnosis-pattern.md` (P1; user-approved 2026-05-12). The proposal documents the empirical telemetry zero-confirmation that drove the class-level fix.
- Framework-Hardening Wave 1 from `workspace/_global/framework-hardening-proposal.md §7` (greenlit 2026-05-12, including 4 Critic reconciliation passes B1–B4). Per-agent walks are in `workspace/_global/framework-hardening/wave1-agent-updates.md`.
- Both initiatives explicitly target the same 14 framework agent contract files; bundling avoids a rebase. Per-commit atomicity preserved within the single branch.

---

## [0.13.2] — 2026-05-12 — Sync transformer field-merge + private-npm-publish-guard (BL-051 + BL-052)

**Patch release** combining two complementary halves of one atomic concern: (1) the `template-package-json` transformer is rewritten from a pass-through copy into a structured field-by-field merge that prevents the v0.11.0 / v0.12.2 files-array regression class for good (BL-051); and (2) internal `.claude/package.json` is marked `"private": true` as a defense-in-depth npm-publish-guard against accidental egress of operator-private `memory/` content, with the transformer stripping the flag on the way to public so public stays publishable, and the now-dead internal tag-push publish workflow retired in the same atomic unit (BL-052).

**Motivation.** Two coupled hazards surfaced from BL-047 architect's `spawn_task` chip 2026-05-12. First (BL-051): the v0.11.0 regression silently dropped 4 entries from internal's `package.json#files` (`playbooks`, `memory`, `docs`, `settings.json`); v0.12.2 fixed public's files array via direct edit, but internal's was never restored. The pre-fix pass-through transformer at `scripts/sync-src/sync.ts:378` would have re-introduced the regression on the next `npm run sync:apply` — overwriting public's 16-entry array with internal's 12-entry array, re-shipping the broken tarball, and breaking `<project>`'s prebuild integrity check (REQUIRED_ENTRIES includes `settings.json` and `memory/`). Second (BL-052): the BL-051 investigation surfaced the npm-pack-vs-gitignore distinction — `npm pack` and `npm publish` consult `package.json#files` exclusively, NOT `.gitignore`. Internal's on-disk `memory/` contains 12 operator-private files (`agent-changelog-private.md`, `lessons-learned.md`, `patterns.md`, `runtime-gotchas.md`, `security-patterns.md`, `test-patterns.md`, `ui-*-patterns.md`, `audience-knowledge.md`, `stack-preferences.md`, `intake-retros.md`, `product-principles.md`, `framework-metrics.jsonl`). Any future `npm publish` from `tap-agents-internal.git` (intentional or accidental) would ship those if `"memory"` were ever added to internal's `files[]`. Marking the internal package `"private": true` makes `npm publish` refuse to run on it before any file-matching happens — categorical guard at the metadata layer. The two changes ship together because they are complementary halves of one atomic unit: BL-052's `"private": true` on internal AND BL-051's field-merge with strip-private on the way to public. A third sub-component of BL-052 retires `.github/workflows/publish.yml` from the internal tree — with the metadata guard in place, the shadow tag-push publish workflow was structurally guaranteed to fail and existed as zombie CI; deletion makes the retirement explicit, paired with a `manifest.json5` exclude entry so the deletion does not propagate to public via sync.

### Fixed

- **`scripts/sync-src/sync.ts`** — `template-package-json` transformer rewritten as a structured field-by-field merge with strip-private composed in (BL-051 + BL-052):
  - New helpers `mergePackageJson(source, target)` and `unionStringArray(primary, secondary)` added inline (~60 lines).
  - **Internal wins** on every internal-defined field EXCEPT `files` and `private`.
  - **`files`** is the array union with internal's order preserved + public-only entries appended deduplicated (BL-051).
  - **`private`** is stripped unconditionally — applies whether the field comes from source or target (BL-052). Public must stay publishable; internal's metadata guard does not propagate.
  - Public-only top-level keys preserved verbatim as a safety net for future divergence.
  - JSON output uses 2-space indent + trailing newline to match both trees' existing convention.
  - On malformed-JSON parse failure (either side), the transformer logs a warning and falls back to pass-through — preserves the fail-loud principle without silently dropping the sync run.
  - JSDoc blocks document the per-field direction rules, the v0.11.0 / v0.12.2 regression history, and the npm-publish-guard rationale.

### Added

- **`package.json`** — `"private": true` added (right after `"name"`) on the internal `.claude/` tree (BL-052). Causes `npm publish` to fail with `Refused to publish private package` before any file-matching, regardless of `files[]` contents. `npm pack --dry-run` continues to work (verified — pack is unaffected; publish is the only blocked operation).
- **`scripts/sync-src/sync.test.ts`** — 10 new tests locking in the combined contract (BL-051: 8 field-merge tests; BL-052: 2 strip-private tests):
  1. (BL-051) `public-only files entries are preserved through the merge` — the canonical regression-prevention test; fixtures mirror the actual v0.11.0 → v0.12.2 state.
  2. (BL-051) `internal-side version field overrides public's` — the sync-direction rule.
  3. (BL-051) `field-merge resolves conflicts per documented direction` — the most thorough contract test; locks in that ONLY `files` is union-merged.
  4. (BL-051) `public-only top-level keys are preserved as a safety net`.
  5. (BL-051) `internal-only top-level keys flow through` — symmetric to 4; normal propagation.
  6. (BL-051) `empty files arrays on both sides return empty union`.
  7. (BL-051) `missing files field on source falls back to target's files`.
  8. (BL-051) `union dedupes — duplicate entries appear once`.
  9. (BL-052) `source 'private: true' is stripped from merged output` — the canonical privacy-guard test; verifies the npm-publish-guard inversion at the sync boundary.
  10. (BL-052) `neither side has 'private' — output omits 'private' (no spurious addition)` — defensive: stripping logic must NOT accidentally add `"private": false`.

  Tests reproduce the merge logic inline (matching the BL-037 pattern at sync.test.ts:17-22) rather than importing private helpers — preserves the narrow public surface of `sync.ts`. Total suite: **24 passed, 0 failed** (8 BL-037 baseline + 6 BL-047 + 8 BL-051 + 2 BL-052).

### Changed

- **Internal `package.json#files` deliberately left at 12 entries.** Investigation found internal's remote is `tap-agents-internal.git` (private), not the public publish source `tap-agents.git`. Public is the canonical npm-publish path. Expanding internal's `files` to include `memory/`, `playbooks/`, `docs/`, `settings.json` would NOT improve the public publish path — and would introduce the privacy hazard described in the BL-052 motivation. The transformer's union semantics (BL-051) handle the divergence safely without requiring internal to converge to 16 entries; the `"private": true` flag (BL-052) provides categorical defense even if a future operator mis-edit added one of those entries.

### Removed

- **`.github/workflows/publish.yml`** (internal tree) — retired as the third sub-component of the BL-052 npm-publish-guard (alongside `"private": true` and the strip-private transformer). With `"private": true` set on internal's `package.json`, the shadow tag-push publish workflow was structurally guaranteed to fail (`npm publish` returns "Refused to publish private package") and added zombie-CI noise. Deletion makes the retirement explicit. The PUBLIC `tap-agents/` tree retains its own `publish.yml` (verified present; legitimate publish path). Tarball file count UNCHANGED at 153 — `.github/` is NOT in `package.json#files`, so this deletion is invisible to the npm tarball; the change is purely internal-tree CI hygiene.
- **`scripts/sync-src/manifest.json5`** — added `.github/workflows/publish.yml` to `exclude[]` (paired with the deletion above). Without this entry, sync's `--delete` mode would orphan public's legitimate `publish.yml` on the next `npm run sync:apply`. The exclude both prevents that orphaning AND surfaces the divergence as deliberate in the manifest itself, where future operators look first. History notes in the manifest header updated to record the BL-052 retirement decision alongside the original lockstep note.

### SemVer classification

Per `protocols/versioning-protocol.md §3.1`:

- **PATCH.** Bug fixes (BL-051 transformer regression-prevention) + security guards (BL-052 npm-publish-guard) + behavior-preserving internal infrastructure (strip-private at sync boundary) + internal-tree dead-CI retirement (`publish.yml` deletion + manifest exclude). No new agent / command / protocol / template added or removed. No npm export-surface change. The `"private": true` flag is metadata internal to the source tree; it gets stripped by the sync transformer before the body lands in public, so downstream `@tapintomymind/tap-agents` consumers see byte-identical `package.json` semantics after sync runs (modulo the files-array union which restores the v0.12.2 state). The internal-tree workflow deletion is invisible to the npm tarball (`.github/` is NOT in `package.json#files`); tarball file count UNCHANGED at 153.
- **MINOR rejected.** The new transformer behavior is an internal mechanism for keeping the divergence stable + a privacy guard, not a new capability exposed to consumers.
- **MAJOR rejected.** No removal or rename in any consumer-facing surface. The transformer's named contract (`template-package-json` registered in `manifest.json5`) is unchanged.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `version` `0.13.1 → 0.13.2`, `.claude-plugin/plugin.json` `version` `0.13.1 → 0.13.2`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.13.1 → 0.13.2`. The version-gate hook's SemVer-successor rule (§4.2 invariant 2) treats this as a clean patch successor following BL-047's `0.13.0 → 0.13.1` landing.

### Provenance

This release is the product of a 2026-05-12 reconciliation absorbing a parallel chip session's substantive contributions. Honest narrative:

- **BL-049 was placeholder-labeled** in the pre-reconciliation commits on `files-array-transformer-fix` before this reconciliation discovered the collision with the real BL-049 ("Scaffold <project>/.claude/db-register.md per destructive-data-ops protocol"). Mis-attribution corrected to BL-051 in this release; the four pre-reconciliation commits were reset and rebuilt with proper attribution.
- **Chip session** (`npm-publish-guard-internal` local branch at SHA `78eb40b`, archived at tag `archive/chip-session-2026-05-12`) originated the private-npm-publish-guard work in a parallel exploration. Substantive contributions (`"private": true` addition + strip-private transformer logic) absorbed into BL-052 here; chip's narrower v0.13.1 release scope superseded by combined v0.13.2. Chip's commit also mis-attributed to "BL-050" (real BL-050 = "<project>/.env.local NEON_BRANCH inconsistency") — corrected to BL-052 here. Chip's deletion of `.github/workflows/publish.yml` and addition of the matching `scripts/sync-src/manifest.json5` `exclude[]` entry were initially deferred from the reconciled release as chip-session-local cleanup; operator decision 2026-05-12 (pre-pipeline cleanup dispatch) re-included them in BL-052 scope for atomic-unit coherence and zombie-CI elimination — see the new "Removed" section above. With this scope extension, the BL-052 unit now covers all three components of the original chip rationale: metadata guard (`private: true`), sync-direction inversion (strip-private transformer), and dead-CI retirement (publish.yml deletion). No chip-session contributions remain unabsorbed.
- **Curator dispatch** 2026-05-12 mirrored BL-048/049/050 from `workspace/_global/backlog.json` to `memory/backlog.md` (pre-existing mirror-drift from a prior parallel-session commit `3ed15e4` that landed JSON-only). Included in this release for clean baseline; not part of BL-051/BL-052 substantive scope.
- **BL-051 surfaced** by the BL-047 architect's `spawn_task` 2026-05-12. Quote: "The internal `.claude/package.json` `files` array has 12 entries; the public `tap-agents/package.json` `files` array has 16 entries (the v0.12.2 fix that restored `playbooks`, `memory`, `docs`, `settings.json`). The `template-package-json` transformer in `sync.ts:378` does a pass-through copy, so the next sync would re-introduce the v0.11.0 files-array regression and break `<project>`'s prebuild."
- **BL-052 surfaced** by the BL-051 investigation immediately after — the npm-pack-vs-gitignore distinction surfaced while deciding whether to expand internal's `files[]` to match public's. Decision: keep internal at 12 entries, add `"private": true` as the metadata-layer categorical guard, strip the flag on sync to public.
- **v0.11.0 history** per `memory/runtime-gotchas.md` entry `tap-agents v0.11.0/v0.12.0/v0.12.1 — files-array regression` and v0.12.2 public-side fix at `tap-agents` repo SHA `1c11fb0`.
- **Operator-private rationale** (which specific files would have leaked, threat-model detail for BL-052) lives in `memory/agent-changelog-private.md` 2026-05-12 entry — the public CHANGELOG holds the framework-portable shape of the guard; the private companion holds the project-attributable detail.

---

## [0.13.1] — 2026-05-12 — BL-047 lint-findings triage (unblocks v0.13.0 npm release path)

**Patch release** resolving the 26 (28 with self-fixture follow-ons) pre-existing leaks that v0.13.0's broadened linter surfaced. No public-surface change — pure fixes to the public tree's bytes plus three documentation-pattern allowlist rules added to the linter so legitimate documentation idioms don't fire.

**Motivation.** v0.13.0 broadened `scripts/sync-src/sync.ts:lintActions()` to scan every public-bound file regardless of action (BL-037 fix). The widened scan immediately surfaced 28 hard-fail issues that had been invisible to diff-driven dry-runs: 1× internal-abs-path in `commands/release.md:16`, 7× private-memory-ref using the `...` placeholder pattern in protocol docs, 18× project-slug-ref across 9 protocol files + `workspace/_examples/` (7) + `workspace/_registry.md` (4), and 2× tautological self-fixture hits once the new test file landed. All 28 are addressed here as a hybrid of Path A (allowlist for legitimate documentation patterns) and Path B (rewrites of real operator-identity exposures).

### Added

- **`scripts/sync-src/sync.ts:USER_AUTO_MEMORY_RE`** — negative-lookahead widened beyond the literal `<project>` placeholder. Now skips ANY `<bracket-template>` segment AND the `...` path-ellipsis placeholder. Both are documentation-grade placeholders used in protocol docs to denote a generic per-project auto-memory tree without naming an operator. Real leaks (literal `/Users/<name>/...`, literal encoded user-home paths) continue to fire. (7 of 28 findings allowlisted by this rule.)
- **`scripts/sync-src/sync.ts:lintPropagatedBody`** — files under `workspace/_examples/` suppress project-slug-ref and private-memory-ref checks. The `_examples/` tree IS the public-facing example library; its job is to demonstrate the full Tier-1 artifact set using a fictional project slug (`example-tools-cli`). Internal cross-references between fixture files must keep that concrete slug so a reader can trace the example end-to-end. The internal-abs-path and secret-pattern checks still apply. (7 of 28 findings allowlisted by this rule.)
- **`scripts/sync-src/sync.ts:isSecretPatternsSource`** — `scripts/sync-src/sync.test.ts` added to the secret-pattern self-exclude alongside `scripts/sync-src/secret-patterns.ts`. The test file carries synthetic operator-identity path literals (synthetic username documented in the file header) to exercise the `operator-identity-macos` pattern by construction. Same tautological-fixture rationale as the pattern definition file itself. (2 of 28 findings allowlisted by this rule.)
- **`scripts/sync-src/sync.test.ts`** — six new locked-in assertions for the BL-047 allowlist semantics. Each rule has paired tests: (a) the allowlist pattern does NOT fire, (b) a real-leak pattern of the same shape STILL fires (regression guard). Full suite now 14 passed, 0 failed.

### Fixed

- **`commands/release.md:16`** — operator-machine absolute path (`App Development/.claude/`) rewritten as a framework-relative description naming the published package (`@tapintomymind/tap-agents`) instead of any operator's working-tree path.
- **`protocols/backlog-protocol.md:46`** — narrative example of a Tier-1 collision pattern. `workspace/<project>/backlog.md` → `workspace/<slug>/backlog.md`. The collision-pattern explanation is fully preserved; only the project identifier is genericized.
- **`protocols/checkpoint-protocol.md:205`** — cascade verification checklist item. `workspace/<project>/handoff-package.md` → `workspace/<slug>/handoff-package.md`.
- **`protocols/conflict-resolution.md:24`** — JSON example for `contested_artifacts[]`. `workspace/<project>/scope.md` → `workspace/<slug>/scope.md`.
- **`protocols/outcome-grading.md:310`** — BL-019 envelope precedent reference. `workspace/<project>/critic-review-bl019-fix.md` → `workspace/<slug>/critic-review-bl019-fix.md`.
- **`protocols/verification-before-completion.md:56`** — code-block illustration. `workspace/<project>/critic-notes.md` → `workspace/<slug>/critic-notes.md`.
- **`workspace/_registry.md`** — entire file was an operator-portfolio snapshot listing two specific active Tier-1 projects. Rewritten to the format-template shape: empty "Active Projects" / "Paused" / "Shipped" / "Abandoned" sections plus the existing Format + How to Use documentation. The file's job in the public tree is to show readers what the registry looks like, not what any specific operator's portfolio contains.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:

- **PATCH.** Every change is a fix to pre-existing leaks in the public tree's bytes (Path B rewrites) plus tightening of the lint policy so legitimate documentation patterns don't false-positive (Path A allowlists). No public-surface narrows, no script removes, no rename, no API change. `sync.ts` exports are unchanged. `package.json` script names are unchanged. The linter becomes MORE PERMISSIVE for documentation-grade placeholders and STAYS STRICT for real operator-identity strings.
- **MINOR rejected.** No new detection capability is added; the change is calibration of the existing checks (BL-037 in v0.13.0 added the detection capability; this release calibrates it).
- **MAJOR rejected.** No public-surface removal or rename.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `version` `0.13.0 → 0.13.1`, `.claude-plugin/plugin.json` `version` `0.13.0 → 0.13.1`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.13.0 → 0.13.1`.

### Provenance

- BL-047 (`memory/backlog.md §"Tech-Debt — Triage 26 lint findings surfaced by BL-037 fix"`) — Tier-1 framework P2, status `open`, estimated effort S; landed via the Path A+B hybrid described above. Backlog entry was filed when v0.13.0's broadened scan first surfaced the 26 leaks on the orchestrator dry-run; v0.13.1 closes it.
- v0.13.0 was the internal-only release that triggered this triage; the v0.13.0 → v0.13.1 sequence is the standard "broaden detection in one release, calibrate + resolve findings in the next" pattern. The combined v0.13.0+v0.13.1 pair is what reaches npm consumers.

---

## [0.13.0] — 2026-05-12 — Lint pass scans every public-bound file (BL-037)

**Minor release** broadening the sync linter's scope so a leak that already shipped in a previous release becomes visible on the very next `npm run sync:dry-run` — not invisible until source content changes.

**Motivation.** v0.12.1 fixed the operator-identity leak in `hooks/stop-dispatch-monitor.py` and added three new secret patterns to catch the class. The post-release audit (CHANGELOG v0.12.1 line 34) flagged a second-order defect: `sync.ts:lintActions()` was diff-driven — it only scanned files with action `create` or `update`. Files with action `skip-identical` (already-shipped bytes the sync run isn't changing) were never re-scanned, so a leak already in the public tree would stay invisible to dry-run until something else triggered a content change. v0.13.0 widens the scope: every file in the sync set whose post-run bytes will sit in the public tree gets scanned, regardless of action.

### Fixed

- **`scripts/sync-src/sync.ts`** — `lintActions()` rewritten with per-action body resolution:
  - `create` / `update`: scan the propagated body (the bytes being written) — unchanged behavior.
  - `skip-identical`: scan body (preferred) or fall back to targetBody — the file is staying in public; the retained bytes need to be clean even if this run isn't changing them.
  - `skip-template`: scan targetBody — the transformer chose to leave the existing public file in place; those bytes still need to be clean.
  - default: scan targetBody (defensive).
  - Empty / undefined bodies are no-ops (covers binary skip-template cases like `package-lock.json` where there's no readable body).
  - JSDoc block added documenting the BL-037 fix rationale and the scope contract ("scan whatever bytes will sit in public after this run completes, regardless of changed-status").

### Added

- **`scripts/sync-src/sync.test.ts`** (NEW) — first test file in the framework. Stdlib-only runner (`node:assert/strict` + ad-hoc `test()` registry; zero new devDeps). Eight assertions:
  1. BL-037 regression: pre-fix shape MISSES leak in skip-identical action (locks in the bug being fixed).
  2. BL-037 fix: post-fix shape CATCHES leak in skip-identical action.
  3. post-fix: clean body in skip-identical action produces no issues.
  4. post-fix: create action still scanned (no regression).
  5. post-fix: update action still scanned (no regression).
  6. post-fix: skip-template with leaked target body is scanned.
  7. post-fix: skip-template with empty target body is a no-op (binary / package-lock case).
  8. post-fix: empty action list returns empty issues.
  Invokable via `tsx scripts/sync-src/sync.test.ts`. No `test` script added to `package.json` — that's a separate decision (runner promotion to `node --test` / `vitest` / etc. can come later once a second test file lands and the choice of runner has more shape to it).

### SemVer classification

Per `protocols/versioning-protocol.md §3`:

- **MINOR.** The change adds detection capability — same public surface (`sync.ts` exports nothing changed; `package.json` script names unchanged), broader behavior under the same script. No consumer-facing surface narrows; no script removes; no rename. The first test file is a new internal artifact, not a public-surface addition.
- **PATCH rejected.** A `npm run sync:dry-run` that previously passed silently could now FAIL on a real leak. That's the intended behavior — but it's a behavior change Dependabot's auto-merge logic should NOT just wave through. Pinning this to MINOR keeps `^0.12.x` consumers stable until they explicitly opt in.
- **MAJOR rejected.** No public-surface removal or rename. Pure scope expansion within an existing module.

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `version` `0.12.1 → 0.13.0`, `.claude-plugin/plugin.json` `version` `0.12.1 → 0.13.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.12.1 → 0.13.0`.

### Provenance

- BL-037 carved out of the v0.12.1 post-release audit follow-up (see v0.12.1 CHANGELOG line 34: "Lint-policy follow-up flagged for v0.13: `sync.ts:lintActions()` skips `action: \"skip-identical\"` files, so a leak that already shipped in a previous release cannot be caught via `npm run sync:dry-run` until source content changes. … the path of least surprise for v0.13 is to scan ALL files in the sync set regardless of action, not just changing ones").
- First test file in the framework — the runner-promotion path (stdlib-only → `node --test` / `vitest` / etc.) is deliberately deferred until a second test file lands and the choice of runner has more shape to it.

---

## [0.12.1] — 2026-05-12 — Operator-identity sanitizer + portable USER_MEMORY_DIR + _landed/ convention placeholder

**Patch release** addressing the operator-identity leak found in the v0.12.0 post-release audit. Three targeted fixes; no doctrinal or surface changes.

**Motivation.** v0.12.0 shipped publicly with a hardcoded operator-identifying absolute path (Claude Code per-project auto-memory dir) baked into `hooks/stop-dispatch-monitor.py` at module scope. The sanitizer pattern set was tuned for credential-shape secrets (API keys, tokens, PEM blocks) and didn't cover identity-shape paths. The hook fails open on non-operator machines (path doesn't exist; pattern-note write is a no-op) so it's not breaking anyone — but the identifying string ships in the public npm package, which is itself the defect.

### Fixed

- **`hooks/stop-dispatch-monitor.py`** — `USER_MEMORY_DIR` derived at runtime from `$CLAUDE_PROJECT_DIR` (falling back to `os.getcwd()`) instead of hardcoded literal. Slug rule mirrors Claude Code's auto-memory convention: `/` and ` ` both rewrite to `-`, leading `-` retained. `_telemetry._find_workspace()` already used the same `$CLAUDE_PROJECT_DIR`-first resolution order — this fix brings the user-memory-dir resolution into the same shape.

### Added

- **`scripts/sync-src/secret-patterns.ts`** — three new `operator-identity-*` patterns (macOS / Linux / Windows shapes of Claude Code per-project auto-memory paths). Module-level `VERSION` constant (`2026-05-12`) added so the post-release audit can confirm which pattern set was active for a given dist. Pattern count: 18 → 21. Self-exclusion of `scripts/sync-src/secret-patterns.{ts,js}` from the scan body (sync.ts:532-534) still holds — regex source escapes prevent self-tautology.
- **`agents/_planned/_proposals/_landed/.gitkeep`** — convention placeholder. The `_landed/` directory codifies the "promoted to active" lifecycle stage; its contents are operator-internal (covered by the broader `agents/_planned/_proposals/**/*` exclude). The `.gitkeep` is the one file that propagates so the directory shape stays visible in the public tree.
- **`scripts/sync-src/manifest.json5`** — explicit include for the `.gitkeep` (specific-path includes override the broader proposals-exclude per the manifest's first-match priority rule).

### SemVer classification

Per `protocols/versioning-protocol.md §3`: leak-fix in hooks (PATCH), additive secret patterns (PATCH), convention-placeholder file (PATCH). No new surface, no removals, no renames. **PATCH.**

### Cross-channel sync

All three channel-version fields update atomically: `package.json` `version` `0.12.0 → 0.12.1`, `.claude-plugin/plugin.json` `version` `0.12.0 → 0.12.1`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.12.0 → 0.12.1`.

### Provenance

- Post-release audit dispatch (continuing from prior `a7fe755f66121418d`): identified the leak at `hooks/stop-dispatch-monitor.py:61` and walked the three-fix sequence (pattern → portable derivation → convention placeholder).
- Lint-policy follow-up flagged for v0.13: `sync.ts:lintActions()` skips `action: "skip-identical"` files, so a leak that already shipped in a previous release cannot be caught via `npm run sync:dry-run` until source content changes. Fix 2 was verified via direct `scanBody` invocation against the pre-Fix-1 source; the path of least surprise for v0.13 is to scan ALL files in the sync set regardless of action, not just changing ones.
- **Known asymmetry**: Internal repo's v0.12.1 tag (SHA `7b9533b`) and public npm repo's v0.12.1 tag (SHA `a3cd833`) point to different commits. Structural to the dual-repo topology; downstream of the `package.json#files` hotfix race. Accepted as-shipped; no consumer impact. See BL-040 (wontfix).

---

## [0.12.0] — 2026-05-12 — PMM activation + roster hygiene + park/refocus + internal→public sync flow

**Four-track release.** Three are doctrinal/role-set changes; the fourth is the first piece of operational tooling for keeping internal and public trees in lockstep going forward. Each is independently MINOR per `protocols/versioning-protocol.md §3`; bundled here because they all land in the same internal-to-public propagation window.

**Motivation.** The internal canonical tree (`.claude/` under `App Development/`) has been accumulating role + commands changes (PMM, park, refocus) and convention rearrangements (`_archive/`, `_landed/`) since v0.8.0 without a clean propagation path to the public `tap-agents/` checkout. v0.12.0 ships the sync flow that defines the propagation; the same release also lands the role + hygiene work that triggered the need.

### Added

- **`agents/product-marketing-manager.md`** (PMM activated) — new top-level agent role joining the active roster. Handles product-marketing/launch-positioning concerns; reachable via Conductor + EA routing.
- **`agents/_planned/technical-writer.md`** (NEW stub) — planned-agent placeholder; not yet active.
- **`commands/park.md`** + **`commands/refocus.md`** — orchestrator-discipline slash-commands. `park` captures a side-thought to a project's parked-thoughts log without derailing the active task. `refocus` re-reads state.json and restates the active task in one tight block. Previously referenced in v0.9.0 release notes but never actually shipped to public; landing here for real.
- **`scripts/sync-src/sync.ts`** (NEW, ~600 LOC) — internal→public sync mechanism. Reads source tree, applies manifest categorization rules, runs sanitizers + transformers, lints for private-memory refs / project-slug leaks / internal abs-paths / secret-pattern hits, prints unified diff (dry-run) or writes files (apply mode). Default mode is dry-run. Does NOT commit — operator inspects target's `git status` and commits manually (v1 path; `/release` integration arrives in v1.1).
- **`scripts/sync-src/manifest.json5`** — JSON5 categorization manifest with explicit include[]/exclude[]/sanitize/template rules. JSON5 chosen over JSON to support inline `//` comments documenting per-pattern intent.
- **`scripts/sync-src/secret-patterns.ts`** — 18 secret-pattern regexes (Anthropic, OpenAI, Stripe, AWS, Vercel, Postgres/Neon, npm, GitHub PAT, Slack, PEM private keys, GCP service-account). Hard-FAIL on any hit during sync lint pass.
- **`scripts/sync-src/verify-sync.ts`** — post-apply hash check (asserts all 1:1 copies are byte-identical between source and target) + manifest-consistency check (every sanitizer/transformer name in manifest is implemented; secret-patterns list is non-empty).
- **`agents/_archive/`** + **`agents/_planned/_proposals/_landed/`** convention directories — codified rename-on-move + ship-or-defer markers for the `_planned/` lifecycle.

### Changed

- **`agents/_planned/README.md`** — updated to reflect roster post-PMM activation + rename of gtm-strategist → gtm-launch-strategist.
- **`agents/conductor.md`**, **`agents/executive-assistant.md`**, **`agents/quality-engineer.md`** — wording tweaks; roster-awareness updates after PMM lands. `fires_when` / authority / output contracts unchanged → PATCH-level edits folded into this MINOR.
- **`docs/specs/2026-05-04-framework-design.md`** — doc edit reflecting PMM activation.
- **`.github/workflows/publish.yml`** — internally caught up to v0.8.3 Trusted Publishing migration (was stale internally; previously only landed in public).
- **`.github/dependabot.yml`** (NEW internally) — caught up from v0.8.2 (existed only in public until v0.12.0).
- **`package.json`** — adds `sync`, `sync:dry-run`, `sync:apply`, `verify-sync` npm scripts. Adds `json5@^2.2.3` runtime dependency (manifest parser).

### Renamed

- **`agents/_planned/gtm-strategist.md` → `agents/_planned/gtm-launch-strategist.md`** — clarified role name. `_planned/` is not in the npm-exported surface (`scripts/build-src/build.ts` excludes `_*` directories) → §3.4 reading: rename folds under this MINOR rather than triggering MAJOR.

### Removed

- **`agents/_planned/ops-security.md`** — already promoted to active `agents/ops-security.md` in a prior release; the planned-stub became redundant.
- **`agents/_planned/quality-engineer-superseded-2026-05-06.md`** — moved to `agents/_archive/` per the `_archive/` convention codified in this release.
- **`agents/_planned/_proposals/qe-promotion-2026-05-06.md`** — moved to `_proposals/_landed/` per the same convention.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:
- New agent (`product-marketing-manager.md`) → MINOR per §3.2 (new active-roster role).
- New commands (`park.md`, `refocus.md`) → MINOR per §3.2 (new top-level commands).
- New scripts module (`scripts/sync-src/*`) + new npm scripts → MINOR per §3.2 (additive surface).
- `_planned/` rename + deletions → MINOR per §3.4 (not in npm-exported surface; folds under this MINOR rather than triggering MAJOR).
- Conductor/EA/QE wording edits → PATCH per §3.4; folded into MINOR.

No removals or renames in the npm-exported surface → **MINOR**.

### Cross-channel sync

Per `protocols/versioning-protocol.md §6`, all three channel-version fields update atomically: `package.json` `version` `0.11.0 → 0.12.0`, `.claude-plugin/plugin.json` `version` `0.11.0 → 0.12.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.11.0 → 0.12.0`. v0.12.0 ships as the FIRST release driven by the internal-canonical → public-derivative topology — internal's `v0.12.0` tag (`v0.11.0-anchor` precedes it locally) is the source; public's `v0.12.0` is propagated via `npm run sync:apply` from internal.

### Provenance

- Seed brief: Architect design `workspace/_global/architect-designs/2026-05-11-internal-to-public-sync-flow.md` v2 (approved 2026-05-12). PMM activation seed + roster hygiene work accumulated since v0.8.0 (March-May 2026).
- v0.11.0-anchor commit (local-only tag `v0.11.0-anchor`) precedes this release as the catch-up baseline closing the v0.8.0 → v0.11.0 drift; `v0.12.0` lands on top.
- Drift resolutions (2026-05-12): `.github/workflows/publish.yml` (drift 1) + `.github/dependabot.yml` (drift 2) caught up from public into internal before v0.12.0 to keep both trees aligned going forward. The sync manifest treats both as always-propagate, no-sanitize.

---

## [0.11.0] — 2026-05-12 — Telemetry coverage across all hooks + classifier-feedback loop

**Second slice of the broader telemetry layer (BL-035).** v0.10.0 instrumented one event class (orchestrator-dispatch-gate blocks). v0.11.0 extends coverage to ALL seven hooks plus adds a NEW classifier-feedback hook (`prompt-router-feedback.py`) and a NEW rollup script (`scripts/telemetry-rollup.py`). After this lands, every meaningful runtime signal — every hook fire, every block, every classification, every pattern, every misfire — drops into `<workspace>/_global/events.jsonl` (or sibling `misfires.jsonl` for hook-internal exceptions) for the dashboard rollup to render. Schema is additive-only at the v0.10.0 baseline — same JSON shape, only `source`/`type`/`subtype` values expand. Consumers written against v0.10.0 keep parsing v0.11.0 events.

**Motivation.** v0.10.0 captured the "rail strike" event class (orchestrator hitting the dispatch wall). The dashboard product needs the full distribution: how often did each hook fire, what did the prompt-router classify, did the orchestrator ignore the nudge, did anything misfire. Without per-hook coverage the dashboard renders one signal in an ocean of dark data; with v0.11.0 every session produces structured shape that downstream surfaces (the dashboard, future scheduled-task rollups, EA briefings) can read.

**Schema additions (additive-only).**

New `source` values: `pre-tool-gate`, `version-gate`, `stop-critic-check`, `session-start-brief`, `prompt-router`, `prompt-router-feedback`, `stop-dispatch-monitor`. (`orchestrator-dispatch-gate` already covered in v0.10.0.) New `type` values: `fire` (session-start), `classify` (prompt-router), `rollup` (stop-dispatch-monitor), `nudge_ignored` (prompt-router-feedback), `misfire` (every hook's top-level wrap). New `subtype` enumerations per (source, type) pair documented in `protocols/telemetry-events.md §2.3`.

**Misfires.jsonl.** A new sibling file `<workspace>/_global/misfires.jsonl` captures hook-internal exceptions. Same top-level schema as events.jsonl with one additional `error` field. Separation keeps events.jsonl as the clean dashboard-input stream — consumers iterate it without filtering on `type=misfire`. Each hook's top-level `try/except` calls `emit_misfire(...)` and re-raises so Claude Code still sees the failure exit code.

### Added

- **`hooks/prompt-router-feedback.py`** (NEW, ~190 LOC) — second `UserPromptSubmit` hook in the chain, registered AFTER `prompt-router.py`. Fires per-turn, emits nothing in the common case. Retro-active detection: reads events.jsonl for the previous-turn `prompt-router` classify event (filter `session_id` + `source=prompt-router` + `type=classify`, take latest by ts). If previous classification was `side` and current prompt does NOT start with `/park` → emits `{source: prompt-router-feedback, type: nudge_ignored, subtype: side-not-parked}`. If previous classification was `implement` and current prompt looks like continuation (doesn't contain "dispatched"/"agent"/"continue") → emits `{... subtype: implement-not-dispatched}`. Heuristics intentionally loose; tighten over time with data. Self-instrumented: events.jsonl lookup failures emit their own misfire so a permanently-silent feedback layer is detectable.
- **`scripts/telemetry-rollup.py`** (NEW, ~180 LOC) — stdlib-only aggregator over events.jsonl + misfires.jsonl. Output: `<workspace>/_global/metrics-rollup.json` with `meta` (generated_at, totals, sessions_count), `by_source`, `by_type`, `by_source_type`, `classifier_distribution`, `nudge_ignored`, `dispatch_gate_trips`, `misfires_by_source`. NOT wired as a hook — run explicitly. Distinct from existing `rollup-metrics.py` which targets `memory/framework-metrics.jsonl` (different file/schema). Documented in `protocols/telemetry-events.md §8`.

### Changed

- **`hooks/_telemetry.py`** — added `emit_misfire(source, error, payload, session_id)` function that appends to `misfires.jsonl` (sibling of events.jsonl, same `_global/` bucket). Same fail-open contract as `emit_event`. Subtype derived from exception class name (`type(e).__name__`). Both `_events_path()` and the new `_misfires_path()` share a `_resolve_global_file(filename)` helper to keep the workspace-discovery logic single-sourced.
- **`hooks/pre-tool-gate.py`** — emits `{source: pre-tool-gate, type: block, subtype: <env-edit|force-push|rm-rf|sudo-rm|chmod-777|contested-artifact|seed-immutable|file-protection|bash-dangerous>}` on every hard-block. Subtype derived from which dangerous-pattern regex matched or which file-protection rule fired. Top-level misfire wrap.
- **`hooks/version-gate.py`** — emits `{source: version-gate, type: block, subtype: <atomicity|sequence|severity-floor|matchup>}` on every `_block(...)` invocation. Subtype derived from a phrase-based discriminator on the block message body (sequence: "SemVer sequence" / "going backwards"; severity-floor: literal "severity-floor"; matchup: "tag/package version mismatch" / "marketplace version drift"; atomicity: fallback). Top-level misfire wrap. Module-level `_HOOK_PAYLOAD` + `_TOOL_NAME` stash payload context so `_block()` can attach session_id + tool_name without re-threading every check function signature.
- **`hooks/stop-critic-check.py`** — emits one event per distinct issue when Stop is blocked: `{source: stop-critic-check, type: block, subtype: <blocked-on|contested|critic-blocking>}`. Phrase-based discriminator on the issue string. Silent on anti-loop short-circuit + on pass. Top-level misfire wrap.
- **`hooks/session-start-brief.py`** — emits `{source: session-start-brief, type: fire, subtype: <startup|resume|clear|compact>}` on every fire. Payload extras: `mode` (`tier1-multi-project` / `tier2-single-project` / `bootstrap`), `projects_count`, `blocked_count`. Top-level misfire wrap. Briefing emit semantics unchanged.
- **`hooks/prompt-router.py`** — emits `{source: prompt-router, type: classify, subtype: <implement|side|status|slash|ack|silent>}` on every fire. New `classify_full()` function returns the wider taxonomy that surfaces the reasons `classify()` returns None (slash-routed / status / ack / silent). Payload includes `nudge_emitted: bool`, `prompt_length: N`, and first 120 chars of prompt as `summary`. Nudge logic unchanged. Top-level misfire wrap.
- **`hooks/orchestrator-dispatch-gate.py`** — emit on block already present from v0.10.0. v0.11.0 adds the top-level misfire wrap and imports `emit_misfire` alongside `emit_event`.
- **`hooks/stop-dispatch-monitor.py`** — emits `{source: stop-dispatch-monitor, type: rollup, subtype: <below-threshold|threshold-tripped>}` on every fire (including when block count is 0). Payload extras: `block_count`, `threshold`, `memory_note_written`. Closes the loop on whether the threshold trips in practice. Top-level misfire wrap.
- **`settings.json` UserPromptSubmit chain** — registers `prompt-router-feedback.py` as the second hook in the chain, AFTER `prompt-router.py`. Order matters: prompt-router emits the current-turn classify first, then prompt-router-feedback evaluates the previous turn's classify against the current prompt. Both have `timeout: 10`. The `_purpose` field on the chain is rewritten to describe the two-stage handoff.
- **`protocols/telemetry-events.md`** — extended with the full v0.11.0 emit matrix in §2.3 (every source/type/subtype tuple in use); new §3.4 documents misfires.jsonl as a sibling file with the extra `error` field; new §8 documents `scripts/telemetry-rollup.py` invocation + output shape. §2.4 narrowed to the genuinely-reserved next-slice triples (subagent dispatch outcomes, slash-command fires, state-machine transitions) now that v0.10.0's reserved-future names are live.

### Propagated

- All four hook directories (framework `.claude/hooks/`, `tap-agents/hooks/`, `<project>/scaffold-source/hooks/`, `<project>/hooks/`) receive the seven modified hooks + new `prompt-router-feedback.py`. `chmod +x` applied to the new feedback hook. The new `scripts/telemetry-rollup.py` lands in framework + tap-agents + scaffold-source (NOT tier-2 — Tier 2 doesn't run rollups; the dashboard product does). `protocols/telemetry-events.md` mirrored to `tap-agents/protocols/` + `<project>/scaffold-source/protocols/` so the dist build picks it up.
- Tier-2 `<project>/.claude/settings.json` registers `prompt-router-feedback.py` as the second `UserPromptSubmit` hook in the chain — same handoff as Tier 1.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:
- New hook (`prompt-router-feedback.py`) added to `hooks/` and wired into `settings.json` → MINOR per §3.2.
- New script (`telemetry-rollup.py`) added to `scripts/` → MINOR per §3.2.
- Existing hooks gain a side-effect on their primary action (emit one JSON-line per fire / block / classify); the primary block-vs-pass semantics are byte-identical. No existing consumer breaks.
- Existing protocol (`telemetry-events.md`) extends additively — new sources/types/subtypes documented; v0.10.0 consumers continue to parse v0.11.0 events.

No removals, no renames, no contract narrowings → **MINOR**.

### Cross-channel sync

Per `protocols/versioning-protocol.md §6`, all three channel-version fields update atomically: `package.json` `version` `0.10.0 → 0.11.0`, `.claude-plugin/plugin.json` `version` `0.10.0 → 0.11.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.10.0 → 0.11.0`. Marketplace `description` updated from "five enforcement + telemetry hooks" to "seven instrumented enforcement + telemetry hooks" to reflect coverage expansion. Both Tier 1 framework `.claude/` and the public `tap-agents/` repo carry the same triplet.

### Provenance

- Seed brief: v0.11.0 extension brief (2026-05-12) — "Extend the v0.10.0 telemetry foundation to cover ALL remaining hooks + add a classifier-feedback loop. Schema additive-only."
- Schema constraint: additive-only at the v0.10.0 baseline. New `source`/`type`/`subtype` values may land; field names / field types are frozen until a `events.v2.jsonl` migration window.
- Smoke tests run before release (per the v0.11.0 brief §Smoke tests):
  1. Each hook's emit on its primary action — 6/6 hooks emitted the expected event.
  2. Misfire capture — patched copy of stop-dispatch-monitor.py raised inside main(); misfires.jsonl captured `RuntimeError` subtype, exit code 1 propagated, events.jsonl untouched.
  3. prompt-router-feedback detection — seeded `side` classify + non-`/park` prompt → emitted `nudge_ignored / side-not-parked`.
  4. prompt-router-feedback non-detection — seeded `side` classify + `/park` prompt → NO event emitted.
  5. Rollup script — produced metrics-rollup.json with `meta`, `by_source` (5 sources), `by_type` (4 types), `classifier_distribution`, `dispatch_gate_trips=1`, `misfires_by_source`. All 7 aggregations present.

---

## [0.10.0] — 2026-05-12 — Dispatch-gate telemetry + auto-pattern memory note

**First slice of the broader telemetry layer (BL-035).** Every time `hooks/orchestrator-dispatch-gate.py` hard-blocks a code-mutating tool call on the main thread, it now also appends one structured JSON-line event to a per-workspace `events.jsonl`. A new Stop hook (`hooks/stop-dispatch-monitor.py`) reads the same file, counts orchestrator-source blocks for the current session, and — at ≥ 3 blocks — auto-writes a `runtime_dispatch_gate_pattern_<YYYYMMDD>_<sid>.md` memory note + appends an index pointer to `MEMORY.md`. The schema is frozen at this release and designed to absorb future event types (prompt-router classifications, slash-command invocations, hook misfires) without re-architecture — single `events.jsonl` per workspace, additive-only field evolution. See `protocols/telemetry-events.md` for the full schema + producer/consumer contracts.

**Motivation.** `memory/feedback_orchestrator_session_discipline.md` captured the 3+-same-class threshold for dispatching a reviewer agent OR appending to anti-patterns log; until BL-035 that threshold was a hand-counted observation no automation could see. The events.jsonl + stop-dispatch-monitor pair makes the threshold mechanical — pattern notes land on disk without a human noticing first. The note is observational (Stop never blocks because of it), and the routing-nudge / new-specialist-agent decision still belongs to the user reading `MEMORY.md` next session.

### Added

- **`hooks/_telemetry.py`** (NEW, ~170 LOC) — shared stdlib-only helper module. Single exported function `emit_event(source, type, subtype, agent_context, agent_type, agent_id, payload, session_id)` appends one JSON-line event to `<workspace>/_global/events.jsonl`. Auto-creates `_global/` if missing. Mirrors `session-start-brief.py`'s `find_workspace()` logic across the Tier 1 / Tier 2 / framework layouts. Truncates `payload.summary` to 200 chars. Fail-open on every failure path — telemetry never breaks the calling hook's primary signal. Underscore prefix keeps it out of the npm-package's manifest indexing (it's a helper, not a hook entry point); hooks that need it `sys.path.insert` the hooks dir and `from _telemetry import emit_event`.
- **`hooks/stop-dispatch-monitor.py`** (NEW, ~220 LOC) — Stop hook. Reads `<workspace>/_global/events.jsonl`, filters for `source=orchestrator-dispatch-gate AND type=block AND agent_context=orchestrator AND session_id=<this-session>`, and — at ≥ 3 events — writes `<user-memory>/runtime_dispatch_gate_pattern_<YYYYMMDD>_<short-sid>.md` with frontmatter (`name` / `description` / `type: runtime`) + body listing the events. Prepends a one-line index pointer to `MEMORY.md`. Always exits 0 (observational; never blocks Stop). `stop_hook_active` anti-loop guard per the Claude Code Stop hook spec.
- **`protocols/telemetry-events.md`** (NEW, ~165 lines) — frozen v0.10.0 schema for the events log. Documents the 9 top-level fields, reserved `payload.summary` / `payload.tool_name` keys, additive-only versioning rules (new fields = MINOR, new `type`/`subtype` values = MINOR, removals = MAJOR with a `events.v2.jsonl` migration window), producer contract (fail-open, no third-party deps, all-keyword args, no emit on pass), consumer contract (ignore unknown fields, tolerate unknown values, skip bad lines, filter by `session_id`/`source`). Lists the reserved next-slice triples (prompt-router classifications, slash-command fires, hook misfires) so the next author knows the naming conventions.

### Changed

- **`hooks/orchestrator-dispatch-gate.py`** — on every `return 2` (every hard-block), now calls `emit_event(...)` with `source="orchestrator-dispatch-gate"`, `type="block"`, `subtype` of `edit`/`write`/`notebook-edit`/`bash-mutate` per the tool class, `agent_context="orchestrator"`, and `payload.tool_name` + `payload.summary`. Does NOT emit on pass (subagent calls, read-only tools, etc.) — v0.10.0 keeps the events.jsonl tight; emit-on-pass is reserved for a later observability tier. The hook's primary block semantics are unchanged: exit 2 with the same stderr message, same agent-hint suggestions.
- **`settings.json` Stop hook chain** — appends `stop-dispatch-monitor.py` after the existing `stop-critic-check.py` (framework / tap-agents / scaffold-source) or `stop-tier2-check.py` (<project> tier-2). The existing first-stage hook keeps its blocking semantics; the new second-stage hook is observational (always exits 0). Order matters: critic-check first so a real BLOCKING concern doesn't get masked by a routine telemetry rollup.

### Propagated

- All four hook directories (framework `.claude/hooks/`, `tap-agents/hooks/`, `<project>/scaffold-source/hooks/`, `<project>/hooks/`) receive the new `_telemetry.py` + `stop-dispatch-monitor.py` + the updated `orchestrator-dispatch-gate.py`. `chmod +x` applied to the two executable scripts. `protocols/telemetry-events.md` mirrored to `tap-agents/protocols/` + `<project>/scaffold-source/protocols/` so the dist build picks it up.

### SemVer classification

Per `protocols/versioning-protocol.md §3`:
- New hook (`stop-dispatch-monitor.py`) added to `hooks/` and wired into `settings.json` → MINOR per §3.2 ("new hook added to `hooks/` and wired into `settings.json` (existing hooks unchanged)").
- New protocol (`telemetry-events.md`) added to `protocols/` → MINOR per §3.2 ("new protocol added to `protocols/`").
- New shared helper (`_telemetry.py`) added — not a top-level hook entry point (underscore-prefixed); from the npm consumer's perspective this is an additive packaging item.
- Existing hook (`orchestrator-dispatch-gate.py`) gains a side-effect on the block path (emit one JSON-line); the block-vs-pass semantics are byte-identical. No existing consumer breaks.

No removals, no renames, no contract narrowings → **MINOR**.

### Cross-channel sync

Per `protocols/versioning-protocol.md §6`, all three channel-version fields are updated atomically: `package.json` `version` `0.9.0 → 0.10.0`, `.claude-plugin/plugin.json` `version` `0.9.0 → 0.10.0`, `.claude-plugin/marketplace.json` `plugins[0].version` `0.9.0 → 0.10.0`. The marketplace `description` field also drops the stale "two enforcement hooks" phrasing in favor of "five enforcement + telemetry hooks" (correct count post-rollout). Both Tier 1 framework `.claude/` and the public `tap-agents/` repo carry the same triplet.

### Provenance

- Seed brief: BL-035 (2026-05-12 user-authored) — auto-log dispatch-gate blocks + write a memory pattern note at ≥ 3 blocks per session.
- Schema-design constraint: forward-compat with prompt-router classifications, slash-command invocations, hook misfires landing in the SAME events.jsonl. See `protocols/telemetry-events.md §2.4`.
- Motivating memory: `memory/feedback_orchestrator_session_discipline.md` — "on 3+ fixes of the same class in one session, dispatch the matching reviewer agent OR append to anti-patterns log. The framework has the surface; I have to use it." BL-035 closes that gap: the surface now writes itself.

---

## [0.9.0] — 2026-05-12 — Orchestrator-discipline rollout: dispatch-gate + session-start briefing + prompt-router + /park + /refocus

**Framework structural addition.** Three new hooks (`session-start-brief.py`, `prompt-router.py`, `orchestrator-dispatch-gate.py`) + two new slash commands (`/park`, `/refocus`) operationalize the TapAgents product thesis at the harness layer — that the orchestrator (the main Claude session) **dispatches** work to subagents rather than implementing inline. The dispatch-gate hard-blocks `Edit` / `Write` / `NotebookEdit` and mutating-Bash (`git commit|rebase|merge|cherry-pick|revert`, `git reset --hard`, `git push`, package-manager installs, `drizzle-kit push|migrate`, `vercel deploy|link`) on the main thread, while subagent calls bypass via the `agent_id` / `agent_type` PreToolUse payload fields per the Claude Code hook spec. SessionStart auto-loads workspace state and injects an orchestrator briefing. UserPromptSubmit classifies prompts and nudges toward dispatch (on code-intent verbs) or `/park` (on side-thought patterns), silent on status / slash / acknowledgement prompts.

Phase 1 (canary on `<project>`), Phase 2 (framework `.claude/`), and Phase 3 (TapAgents distributed plugin) collapsed into a single session — the canary held under smoke-test, so the promotion path through Phases 2 and 3 ran continuously. Two latent bugs surfaced during Phase 2/3 deployment and are bundled in this release as fixes (see "Fixed" below).

**Dashboard-pipeline relevance.** Per user directive 2026-05-11, the `<project>` product is not usable without proper agent usage producing measurable artifacts (`state.json` mutations, backlog entries, reportback writes). The dispatch-gate *forces* agent usage by hard-blocking inline orchestrator edits, so every code-mutating action now flows through a subagent that produces audit-trail artifacts the dashboard can read. Without the gate, drift of the kind captured in `memory/feedback_session_discipline_oauth_arc_2026-05-08.md` (4 same-class fixes shipped inline without dispatching a reviewer agent) leaves the dashboard with empty telemetry.

### Added

- **`hooks/session-start-brief.py`** (NEW, ~250 LOC) — SessionStart hook. Auto-detects single-project Tier 2 mode (one `.claude/workspace/state.json`) vs. multi-project Tier 1 framework mode (multiple `.claude/workspace/<slug>/state.json`). In single-project mode emits the active milestone + top pending tasks + `blocked_on` + routing rule. In multi-project mode emits a `/status`-style cross-project summary sorted by recency (`last_agent_at` / `entered_phase_at`). Output is a valid Claude Code hook JSON envelope; silent on missing state.
- **`hooks/prompt-router.py`** (NEW, ~140 LOC) — UserPromptSubmit hook. Intent classifier; emits `ROUTING_NUDGE` on code-intent verbs (fix, add, change, refactor, implement, build, write, deploy, install) suggesting which subagent to dispatch; emits `PARK_NUDGE` on side-thought patterns ("by the way", "also", "while we're at it", "random thought"). Silent on `/`-prefixed slash commands, status questions, plain acknowledgements ("yes", "ok", "thanks"). Tight starting regex set — designed to loosen on observed false-negatives rather than chase false-positives.
- **`hooks/orchestrator-dispatch-gate.py`** (NEW, ~120 LOC) — PreToolUse hook. Hard-blocks (exit 2) `Edit` / `Write` / `NotebookEdit` and mutating-Bash patterns (`git commit`, `git rebase|merge|cherry-pick|revert`, `git reset --hard`, `git push`, `npm/pnpm/yarn/bun install|add|remove|update`, `drizzle-kit push|migrate`, `vercel deploy|link`) when invoked on the main thread. Subagent calls bypass via the `agent_id` / `agent_type` PreToolUse payload fields per the Claude Code hook spec. Read-class tools (`Read`, `Glob`, `Grep`, `ls`, `git status`, `git log`, `npm test`, `npm run build`) pass through unconditionally. The dispatch-gate is the load-bearing enforcement of the orchestrator product thesis — friction is the design intent.
- **`commands/park.md`** (NEW) — `/park <thought>` captures a side-thought to `<project>/.claude/workspace/parked-thoughts.md` (creates file if missing) with a UTC timestamp + active-task hint pulled from `state.json`, then replies in a fixed two-line shape (`Parked: …` / `Resuming: …`) and stops. If the thought looks like real backlog material (feature ask, bug, follow-up), fires `backlog-curator` fire-and-forget for ID allocation; the curator surfaces the new `BL-NNN` via EA on next `/briefing`. Does not start work on the parked thought, does not ask follow-up questions, does not block on the curator dispatch.
- **`commands/refocus.md`** (NEW) — `/refocus` re-reads `state.json` and restates the active task in a fixed 6-line block (Project / Phase / Status / Next / Blocker / Critic-open). Read-only: does not dispatch any subagent, does not modify any artifact, does not bring up parked thoughts as candidates. Each line ≤ 100 chars; truncates long task strings to ≤ 80 chars + `…`.
- **Scaffold inheritance.** The same three hooks + two commands are mirrored into `<project>/scaffold-source/` (the Tier 2 scaffold template `<project>` ships to projects it generates), so projects scaffolded via the `<project>` product inherit the new pattern. Existing `<project>`-scaffolded projects pick up the new wiring on their next scaffold-sync.

### Changed

- **`settings.json`** — registers `SessionStart` hook entry pointing at `session-start-brief.py`; registers `UserPromptSubmit` hook entry pointing at `prompt-router.py`; appends `orchestrator-dispatch-gate.py` to the existing `PreToolUse` chain after `pre-tool-gate.py` and `version-gate.py`. PreToolUse matcher widened to include `NotebookEdit` (previously `Write|Edit|Bash`, now `Write|Edit|NotebookEdit|Bash`). Three-layer gate order documented in the file's `_purpose` field: (1) `pre-tool-gate.py` safety first, (2) `version-gate.py` second, (3) `orchestrator-dispatch-gate.py` routing-discipline third.

### Fixed

- **Unquoted hook-path bug — affects all `settings.json` files across the framework.** Hook commands were registered as bare `$CLAUDE_PROJECT_DIR/hooks/foo.py` and invoked via `/bin/sh -c "<command>"`. When the project path contains a space (e.g. `~/App Development/`), the shell split on the space and tried to execute the first word as the command, failing with `exit 127 — No such file or directory`. Every hook command across `settings.json` is now wrapped in escaped double-quotes — `"\"$CLAUDE_PROJECT_DIR/.claude/hooks/foo.py\""` — so the path survives shell word-splitting. Surfaced when `claude -p` with `--include-hook-events --output-format=stream-json` produced `hook_response` entries with `exit_code:127, outcome:error`. Pre-existing since project inception; silently broke every hook on any operator with a space-containing project path. Per `protocols/versioning-protocol.md §3.1`, this is PATCH-class on its own (an internal hook-wiring fix that "was supposed to work but didn't"), bundled into this MINOR release per §3.2's dominant-class rule.
- **Wrong hook-path bug — affects framework-level `settings.json` only.** Framework `.claude/settings.json` (and `tap-agents/`, `<project>/scaffold-source/`) referenced `$CLAUDE_PROJECT_DIR/hooks/...` but framework hooks live at `<root>/.claude/hooks/...`. `$CLAUDE_PROJECT_DIR` resolves to the directory *containing* `.claude/` (the parent), not to `.claude/` itself, so the path never resolved to the hook files. All framework-level hook commands now use `$CLAUDE_PROJECT_DIR/.claude/hooks/foo.py` with the explicit `.claude/` prefix. Tier 2 scaffolded projects (e.g. `<project>`) were unaffected because their `hooks/` directory sits at the project root, not inside `.claude/` — so `$CLAUDE_PROJECT_DIR/hooks/...` resolved correctly there. Pre-existing since hook adoption; silently broke every framework-level hook on every operator. Per `protocols/versioning-protocol.md §3.1`, PATCH-class on its own; bundled into this MINOR release.

### SemVer classification

Per `protocols/versioning-protocol.md §3`: the orchestrator-discipline hooks + slash commands are net-new behavior (`§3.2` — new hooks added to `hooks/` and wired into `settings.json`, new commands added to `commands/`, all existing consumers continue to function unchanged) → MINOR. The two path-bug fixes are PATCH-class on their own (`§3.1` — internal hook-wiring fixes that "was supposed to work but didn't", no consumer behavior change beyond making the existing wiring actually run). The bundled release dominates at the higher class — **MINOR**.

### Provenance

User direction 2026-05-11 — Phase 1 canary lands on `<project>`, Phases 2/3 collapsed into the same session after smoke-tests held. Full rollout plan + smoke-test results + open follow-ups at `.claude/workspace/_global/orchestrator-discipline-rollout.md`. Memory entries that motivated the rollout: `memory/feedback_orchestrator_session_discipline.md` (the 3+ same-class fix dispatch threshold) and `memory/feedback_session_discipline_oauth_arc_2026-05-08.md` (the OAuth-arc incident where 4 same-class fixes shipped inline without dispatching a reviewer agent).

### Cross-channel sync

Per `protocols/versioning-protocol.md §6`, all three channel-version fields are updated atomically in this release: `package.json` `version`, `.claude-plugin/plugin.json` `version`, and `.claude-plugin/marketplace.json` `plugins[0].version`. Same bump applied to the framework-root canonical at `/.claude/` (which was stale at v0.7.8 — that drift is reconciled by this release; both channel triplets now read 0.9.0 in lockstep).

---

## [0.8.3] — 2026-05-11 — docs/ included in npm tarball + Trusted Publishing migration

**Two-axis infrastructure patch.** No framework surface changes — agents, commands, protocols, templates, hooks, settings.json, memory/, and playbooks/ are byte-identical to v0.8.2. This release widens the npm package's `files` allow-list to include `docs/` AND swaps the publish workflow's auth mechanism from a long-lived NPM_TOKEN secret to OIDC-based Trusted Publishing.

### Changed

- **`package.json`** `files` field — added `"docs"` so `docs/managed-agents-comparison.md`, `docs/specs/2026-05-04-framework-design.md`, and any other `docs/` content the framework carries now ship in the published tarball. `<project>`'s `scaffold-overlay/docs/` directory becomes redundant after this release and can be retired in a follow-up dashboard commit.
- **`package.json`** `exports` field — added `"./docs/*"` so consumers can resolve `docs/*` paths via `import` / `require.resolve`.
- **`.github/workflows/publish.yml`** — removed the `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` env binding from the "Publish to npm" step. The npm CLI auto-detects the GitHub Actions OIDC context via the existing `id-token: write` permission and authenticates against npm without a long-lived token. The `NPM_TOKEN` repo secret remains in place for the migration cutover; after the first successful Trusted Publishing publish, it can be deleted from both `tap-agents` and `tap-agents-internal` repos.

### Provenance

User direction 2026-05-11. Two related but independent infrastructure improvements bundled because both are PATCH-grade publish-surface changes with no consumer behavior delta. The Trusted Publishing migration is the second leg of the npm hardening pattern the API skill recommends (long-lived token → OIDC); the `docs/` inclusion closes the gap surfaced during the <project> migration session where two framework-canonical docs were temporarily living in `scaffold-overlay/` because they weren't yet shipped by the npm package.

---

## [0.8.2] — 2026-05-11 — README v2 + Dependabot seed for the public repo

**Discoverability + dependency hygiene patch.** No framework surface changes — agent prompts, commands, protocols, templates, hooks, and the npm package's programmatic API are all byte-identical to v0.8.1. This release is what people see when they land on the GitHub repo, and how the repo manages its own dependency updates over time.

### Changed

- **`README.md`** — full rewrite. Centered hero, four shield-style badges (npm version, Claude Code plugin, MIT, GitHub stars), explicit two-path Quick Start (marketplace install + npm install) at the top, a "Claude Code with vs. without TapAgents" comparison table that makes the wedge explicit, a Distribution Pipeline table explaining the dual-egress model, and a Versioning section pointing at `protocols/versioning-protocol.md`. Preserves the load-bearing parts of v0.8.1's README — the Founding Team table, the State Machine, Tier 1 vs Tier 2, the Public/Private Split, and the Memory section — and adds a footer with quick-links. The previous README served as a strong internal design doc; this version sells.

### Added

- **`.github/dependabot.yml`** (NEW, ~80 lines) — seeds the enable-with-ignore pattern from the framework operator's 2026-05-07 memory note BEFORE Dependabot's first run on this repo, avoiding the 13-PR-flood failure mode that hit <project> on its first Dependabot activation. Locks major-version bumps on `@types/node` (lockstep with Node runtime) and `typescript` (TS 6 deprecates APIs that would require code changes). Groups patch + minor updates into one PR/week per dep-class. Mirror config for GitHub Actions ecosystem with majors locked on `actions/checkout`, `actions/setup-node`, and `softprops/action-gh-release` where v→vN+1 contracts have historically shifted.

### Provenance

User direction 2026-05-11 to ship README + Dependabot as a focused docs patch, holding the `docs/`-in-npm-tarball packaging fix (originally bundled into the v0.8.2 plan) for v0.8.3 to keep each release's changelog narrative cohesive. Per `protocols/versioning-protocol.md` §3.1, PATCH is correct: README is docs, `.github/dependabot.yml` is config outside the versioned dirs (`agents/`, `commands/`, `protocols/`, `templates/`, `hooks/`, `scripts/`), and no consumer behavior changes. Severity-floor classifier confirms PATCH allowed.

---

## [0.8.1] — 2026-05-11 — Packaging fix: settings.json + memory/ + playbooks/ included in npm tarball

**Packaging-only patch.** No framework surface changes — only the npm-package `files` + `exports` fields. Consumer-facing addition: three previously-omitted top-level surfaces now ship with the published tarball.

### Changed

- **`package.json`** `files` field — added `"memory"`, `"playbooks"`, `"settings.json"` so they ship in the npm tarball. The dashboard's prebuild + runtime resolvers expected these and would have failed integrity checks against the v0.8.0 install.
- **`package.json`** `exports` field — added `"./memory/*"`, `"./playbooks/*"`, `"./settings.json"` so consumers can resolve these paths via `import` / `require.resolve`.

### Provenance

Surfaced during the `<project>` migration session — the prebuild integrity check (`scripts/copy-scaffold-source.mjs:findMissing`) flagged the gap when `node_modules/@tapintomymind/tap-agents/` was checked against `REQUIRED_ENTRIES`. PATCH-grade because no existing consumer's behavior changes (the v0.8.0 install was unusable for the dashboard's path; v0.8.1 fixes that). Per `protocols/versioning-protocol.md` §3.1 — fixing a packaging oversight that no consumer relied on at v0.8.0 is consistent with PATCH semantics.

---

## [0.8.0] — 2026-05-11 — Distribution wedge: SemVer protocol + npm publish pipeline + Claude Code marketplace manifest

**Framework structural addition — initial public release.** Establishes the framework as a dual-channel distributable: published to the npm registry as `@tapintomymind/tap-agents` for programmatic consumers (starting with `<project>`, which will replace its `scaffold-source/` mirror with this dependency), and published to the Claude Code plugin marketplace at `tapintomymind/tap-agents` for end-user `/plugin marketplace add` installs.

With two consumer channels live, the framework's version field crosses from internal-discipline into external-contract. The new `protocols/versioning-protocol.md` codifies strict SemVer enforcement at four gates (AI-led `/release` command → mechanical `hooks/version-gate.py` → CI `version-check.yml` → Critic review at release).

The `<project>` repo's `scaffold-source/` mirror is the legacy mechanism this replaces. `protocols/framework-change-discipline.md` §2 already declared scaffold-source out-of-scope of doctrinal review; this release operationalizes the replacement by giving scaffold-source a canonical upstream it can subscribe to via SemVer.

### Added

- **`protocols/versioning-protocol.md`** (NEW canonical, ~280 lines) — SemVer spec for the framework-release scope. §3 defines severity classification (PATCH = no consumer-visible change; MINOR = additive backwards-compatible; MAJOR = anything that could break a downstream consumer). §4 defines the four-gate enforcement chain. §6 locks `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` versions together. §7 overrides the pre-1.0 "anything goes" SemVer loophole — the classifier applies as-written regardless of major-zero phase. §8 codifies the relationship to per-agent `prompt_version` (the two version layers answer different questions and coexist).
- **`hooks/version-gate.py`** (NEW, ~280 lines) — PreToolUse hook that enforces three invariants at `git commit` time: atomicity (`package.json` version change must coincide with matching `CHANGELOG.md` heading in same staged diff), sequence (new version must be a legal SemVer successor to last tag), severity floor (removal/rename in `agents/`/`commands/`/`protocols/`/`templates/` forces MAJOR; addition forces MINOR floor). Soft-blocks (exit 2 with actionable message) — does not bypass via `--no-verify`. Wired into `settings.json` PreToolUse `Write|Edit|Bash` matcher alongside existing `pre-tool-gate.py`.
- **`commands/release.md`** (NEW slash command) — AI-led release flow. Six-step workflow: establish baseline → classify diff against §3 → propose version → draft `CHANGELOG.md` entry → draft `memory/agent-changelog.md` narrative → execute atomic release commit + tag. Each step has explicit "stop and surface to user" conditions for ambiguous classifications.
- **`package.json`** (NEW) — npm package manifest. Name `@tapintomymind/tap-agents`, scoped public package. Initial publish target: v0.8.0 on this release commit. `exports` field surfaces both programmatic API (`dist/index.mjs`) and raw `.md` file access (`./agents/*`, `./commands/*`, `./protocols/*`, `./templates/*`, `./hooks/*`, `./.claude-plugin/*`).
- **`tsconfig.json`** (NEW) — strict TypeScript config for `scripts/build-src/*.ts`. Targets `ES2022`/`ESNext`, `noUncheckedIndexedAccess`, isolated modules.
- **`scripts/build-src/build.ts`** (NEW, ~340 lines) — generates `dist/index.mjs` (programmatic exports with inlined agent/command/protocol/template bodies), `dist/index.d.ts` (TypeScript declarations with per-name string literal unions), `dist/manifest.json` (metadata-only summary read by EA's framework-health briefing). Pure Node stdlib + tsx runtime — zero external runtime deps.
- **`scripts/build-src/verify.ts`** (NEW, ~150 lines) — `prepublishOnly` guard. Hard-fails npm publish if any of: dist artifacts missing, manifest version drift, plugin.json/marketplace.json version drift, source files dropped from manifest, generated index.mjs not loadable.
- **`scripts/build-src/version-check.ts`** (NEW, ~210 lines) — Gate 3 CI counterpart to `hooks/version-gate.py`. Validates PR diff against base branch with the same algorithm (atomicity + sequence + severity-floor) but reading from `git diff <base>...HEAD` instead of `git diff --cached`.
- **`.github/workflows/version-check.yml`** (NEW) — required PR check on `main`. Path-filtered to fire only when the version surface is touched. Runs `version-check.ts` against `origin/main`.
- **`.github/workflows/publish.yml`** (NEW) — fires on `v*.*.*` tag push. Builds, verifies, validates tag/package alignment, publishes to npm with provenance, creates a GitHub Release extracting the matching CHANGELOG section.
- **`.claude-plugin/plugin.json`** (NEW) — Claude Code plugin manifest. Single plugin `tapagents` at framework root (RuFlo's `claude-flow` pattern, intentionally one curated plugin not a sprawl of forty).
- **`.claude-plugin/marketplace.json`** (NEW) — marketplace manifest. Declares the `tapagents` plugin with `source: "."` so the marketplace serves the framework root directly.

### Changed

- **`settings.json`** — PreToolUse `Write|Edit|Bash` matcher now includes a second hook entry pointing at `version-gate.py` alongside the existing `pre-tool-gate.py`. Two parallel gates, distinct concerns: `pre-tool-gate.py` handles dangerous-shell pattern matching; `version-gate.py` handles SemVer invariants. Both fire on every relevant tool call; either exit 2 blocks.
- **`.gitignore`** — adds `dist/`, `.npm`, `npm-debug.log*`, `*.tgz` to the build-artifacts section. `dist/` is regenerated by `scripts/build-src/build.ts` on every publish; never committed.

### Provenance

User direction 2026-05-11 to operationalize the distribution wedge (Claude Code marketplace + npm registry). Conversation chapter "CLI/marketplace implementation" — full design rationale in the chat transcript, condensed into this release's protocol and code artifacts. Authority: explicit user authorization for this scope (per `protocols/framework-change-discipline.md` Rule 1(b)) — files affected named in chat in advance of landing. Critic adversarial review will run on the release commit per `versioning-protocol.md` §4.4 before any tag is pushed.

---

## [0.7.8] — 2026-05-07 — Framework metrics protocol + agent emit instructions + UI-discipline proposal

**Framework structural addition.** Five new protocols (security scanning, observability, framework metrics, agent input sanitization, stack portability) + emit/rollup scripts (Python stdlib only) + agent-prompt updates (six agents bumped to `prompt_version: 2026-05-07-1` with metrics-emit instructions) + new `/feature` command + Designer/UI-UX-Reviewer activation discipline incident captured.

The framework metrics protocol is the load-bearing addition — it ties the agent prompts to a structured event stream that downstream Tier 2 projects (e.g., <project>) can ingest into their own production stores. <project>'s Tier 2 PG-backed metrics surface (landed same day in <project> `dev` branch) is the first Tier 2 consumer of this event stream.

### Added

- **`protocols/framework-metrics.md`** (NEW canonical, ~520 lines) — event taxonomy (agent.invoked, critic.review, qe.smoke, qe.test_plan, gate.passed, conductor.transition, project.created, agent.run.completed, ea.briefing.delivered + counters), emit primitive contract (atomic single-line JSONL append; size budget; no PII / secrets / artifact contents per §4); rollup architecture (window + project + agent dimensions); five-layer reader contract (file → parse → window-filter → project-filter → tally); operator vs agent vs project-scope split (§7); prompt-version + agent-changelog atomicity rule (§9); production-sync follow-up (§11) — points at the PG-backed Tier 2 path <project> now implements.
- **`protocols/security-scanning-defaults.md`** (NEW canonical, ~340 lines) — five-layer protocol (SAST + SCA + secret-scan + license-check + DAST). Per-stack appendix shows Next.js + Python + Go + Rust + Ruby concrete tooling. The <project>'s `.github/workflows/{vitest,audit,codeql,gitleaks}.yml` are the Next.js reference implementation.
- **`protocols/observability-defaults.md`** (NEW canonical, ~290 lines) — five-layer protocol (request-ID correlation + structured logs + tracing + error tracking + RUM). Per-stack appendix; <project>'s middleware + instrumentation + logger is the Next.js reference impl.
- **`protocols/agent-input-sanitization.md`** (NEW canonical, ~210 lines) — three-tier trust model (system instructions → user input → external content) + per-agent bindings. Closes the prompt-injection defense gap — Tier 2 implementers (e.g., <project>'s job handlers) now have explicit guidance on what's safe to put in payloads.
- **`protocols/stack-portability-map.md`** (NEW canonical, ~410 lines) — translation matrix across nine stacks (Next.js + Remix + SvelteKit + Astro + Express + FastAPI + Django + Rails + Go-stdlib). Used by Architect when picking tooling for new projects.
- **`scripts/emit-metric.py`** (NEW, ~280 lines) — Python stdlib-only event emitter. Atomic single-line JSONL append. Best-effort dual-write to a Tier 2 PG-backed ingest endpoint when `FRAMEWORK_METRICS_INGEST_URL` + `FRAMEWORK_METRICS_INGEST_SECRET` env vars are set (gated by env so JSONL-only operators are unaffected). Network failures + non-2xx responses log to stderr but never fail the script — JSONL is the local source of truth.
- **`scripts/rollup-metrics.py`** (NEW, ~210 lines) — rollup with `--window`, `--full`, `--format` flags. Reads JSONL, computes byEvent / byAgent / byProject / criticVerdicts / qeSmokes tallies. Mirrors the TS reader's contract so <project>'s `/admin/framework` page renders the same numbers operators see locally.
- **`agents/_planned/test-engineer.md`** (NEW activation-trigger stub) — backstop role for inline test-writing during feature dev when feature agents repeatedly fail to write tests at the coding→review gate. Activates only on accumulated trigger evidence (per `protocols/agent-changelog-activation-protocol.md`).
- **`commands/feature.md`** (NEW slash-command body) — feature-mode invocation of Intake. Anchors to existing PRD/scope/decisions for an existing project; Strategist turns the resulting feature-brief into a PRD-revision or mini-PRD.
- **`templates/feature-brief.md`** (NEW) — canonical shape for the feature-brief artifact `/feature` produces. Mirrors `templates/intake-brief.md`'s discipline (cited claims only) but scoped to feature-grain decisions.

### Changed

- **`agents/conductor.md`** (+~80 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `agent.invoked` / `gate.passed` / `conductor.transition`); `prompt_version: 2026-05-07-1` first set.
- **`agents/critic.md`** (+~70 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `critic.review` with verdict + blocking_concerns + severity_distribution payload); `prompt_version: 2026-05-07-1`.
- **`agents/quality-engineer.md`** (+~75 lines) — Read-list adds `protocols/framework-metrics.md`. New emit-instructions block (when to fire `qe.smoke` + `qe.test_plan` + `agent.invoked`); `prompt_version: 2026-05-07-1`.
- **`agents/org-designer.md`** (+~95 lines) — Read-list adds `protocols/framework-metrics.md` + `protocols/agent-input-sanitization.md`. New "weekly trigger sweep" section (§5) — fires every Sunday 23:00 UTC, mines `memory/framework-metrics.jsonl` for accumulated triggers (agent prompt size, WRONG_AGENT rate, recurring failure patterns); produces a Decision Packet via EA when a structural-change recommendation lands. New "monthly memory curation" hook + "quarterly framework-metrics rollup" hook. `prompt_version: 2026-05-07-1`.
- **`agents/executive-assistant.md`** (+~110 lines) — Read-list adds `protocols/framework-metrics.md`. New "framework health" briefing section in `/status` and `/briefing` (surfaces ingest-volume, agent-invocation-rate, critic-block-rate, last-QE-smoke per project; cardinal-zero-rule omits when absent); new emit-instructions for `ea.briefing.delivered` events. `prompt_version: 2026-05-07-1`.
- **`agents/intake.md`** (+~25 lines) — feature-mode invocation path added (handles `/feature` slash-command); read-list adds `templates/feature-brief.md`.
- **`commands/intake.md`** (+~10 lines) — disambiguates between `/team` (full intake-brief) and `/feature` (feature-brief mode); points at `agents/intake.md` for routing.
- **`protocols/framework-change-discipline.md`** (+§9 ~60 lines) — prompt-version naming convention (`YYYY-MM-DD-N`), atomicity rule (CHANGELOG + agent-changelog updates land with each agent prompt edit), trigger conditions for prompt bumps. Used by Conductor/Critic/QE/Org-Designer/EA's first version-set in this release.
- **`protocols/checkpoint-protocol.md`** (+~25 lines) — checkpoint-events include framework-metrics emit hooks so `gate.passed` events surface in the rollup automatically.
- **`protocols/intake-protocol.md`** (+~40 lines) — intake-mode-vs-feature-mode disambiguation; feature-brief output schema reference.
- **`templates/decision-packet.md`** (+~30 lines) — references the new `protocols/framework-metrics.md` ingest contract; explicit "include rollup metric IDs in `Provenance` section" guidance.
- **`memory/incidents.md`** (+~80 lines) — new entry "2026-05-07 — UI-fix dispatch-discipline gap [project: <project>]" capturing the orchestrator-discipline failure mode where Claude Code shipped four UI fixes in one session without dispatching `ui-ux-reviewer` or appending to `memory/ui-anti-patterns.md`. Cross-cutting class-of-issue: design-system tokens applied inconsistently across same-tier peer components.
- **`memory/agent-changelog.md`** (+~20 lines) — narrative entry for the six agent-prompt bumps (Conductor/Critic/QE/Org-Designer/EA — first prompt_version set; Intake — feature-mode addition). Public-safe; no project-specific details.
- **`workspace/_global/backlog.json`** (+~3 entries) — `framework-metrics-Tier-2-pg-sync` (LANDED 2026-05-07 in <project> `dev`); `framework-metrics-silent-failure-watchdog` (LANDED same day); `scan-and-adopt-ui-surface-v1.5-task-9` (LANDED same day).

### Org-discipline note

`workspace/_global/org-designer-proposal-2026-05-07-ui-discipline.md` — Org Designer formal proposal awaiting user approval per the agent's "never acts unilaterally" charter. Three bundled changes:
- **A.** `agents/ui-ux-reviewer.md` prompt-version bump to `2026-05-07-2` adding a fourth `fires_when` trigger for "orchestrator reports 3+ UI/UX fixes in one session/branch without intervening review."
- **B.** New `protocols/orchestrator-session-discipline.md` (Org Designer to own) — pins the rule "3+ UI fixes → either dispatch reviewer OR append `memory/ui-anti-patterns.md` entry."
- **C.** New `templates/design-spec.md §3.0` tier-treatment table (Primary CTA / Ambient-tier icon / Filter-chip / Metadata-badge / Destructive-tier action) so future implementers can't drift on visual contracts for same-class components.

A+B is the minimum-coherent pair (closes the dispatch loop). C is independently approvable.

### Adjacent ui-anti-patterns entry

`memory/ui-anti-patterns.md` entry #2 — "Design-system tokens applied inconsistently across same-tier peer components" — bundles the four observed <project> fixes (Scan icon mismatch with peer SyncButton; chip dark-mode invisibility; per-agent model badge legibility; description ellipsis with no expansion) as ONE class-of-issue, not four separate entries. Resolved by the <project> `fix(ui)` commit on `dev` 2026-05-07.

### Provenance

<project> 2026-05-07 dev session — first end-to-end exercise of the `protocols/framework-metrics.md` Tier 2 PG-backed sync path. Agent-dashboard's commits at `https://github.com/tapintomymind/<project>.git` `dev` branch (10 commits between `86c25bb..181fc25`).

---

## [0.7.7] — 2026-05-07 — BL-031 Phase 1: dream-pass capability landing

**Framework structural addition.** Lifts Anthropic's May 2026 Managed Agents `dreams` feature shape (immutable input → new output memory store; optional review-mode for accept/discard before commit) into TapAgents memory curation. Hybrid shape (skill extension + scheduled-task hook + Org Designer cadence ownership + EA Decision Packet for review) — composes four existing primitives, no new agent contract. Pure protocol/skill/contract change — no Managed Agents API dependency.

### Added

- **`protocols/dream-pass.md`** (NEW canonical, ~305 lines) — immutable-input invariant (`memory/` never mutated; output writes only to `memory.next/`); `MEMORY_ROOT=memory.next/` explicitly forbidden; file layout convention (`memory.next/` candidate-store with `_diff.md`, `_instructions.md`, `_provenance.md` internal metadata files; `memory.prev.<ISO-ts>/` post-accept archive at 90-day retention); tier'd ingest scope (default-tier 350KB at Phase 1; stretch 1.2MB Phase 2+; aggressive 2MB Phase 3+); curation discipline as hard rules (axis discipline preserved; provenance preservation; public/private split preservation); `[INVENTED?]` flagging for hallucination defense-in-depth (skill annotation + OD diff review + user accept-flow surfacing — three-layer pattern); cadence (weekly Sunday 23:00 UTC = Sunday 19:00 EDT cron `0 19 * * 0`; self-tuning 3-no-op-relax to bi-weekly then monthly); Phase 1→4 rollout with explicit fail-recovery paths; industry-portability framing.
- **`commands/consolidate-memory.md`** (NEW slash-command body, ~206 lines extending Anthropic `consolidate-memory` skill) — two-mode pipeline. Legacy mode preserves the original Anthropic 35-line in-place behavior with TapAgents-shape Phase 3 no-op handling. Dream-pass mode (`--dream-pass`) implements the immutable-input pipeline with defensive preflight (pending-`memory.next/` guard refuses to overwrite; tier-gate guards refuse pre-Phase-2 stretch / pre-Phase-3 aggressive; forbidden-env-var guard refuses `MEMORY_ROOT=memory.next/`); supports `--instructions=<prose>`, `--tier=default|stretch|aggressive`, `--dry-run`, `--legacy`. Backward-compat preserved per Fork 3.
- **`mcp__scheduled-tasks` `weekly-dream-pass` task entry** — cron `0 19 * * 0` (Sunday 19:00 EDT = Sunday 23:00 UTC; MCP evaluates cron in user's local timezone; small deterministic dispatch delay confirmed at :09 minutes). Task prompt embeds protocol references + preflight discipline + EA-signaling at completion + explicit "do NOT auto-execute the atomic mv accept-flow" guard; `notifyOnCompletion: false` to avoid noise on no-op cycles. **First scheduled fire: Sunday 2026-05-10 19:00 EDT (= 23:00 UTC).**

### Changed

- **`agents/org-designer.md`** (+~15 lines) — Read-list adds `protocols/dream-pass.md` + `memory.next/_diff.md` + `memory.next/_provenance.md` + latest `memory.prev.<ts>/` archive. Authority adds dream-pass cadence + review row (OD owns weekly schedule + reviews `_diff.md` before EA Decision Packet; annotates with `approve | approve-with-edits | discard | pause-cadence` recommendation; defers final decision to user; cadence operates alongside not instead of monthly pattern-mining audit; self-blindness mitigation via Phase 2 user `/grow-team` calibration check after week 4). Quarterly Review section adds dream-pass acceptance-rate tracking (target ≥30% post Phase 2; <20% triggers cadence-relax + curation-discipline retro).
- **`agents/executive-assistant.md`** (+~85 lines) — Read-list adds `protocols/dream-pass.md` + `memory.next/_diff.md` + `memory.next/_provenance.md` + `workspace/_global/dream-pass-log.md`. New "Memory health" briefing section (surfaces pending dream-pass with cycle-tier-diff-summary-OD-recommendation; cardinal-zero-rule omit-when-absent; no-op cycles surface as single line + count toward 3-no-op tracker). New "Dream-pass Decision Packet" surface format (≤400 words with summary / inputs / top-changes / invented-flag-review / OD-recommendation / artifacts / four-option fork: accept-as-proposed / edit-then-accept / discard / pause-cadence).
- **`memory/README.md`** (+~15 lines) — `Configurable Path` section adds `MEMORY_ROOT=memory.next/` forbidden note. New "Dream-pass cadence" section.
- **`.gitignore`** (+~10 lines) — `memory.next/` and `memory.prev.*/` patterns added with cross-reference to `protocols/dream-pass.md §2`.
- **`memory/backlog.md`** + **`workspace/_global/backlog.json`** — BL-031 status changed `open → in-progress` with Phase 1/2/3/4 status detail; new fields (`phase_status`, `user_forks_applied`, `implementation_session`, `files_landed_phase_1`, `approval_packet`, `critic_review_path`); `item_counts` recomputed mechanically (total=31 unchanged; by_status `open: 18→17`, `in-progress: 3→4`).

### Mirrored

3 framework files mirrored to `<project>/scaffold-source/` with `diff -q` empty parity (re-mirrored after Critic Pass 1 P1-6 fix to protocol §7): `protocols/dream-pass.md`, `agents/org-designer.md`, `agents/executive-assistant.md`. `commands/consolidate-memory.md` is NOT mirrored — slash-command bodies are framework-local.

### Phase rollout

- **Phase 1 (this landing):** protocol + skill body + contract diffs + scheduled-task + .gitignore + memory/README.md cadence section + scaffold-source mirrors. NO live dream-pass run during Phase 1 land.
- **Phase 2 (4 weekly cycles dogfood observation, gates Phase 3):** first scheduled fire 2026-05-10 19:00 EDT. 4 cycles minimum; extends to 8 weeks if 20-30% acceptance triggers extended observation. User `/grow-team` after week 4 evaluates OD's recommendation calibration. Success criteria: (a) 4 weekly cycles complete; (b) acceptance rate ≥30%; (c) zero accepted bad-curation incidents; (d) at least one `--instructions` cycle exercised.
- **Phase 3 (aggressive-tier ingest + event-driven trigger evaluation):** gated on Phase 2 success. Separate OD proposal at Phase 3 entry.
- **Phase 4 (framework-default promotion):** gated on Phase 3 settlement. Promotion to `templates/stacks/_baseline/`.

### User forks applied (per BL-031 EA Decision Packet 2026-05-07)

| Fork | User decision | Implementation |
|---|---|---|
| Fork 1 — Default cadence | **weekly Sunday 23:00 UTC + 3-no-op-relax to bi-weekly** | `mcp__scheduled-tasks__create_scheduled_task` `weekly-dream-pass` cron `0 19 * * 0`; self-tuning relax codified in protocol §6 |
| Fork 2 — Default ingest tier | **default-tier @ 350KB cap** | Protocol §4 + skill body Step 1 input cap enforcement; `agent-changelog.md` 134KB / 48% special-handling note in protocol §4 |
| Fork 3 — Default mode for `/consolidate-memory` | **legacy in-place stays default; --dream-pass opt-in** | Skill body "Mode resolution" preserves legacy as default; `--dream-pass` is opt-in flag; scheduled-task explicitly invokes `--dream-pass` regardless |

### Critic verdict

Pass 1 REVISE-BEFORE-LAND (0 P0 / 2 P1 / 2 P2 / 8 Notes); one P1 mechanically fixed inline (P1-6 protocol §7 dream-pass-log location hedge). Pass 2 LAND (clean on Pass-1 fix). Four Phase-2-retro observation criteria registered (not BL-NNN items): scheduled-task fail-recovery edge case; stretch-tier phase-gating machine-readable marker; `mv` atomicity multi-mount caveat; cron miss-rate tracking when machine offline.

---

## [0.7.6] — 2026-05-07 — BL-025 Phase 1: outcome-grading rubric envelope landing

**Framework structural addition.** Lifts Anthropic's May 2026 Managed Agents `outcomes` feature shape (rubric + separate-context grader → structured result envelope) into TapAgents' four-axis review tier. Pure protocol/contract change — no Managed Agents API dependency.

### Added

- **`protocols/outcome-grading.md`** (NEW canonical, ~340 lines) — rubric-style result envelope schema; result enum (`satisfied | needs_revision | max_iterations_reached | failed | unable_to_grade`) with mandatory `reason_class: infra | tooling | precondition_absent | runtime_error` for `unable_to_grade`; iteration loop semantics scoped to `handed-off → shipped` only; rubric-extraction discipline (reviewer-extracts criterion IDs from existing producer artifacts — zero producer-side change per user Fork 3); marker-file backward-compat mechanism (`workspace/<slug>/.outcome-grading-active`); industry-portability framing.
- **`templates/smoke-report.md`** (NEW) — formerly referenced by `agents/quality-engineer.md` but didn't exist as standalone template; now codifies envelope-at-section-top + structured prose with criteria-evaluated → §What-was-tested cross-reference.
- **`templates/security-audit.md`** (NEW) — formerly referenced by `agents/ops-security.md` but didn't exist as standalone template; now codifies envelope-at-section-top + structured prose with mitigation-map ID (`M-N`) → criteria-evaluated cross-reference.
- **NEW Tier 1 P3 BL-029** — "Codify 'iterate on user's behalf' principle in EA + Conductor + Org Designer contracts" filed per BL-025 proposal §7 + user founding-principle directive 2026-05-06 (also captured at `memory/feedback_iterate_on_users_behalf.md`).

### Changed

- **`agents/critic.md`** (codify-only per user Fork 2; +57 lines net) — adds "Result Envelope" section after Severity Reference with BL-019 verdict-shape mapping table (LAND-WITH-FOLLOWUPS → `satisfied` with `followup_items_filed:` populated; BLOCK → `needs_revision`; etc.); explicit codify-only scope language.
- **`agents/quality-engineer.md`** (+27 lines) — Algorithm step 4 inserted to codify rubric-extraction from `prd.md §Acceptance` items (`AC-N` IDs); Algorithm step 5 (smoke-report write) updated to require YAML envelope at section-top; new "Iteration loop" section codifying Phase-2 MANUAL-ITERATE mode + `max_revision_attempts = 2` per user Fork 1.
- **`agents/ui-ux-reviewer.md`** (+18 lines) — Algorithm step 6 (design-review write) updated to require YAML envelope with `criteria_evaluated` from `design-spec.md §7 default-coverage` route + state IDs (`DC-N`).
- **`agents/ops-security.md`** (+25 lines) — Algorithm step 7 (security-audit write) updated to require YAML envelope with `criteria_evaluated` from `threat-model.md` mitigation-map IDs (`M-N`).
- **`agents/conductor.md`** (+60 lines) — Read-list adds `protocols/outcome-grading.md`; new "Outcome-grading envelope handling" section with parser table mapping all 5 envelope results to Conductor actions; new "Cross-reviewer brief assembly" subsection (precedence Ops/Sec > QE > UI/UX > Critic-on-Tier-2); new "Phase gating" subsection (Phase 1 codify-only / Phase 2 manual-iterate / Phase 3 auto-iterate).
- **`templates/critic-review.md`** (+24 lines) — adds YAML envelope as new required first block.
- **`templates/design-review.md`** (+30 lines) — adds new §0 "Result envelope" section.
- **`memory/backlog.md`** + **`workspace/_global/backlog.json`** — BL-025 entry status `open → in-progress` with Phase 1/2/3 status detail; new entry for BL-029.

### Mirrored

All 10 framework files mirrored to `<project>/scaffold-source/` with `diff -q` empty parity.

### Phase rollout

- **Phase 1 (this landing):** Critic emits envelope (codify-only); trio (QE/UI-UX/Ops-Security) contracts updated to emit envelopes; Conductor parses LAST yaml-fenced block; iteration loop reserved.
- **Phase 2 (next ship cycle dogfood):** activates on the next project's `handed-off` cycle by Conductor creating `workspace/<slug>/.outcome-grading-active` marker. MANUAL-ITERATE mode.
- **Phase 3 (auto-iterate, future):** gated on Phase 2 dogfood validation + Tier 2 baseline scaffold update — separate OD proposal at Phase 3 entry.

### User forks applied (per BL-025 EA Decision Packet 2026-05-06)

| Fork | User decision | Implementation |
|---|---|---|
| Fork 1 — `max_revision_attempts` default | **2** | Hard-coded `default = 2` across all 5 reviewer contracts + protocol + state.json schema |
| Fork 2 — Critic codification scope | **codify-only** | Critic contract notes Phase 1 = codify-only; Critic-on-Tier-2 auto-iteration reserved for Phase 3 |
| Fork 3 — Rubric authorship discipline | **reviewer-extracts** | Protocol §8 + reviewer Algorithm steps cite "extract from existing producer artifacts"; no producer contract amended |

### Bundled in same commit (separately tracked, not v0.7.6 scope)

- **BL-026 doc landing** — `.claude/docs/managed-agents-comparison.md` (NEW, 215 lines, Critic LAND-WITH-FOLLOWUPS clean). Status: `open → done`. Public-safe narrative in `memory/agent-changelog.md`.
- **BL-031 proposal artifacts** — `workspace/_global/org-designer-proposals/20260507T0251-bl-031-dream-pass-tapagents.md` (~750 lines), Critic review, EA Decision Packet. Awaiting user decision; agent-changelog narrative lands at Phase 1 implementation per BL-025 precedent.
- **BL-031 backlog entry** filed canonically by Backlog Curator; `item_counts` recomputed: total=31, P2=12, open=18, tier1=11.
- Earlier in-flight session work captured (separate sessions, not landed individually): `agents/db-admin.md` activation, `protocols/destructive-data-ops.md`, `protocols/framework-change-discipline.md`, baseline scaffold tier2 template updates, registry/portfolio touches.

---

## [0.7.5] — 2026-05-06

### Added — Backlog Curator activated (curator-lite hybrid scope)

Backlog Curator graduated from `agents/_planned/` to `agents/` with curator-lite scope per user-approved Proposal 3 of `workspace/_global/org-designer-proposals/20260506T2330-backlog-reconciliation.md`. User direction: *"Backlog Curator is needed for our Tap Agents to be able to efficiently work amongst itself and resolve vulnerabilities, functional enhancements, UI/UX, etc."*

**Scope of curator-lite (what landed).** ID allocation as canonical allocator per `protocols/backlog-protocol.md §2.1`; JSON↔MD mirror-sync verification (structural assertion only — never silent reconciliation); `item_counts` recomputation in `workspace/_global/backlog.json` (the only mutation curator does without authorization); simple staleness flagging — Tier 2 P3 items > 90 days flagged via `STALENESS-CANDIDATE` finding (curator does NOT autonomously archive); status-drift sweep via `git log --grep="BL-NNN"` flagged as `STATUS-DRIFT-CANDIDATE`; top-of-backlog surfacing to EA's `Needs input:` line. Cadence: post-edit verify on every backlog mutation + on-demand ID-allocation gate + daily sweep summary signaled to EA + post-retro focused pass + post-merge sweep when promotion script invokes.

**What stayed with Org Designer.** Re-prioritization based on incident signal, archival decisions on Tier 1 items, stub-activation proposals when P0/P1 items keep being pushed, pattern-mining from `incidents.md` to backlog. Curator surfaces candidates via NEW append-only file `workspace/_global/backlog-curator-notes.md`; OD/user decides.

**Why curator-lite over full activation.** The full curator scope from the original `_planned/` stub (re-prioritization + archival + pattern-mining + stub-activation proposals) would have duplicated OD's pattern-detection work and risked the curator-OD seam producing the same friction the activation was meant to relieve. Curator-lite is sized to its actual job — mechanical hygiene — with cleaner separation of concerns and a smaller activation surface. The 30% time-cost data point from the same-day reconciliation pass (proof-of-need) drove sizing.

**Resize clause (load-bearing).** `agents/backlog-curator.md` codifies a 30-day evaluation (target 2026-06-05). OD evaluates whether curator-lite scope is under-scoped (>10% OD curator work in retros → propose mandate expansion), over-scoped (curator firing on noise → propose contraction), or right-sized (codify curator-lite shape as canonical activated form). Codified ratchet rather than scope creep.

**Lane discipline.** Curator owns `backlog.json` mutation (counts + ID-allocation), `backlog.md` mirror sync verification, `protocols/backlog-protocol.md §2.1` cadence enforcement. Curator does NOT decide priority bumps without OD/user authorization, does NOT delete items (mark wontfix/archived only — audit trail preserved), and does NOT detect cross-project patterns.

### Added — Backlog protocol §2.1 ID-allocation rule

`protocols/backlog-protocol.md` gained a new §2.1 "ID Allocation" section codifying single-shared-monotonic `BL-NNN` namespace + mandatory full-scan allocator + atomic JSON-MD pairing rule. Closes the failure mode that surfaced 2026-05-06: framework session 21-00 allocated BL-017/BL-018 from `backlog.json`'s then-max=16 while project sessions had previously allocated BL-017..BL-023 in `workspace/<project>/backlog.md` without mirroring to JSON, producing a numbering collision. The rule: allocator MUST scan `workspace/_global/backlog.json` + `memory/backlog.md` + `workspace/<slug>/backlog.md` for **every active project** in `portfolio.json` before picking `max(observed) + 1`. Append entry to the correct tier file AND mirror to `backlog.json` as the **same atomic unit** — never one without the other. Collision recovery: later allocator (by `added` date, then file mtime) renumbers + updates all references via `git grep`. Backlog Curator is the canonical allocator.

### Changed — 24-item backlog reconciliation (data correction pass)

`workspace/_global/backlog.json` rewritten end-to-end with reconciled state:
- **Status drift closed on 5 shipped items** with full git-evidence citations: BL-011 (commit `d929df3`), BL-013 Phases 1-5 (commits `9bca272`, `9800d4f`, `4c66fb6`; merges `47a1205`, `dafe25b`, `bf2f08a`), BL-015 + BL-016 (commit `00311e4` → merge `47a1205`), BL-023 (commit `1c176ee` → merge `bf2f08a`; migration `0004_bumpy_catseye.sql` to prod Neon at audit `a725f85`).
- **Status accuracy update on 1 item:** BL-006 from `open` to `in-progress` (implementation brief filed, doctrine doc exists, code not yet landed at commit baseline).
- **6 previously-unsynced project items added to JSON:** BL-019, BL-020, BL-021, BL-022, BL-023 (Tier 2 items existed in `workspace/<project>/backlog.md` but were missing from JSON; EA's BACKLOG SUMMARY had been undercounting Tier 2 by 6).
- **Framework BL-017→BL-024 + BL-018→BL-025 collision-recovery renumber:** project BL-017..BL-023 had earlier `added` timestamps and won the recovery per §2.1 rule. Renumbered framework entries carry `renumbered_from` field documenting the rename trail. Historical references in already-shipped CHANGELOG.md / sealed sessions / `_landed/0.7.4.md` left **unchanged** (they correctly say what was filed at the time).
- **Final post-recon counts:** Total 24 items; by_priority P0=0 P1=10 P2=10 P3=4; by_status open=14 in-progress=2 done=8 wontfix=0; by_tier tier1=7 tier2=17.

### Changed — Conductor + EA + OD contracts updated for Curator activation

- `agents/conductor.md` — Read-list adds `workspace/_global/backlog-curator-notes.md`; Backlog pull algorithm step 4 routes ID allocation + post-edit verify to Curator; NEW `Backlog Routing Matrix` section codifies which work routes to Curator vs OD vs user (13-row routing table).
- `agents/executive-assistant.md` — Read-list adds `backlog-curator-notes.md`; BACKLOG SUMMARY format adds `Curator findings (last 24h):` line filtered from curator-notes timestamps (cardinal-zero rule applies).
- `agents/org-designer.md` — Read-list adds `backlog-curator-notes.md`; Authority "Backlog grooming (pre-Curator)" bullet revised to "delegated to Backlog Curator since 2026-05-06"; 30-day resize evaluation codified inline (target 2026-06-05; lives in OD's monthly Cadence 4 pass per `protocols/team-rhythm.md`).
- Scaffold-source mirrors at `<project>/scaffold-source/agents/{conductor,executive-assistant,org-designer,backlog-curator}.md` updated identically (`diff -q` empty post-edit).

### Removed — `agents/_planned/backlog-curator.md` (graduated, not superseded)

Stub at `agents/_planned/backlog-curator.md` deleted — clean promotion of the previously-provisional contract per the activation checklist in the original stub. The active contract at `agents/backlog-curator.md` carries the curator-lite scope; the stub's "full curator" scope was deliberately not adopted.

### Founding team count: 8 active + 11 planned → 9 active + 10 planned

Backlog Curator graduated from `_planned/` (decrementing planned roster by 1, incrementing active roster by 1) in the same atomic transaction.

### Files changed

- `.claude/agents/backlog-curator.md` (NEW — graduated from `_planned/`; curator-lite scope; resize clause codified)
- `.claude/agents/_planned/backlog-curator.md` (DELETED — clean promotion)
- `.claude/agents/conductor.md` (Read-list + Backlog pull algorithm + NEW Backlog Routing Matrix section)
- `.claude/agents/executive-assistant.md` (Read-list + BACKLOG SUMMARY format with Curator findings line)
- `.claude/agents/org-designer.md` (Read-list + Authority Backlog grooming bullet revised + 30-day resize evaluation codified)
- `.claude/protocols/backlog-protocol.md` (§2.1 ID-allocation rule added; §8 anti-patterns updated for status-drift + single-source-allocation)
- `.claude/workspace/_global/backlog.json` (full rewrite with reconciled state)
- `<project>/scaffold-source/agents/backlog-curator.md` (NEW mirror)
- `<project>/scaffold-source/agents/conductor.md` (mirror)
- `<project>/scaffold-source/agents/executive-assistant.md` (mirror)
- `<project>/scaffold-source/agents/org-designer.md` (mirror)
- `<project>/scaffold-source/agents/_planned/backlog-curator.md` (DELETED — mirror)
- `.claude/CHANGELOG.md` (this entry)
- `.claude/memory/agent-changelog.md` (atomic narrative pair per `protocols/changelog-protocol.md §6`)

### Cross-references

- `workspace/_global/org-designer-proposals/20260506T2330-backlog-reconciliation.md` — OD proposal artifact with full evidence (Proposals 1+2 LANDED in prior dispatch; Proposal 3 = curator activation HYBRID approved by user).
- `protocols/backlog-protocol.md §2.1` — load-bearing ID-allocation rule (codified 2026-05-06; Curator is canonical allocator).
- `protocols/changelog-protocol.md §6` — atomic-cadence rule (data correction + protocol amendment + agent activation paired as one v0.7.5 release).
- Prior session 21-00 (v0.7.4) auto-seal hardening filed BL-017 (P2-cluster) and BL-018 (P3-hooks) which became the framework BL-024/BL-025 in collision-recovery rename — `renumbered_from` field in `backlog.json` documents the trail.

---

## [0.7.4] — 2026-05-06

### Process — Session-tracking auto-seal + EA drift-detection

Closes the session-tracking drift gap that surfaced 2026-05-06: BL-023 (16-00) + BL-013 Phase 5 (18-15) sessions left their `active-sessions.md` entries `status: in-progress` for ~3.5h after merge bf2f08a landed at 19:49. Two complementary mechanisms now make this self-healing:

**(A) Auto-seal on promotion** — `<project>/scripts/promote-to-prod.sh` now walks `active-sessions.md` at start of Gate 5 (success path) and inside `fail_with_audit` (partial-state path) and seals every in-progress entry whose `files_in_flight:` list overlaps the merged file set. Sealed entries gain `auto_sealed`, `auto_seal_merge`, `auto_seal_outcome`, `auto_seal_files`, and an `AUTO-SEALED via promote-to-prod.sh ...` `completion_note` (with a CAUTION line when claimed-files > shipped-files). Manually-sealed entries (existing `completion_note:`) are NOT overwritten — only `auto_*` metadata is appended for forensic record. Manifest path resolves framework-root-first then project-local fallback for industry portability. Failures are non-blocking (warn-only) — auto-seal is a metadata convenience, not a promotion gate. Implemented in inline python3 (multi-line YAML block parsing in pure bash is too brittle).

**(B) EA stale-session sweep** — `executive-assistant.md` runs a drift-detection sweep on every `/status` and `/briefing`. For each `status: in-progress` entry whose `last_updated` is >2h old, EA cross-references claimed `files_in_flight:` against `git log` since `last_updated`. Drift candidates surface as a `SESSION-TRACKING DRIFT` section with the suggested fix (re-run promotion script, or manually seal). EA is read-only — auto-seal owns mutation; EA owns surfacing. Catches cases auto-seal can't see: manual merges, hotfixes, projects without a promotion script, or any path that bypasses the script.

**Protocol amendment.** `session-coordination-protocol.md` Rule 1 now documents both mechanisms verbatim (field shapes, idempotency rules, fallback behavior). The "Future enforcement (hooks)" section was split: A and B moved into a new "Current enforcement (active)" section; pre-edit hooks remain as future work. Rule 1's "On session end" paragraph adds a one-line note clarifying that promote-script-merged work is auto-sealed; manual seal is only for non-promote paths. Path-format contract codified per Critic PASS 2: claims must be full repo-relative paths from framework workspace root, not basenames — the auto-seal matcher enforces exact-equality after framework/project-rooted normalization.

**EA reactive-cadence honesty.** EA's stale-session sweep is **reactive** — it fires on `/status` or `/briefing`, not on a timer or background hook. The 2026-05-06 drift surfaced because the user manually asked at 21:00, ~3.5h after merge. Even with this fix, EA would not have caught the gap during those 3.5h unless invoked. Auto-seal (A) is the active mechanism that closes the most common drift path; EA's sweep (B) is the reactive safety net for cases auto-seal can't see; the proactive answer (Claude Code pre-edit + pre-commit hooks) remains a P3 backlog item — see BL-018.

**Industry portability.** Scaffold-source mirrors at `<project>/scaffold-source/protocols/session-coordination-protocol.md` and `<project>/scaffold-source/agents/executive-assistant.md` updated identically (`diff -q` empty post-edit). `promote-to-prod.sh` is project-specific and has no scaffold-source mirror — other-stack promotion scripts SHOULD implement the same `auto_seal_active_sessions()` shape.

**Team flow.** Routed through Architect (PASS 1 + PASS 2) → Critic (PASS 1 LAND-WITH-FOLLOWUPS → PASS 2 GREEN-LAND-NOW). Two P1s closed before commit (path-suffix matcher false-positive elimination + CHANGELOG draft completeness). 4 P2s + 3 Notes filed as backlog: BL-017 (P2-cluster hardening — em-dash literal docs, EA guard rewrite, git-log timezone, sanity-line-count threshold, MERGE_SHA defense-in-depth, mktemp portability) + BL-018 (P3 Claude Code hooks).

### Files changed

- `<project>/scripts/promote-to-prod.sh` — §0.1 manifest-path resolution (framework-first/project-fallback); `auto_seal_active_sessions()` helper (~220 lines of inline python3); Gate 5 success-path call; `fail_with_audit` partial-state call; PASS 2 matcher tightening to exact-equality + basename-only-claim warn.
- `.claude/protocols/session-coordination-protocol.md` — Rule 1 amended; new "Current enforcement (active)" section; Path-format contract codified per Critic PASS 2.
- `<project>/scaffold-source/protocols/session-coordination-protocol.md` — mirror, identical post-edit.
- `.claude/agents/executive-assistant.md` — `active-sessions.md` + `session-coordination-protocol.md` added to Read on Every Invocation; new "Session-Tracking Drift Sweep" section (algorithm + non-actions + surface format + cadence + stack-agnostic note); Briefing format spec updated with conditional `SESSION-TRACKING DRIFT` section.
- `<project>/scaffold-source/agents/executive-assistant.md` — mirror, identical post-edit.
- `.claude/workspace/_global/active-sessions.md` — sealed prior 16-00 (BL-023) + 18-15 (BL-013 Phase 5) entries truthfully (both shipped via merge bf2f08a); registered + sealed this session's entry.
- `.claude/workspace/_global/backlog.json` — appended BL-017 (P2 Tech-Debt cluster, M effort, tier1) + BL-018 (P3 Process hooks, L effort, tier1); `item_counts` recomputed (total 18, P0:0/P1:6/P2:8/P3:4).
- `.claude/workspace/_global/changelog-drafts/_landed/0.7.4.md` — landed draft archive (moved from `2026-05-06T21-00-session-tracking-fix.md`).
- `.claude/workspace/_global/critic-review-session-tracking-fix.md` — NEW; Critic PASS 1 + PASS 2 review.
- `.claude/CHANGELOG.md` — this entry.
- `.claude/memory/agent-changelog.md` — atomic narrative pair per `protocols/changelog-protocol.md` §6.

### Cross-references

- Originating drift incident: merge `bf2f08a` ("Merge dev into main — promote-to-prod (additive, 6 commits)") on `<project>` 2026-05-06T19:49:58 — sealed sessions 16-00 (BL-023) + 18-15 (BL-013 Phase 5) shipped via this merge but were left `in-progress` until user surfaced the gap at 21:00.
- `.claude/workspace/_global/critic-review-session-tracking-fix.md` — Critic adversarial review (PASS 1 LAND-WITH-FOLLOWUPS → PASS 2 GREEN-LAND-NOW).
- `.claude/workspace/_global/backlog.json` BL-017 — P2-cluster hardening (em-dash literal docs, EA guard rewrite, git-log timezone, sanity-line-count threshold, MERGE_SHA defense-in-depth, mktemp portability).
- `.claude/workspace/_global/backlog.json` BL-018 — P3 Claude Code hooks (pre-edit on CHANGELOG/conductor.md + pre-commit atomic-cadence validator + session-close drift-sweep auto-fire) — graduate from Future-enforcement to Current.
- Reference implementation in `<project>/scripts/promote-to-prod.sh` `auto_seal_active_sessions()` helper.
- Prior protocol amendment: [0.7.3] — Rule 1 stale-but-still-claimed conflict-resolution; this release adds the active-mechanism layer beneath that defensive rule.

---

## [0.7.3] — 2026-05-06

### Changed — Session-coordination Rule 1 tightened: stale ≠ abandoned, ASK before auto-take-over

User-binding correction 2026-05-06: *"Make necessary notes so we don't have team members drifting their focus like this and accidentally doing overlapped work."* Triggered by 2026-05-06 incident in which an orchestrator session detected another session's BL-015/16 entry as stale (>1hr since last_updated) and started reading their design-brief in detail to take over implementation. User corrected: *"The other session is already doing BL15 and 16. You should be able to identify that."* The original rule wording — *"proceed but check for left-behind state"* — was insufficient.

**Rule 1 conflict-resolution flow amended.** Previous step 2 ("If sealed or stale — proceed but check for left-behind state") split into:
- Step 2 (sealed): proceed normally — claim is released.
- Step 3 (stale + in-progress): **DO NOT auto-take-over claimed files.** Stale ≠ abandoned. Other session may be drafting offline, designing in another tool, mid-implementation without committing. Read-only investigation is allowed; modifying claimed files requires explicit user authorization. Self-pivot signal added: detailed reading of another session's brief = preparing to take it over = surface to user.
- Step 4 (genuinely concurrent + cannot wait): write decision packet (Rule 3) — unchanged.

**Why this matters.** The prior rule encoded a heuristic ("1 hour stale = probably abandoned") that doesn't survive contact with real workflows. A producer drafting a long document offline doesn't ping last_updated. A session designer thinking in Figma for 2 hours is still active. The cost of asking is one message; the cost of overlapping work is real (wasted producer time, divergent implementations, conflict-resolution overhead, user frustration). The asymmetry favors asking.

**Companion memory note.** New user-memory entry `feedback_session_coordination_dont_drift.md` captures the behavioral rule for orchestrator-style sessions across all future invocations, indexed in `MEMORY.md`.

**Cross-reference v0.7.x context.** This release retroactively records the session-coordination tightening that was needed alongside the v0.7.x series. The dev-to-main-promotion protocol shipped earlier under the v0.7.3 git tag (commit 103b3e3) — its battle-test on BL-013 Phase 3 succeeded; the missing-from-CHANGELOG quirk is a separate housekeeping FYI tracked here for future reconciliation.

### Files changed

- `protocols/session-coordination-protocol.md` — Rule 1 conflict-resolution flow amended (step 2 → split into 2/3/4; new explicit "DO NOT auto-take-over" + "self-pivot signal" + asymmetric-cost framing).
- User-memory: `feedback_session_coordination_dont_drift.md` (NEW) + `MEMORY.md` index updated.

### Provenance

Triggered by 2026-05-06 BL-015/16 overlap incident. Lesson captured atomic with the protocol amendment per `feedback_changelog_proactive.md`.

---

## [0.7.2] — 2026-05-06

### Added — Team Rhythm Protocol + first institutional idle-cadence run (memory hygiene pass)

User-binding directive 2026-05-06: *"build good idle tendencies so agents are consistently learning and growing with their peer agents and the company itself has a structure so robust and token efficient it makes the output desirable."* This release codifies idle-cadence work as an institutional habit and runs the first instance of it.

**The protocol — `protocols/team-rhythm.md` (NEW).** Three principles (read-heavy, write-light, deltas not rewrites; peer-agent learning is the highest-leverage category; scheduled not constant). Five cadences with explicit triggers, owners, outputs, and costs: (1) Per-session-close summary (already in place via `templates/session-close.md`), (2) End-of-day pattern extraction (EA + Critic in parallel + Reconciler), (3) Weekly process-adherence audit (gated until first month of Cadence 2 has run), (4) Monthly Org Designer pass (cross-references `protocols/framework-contract-discipline.md` for separate leakage-audit cadence), (5a) Quarterly archive sweep + (5b) Annual memory-file currency review (supersession-marker convention deferred to first 5b run as ratification deliverable). Anti-patterns enumerated: NOT a license to refactor, NOT speculative, NOT continuous background, NOT a way to bypass review, NOT a substitute for in-line writing. Token-efficiency rules: bounded reading lists, deltas not rewrites, ~15K critic-notes cap (forward-only — existing files grandfathered), parallel dispatches over sequential, Adjacent-files footers in memory files. Three feedback loops claimed (one observed today: pattern extraction → faster future packets; two predicted: cross-axis peer learning → fewer recurring bugs; memory hygiene → smaller dispatches).

**Cadence 2 — Reconciler role.** Defined explicitly to close the autonomous-mode failure mode. Reconciler is NEVER the same agent as one of the parallel synthesis agents. Fallback chain (first match wins): user's active main session → Conductor → Org Designer → defer with backlog entry + next-briefing surface. Today's first run used fallback step 1.

**The first run — pattern extraction + memory hygiene pass (this session).** EA produced `workspace/_global/patterns-2026-05-06.md` (~1,389 words, 6 sections, citation-dense). Critic produced `workspace/_global/memory-gap-audit-2026-05-06.md` (~590 words, 4 P0 / 5 P1 / 3 P2; surgical delta proposals; structural memory-design observations). Reconciler (this session) applied surgical deltas:

- `memory/lessons-learned.md` — was empty placeholder; now has 6-entry 2026-05-06 cohort: force-issue TLS when nameservers stay third-party (v0.4.5 source); platform env-var removal scope-bleeds (v0.4.5); dev-vs-main drift is silent under current protocols (v0.4.6); Tier B → Tier C elevation when scope crosses milestones (v0.4.6); `_planned` agent promotions are merges not overwrites (v0.5.0); verification-before-completion applies to protocol-written claims about siblings (Critic-review-webhook-handler-ownership P1-1).
- `memory/security-patterns.md` (NEW) — Ops/Security's Tier 1 axis file (peer to QE's `runtime-gotchas.md`). Seeded with stack-agnostic webhook-handler security baseline: HMAC-over-raw-bytes, X-event-id replay rejection at DB layer, atomic cleanup-on-revoke, cross-tenant guard. Sourced from BL-013 §5.1-5.3, generalized off GitHub specifics.
- `memory/patterns.md` — 3 new entries: "Parallel-session-aware decision-packet drafting" (P0-4, third recurrence threshold met); "Adjacent-overlap audit during cross-plan packet authoring" (P1-2, from webhook-ownership §6); "Session-coordination protocol Rule 1 validates bidirectionally — first proven 2026-05-06" (P1-4, FYI codifying that the protocol does what it says).
- `memory/runtime-gotchas.md` — 1 new entry (P1-1): "Fixed absolute offset for variable-width content sibling causes intermittent overlap" — the runtime-axis class for the BL-015 ProjectCard z-index bug. Cross-axis peer to `memory/ui-anti-patterns.md`.
- `memory/incidents.md` — 1 new entry (P1-5): "Owner-only beta GitHub-App posture would have shipped to production without an explicit security baseline (near-miss)" — pattern candidate Y for "multi-tenant readiness audit must precede every dev → prod promotion that introduces an external auth surface."
- `memory/ui-anti-patterns.md` — added bidirectional cross-axis peer note pointing to the new runtime-gotchas entry.
- **Adjacent-files footers** added to all 6 memory files (structural memory-design issue #2 from gap audit) — single-line per file pointing to peer-axis siblings, making cross-axis peer learning discoverable from inside any one file.

**Critic adversarial review of `team-rhythm.md` itself.** PASS 1 found 3 P0 / 6 P1 / 5 P2; recommendation REVISE BEFORE LAND. PASS 2 fixed all 3 P0s + P1-5: (P0-1) Cadence 1 ↔ Cadence 2 trigger overlap disambiguated; (P0-2) Reconciler role + 4-step fallback chain added; (P0-3) Cadence 5 split into 5a (archive sweep, with source-of-truth citations + grandfather clause for 22K + 14K critic-notes files) + 5b (annual memory-file currency review with supersession-marker convention as first-run ratification deliverable); (P1-5) `framework-contract-discipline.md` cross-reference added in Cadence 4. Remaining P1/P2 deferred as next-pass amendments — surface in EA briefing.

**Memory-design structural observations from gap audit (deferred to Org Designer):** (1) Empty-file deferral smell — every `_planned` agent activation should auto-seed at least one memory entry; (2) Naming convention drift across 7 memory files (5 different shapes) — Org Designer ratify a single `<axis>-<artifact-type>.md` shape; (3) Cross-reference index — addressed by Adjacent-files footers in this release.

**Coordination signals.** First adversarial test of `protocols/session-coordination-protocol.md` Rule 1 — protocol worked bidirectionally. Two concurrent sessions (`2026-05-06T12-49-webhook-ownership-decision` and `2026-05-06T16-47-bl013-and-leakage-audit`) shared overlapping files; both detected each other in `active-sessions.md`; both wrote `coordination_note` fields acknowledging the dance; the file-modified-since-read race-detection caught two concurrent active-sessions.md edits; the parallel session staged a cross-lane edit to `protocols/session-coordination-protocol.md` but did NOT apply it, deliberately respecting this session's lane lock. The 16-47 session also closed BL-014 (Org Designer ratification of QE memory files) which independently resolved gap-audit P0-3.

### Files changed

- `protocols/team-rhythm.md` — **NEW** (~5KB → ~7KB after PASS 2; 5 cadences, 3 principles, 6 token-efficiency rules)
- `workspace/_global/patterns-2026-05-06.md` — **NEW** (EA day-end synthesis)
- `workspace/_global/memory-gap-audit-2026-05-06.md` — **NEW** (Critic gap audit)
- `workspace/_global/critic-review-team-rhythm.md` — **NEW** (Critic adversarial review of team-rhythm.md PASS 1)
- `memory/lessons-learned.md` — was empty placeholder → 6-entry 2026-05-06 cohort + Adjacent-files footer
- `memory/security-patterns.md` — **NEW** (Ops/Security Tier 1 axis file with seed entry + Adjacent-files footer)
- `memory/patterns.md` — placeholder removed; +3 entries; + Adjacent-files footer
- `memory/runtime-gotchas.md` — +1 entry; + Adjacent-files footer
- `memory/incidents.md` — +1 entry; + Adjacent-files footer
- `memory/ui-anti-patterns.md` — + cross-axis peer note + Adjacent-files footer

### Cross-references

- User-binding directive: this conversation 2026-05-06
- First-run companion artifacts: `workspace/_global/patterns-2026-05-06.md` + `workspace/_global/memory-gap-audit-2026-05-06.md`
- Adversarial review: `workspace/_global/critic-review-team-rhythm.md`
- Adjacent protocol (separate cadence, separate codification): `protocols/framework-contract-discipline.md`
- Coordination test evidence: `active-sessions.md` 2026-05-06 entries (sessions 12-49 and 16-47)

## [0.7.1] — 2026-05-06

### Added — Decision Packet: Webhook Handler Ownership (v1.5 Task 7 ↔ BL-013 Phase 3.5)

Cross-plan coordination artifact resolving the implicit overlap between two approved execution plans, both of which touch `POST /api/webhooks/github`. The v1.5 plan's Task 7 inline note ("deduplicate vs BL-013 step 5, do not duplicate plumbing") was correct in spirit but ambiguous in arbitration; this packet makes the seam explicit, names the arbitration rule, and hardens the sequencing.

**Resolution.** **BL-013 Phase 3 §5.1-5.3 owns the schema migration** (`installations` + `webhook_events` tables, generated as the next free `drizzle/*.sql` slot at landing time). **v1.5 Task 7 owns the handler implementation** (route + signature verifier + per-event handlers); Task 7 does NOT generate SQL DDL — its handler code reads/writes the schema BL-013 created. **Behavioral contracts come from BL-013 §5.1-5.3** (HMAC-over-RAW-bytes, X-GitHub-Delivery replay-rejection, installation.deleted atomic-transaction shape, cross-app guard); Task 7 consumes these as design spec. **BL-013 Phase 3.5 owns the security audit lens** — Ops/Security's first real dispatch — running against landed Task 7 code with P0 findings blocking BL-013 Phase 4.

**Sequencing (load-bearing).** `BL-013 Phase 3 (schema migration) → v1.5 Task 7 (handler implementation) → BL-013 Phase 3.5 (Ops/Security mini-audit) → BL-013 Phase 4`. You cannot audit what does not exist, and Task 7's handler code cannot be implemented against a schema that has not been migrated. BL-013 Phase 1+2 (prod App registration + Vercel env-var rotation) remain independent of Task 7 and were executed in parallel session 2026-05-06T16-47-bl013-and-leakage-audit.

**Adjacent overlaps named (no separate packet).** `GITHUB_APP_WEBHOOK_SECRET` is touched by both plans (v1.5 Task 8 code-side, BL-013 Phase 2 platform-side) — complementary, not conflicting. `bug_reports` and `webhook_events` both fire on signature failure — different sinks (existing error trail vs new audit log), Tier 2 wires both. Migration-slot collision flagged for Tier 2 implementer to handle at landing time.

**Process notes.** First adversarial test of the `protocols/session-coordination-protocol.md` (v0.6.0). Conflict-resolution flow (Rule 1) was triggered when active-sessions.md showed the BL-013 packet, CHANGELOG.md, and agent-changelog.md held by a concurrent session — this session paused edits on those files and proceeded only with parallel-safe work (new packet draft, v1.5 plan cross-reference, this CHANGELOG draft). Cross-reference application split: §5.1 (v1.5 plan) applied at packet landing; §5.2 (BL-013 packet) applied after the concurrent session sealed at 2026-05-06T18:10. Both cross-references now in place. Critic adversarial review surfaced 4 P1 findings; Architect PASS 2 addressed two before-commit items (changelog-draft accuracy + schema-ownership clarification + sequencing diagram correction); three post-commit follow-ups deferred (Phase 3.5 P0 arbitration paragraph, Phase 0 status check, migration-slot one-liner promotion).

**Authority.** Load-bearing for Ops/Security's BL-013 Phase 3.5 dispatch. Supersedes the inline "deduplicate vs BL-013 step 5" note in v1.5 Task 7. Does NOT re-open either plan's content — both remain approved and execution-ready; only the seam is named.

### Files changed

- `workspace/<project>/decision-packet-webhook-handler-ownership.md` — **NEW** (decision packet, 125 lines)
- `workspace/<project>/critic-review-webhook-handler-ownership.md` — **NEW** (Critic adversarial review)
- `workspace/<project>/decision-packet-bl013-multiuser-security.md` — §5.3 footnote cross-reference added (per packet §5.2)
- `<project>/.claude/docs/v1.5-execution-plan.md` — Task 7 Accept clause cross-reference applied (per packet §5.1)
- `workspace/_global/active-sessions.md` — session 2026-05-06T12-49-webhook-ownership-decision registered, sealed at landing

### Cross-references

- `protocols/session-coordination-protocol.md` — first adversarial test of Rule 1 (conflict-resolution) and Rule 3 (decision packets as cross-plan authority)
- `workspace/<project>/decision-packet-bl013-multiuser-security.md` — paired plan; cross-reference applied 2026-05-06T18:10+ after session 16-47 sealed
- `<project>/.claude/docs/v1.5-execution-plan.md` — paired plan; cross-reference applied at packet landing

## [0.7.0] — 2026-05-06

### Changed — Project-leakage audit cleanup: BLOCKING entries migrated, activation contexts sanitized, framework-contract-discipline protocol shipped

**Org Designer leakage audit cleanup (Round 1 + Round 2 dispatch).** Closes the Round-1 BLEED-BLOCKING and BLEED-WARNING findings + the Round-2 Critic-flagged blockers (C1 / C2 / C4) + EA flags. Founding audit at `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` (now amended with §8 "Round 2 Amendments"). User approved continuation 2026-05-06T17:05: *"Yes, continue with the changes."* Critic Round-2 verdict: GREEN — all 7 cross-lane edits APPROVED-AS-IS, migrations + sanitizations + protocols all approved.

**Headline.** Convention is right; discipline lapsed. Migrated 3 BLEED-BLOCKING `CHANGELOG.md` entries (v0.4.5 / v0.4.6 / v0.5.0) by replacing project-attributable bodies with framework-portable lesson summaries + breadcrumb pointers to the migrated full narratives. Sanitized 3 activation-context surfaces (active `agents/ops-security.md`, post-promotion `agents/_planned/ops-security.md`, UI/UX Reviewer activation entry in `memory/agent-changelog.md`) per the new Activation Context discipline. Codified 4 amendments (A1 audit-routing, A2 migration policy, A3 + A4 + A5 framework-contract-discipline, A6 cadence). Applied 7 cross-lane edits (architect + critic + QE + UI/UX Reviewer + Ops/Security + session-coordination-protocol) post Critic GREEN verdict.

**A1 — `protocols/autonomous-ops-permissions.md §6.1` audit-routing amended.** New §6.1.1 "Audit-routing destination" codifies that Tier B / C audit entries route by scope: project-scoped actions append to `<project>/.claude/memory/agent-changelog.md`; framework-scoped actions append to `.claude/memory/agent-changelog.md`; cross-cutting actions append both atomically per `changelog-protocol.md §3`.

**A2 — `protocols/changelog-protocol.md §7` Migration Note amended.** New §7.1 (retroactive migration of pre-protocol BLEED-BLOCKING entries), §7.2 (migration breadcrumb format), §7.3 (cross-reference preservation policy). Closes Critic C4 — cross-reference integrity preserved through the migration without cascading edits.

**A3 + A4 + A5 + A6 — `protocols/framework-contract-discipline.md` shipped (NEW).** Codifies four discipline rules: §1 Activation Context discipline (category-level + footnote pattern); §2 Provenance-citation discipline (date-pointers); §3 Stack-specific examples are illustrative, not binding (single-sentence portability framing); §4 Project-leakage audit cadence (monthly during single-project-phase; relaxes to quarterly on observable triggers).

**Round 1 BLOCKING migrations (F1 + F2 + F3) executed.** Three entries' framework-public residue retained (the lessons that generalize: force-issue-TLS-when-third-party-NS, Tier-B-becomes-Tier-C-on-M-milestone-scope, QE-merge-not-overwrite-doctrine); full project narratives migrated to a new `<project>/.claude/CHANGELOG.md` (created as the migration destination per EA flag #1) under three "Migrated 2026-05-06" entries.

**Activation-context sanitization (F5 + F12 + F12.1) executed.** Active Ops/Security contract's `## Activation Context` rewritten to category-level triggers + the F18-shape footnote pointing at `memory/agent-changelog-private.md` for project-attributable evidence. Post-promotion `_planned/ops-security.md` historical-record stub received identical surgery. UI/UX Reviewer activation entry in `memory/agent-changelog.md` now references project-attributable evidence by pointer.

**Cross-lane edits applied (7 total, post Critic GREEN verdict).** Surgical patches applied to `agents/architect.md` (L106 + L111 — F10), `agents/critic.md` (L135–L136 — F11), `agents/quality-engineer.md` (L91–L100 — F18 + L181 — F13), `agents/ui-ux-reviewer.md` (L87 + L154 — F16), `agents/ops-security.md` (L75 — F17), `protocols/session-coordination-protocol.md` (L18 + L42 — F22). Each patch preserves load-bearing technical specificity inside the contract; project-attributable specifics demoted to italicized footnotes per `framework-contract-discipline.md §1`.

**Round 2 audit amendments + Critic findings closed.** F22 (session-coordination-protocol stack-example bleed) opened and closed. F12.1 (`_planned/ops-security.md` post-promotion bleed) opened and closed. F23–F29 spot-audit of the 7 unactivated `_planned/` stubs returned 7 clean / 1 already-surgeried / 1 acceptable-by-archival-purpose. F30 spot-audit of the 5 Tier-1 backlog entries' source-attribution returned 5 lessons-generalize / 0 mis-tiered. C5 cadence reconciliation landed in `framework-contract-discipline.md §4`. C6 F12 symmetry with F18 landed. C7/C8/C9 acknowledged or closed.

### Cross-references

- Audit log: `workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md`
- Cross-lane edit archive: `workspace/_global/org-designer-proposals/20260506T1705-cross-lane-edits-staged.md`
- A2 in: `protocols/changelog-protocol.md §7.1–§7.3`
- A1 in: `protocols/autonomous-ops-permissions.md §6.1.1`
- A3–A6 in: `protocols/framework-contract-discipline.md`
- Migration destination: `<project>/.claude/CHANGELOG.md`
- Industry-portability binding: user memory `project_team_industry_portability.md`
- Session coordination: `protocols/session-coordination-protocol.md`

---

## [0.6.0] — 2026-05-06

### Added — Session Coordination Protocol: cross-session consistency for parallel Claude sessions

User-binding directive 2026-05-06: *"I can't have cross session drifts and consistency is key. The whole team is connected and needs to act that way ALL the time."* Codifies how multiple parallel Claude sessions stay consistent when editing shared workspace state. Complements (does not duplicate) `protocols/changelog-protocol.md` (scope split between framework and project changelogs), `protocols/conflict-resolution.md` (within-project artifact conflicts), and `protocols/consistency-check.md` (automated diff at state-machine transitions). Uniquely owns: inter-session coordination across concurrent sessions.

Real friction observed prior to codification: CHANGELOG entries [0.4.7] → [0.5.0] → [0.5.1] → [0.5.2] landed within hours from four independent sessions, mutual unawareness; agent-changelog files race-edited during in-flight work; v1.5 plan and BL-013 decision packet both spec the webhook handler at `POST /api/webhooks/github`.

**Six rules.** (1) **Session manifest** at `.claude/workspace/_global/active-sessions.md` — every cross-cutting session declares scope, files-in-flight, status before editing. (2) **CHANGELOG drafts** at `.claude/workspace/_global/changelog-drafts/` — version stamped at landing, not edit time, eliminating version-claim races. (3) **Decision packets** as single authority for cross-plan conflicts; both plans cross-reference, never edit-both-concurrently. (4) **Lane ownership** — each agent owns specific files (Designer→design-spec, QE→test-plan/smoke-report, Conductor→state.json, etc.); cross-lane edits dispatch the owner. (5) **EA briefing** opens every non-trivial cross-cutting session — cross-session standup. (6) **Atomic git commits** per landed unit, no accumulated work across sessions.

**Scope.** MUST follow when editing: `.claude/CHANGELOG.md`, `memory/agent-changelog.md`, agent contracts, protocols, templates, conductor.md, cross-cutting plans, decision packets, files referenced by ≥2 agents' read-on-invocation lists. MAY skip for: scoped per-project work, read-only operations.

**Conflict resolution flow.** When `active-sessions.md` shows another session editing the file you want: pause if `in-progress` and `last_updated` < 30min ago; proceed-with-caution if sealed or stale (>1h); write decision packet if genuinely concurrent and cannot wait.

**Future enforcement.** Hooks in `.claude/settings.json` (per `update-config` skill): pre-edit hook on CHANGELOG.md checking active-sessions; pre-edit hook on conductor.md requiring manifest entry; pre-commit hook validating atomic-cadence rule. Out of scope for initial protocol; backlog item.

**First session under the new protocol** is the protocol's own authorship: session-id `2026-05-06T15-30-session-coord-protocol` registered in active-sessions.md, CHANGELOG entry drafted in `changelog-drafts/`, landed atomically with the narrative entry, then sealed.

### Files changed

- `protocols/session-coordination-protocol.md` — **NEW** (load-bearing protocol document)
- `workspace/_global/active-sessions.md` — **NEW** (session manifest registry, seeded)
- `workspace/_global/changelog-drafts/README.md` — **NEW** (drafts directory protocol)
- `workspace/_global/changelog-drafts/_landed/0.6.0.md` — **NEW** (this entry archived)
- `CHANGELOG.md` — this entry stamped at landing
- `memory/agent-changelog.md` — narrative entry (atomic with this CHANGELOG entry)
- User auto-memory: `feedback_session_coordination.md` + `MEMORY.md` pointer (binding for orchestrator sessions)

### Cross-references

- User directive: 2026-05-06 — *"I can't have cross session drifts..."*
- Atomic-cadence rule: `~/.claude/projects/<project>/memory/feedback_changelog_proactive.md`
- Complements: `protocols/changelog-protocol.md`, `protocols/conflict-resolution.md`, `protocols/consistency-check.md`, `protocols/ea-protocol.md`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — Session Coordination Protocol shipped

## [0.5.3] — 2026-05-06

### Fixed — UI/UX Reviewer P1 quality-of-symmetry fixes (refinement pass #3, final)

Final refinement pass on UI/UX Reviewer activation, landing the seven P1 quality-of-symmetry warnings from Critic's adversarial review (`workspace/_global/critic-notes-ui-ux-reviewer-activation.md`, dated 2026-05-06). The three P0s landed in v0.5.2; this pass closes the structural-symmetry items so the contract reaches peer-agent shape parity with Ops/Security and QE. **No structural team change** — last touch on the contract that activated in v0.4.7, refined through Option C in v0.5.1, hardened on P0s in v0.5.2, and reaches steady-state shape here.

**P1-A merged with P1-G — Activation Context section + originating-proposal/user-quote citation.** Mirrors `agents/ops-security.md:229-247` precedent. New `## Activation Context` section preserves the user's verbatim `/grow-team` ask (*"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create and implement the most modern stack/design theming ... seeing layout and changes that are logical without needing user screenshots or inputs."*) inside the contract itself — so future invocations reading only the contract retain the role's "what good looks like" intent. Maps the four phrases in the ask onto the four operating principles. Names the four-axis review tier this completes (Critic plan / QE runtime functional / Ops/Security runtime adversarial / UI/UX Reviewer runtime visual+IA). Links originating proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`. Activation date 2026-05-06. Slash command `/design-review` per `commands/quality-engineer.md` precedent.

**P1-B — Memory File Authority table.** Mirrors `agents/ops-security.md:211-228` table-form precedent. New `## Memory File Authority` section codifies per-file read/write semantics across 12 files spanning `memory/ui-references.md` / `memory/ui-patterns.md` / `memory/ui-anti-patterns.md` (UI/UX Reviewer append-only with provenance), peer-owned files (`memory/lessons-learned.md` / `memory/incidents.md` / `memory/runtime-gotchas.md` — read-only), per-project artifacts (`workspace/<slug>/design-review.md` owner + append-only across passes; `workspace/<slug>/backlog.md` append-only for P1 visual findings), and Playwright config files (`tests/visual/playwright.visual.config.ts` and `tests/visual/*.spec.ts` — owner; `playwright.config.ts` — read-only, QE's exclusive territory). **Designer is granted append authority on `memory/ui-references.md`** with provenance-required (project + date + role-of-author). Rationale: both roles benefit from canon currency, and dual-authoring with provenance prevents stale-canon while preserving audit trail. Neither role edits prior entries.

**P1-C — Reconcile L74 framing language to project-type-agnostic.** L74 is already project-type-agnostic post-Option-C (lists "first dashboard project, first marketing site, first dev-tool console" as parallel examples, none baked). Verified the founding-project exception language at L85 also doesn't bake project-type assumption — uses "any project without design-spec.md" with <project> as one example. No edit needed; verification documented here for audit trail. The "team's only shipped project type" phrasing the v0.5.2 critic notes flagged was already removed by Option C in v0.5.1.

**P1-D — Founding-project exception sunset criteria.** Single-line addition to the founding-project exception at L85. Prior text said "This exception applies once per project. After first pass, the design-spec must own the list" — implicit but not codified. Now explicit: *"Sunset criteria: the exception lapses on the next pass once `design-spec.md` exists with a §7 default-coverage block — Reviewer reads the block from spec on that pass, no further exploratory routing."* Closes the bounded-criteria gap Critic flagged at note ⚠ "Founding-project exception clause not yet defined for the contract."

**P1-E — Failure Modes for runtime-infrastructure failures.** New four-class failure-mode block addressing what happens when the review can't proceed. (a) **Deployed URL unreachable / 502 / connection refused** — abort, write `§What couldn't be reviewed`, signal Conductor `blocked` (NOT a P0 visual finding — infrastructure block). (b) **Playwright browser crash / navigation timeout** — retry once with extended 30→90s timeout; on second failure, log to `§What couldn't be reviewed`, do NOT proceed to checklist on missing screenshots (hollow review > blocked review). (c) **Redirect loop** — classify as routing bug; route via `WRONG_AGENT: → Quality Engineer`, no P0 against the surface that never rendered. (d) **Auth-bypass not set** — detection: >50% of default-coverage routes resolving to same auth path. Cross-references QE's `TEST_AUTH_BYPASS` pattern at `agents/quality-engineer.md:90-100` (Auth-Protected Test Gap section). Required env: `TEST_AUTH_BYPASS=1` plus `TEST_AUTH_USERNAME` (default `<operator>`), guarded by `NODE_ENV !== 'production'`. If unset, abort and signal Conductor `blocked` rather than file findings against the auth page. Closes Critic's note ⚠ "Failure mode missing: dev server not running when /design-review fires."

**P1-F — Future-Growth Lens section.** Mirrors `agents/quality-engineer.md:166-174` precedent. New `## Future-Growth Lens` section documents fragmentation triggers at 5x team size or 10 shipped projects across multiple project types: likely split into Visual Reviewer / IA Strategist / Pattern Researcher (the three sub-roles the originating proposal §"Risk this proposal is wrong" already named); sub-role spawns for Accessibility Tester / Mobile-First Reviewer / Brand-System Auditor; Tier 2 mirror pattern (per-project Visual Reviewer, HQ Reviewer becomes cross-project pattern keeper); memory-artifact compounding (`ui-patterns.md` / `ui-anti-patterns.md` become load-bearing); merge-with-Designer assessment (unlikely — author/judge separation is load-bearing); industry-portability binding per `project_team_industry_portability.md`.

### Files changed

- `agents/ui-ux-reviewer.md` — Founding-project exception sunset criteria added (L85); Failure Modes runtime-infrastructure four-class block added after "Mis-routes findings as bugs" (L150-154); new `## Memory File Authority` section between Wrong-Agent Returns and Format (L181-198); new `## Activation Context` section after Memory File Authority (L200-218); new `## Future-Growth Lens` section after Activation Context (L220-227). Net file size: 179 → 235 lines (+56, well under the 300 ceiling, within the +50-80 target).
- `CHANGELOG.md` — this entry stamped at landing.
- `memory/agent-changelog.md` — narrative entry (atomic with this CHANGELOG entry).

### Critic re-review status

No critic re-review will follow — user direction at session wrap. P1 fixes are surgical, structural-symmetry items mapped cleanly to peer-agent precedents (Ops/Security L211-228 / L229-247; QE L166-174); no novel doctrine introduced; no behavioral change to the Algorithm beyond explicit failure-mode handling (which strictly tightens, never loosens, the contract). Counterpart-agent shape parity reached: UI/UX Reviewer now matches Ops/Security and QE on Activation Context, Memory File Authority, and Future-Growth Lens sections. Steady-state contract.

### Cross-references

- Critic notes (P1 source): `workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`
- Prior P0 fixes: CHANGELOG v0.5.2 (this date)
- Industry-portability binding: user memory `project_team_industry_portability.md`
- Peer-agent precedents: `agents/ops-security.md:211-247`, `agents/quality-engineer.md:90-100,166-174`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer P1 quality-of-symmetry fixes

## [0.5.2] — 2026-05-06

### Fixed — UI/UX Reviewer P0 fixes from critic adversarial review (refinement pass #2)

Surgical pass against the three blocking concerns surfaced by Critic in `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md` (review dated 2026-05-06, post-v0.5.1 baseline). User approved fixing the P0s; the 7 P1 quality-of-symmetry warnings and 2 P2 observations are deferred to a follow-up pass. **No structural team change** — this hardens the contract that activated in v0.4.7 and refined in v0.5.1.

**P0-1 — Designer-seam protection invariant.** Critic flagged that Operating Principle 3, as written, contained a load-bearing escape hatch: when implementation drifts AND modern competitors agree with the implementation (the spec might be the wrong call), the contract could be read as licensing `WRONG_AGENT: → Designer` revision-only routing instead of routing the finding as an implementation-side fix. That collapses the author/judge separation that justified the role split — the very risk the original org-designer proposal §"Cost / risk" identified as the largest seam risk. Fix: Operating Principle 3 now opens with a single-line invariant — *"Reviewer files findings against implementation. Spec edits are Designer's exclusive territory. The two are independent: a finding can be filed AND a spec-revision recommended in the same pass; they do not block each other."* — followed by a worked example covering the 32px button case (spec says 40, impl renders 32, references show 32). The example states the resolution algorithm explicitly: file the impl-side finding (P0/P1 per visible impact), AND optionally file a separate `WRONG_AGENT: → Designer` handoff tagged `spec-revision-candidate` with rationale; the two are decoupled. The Wrong-Agent Returns table gains two new rows distinguishing the spec-internally-contradictory case (revision-only) from the references-have-moved case (additive, parallel impl finding still files). Algorithm step 4 (market calibration) updated to reference the doctrine rather than imply a substitutive route.

**P0-2 — Anti-sycophancy fallback strengthened to peer-agent parity.** Critic flagged that the prior single-pass trigger (`if P0=0 AND P1=0`) could be tripped by five P2 polish items with zero P0/P1 — calibrated-permissive drift would satisfy the count-based trigger logically while bypassing the spirit. Plus the cross-run anti-sycophancy mechanism (the 5-consecutive-clean-runs trigger that QE and Ops/Security have at the *Algorithm* level) lived only in Failure Modes, not Algorithm — wrong location for enforcement. Fix: Operating Principle 4 now codifies three triggers — (a) single-pass substantive (a P2-heavy pass with ≥3 P2 and zero P0/P1 does NOT exempt the second-pass requirement), (b) cross-run (5+ consecutive zero-P0 reviews force the second pass regardless of P1 count, threshold tunable by Org Designer), (c) severity calibration check (every pass, ask "would the user disagree with this severity? If yes-or-uncertain, escalate one tier" — re-rate before sign-off). Algorithm step 7 enumerates the three checks in order; Failure Modes "Rubber-stamp risk" updated to reference Algorithm enforcement rather than duplicate the rule.

**P0-3 — Playwright config separation Authority↔Failure-Mode contradiction resolved (Option A — separate config file).** Critic flagged a direct contradiction: the Authority table forbade editing `playwright.config.ts` (QE's exclusive territory), while Failure Modes mitigation said Reviewer "adds a `projects: []` entry only if needed" — which is a config edit. The first activation pass had already worked around the contradiction organically by creating `<project>/tests/visual/playwright.visual.config.ts` and running with `--config`. Fix: codify the organic pattern as Option A. Algorithm step 4 now mandates the separate-config-file pattern — Reviewer creates and owns `tests/visual/playwright.visual.config.ts` (own testDir, viewport projects for the 375/768/1024/1440 sweep, own reporters, headed-mode toggles) and runs `npx playwright test --config=tests/visual/playwright.visual.config.ts` (or via an `npm run test:visual` script). Authority table replaces the "Extend `playwright.config.ts`" cannot-row with two rows: a "Run Playwright runner via own config" can-row and an explicit "Edit `playwright.config.ts`" cannot-row. Failure Modes "Tooling drift with QE" updated to point at Algorithm step 4 — neither file imports nor extends the other; no shared `projects: []` array between them.

### Files changed

- `agents/ui-ux-reviewer.md` — Operating Principle 3 expanded with invariant + worked example (L35-42); Operating Principle 4 expanded with three-trigger anti-sycophancy doctrine (L43-45); Algorithm step 4 (market calibration) updated to reference Operating Principle 3 doctrine (L76); Algorithm step 4 (Playwright runner) replaced with separate-config doctrine (L87-95); Algorithm step 7 (anti-sycophancy fallback) replaced with three-check enumeration (L104-109); Authority table reworked for Playwright config separation (L137-138); Failure Modes "Rubber-stamp risk" + "Tooling drift with QE" updated (L145, L148); Wrong-Agent Returns gains two new rows for the spec-revision routing cases (L162-163). Net file size: 154 → 179 lines (+25, well under 300 ceiling, exactly at the 180 target upper bound).

### Critic re-review status

P0 fixes ratified for self-validation per the contract; recommend batching critic re-review with the P1 pass to amortize one cycle vs. two. Three P0s landed; 7 P1 quality-of-symmetry items + 2 P2 observations open for a future refinement pass. No P0 leakage from the fixes themselves.

### Cross-references

- Critic notes: `.claude/workspace/_global/critic-notes-ui-ux-reviewer-activation.md`
- Prior activation + refinement: this CHANGELOG v0.4.7, v0.5.1; `memory/agent-changelog.md` 2026-05-06 (both prior entries).
- Originating proposal: `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md` §"Cost / risk".
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer P0 fixes.

## [0.5.1] — 2026-05-06

### Changed — UI/UX Reviewer refinements: default-coverage portability, reference canon balance, changelog scope protocol, industry-portability vision codified

Surgical post-activation refinements to the UI/UX Reviewer team integration, driven by user clarifications on the four open items from the activation pass and a binding strategic note on industry portability.

**Industry-portability vision codified.** User memory note `~/.claude/projects/<project>/memory/project_team_industry_portability.md` (2026-05-06) makes the team structure cross-industry by design — the App Development agent team should generalize to marketing, media, curation, and other industries. Defaults that name a stack must be parameterized by project type or pushed upstream into the project's spec, not hardcoded into framework-level agents. **Binding for all future org decisions.**

**Default-coverage portability (Option C — push upstream into Designer).** The dashboard-specific screenshot list previously hardcoded in `agents/ui-ux-reviewer.md` Algorithm step 2 has been removed. Designer now owns a per-project `default-coverage` block in `design-spec.md` §7 (new section, between Accessibility §6 and Open Questions, which renumbered to §8). The block enumerates routes, breakpoints, states, and auth-state setup notes — all sourced from the PRD's user stories. UI/UX Reviewer reads the block on every pre-ship pass; if absent, returns `WRONG_AGENT: → Designer`. A founding-project exception applies once per project for cases where no design-spec.md exists yet (e.g., <project> at activation time): Reviewer may run a one-time exploratory pass and output a "Recommended default-coverage block" section that Designer lifts into the spec.

**Reference canon balance.** `memory/ui-references.md` removes Anthropic Console (Tier-B entry 7) to avoid self-referential bias risk for an Anthropic-built agent team. Tier-A canon (Vercel, Linear, Stripe Dashboard, Railway) plus Tier-B (GitHub Projects, Notion) is sufficient. Removal rationale documented in a new "Considered but not seeded" section so a future addition is informed. Quarterly canon review will reconsider.

**Changelog scope protocol codified.** New `protocols/changelog-protocol.md` fixes the scope split between framework `.claude/memory/agent-changelog.md` (team-shape changes that span projects) and project `<project>/.claude/memory/agent-changelog.md` (project-scoped agent activity). Both files are updated atomically when a team-shape change has project-specific consequences. The atomic-cadence rule from user memory (`feedback_changelog_proactive.md`) is operationalized as: same turn / commit / PR — not deferred sweep. One-line pointers added to both `agent-changelog.md` files referencing the new protocol.

### Files changed

- `agents/designer.md` — Algorithm step 7 added (Define default-coverage block); design-spec output structure §7 added (renumbered §7→§8); Authority gains "Define default-coverage block" bullet.
- `agents/ui-ux-reviewer.md` — Algorithm step 2 replaced (read design-spec block; WRONG_AGENT if absent) + step 3 added (run pass per block) + founding-project exception paragraph + steps 4–9 renumbered; Wrong-Agent Returns table gains "missing default-coverage block → Designer" row. Net: 160 → 154 lines (-6, well under 300 ceiling).
- `templates/design-spec.md` — §7 (Default-Coverage) added with route table + breakpoints + states + auth-setup notes; §7→§8 renumber.
- `memory/ui-references.md` — Anthropic Console entry removed; "Considered but not seeded" section added with deferral rationale; top-of-file revision note updated.
- `protocols/changelog-protocol.md` — **NEW.** Scope split codified, atomic-cadence rule operationalized.
- `memory/agent-changelog.md` (this directory) — pointer added to changelog-protocol.md; narrative entry above v0.4.7.
- `<project>/.claude/memory/agent-changelog.md` — pointer added to changelog-protocol.md.

### Cross-references

- User memory note: `~/.claude/projects/<project>/memory/project_team_industry_portability.md`
- Atomic-cadence rule: `~/.claude/projects/<project>/memory/feedback_changelog_proactive.md`
- Prior activation: this CHANGELOG v0.4.7; `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer activated.
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — UI/UX Reviewer refinements.

## [0.5.0] — 2026-05-06

### Added — QE prompt merge: planned-stub institutional memory absorbed into active (framework-scoped Phase 0.1)

**0.1 — QE prompt merge** (`agents/quality-engineer.md`). Per org-designer proposal at `agents/_planned/_proposals/qe-promotion-2026-05-06.md`: a **merge, not a wholesale overwrite**. The active 12K file was ahead on the test-bypass auth pattern, refined `trigger_conditions` frontmatter (`fires_when` / `does_not_fire_when` / `parallel_with`), and the full "Read on Every Invocation" list — overwriting would have lost these production gains. The 17K planned stub contributed additive institutional-memory sections only. Merge adds four sections to active: `## Tier Clarification` (HQ vs Tier 2 QE coexistence), `## Future-Growth Lens` (fragmentation triggers + sub-role spawn thresholds + Critic-merge assessment), `## Cross-References` (links to source proposal, seed incident, counterpart roles), and a 2-sentence state-machine 2-step gate narrative in `## Algorithm` intro. Superseded stub renamed `_planned/quality-engineer-superseded-2026-05-06.md` (retained indefinitely as user-confirmed historical reference). **Lesson worth keeping (framework-portable):** promotions of `_planned` agents to active are merges by default, not overwrites. When `_planned` was authored before activation, the live version may have evolved past it; assume neither file is a superset until you've diffed them.

**Phase 0 prerequisite trigger:** managed-surface auto-push positioning under TapAgents v1.5 requires vendor-owned regression discipline at every release gate. Phase 0.2 (dashboard-side agent-changelog initialization) and Phase 0.3 (GitHub App webhook configuration docs) are project-scoped artifacts; their narrative was migrated per leakage audit.

> Phase 0.2 + 0.3 (project-scoped artifacts) full narrative: see `<project>/.claude/CHANGELOG.md` — 2026-05-06 entry on TapAgents v1.5 Phase 0 dashboard-side artifacts. Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F3).

### Cross-references
- Promotion proposal: `agents/_planned/_proposals/qe-promotion-2026-05-06.md`
- Narrative entry: `memory/agent-changelog.md` 2026-05-06 — QE prompt merge

## [0.4.7] — 2026-05-06

### Added — UI/UX Reviewer agent activated (live, fourth review-tier axis)

Live activation of UI/UX Reviewer per Org Designer proposal `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`. User-approved with verbatim text *"Yes. I approve this. The additional agent will really help in overall app development processes and especially user functionality."* This is a **new role**, not a stub promotion — the team had no `_planned/ui-ux-reviewer.md` stub. Trigger: user `/grow-team` invocation surfaced the structural gap (no agent owned the runtime visual / IA / interaction-pattern axis); single-project evidence (<project>) was sufficient because the gap is a mandate gap, not a frequency gap, mirroring the QE (2026-05-05) and Ops/Security (2026-05-06) activation precedents.

**Pattern this completes:** Four-axis review tier. Critic reviews **plan** (artifacts on disk). QE reviews **runtime functional** (does the deployed system do what was specified?). Ops/Security reviews **runtime adversarial** (can an attacker break it?). UI/UX Reviewer reviews **runtime visual / IA / interaction** (does the deployed UI feel logical, modern, and faithful to spec?). Together: plan / functional / adversarial / experiential — orthogonal coverage, parallel firing at `handed-off → shipped`, four independent blocking authorities.

### Added (live agent activation — 6 net-new files)

- `agents/ui-ux-reviewer.md` — full agent contract (160 lines, well under the 300-line ceiling and slightly under the 180-250 target). Sections: frontmatter, role intro, Job in One Sentence, Operating Principles (incl. anti-sycophancy clause + Designer-seam-protection clause), Read on Every Invocation, Algorithm (3 invocation types: Designer-spec finalize market-calibration, pre-ship default-coverage screenshot pass parallel with QE, on-demand `/design-review`), Output Structure, Authority (Can/Cannot table — explicitly forbids editing `design-spec.md` and Tier 2 code), Failure Modes, Trigger Thresholds, Wrong-Agent Returns, Format.
- `templates/design-review.md` — output template. Sections: Project context, Pages reviewed (enumerated with screenshot path per page), Blocking findings (P0), Notable findings (P1), Polish backlog (P2), References cited, What couldn't be reviewed, Anti-sycophancy log, Sign-off.
- `commands/design-review.md` — slash command. Two modes: `/design-review <slug>` for full default-coverage pass; `/design-review <slug> <page>` for focused review.
- `memory/ui-references.md` — append-only canon of reference dashboards seeded with 7 entries (Tier-A: Vercel, Linear, Stripe Dashboard, Railway; Tier-B: GitHub Projects, Notion, Anthropic Console). Append-only protocol documented at top.
- `memory/ui-patterns.md` — empty file with append-only protocol header. Fills as projects ship.
- `memory/ui-anti-patterns.md` — empty file with header + protocol + ONE seed entry: "Mixed-mental-model button row" (provenance: <project> 2026-05-06; cited surface: `src/app/dashboard/page.tsx L135-157`).

### Changed (one-line / few-line additions to existing contracts)

- `agents/designer.md` — Wrong-Agent Returns table gains row `Critique of running UI / drift from spec → UI/UX Reviewer`.
- `agents/critic.md` — Wrong-Agent Returns table gains row `Critique of running UI / visual / IA → UI/UX Reviewer`.
- `agents/conductor.md` — new "Review-tier fan-out at `handed-off → shipped`" subsection under Hard Checkpoints (~10 lines): documents that QE, Ops/Security, and UI/UX Reviewer all fire in parallel at the gate, each on its own axis, and the Decision Packet consolidates findings only after all reviews report.
- `agents/executive-assistant.md` — Read-on-Every-Invocation list gains three artifact paths: `workspace/*/smoke-report.md`, `workspace/*/security-audit.md`, `workspace/*/design-review.md` — so EA surfaces all three review-tier artifacts in handed-off Decision Packets.

### Backlog filed (atomic with activation)

- **BL-015** Tech-Debt — ProjectCard z-index/overlap with PhasePill (P1, <project>). Cited surface: `src/components/ui/project-card.tsx L244-260`.
- **BL-016** Feature — Dashboard header IA: split admin-nav from primary-action and ambient-action (P1, <project>). Cited surface: `src/app/dashboard/page.tsx L135-157`. References the codified anti-pattern in `memory/ui-anti-patterns.md #1`.
- `workspace/_global/backlog.json` updated: total 14 → 16, P1 4 → 6, open 11 → 13, tier2 9 → 11.

### Tooling integration

No new dependencies. Playwright is already installed as part of QE infrastructure; Opus 4.7 is multimodal (reads screenshots directly). UI/UX Reviewer's tests live in `tests/visual/` (architecturally separate from QE's `tests/e2e/`); QE retains sole ownership of `playwright.config.ts`.

### Hard constraints honored at activation

- `agents/_planned/README.md` not edited (this role was never stubbed; activation is fresh, not promotion).
- No `state.json` files modified (Conductor's territory).
- No first-pass `design-review.md` seeded for <project> (dev server status not confirmed; first real review fires on next `handed-off` checkpoint or user `/design-review` invocation).
- No new dependencies in any `package.json`.
- Agent contract line count: 160 (under 300 ceiling).

### Provenance

User `/grow-team` invocation 2026-05-06 surfaced the gap with both diagnostic specificity (a single screenshot named two concrete failures: ProjectCard overlap + dashboard header IA mismatch) and forward-looking framing (*"the right ui/ux reviewer who can consistently go back and forth and identify issues, enhancements ... research the market on existing websites and structures and designs people create ... seeing layout and changes that are logical without needing user screenshots or inputs"*). Org Designer drafted full proposal at `workspace/_global/org-designer-proposals/20260506-1145-ui-ux-reviewer.md`; user approved verbatim. Activation pass executed atomically per "Changelog updates are proactive" memory rule — agent files + memory seeds + backlog filing + changelog entry shipped in one commit-equivalent unit.

### Founding team count

10 active + 11 planned → **11 active** + 11 planned. The 11 active: Intake, Executive Assistant, Conductor, Strategist, Architect, Designer, Critic, Quality Engineer, Ops/Security, Org Designer, and now UI/UX Reviewer.

---

## [0.4.6] — 2026-05-06

### Changed — Tier B promotion of M-milestone scale demonstrated; two protocol-level heuristics codified

A Tier 2 project executed a multi-commit `dev → main` promotion to align production with main-branch development. The mechanical action (push to main) is technically Tier B (autonomous-with-audit), but the scope (cross-milestone code drift, schema additions, multiple feature flags) crossed the threshold where Tier B in-spirit-is-Tier-C. The team surfaced for explicit user approval anyway. Pattern is now empirically validated for future cross-milestone promotions regardless of project type.

**Two protocol-level lessons (framework-portable; remain in this changelog as the protocol-level residue):**

1. **Dev-vs-main drift is silent under current protocols.** A Tier 2 project ran multiple commits ahead of its prod branch with no protocol-level surfacing of the growing gap. Belongs as a check in `protocols/local-first-dev.md` (BL-001) — Conductor cron, EA briefing line, or pre-Tier-C audit step that surfaces "dev is N commits ahead of main" when N exceeds a threshold (proposed: N > 5) or when milestone-shaped work has been merged to dev but not promoted.

2. **Tier B becomes Tier C in spirit when scope crosses M-milestone boundaries.** Heuristic to add to `protocols/autonomous-ops-permissions.md`: a Tier B push warrants explicit user gate when (a) M-milestone scope, (b) DB schema additions, (c) new agent activations, or (d) cross-cutting feature flags. One of these → decision packet, even if the mechanical action is autonomous-with-audit.

> Full project narrative: see `<project>/.claude/CHANGELOG.md` — 2026-05-06 entry on `dev → main` promotion (Tier B with explicit user approval). Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F2).

---

## [0.4.5] — 2026-05-06

### Changed — First end-to-end Tier C decision-packet flow exercised; two operational lessons codified

A Tier 2 project executed its first custom-domain cutover end-to-end via the formal Tier C decision-packet flow (Architect packet → user approval → execution → user smoke test → audit). Pattern is now empirically validated for future Tier C operations regardless of project type.

**Two operational lessons (framework-portable; remain in this changelog as the protocol-level residue):**

1. **Force-issue TLS when nameservers stay third-party.** Hosting platforms typically auto-issue ACME/Let's Encrypt certs only when their DNS controls the apex. When the project keeps DNS at a third-party registrar (A-record approach), the platform does not auto-issue. Manual `<platform> certs issue <domain>` after DNS resolves provisions the cert. Future custom-domain Tier C packets should include a force-issue step as standard, not as a fallback. Belongs in `protocols/autonomous-ops-permissions.md §3.1` as a custom-domain-cutover sub-step.

2. **Platform env-var removal can affect more scopes than the command names.** When a `<platform> env rm <name> <scope>` operation is run against an entry whose underlying record covers multiple scopes (e.g., Production + Preview as a single entry), the rm operation wipes both — not just the named scope. Pre-check the entry's `target` field. Re-add explicitly for any collateral-damaged scopes. Future Tier C packets touching env vars include this pre-check.

> Full project narrative: see `<project>/.claude/CHANGELOG.md` — 2026-05-06 entry on first custom-domain cutover (Tier C). Migrated 2026-05-06 per Org Designer leakage audit (`workspace/_global/org-designer-proposals/20260506-project-leakage-audit.md` finding F1).

---

## [0.4.4] — 2026-05-06

### Fixed — auth-bypass.spec.ts strict-mode selector violation (cross-tier)

Latent bug exposed by BL-011's workflow restructure. `page.locator("nav, header")` on `/dashboard` matches 2 elements (the sticky TopNav `<header>` AND a page-heading `<header>` from `src/app/dashboard/page.tsx`); Playwright strict mode rejects. Pre-BL-011 the bug was hidden because pass-1 (unauth specs) failed first under the workflow's job-level `TEST_AUTH_BYPASS=1`, so pass-2 (this spec) never ran.

### Cross-tier shipped (<project> repo on `dev` branch — committed 2026-05-06)

  - **`tests/e2e/auth-bypass.spec.ts:66`** (commit 66a3879) — replaced ambiguous `page.locator("nav, header")` with `page.getByRole("banner").first()`. Targets TopNav unambiguously; the other `<header>` on `/dashboard` is not a `role="banner"` so the role-based selector resolves to exactly one element. `npm run build` PASSED. Runtime verification deferred — there's an unrelated 500-on-/dashboard state on the user's existing dev server (separate issue, surfaced for awareness).

### Process — first per-task lightweight authorization observed

User's bug report message included file:line + symptom + fix recipe + verification approach + explicit out-of-scope boundaries. Interpreted as per-task lightweight authorization (the user did the diagnostic team-flow work themselves in the message). Confirmed direction with the user inline rather than dispatching QE+Critic for a one-line selector fix. This is the documented pattern for the lightweight escape hatch from the 2026-05-06 "always operate as the team" directive: explicit, per-task, with the user's diagnostic work standing in for the team-flow steps that would otherwise produce it.

### Provenance

Triggered by user observation 2026-05-06 (verified strict-mode violation against `TEST_AUTH_BYPASS=1` dev server). Fix lands as a follow-on to BL-011's workflow restructure rather than reopening BL-011, since the bug pre-existed BL-011 — BL-011 just made it visible.

---

## [0.4.3] — 2026-05-06

### Added — BL-011 90s ceiling regression test (P1, in-progress) + BL-014 Org Designer ratification (P2, open)

QE's first design-axis deliverable beyond infrastructure. The route `POST /api/projects/create` has `maxDuration = 120` on Vercel Pro; we want a regression alarm at 90s for a 30s buffer. QE picked **(D) Hybrid** design after a 4-option analysis (CI-on-every-PR with real creds vs. local pre-deploy gate vs. scheduled canary vs. hybrid):

  - **Structural half** runs in CI on every push to `dev`/`main` and on every PR to `main`. Asserts the auth gate fires correctly with the right response shape (401 not_authenticated for cookieless requests, regardless of body validity). No credentials, no real GitHub work, no DB rows, no cleanup. Catches handler-import crashes, gate-ordering regressions, response-shape regressions, withErrorCapture wrapper regressions.
  - **Timing half** is gated behind `TAPHQ_RUN_TIMING_TEST=1` and runs locally against deployed prod with the user's own `taphq_session` cookie. Asserts `commit_path === "tree-api"` and total wall ≤ 90s. Skipped by default — never fires in CI. Multi-account-friendly (cookie source is whichever account the user is logged in as).

**Why split:** the dev GitHub App is configured "Only on this account" per `<project>/.claude/docs/github-app-setup.md §3.8`. CI runners cannot install the App, so a CI-stored UAT would not exercise the IAT-first production code path inside `commitScaffold`. The structural-vs-timing seam respects that constraint.

**Acceptance amendment** to BL-011: original "runs in CI on every PR to main" was scope-eroded by the design constraints. Amended to: structural half on every PR + timing half at dev → main promotion (manual, gated). Forcing function added: a `pre-promotion-checklist.md` artifact in `workspace/<project>/` with date-stamped sign-off.

### Cross-tier shipped (<project> repo on `dev` branch — committed 2026-05-06)

  - **`tests/e2e/create-project-ceiling.spec.ts`** — 5 specs total. 4 structural (CI-eligible) + 1 timing (manual, gated). Defensive `beforeAll` probe self-skips with a clear reason if the dev server has `TEST_AUTH_BYPASS=1` active (catches accidental local runs against the wrong env). Failure messages include 5-step investigation order; created-repo URL is logged BEFORE the timing assertion so the user can clean up even on failure.
  - **`.github/workflows/playwright.yml`** — restructured into 2 passes. Pass 1 starts the dev server with `TEST_AUTH_BYPASS=0` and runs unauth specs (including the structural half of the ceiling test). Pass 2 restarts with bypass=1 and runs `auth-bypass.spec.ts`. Job-level `TEST_AUTH_BYPASS` removed; per-step scoping prevents the bypass from accidentally activating during unauth runs (this was Critic finding #1, blocking — fixed).
  - **`package.json`** — added `test:e2e:ceiling` (structural only) and `test:e2e:ceiling:real` (timing, requires env vars) scripts.
  - **`.claude/docs/quality-testing.md`** — added §"Create-Project 90s Ceiling Test" with cookie-extraction procedure, pre-promotion checklist reference, jitter-rerun guidance, and the manual cleanup story.

### QE memory file convention (open question — BL-014 P2)

QE created `memory/runtime-gotchas.md` and `memory/test-patterns.md` as new top-level memory files during BL-011. The QE role spec at `agents/quality-engineer.md` instructs append-to these files and the activation plan at `agents/_planned/quality-engineer.md:165` says "initialize" them, but Critic flagged that "append" is not "create" without Org Designer ratification. BL-014 captures this for Org Designer review. Until ratified: files exist with QE's seed entries; QE continues to use them per the role spec but does not extend their format/scope.

### Process — formal flow exercised

This was the first deliverable run end-to-end through the formal team flow per the user's 2026-05-06 directive ("I almost always want us functioning as our team, even if we determine only one agent/employee is involved"):
  1. Conductor orientation read (Playwright infra + CI workflow + route + auth bypass).
  2. QE produced test-plan + spec + workflow + docs.
  3. Critic reviewed adversarially: 2 BLOCKING + 8 WARNING + 1 FYI(positive).
  4. QE addressed: 2 BLOCKING fixed, 6 WARNINGS mix-fixed-acknowledged, 1 WARNING surfaced as BL-014 for Org Designer.
  5. Build re-verified clean (18/18 routes, 0 TS errors, 2 pre-existing lint warnings unchanged).
  6. Conductor consistency check.
  7. Commit.

The flow caught a BLOCKING bug (workflow-level `TEST_AUTH_BYPASS=1` would have made the structural test fail at first CI run) that QE's local verification missed because the local env didn't match CI. This is exactly the value the formal flow exists to deliver — adversarial review catches what self-review misses.

### Provenance

BL-011 was a P1 audit-gap from the M1 dispatch (2026-05-05). BL-014 is a derivative process question raised during the BL-011 critic round. Total backlog now 14 items / 4 P1 / 7 P2 / 3 P3. Open: 12. In-progress: 2 (BL-004 M2 dashboard, BL-011 ceiling test).

---

## [0.4.2] — 2026-05-06

### Added — Backlog item BL-013: Multi-user prod OAuth path (P1)

Surfaces the structural work needed to take any GitHub-App-based Tier 2 project from "owner-only beta" to "anyone with a GitHub account can use this." The 6-step ordered plan (separate prod App registration → Any-account visibility → custom-domain callback → Vercel env-var isolation → install-uninstall webhook → user-facing error UX) is captured in `workspace/<project>/backlog.md` with explicit acceptance criteria + 3-phase sequencing (Phase 1 = trusted-tester, Phase 2 = open beta, Phase 3 = post-launch). Counts mirrored in `workspace/_global/backlog.json` (BL-013, P1, L). Total backlog now 13 items / 4 P1.

### Cross-tier shipped (<project> repo on `dev` branch — committed 2026-05-06)

Two small UI patches to make the GitHub-App-account-mismatch failure mode self-explanatory before users can be hurt by it. Triggered by user incident: same dashboard works on Mac (signed into `<account>`) but returned a 404 on Windows (signed into a different GitHub account). Root cause documented in `<project>/.claude/docs/github-app-setup.md §3.8` ("Only on this account"); the fix is a UX guardrail until the prod App ships.

- **`src/app/page.tsx`** — added a help-text block under the "Connect GitHub" button telling the user to sign into the right account at `github.com` first, with explicit copy that names the 404-on-consent-screen failure mode.
- **`src/app/auth/error/page.tsx`** — added `REASON_MESSAGES` map translating raw reason codes (`missing_code`, `state_mismatch`, `access_denied`, `exchange_failed:*`, `user_lookup_failed:*`, `unknown`) to user-actionable sentences. Raw reason now lives under a `<details>` "Technical details" disclosure (preserved for support/debugging without burdening end users). Added a fixed "Common cause: wrong GitHub account" hint block that catches the post-GitHub-redirect-back case where the 404 came from `github.com` itself.

`npm run build` — PASSED (18/18 static pages, no type/lint errors, no bundle-size regressions).

### Process — Decision packet vs lightweight flow distinction codified inline

User explicitly asked whether this work was operating "in the flow specified" (i.e., dispatched-through-Tier-2-conductor with `react-component-agent` doing the edits + `tier2-critic` review pre-commit). Decision: stayed in lightweight mode (direct edits + inline backlog/changelog updates) for tiny UI-copy + a backlog entry. The trade-off is now explicit: lightweight is appropriate for ≤2-file UI copy + docs work; formal flow kicks in the moment we touch the actual prod-App registration in BL-013. No protocol change; just clarification of when each mode applies.

### Provenance

Triggered by 2026-05-06 multi-account incident on the production Vercel alias (`<prod-vercel-alias>`). The fix doesn't unblock multi-user end-to-end (that requires BL-013) — it just makes the existing single-user failure mode self-explanatory so future testers don't get stuck without a breadcrumb. The full structural fix (BL-013) is queued P1.

---

## [0.4.1] — 2026-05-06

### Changed — autonomous-ops protocol §3.1: refined NEON_BRANCH classifier + Vercel CLI caveat

**`protocols/autonomous-ops-permissions.md` §3.1 — `NEON_BRANCH` classifier:**
- Updated branch-name match list to reflect real Neon branch names (`production`, `prod`, `live` → Tier C; `dev`, `test`, `preview`, `local` → Tier B). Previous version listed only `prod` for Tier C.
- Added note that Neon allows arbitrary branch names; classifier checks the *role* not literal match.
- Added canonical migration-application order: local first, dev second, production last.
- **New caveat (load-bearing):** `vercel env run -e <env>` and `vercel env pull` both layer `.env.local` on top of Vercel-API env. Sensitive Production/Preview values come back encrypted/empty, and `.env.local` fills them in. Local CLI cannot reliably verify Vercel-side sensitive values; use deployment-observation flow instead.
- Documented the `DATABASE_URL="$(npx neonctl connection-string <branch> --pooled)" npx drizzle-kit push` pattern for explicit-branch CLI work.

### Cross-tier shipped (<project>, no code changes — Vercel env + redeploy)

These are operational changes recorded here for audit traceability; no code commits in <project> repo.

- **Vercel Production scope `DATABASE_URL`** rotated → `production` Neon branch (`<prod-neon-branch>`).
- **Vercel Preview scope `DATABASE_URL`** rotated → `dev` Neon branch (`<dev-neon-branch>`). Required empty-string git-branch arg (`vercel env add DATABASE_URL preview ""`) to bind "all preview branches."
- **`.env.local`** updated → `local` Neon branch (`<local-neon-branch>`); `NEON_BRANCH` annotation flipped from `dev` → `local`. Backup saved at `.env.local.bak.1778042003`.
- **Production redeploy** triggered via `vercel redeploy <latest-prod-deployment> --target=production`. Build completed in 47s; aliased to the production Vercel alias (`<prod-vercel-alias>`). New env vars live on deployed app.

### Verified — 3-branch isolation confirmed

Direct queries via `neonctl connection-string <branch> --pooled` against each branch returned distinct hosts and distinct row counts (production: 1 bug_report; dev: 2 bug_reports; local: 1 bug_report). The Tier B / Tier C split in §3.1 is now operationally meaningful — three real branches, three real environments, one-to-one mapping.

### Provenance

First end-to-end exercise of the autonomous-ops Tier C path with full Vercel-CLI mediation. Decision Packet flow: user posed the topology question → I drafted plan with rollback + verification → user approved with "Go" → execute → audit entry. This pattern is now the canonical Tier C flow for env var changes and prod schema operations.

---

## [0.4.0] — 2026-05-06

### Changed — Incident protocol enhanced for security + Conductor parity + QE forward-reference

**`protocols/incident-protocol.md` enhancements (additive, no rewrites of prior content):**

- **§1.1 Sanitization Contract** — new section codifying the security boundary as a table (headers stripped, body keys redacted via regex, query params dropped, sanitization-failure fallback to null). References `<project>/src/lib/error-capture.ts` directly so the protocol cannot drift from the implementation. Calls out that capture-then-patch leaks; patch-then-capture is correct.
- **§4.5 Conductor Auto-Triggers (parallel path)** — new section listing the 6 Conductor auto-trigger events from `conductor.md:178+` (`consistency_check_failed_blocking`, `wrong_agent_return`, `hard_checkpoint_blocked_unexpected`, `tier2_reportback_blocked_24h_or_more`, `user_dissent_fired`, `audit_gap_caught_later`). Documents that `incidents.md` interleaves user-pasted entries and Conductor-appended entries, both following the same shape so Org Designer mines uniformly.
- **§5 Pattern Detection — refined threshold rules** — keeps the N=3 pattern proposal threshold but adds an explicit one-shot lesson allowance: Org Designer may propose individual contract patches without waiting for N=3 when the diagnosis is structurally complete from a single high-signal incident. Locks in the precedent set by the 2026-05-05 scaffold path → Architect runtime-deps audit-checklist patch (a successful one-shot lesson).
- **§5.1 Quality Engineer reference** — first formal mention of the QE stub in the protocol, naming QE as the future owner of bug-reproduction + smoke-test pattern accumulation + pre-ship gating. Notes that the protocol works without QE; QE just makes verification formal and consistent.
- **Anti-Patterns section (7 items)** — auto-write from Tier 2 to Tier 1 forbidden, promotion discipline, mandatory `[fill in]` slots, append-only enforcement, status+promotion travel together, `wontfix` is triage not judgment, every new route must wrap with `withErrorCapture` in the same commit. Each anti-pattern includes the failure mode it prevents.
- **References expanded** — added pointers to `_planned/quality-engineer.md`, `api/admin/test-error/route.ts` (synthetic capture ping), `drizzle/0002_mixed_red_hulk.sql`, and the seed incident.

### Cross-tier shipped (<project> repo on `dev` branch — committed 2026-05-06)

These commits live in the dashboard repo but are cross-referenced here because they are load-bearing for the framework's incident-learning loop. Without them, the protocol can't actually fire.

- **`5f31757` — `feat(db): add 0002 migration for bug_reports table`.** Drizzle migration `drizzle/0002_mixed_red_hulk.sql` generated via `npm run db:generate`. Closes the gap between schema definition (committed in `2c25d85` on 2026-05-05) and applicable SQL — production writes were failing with `relation does not exist` until this. FK to `users.id ON DELETE set null` preserves bug history when a user is deleted. 3 indexes for `/admin/bugs` query patterns.
- **`fdc3b3f` — `feat(observability): sweep withErrorCapture onto 6 unwrapped API routes`.** Wraps `auth/github/callback`, `auth/github/init`, `bugs/[id]/promote`, `bugs/[id]/status`, `repos/create-test`, `repos/delete-test`. Together with the 3 already-wrapped routes (`api/projects/create`, `api/admin/test-error`, `api/bugs/report`), every API route in the dashboard now writes runtime failures to `bug_reports`. Anti-pattern A7 in the incident protocol now has teeth: the assertion "every API route should be wrapped" is enforced, not aspirational.

### Process — Proactive changelog discipline codified

Per user directive 2026-05-06 ("I want to be proactive with changelog reporting"), changelog updates now travel in the same atomic unit as the change itself — not as a follow-up step. CHANGELOG.md (technical, this file) + `memory/agent-changelog.md` (narrative) update together with the work that necessitated them. Recorded as feedback memory; applies to all future structural changes.

### Provenance

All four enhancements (incident protocol, migration, route sweep, changelog discipline) trace to the bug-learning loop's first end-to-end exercise: production smoke-test fail (2026-05-05) → bug_reports + admin/bugs UI → first incident entry → first formal hiring proposal (QE stub) → audit-checklist patches → protocol formalization. The loop now has a complete first revolution: capture → triage → promote → learn → patch contracts and team shape. v0.4.0 closes that revolution.

---

## [0.3.0] — 2026-05-05

### Added — Quality Engineer stub (10th planned role) + first formal hiring proposal artifact

**New planned agent (`agents/_planned/quality-engineer.md`):**
- Counterpart to Critic on the runtime axis. Critic = plan axis (artifacts on disk); QE = runtime axis (deployed system behavior).
- Provisional mandate: test strategy per feature, smoke-test execution against deployed artifact, bug reproduction + fix verification, environment-dependency audits, exploratory testing of running code.
- Provisional non-mandate: unit-test authoring (Tier 2 implementer), security audits (Ops/Security stub), artifact code review (Critic), production monitoring (out-of-scope), CI/CD architecture (Architect/Tier 2).
- Activation trigger: first of — (a) next post-deploy incident with runtime/deploy/env root cause, (b) project handling paid users / payments / user-data writes, (c) project where Architect's tech-strategy cites runtime risk as one of 3 named risks.
- Workflow placement at activation: parallel with Architect at `scoping → planned` (produces `test-plan.md`); solo at `handed-off → shipped` (produces `smoke-report.md`, gates the existing hard checkpoint).
- Future-growth path documented inline: at 5x scale, fragments into Test Strategist + Verification Engineer; spawns Performance Engineer / Accessibility Tester / Compatibility Tester sub-roles; per-project Tier 2 mirrors mirror the deployment-agent pattern.

**First formal hiring proposal artifact:**
- `workspace/_global/org-designer-proposals/20260505-2330-quality-engineer.md` — full proposal in Org Designer's standard format (Observation / Cited incidents / Pattern / Proposal / Cost-risk / Alternatives considered / Future-growth lens / Implementation sketch / Recommendation).
- Sets the precedent: hiring decisions get a formal proposal artifact, not an inline edit. Treats the team-shape decision with the seriousness an exec-staff hiring discussion warrants.

### Changed — Architect contract: runtime-environment dependency review

- `agents/architect.md` scaffold-phase mechanical verification checklist (L96+) gains a **Runtime-environment dependency review** item with explicit sub-checks across five dimensions: filesystem, network egress, env vars / secrets, region / latency, concurrency / persistence.
- Treats absence of `tech-strategy.md §"Runtime Assumptions"` section as a blocking gap (not `fyi`).
- Provenance cited inline: 2026-05-05 scaffold-path bug (`memory/incidents.md`).

### Changed — Critic contract: two new tech-strategy pattern flags

- `agents/critic.md` Pattern Library Tech-strategy-specific section gains:
  - Missing or incomplete `§"Runtime Assumptions"` section → `blocking` (mirrors Architect's new requirement; ensures Critic catches the gap at review time before handoff).
  - No deployed-system test plan referenced → `warning` (placeholder until Quality Engineer activates and produces `workspace/<slug>/test-plan.md`).

### Changed — `_planned/README.md`

- Stub count 9 → 10.
- New "Review tier (HQ)" subsection added to the stub table for Quality Engineer.
- "Why These 9 Specifically" → "Why These 10 Specifically" with QE rationale appended.
- "Not in stubs (intentionally)" note refined to clarify the QA / quality boundary: implementation QA inside one codebase belongs to Tier 2; cross-project quality strategy + smoke-test execution + runtime-pattern memory belongs to HQ via QE.

### Layered defense rationale

The two contract patches (Architect runtime-deps review + Critic blocking-on-missing-section) provide defense-in-depth even before QE activates. The progression at scaffold time becomes: Architect generates and audits → Critic reviews and flags missing Runtime Assumptions → User signs off knowing the runtime axis was checked at the artifact level. When QE activates, it adds a fourth layer: actually exercising the deployed system. Each layer catches a different failure mode.

### Provenance

All four changes trace to `memory/incidents.md` 2026-05-05 — Scaffold path fails on Vercel serverless, the team's first post-deploy production incident. Closing the loop systemically (one incident → one stub + two contract patches + one proposal artifact + this changelog entry) sets the operating cadence for incidents going forward: every production incident produces structural learning, not just a fix.

---

## [0.2.0] — 2026-05-04

### Added — Hooks + Portfolio Registry + Verification Protocol (post-landscape-benchmark absorptions)

**Stop-hook auto-Critic:**
- `hooks/stop-critic-check.py` — blocks session end when projects have unresolved blockers, contested artifacts, or BLOCKING Critic concerns
- `stop_hook_active` guard prevents infinite continuation loops
- Fail-open on parse errors (don't break Claude Code with flaky hooks)

**PreToolUse deterministic gates:**
- `hooks/pre-tool-gate.py` — pattern-blocks `rm -rf /`, `sudo rm`, `chmod 777`, `.env` access, `git push --force`
- Blocks edits to immutable `seed.md`
- Blocks edits to artifacts marked `[CONTESTED]` in state.json
- Pattern-based gates run faster + more reliably than agent-judgment gates

**Hook wiring:**
- `.claude/settings.json` configures Stop and PreToolUse hooks
- `hooks/README.md` documents pattern + tuning approach

**Master portfolio registry:**
- `workspace/_global/portfolio.json` — machine-readable cross-project state aggregate
- `workspace/_registry.md` — human-readable scannable view
- Conductor MUST update both on every state transition (added to state-machine protocol + Conductor agent)
- EA + Org Designer use these for cross-project briefings + portfolio-level patterns

**Resumable bootstrap state:**
- `workspace/_global/setup_state.json` — Org Designer's interruptible wizard state
- Setup flows can pause mid-step (waiting on user) and resume on next invocation without restart

**Verification-before-completion:**
- `protocols/verification-before-completion.md` — paste-able evidence required for any "complete/done/shipped/passing" claim
- Per-claim verification commands enumerated
- Critic + Tier 2 agents must reference specific output, not paraphrase
- Stop-hook enforces at session boundaries

**Agent updates:**
- Conductor adds portfolio-registry update step on every transition
- Critic reads verification-before-completion protocol; sign-offs must reference specific lines/sections
- Org Designer reads setup_state.json + portfolio.json + _registry.md

**.gitignore updates:**
- portfolio.json + setup_state.json + _registry.md now ship publicly (with empty-state defaults)
- Real workspace project state still gitignored

### Sources for these absorptions
- Stop / PreToolUse hooks pattern: [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery)
- Master registry pattern: [wshobson/agents Conductor](https://github.com/wshobson/agents/tree/main/plugins/conductor)
- Resumable wizard state: [wshobson/agents Conductor](https://github.com/wshobson/agents/tree/main/plugins/conductor)
- Verification-before-completion pattern: [obra/superpowers](https://github.com/obra/superpowers)

---

## [0.1.0] — 2026-05-04

### Added
- Initial team scaffold: 7 founding agents (Intake, Executive Assistant, Conductor, Strategist, Architect, Critic, Org Designer)
- Model assignments per agent (Opus for reasoning roles, Sonnet for routing/summarization)
- `AGENTS.md` canonical roster + onboarding doc
- 9 protocol documents covering state machine, handoffs, conflict resolution, consistency checks, citations, checkpoints, intake, EA, reportback
- Template library: PRD, scope, tech-strategy, intake-brief, decision-packet, executive-briefing, dissent-entry, handoff-package, reportback, session-close, critic-review, research-brief
- Question bank with 8 dimensions for Intake's interview framework (+ reserved 9th for compliance)
- 9 planned-but-not-built agent stubs in `agents/_planned/`:
  - Post-shipping: GTM Strategist, Growth Analyst, Feedback Synthesizer
  - Depth specialists: Customer Researcher, Industry Researcher, Designer, Ops/Security, Biz/Finance, Biz/Legal
- 11 slash commands for direct invocation (with spec-file mode in `/team`)
- Memory seed files (private) + 5 example files (public)
- `seed-to-mvp.md` flagship playbook + `portfolio-review.md`
- 4 planned-playbook stubs: validate-feature-idea, post-launch-retro, pivot-from-feedback, legacy-rebuild
- Public/private repo split via `.gitignore`
- Complete example project (`example-tools-cli`) in `workspace/_examples/` showing all artifact types end-to-end
- MIT license

### v1 absorptions (post-Loki Mode benchmark)
- Anti-sycophancy / Devil's Advocate rule added to Critic — forced adversarial second pass when reviews are too clean
- Spec-file mode for `/team` — Intake reads `.md`/`.json`/`.yaml`/`.txt`/`.openapi` files as seed
- Legacy-rebuild playbook stub for non-greenfield projects
- 4 additional planned-agent stubs (Designer, Ops/Security, Biz/Finance, Biz/Legal) — moved from "later" to visible-as-stubs

### Dynamic Tier 2 generation (made the existing flow actually robust)
- Baseline Tier 2 kit at `templates/stacks/_baseline/` — 4 agents (conductor, implementer, critic, deployment) that work for any stack when no specific template exists
- Tier 2 README template at `templates/tier2-readme.md` — generated for every Tier 2; orients the project team
- Critic reviews generated Tier 2 set before handoff completes — semantic check beyond mechanical verification
- Pre-handoff checklist expanded — at least conductor + implementer + critic + deployment must be present
- Tier 2 critic carries anti-sycophancy rule (inherited from Tier 1)
- Capability-request reportback type — Tier 2 can request new agents mid-build via Org Designer's normal proposal flow

### Design references
- `docs/specs/2026-05-04-framework-design.md` — founding design spec
