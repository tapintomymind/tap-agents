---
name: release
description: AI-led framework release. Classifies the diff against versioning-protocol.md §3, proposes the SemVer bump, drafts the CHANGELOG entry, and lands the release commit + tag atomically.
---

# /release

Cut a new framework release of `@tapintomymind/tap-agents` with strict SemVer discipline.

## When to use

You're ready to publish a new version of the framework to:
- The Claude Code plugin marketplace (consumed via `/plugin marketplace add tapintomymind/tap-agents`)
- The npm registry (consumed by `agent-dashboard` and any future programmatic consumer)

Do NOT use this for project-scoped changes inside any project's local `.claude/`. This command operates only at the TapAgents framework root (the `.claude/` checkout that publishes `@tapintomymind/tap-agents`).

## Required reading

Before proposing anything, the orchestrator MUST have read:

1. `protocols/versioning-protocol.md` — the SemVer spec and four-gate enforcement chain
2. `protocols/changelog-protocol.md` — the CHANGELOG format and scope split
3. `protocols/framework-change-discipline.md` — what qualifies as a Tier 1 doctrinal change
4. The current `CHANGELOG.md` (top 1-2 entries, for format alignment)
5. The current `package.json` — note the current version

## Workflow

This is a six-step path. Do them in order. Do not skip steps. If any step's analysis is ambiguous, stop and surface to the user — do not guess.

### Step 1 — Establish the baseline

Run, in this order:

```bash
git fetch --tags
git describe --tags --abbrev=0 --match "v*"   # last release tag
git log <last-tag>..HEAD --oneline             # commits since last release
git diff <last-tag>..HEAD --stat              # file-level summary
```

State three things explicitly:
- Current version (from `package.json`)
- Last release tag (from `git describe`)
- Count of commits since last release

If `package.json` does not yet exist (first release before npm pipeline lands), treat current as `0.0.0` and next as `0.8.0` per the user direction 2026-05-11.

### Step 2 — Classify the diff against versioning-protocol.md §3

Walk the diff in three passes:

**Pass A — Detect MAJOR triggers** (per §3.3):
- Any file removed from `agents/`, `commands/`, `protocols/`, `templates/`?
- Any file renamed in those directories?
- Any required field added to `settings.json`?
- Any existing field removed from `settings.json`?
- Any `fires_when` trigger removed from an existing agent? (Read the agent's prior version via `git show <last-tag>:agents/<name>.md`.)
- Any existing agent's authority or output contract narrowed?
- Any export removed from `scripts/build.ts` output (or rename)?
- Any marketplace plugin name/ID changed in `.claude-plugin/marketplace.json`?

If ANY of the above: bump is MAJOR. Skip Pass B and C.

**Pass B — Detect MINOR triggers** (per §3.2):
- Any new file added to `agents/`, `commands/`, `protocols/`, `templates/`?
- Any new optional field added to `settings.json`?
- Any new optional export added to `scripts/build.ts` output?
- Any new `fires_when` trigger added to an existing agent?
- Any new hook added to `hooks/` and wired into `settings.json`?

If ANY of the above (and no MAJOR triggers): bump is MINOR. Skip Pass C.

**Pass C — PATCH default** (per §3.1):
- Wording tweaks inside existing agents that do not change `fires_when`, authority, or output contract
- Typo fixes in any artifact
- README/doc edits
- Internal hook/script refactors that produce byte-identical functional output
- `memory/` narrative appends (not contracts)

If none of MAJOR / MINOR / PATCH categories applies, **stop and surface to the user** — the diff is in a gap not covered by §3 and the protocol needs amendment before this release can land.

### Step 3 — Propose the version

Compute the new version mechanically:
- Current = `X.Y.Z`
- PATCH bump → `X.Y.(Z+1)`
- MINOR bump → `X.(Y+1).0`
- MAJOR bump → `(X+1).0.0`

Surface to the user (in chat, do not commit yet):

```
Proposed release: v<new>
Severity:         <patch|minor|major>
Last release:     v<prev>  (<date>)
Commits since:    <N>

Evidence for severity:
- <bullet citing specific file paths and the §3 clause that triggered classification>
- <bullet>
- <bullet>

CHANGELOG entry draft:
<see next step>

Files in this release commit:
- package.json
- CHANGELOG.md
- memory/agent-changelog.md  (if framework-scoped narrative needed per changelog-protocol.md §1)
- .claude-plugin/plugin.json
- .claude-plugin/marketplace.json
- <any source files in the bundle>
```

Wait for user `approve` / `revise` / `cancel` before proceeding. Do not guess.

### Step 4 — Draft the CHANGELOG entry

Format follows Common Changelog (see existing entries in `CHANGELOG.md`). Use:

```markdown
## [<new-version>] — <YYYY-MM-DD> — <One-line summary, severity-aware>

<Paragraph context. What changed at the framework level. Who benefits. What downstream consumers need to know (especially: any breaking change implications for the agent-dashboard Vercel build or marketplace users).>

### Added
- **`<path>`** — <what + why>

### Changed
- **`<path>`** — <what + why>

### Removed
- **`<path>`** — <what + why + migration path for downstream consumers>

### Provenance
<commit-range or session anchor>
```

Sections only present if non-empty. Removed section is mandatory for MAJOR bumps (gives downstream consumers a migration path).

### Step 5 — Draft the agent-changelog narrative

Per `protocols/changelog-protocol.md` §1, framework-shape changes also land in `memory/agent-changelog.md`. Narrative format:

```markdown
## <YYYY-MM-DD> — Framework v<new-version> — <one-line summary>

<Narrative paragraph: trigger, what changed, why, cross-references. Public-safe — no project-specific business detail, no user identity. Append above prior entries.>

Cross-reference: `CHANGELOG.md` v<new-version> entry.
```

Skip this step if `### §2` of changelog-protocol explicitly excludes the change (e.g., pure typo fix in a doc). When in doubt, include the narrative.

### Step 6 — Execute the release commit + tag

Once the user has approved Step 3 and the drafts in Steps 4-5, execute atomically:

```bash
# Update package.json version
# Update .claude-plugin/plugin.json version (must match package.json)
# Update .claude-plugin/marketplace.json plugin entry version (must match)
# Prepend CHANGELOG.md with the new entry
# Prepend memory/agent-changelog.md with the narrative entry

git add package.json CHANGELOG.md memory/agent-changelog.md \
        .claude-plugin/plugin.json .claude-plugin/marketplace.json \
        <any source files in the bundle>

git commit -m "release: v<new> — <one-line summary>

<paragraph summary, mirrors CHANGELOG context>
"

git tag -a "v<new>" -m "Release v<new>"
```

The pre-commit hook (`hooks/version-gate.py`) runs invariant checks (atomicity, sequence, severity floor) and exits 2 on failure with an actionable message. If it fails, read the message, fix the diff, retry — do not bypass.

After commit, push:

```bash
git push origin main
git push origin v<new>     # triggers .github/workflows/publish.yml
```

CI then publishes to npm and updates the marketplace surface.

## After landing

State to the user, in this order:

1. The release commit SHA + tag name
2. Whether `publish.yml` was triggered (check GitHub Actions status if available)
3. The Dependabot expectation for `agent-dashboard` (PR will open within ~24h)
4. Whether any follow-up release is queued (e.g., a known-deferred change)

## Failure modes (and what to do)

- **Hook blocks at commit time** — read the error message verbatim, fix the diff (it will name the invariant), retry. Do not use `--no-verify`.
- **`git describe` returns nothing** — first release before any tag exists. Use `0.0.0` as `prev` for severity-floor reasoning; emit `0.8.0` as the initial published version per user direction 2026-05-11.
- **Ambiguous classification** — surface to user. Do not guess. If the gap reflects a protocol weakness, propose an Org Designer amendment to `versioning-protocol.md` as the follow-up.
- **CI workflow fails after tag push** — surface the failure to the user with the workflow URL. Do not retry the tag — re-tagging after publish is a major incident class (npm packages are immutable once published).

## See also

- `protocols/versioning-protocol.md` — the spec this command operationalizes
- `protocols/changelog-protocol.md` — CHANGELOG and agent-changelog scope rules
- `protocols/framework-change-discipline.md` — what qualifies as a Tier 1 doctrinal change
- `.github/workflows/version-check.yml` — the CI gate (Gate 3) that backstops this command
- `.github/workflows/publish.yml` — the publish workflow triggered by tag push
