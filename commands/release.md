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

After commit, push the branch and the tag, then verify each step landed.

```bash
git push origin main
git push origin v<new>     # SHOULD trigger .github/workflows/publish.yml
```

A bare `git push origin v<new>` exits 0 even when the push is incomplete (network blip, auth glitch, fast-forward rejection). Without verification, the release goes silently un-published — exactly the failure mode that orphaned v0.15.0. The next three checks close that gap. **Do not declare the release complete until all three pass.**

### Step 6a — Verify tag reached origin

Poll `git ls-remote --tags origin` until the new tag appears. Timeout if it doesn't.

Timeout is 12 × 10s = 120s. The prior 60s ceiling caught the typical case but first-push-of-day and slow networks empirically push past 60s in roughly 1-2% of cases (per N1 Critic concern 2026-05-12); 120s gives a comfortable margin without making the happy-path wait noticeably worse.

```bash
NEW_VERSION="<new>"   # e.g., 0.18.0 — no leading 'v'
TAG="v${NEW_VERSION}"

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if git ls-remote --tags origin "${TAG}" | grep -q "refs/tags/${TAG}"; then
    echo "Tag ${TAG} confirmed on origin."
    break
  fi
  if [ "${attempt}" -eq 12 ]; then
    echo "FAIL: Tag ${TAG} did not reach origin after 120s." >&2
    echo "Remediation: re-run \`git push origin ${TAG}\` and confirm exit code 0 + 'New' or '[up to date]' in output." >&2
    exit 1
  fi
  sleep 10
done
```

If the loop fails, **stop here.** Do not continue to Steps 6b/6c. Surface the failure to the user with the exact remediation command. The release is incomplete until the tag exists on origin.

### Step 6b — Watch publish.yml to completion

The tag push triggers `.github/workflows/publish.yml`. Watch the workflow to completion before declaring success.

Resolve the run ID by matching the tag's commit SHA against `headSha` on a `push` event (the `headBranch`-based filter does NOT work for tag-triggered runs — `headBranch` is empty or `null` for tag events). Empirically validated 2026-05-13 (manual dogfood of `tap-agents/v0.17.0`): this filter resolved on attempt 1; total tag-push to publish-success was ~42s.

```bash
TAG_SHA=$(git rev-list -n 1 "${TAG}")
# Try several times in case workflow registration is slow (~15s typical lag,
# observed up to 60s+ during GitHub Actions high-load periods).
for attempt in 1 2 3 4 5; do
  RUN_ID=$(gh run list --workflow=publish.yml --limit=15 --json databaseId,headSha,status,event \
    --jq ".[] | select(.headSha == \"${TAG_SHA}\" and .event == \"push\") | .databaseId" | head -1)
  if [ -n "$RUN_ID" ]; then
    echo "Found run ID: $RUN_ID (attempt $attempt)"
    break
  fi
  echo "Waiting for workflow to register (attempt $attempt/5)..."
  sleep 15
done

if [ -z "$RUN_ID" ]; then
  cat >&2 <<EOF
FAIL — could not resolve publish.yml run for tag ${TAG} (SHA ${TAG_SHA}) after 75s.
Remediation: check Actions tab manually:
  gh run list --workflow=publish.yml --limit=10 --json databaseId,displayTitle,headSha,event,status,createdAt
The workflow may have been triggered with delay; investigate before assuming failure.
EOF
  exit 1
fi

echo "Watching publish.yml run ${RUN_ID} for ${TAG}..."
gh run watch "${RUN_ID}" --exit-status
```

`gh run watch --exit-status` returns non-zero if the workflow fails. If the workflow fails, surface the workflow URL (`gh run view ${RUN_ID} --web`) and **stop**. Do not retry the tag — re-tagging a failed publish is the major-incident class per "Failure modes" below. Cut a new version with the fix instead.

### Step 6c — Confirm npm registry has the new version

`npm publish` reports success to `publish.yml` before the registry has fully propagated the package to all CDN edges. Poll `npm view` with backoff:

```bash
for attempt in 1 2 3 4 5 6 7 8; do
  PUBLISHED=$(npm view "@tapintomymind/tap-agents@${NEW_VERSION}" version 2>/dev/null || echo "")
  if [ "${PUBLISHED}" = "${NEW_VERSION}" ]; then
    echo "npm registry confirms @tapintomymind/tap-agents@${NEW_VERSION}."
    break
  fi
  if [ "${attempt}" -eq 8 ]; then
    echo "FAIL: npm registry did not return ${NEW_VERSION} after 4 minutes of polling." >&2
    echo "Remediation: 'gh run view ${RUN_ID}' to inspect publish.yml output; check npm.com for the package directly." >&2
    exit 1
  fi
  sleep 30
done
```

### Step 6d — Tarball completeness probe (catches v0.11.0-regression class)

Gate 5 §4.5 invariant 2: confirm the published tarball actually contains every directory declared in `package.json#files`. The v0.11.0 incident showed that `npm publish` can report success while the tarball is missing files-array entries (4 directories silently dropped at v0.11.0 — `playbooks/`, `memory/`, `docs/`, `settings.json`). Step 6c only confirms version-presence; this step confirms tarball-completeness.

Empirically validated 2026-05-13 (manual dogfood of `tap-agents/v0.17.0`): `npm view ... dist.tarball` resolved a working URL on attempt 1; the curl-then-tar probe confirmed all four v0.11.0-regression-class directories present.

**Tool choice rationale.** Do NOT use `npm view files` (returns empty in some npm CLI versions) or `npm pack --dry-run --silent` (suppresses contents listing). The reliable path is `npm view ... dist.tarball` + curl + `tar -tzf`.

```bash
PKG_NAME="@tapintomymind/tap-agents"

# Resolve the published tarball URL from the npm registry.
TARBALL_URL=$(npm view "${PKG_NAME}@${NEW_VERSION}" dist.tarball 2>&1)
if [ -z "$TARBALL_URL" ] || [[ "$TARBALL_URL" == *"npm ERR"* ]]; then
  cat >&2 <<EOF
FAIL — could not resolve tarball URL via npm view ${PKG_NAME}@${NEW_VERSION} dist.tarball.
Output: ${TARBALL_URL}
This is a publish-side failure — npm has the version metadata but the tarball location is unresolvable.
Stop and investigate before proceeding.
EOF
  exit 1
fi

PROBE_TGZ="/tmp/${PKG_NAME//[\/@]/-}-${NEW_VERSION}-probe.tgz"
curl -sfL "$TARBALL_URL" -o "$PROBE_TGZ"
if [ ! -s "$PROBE_TGZ" ]; then
  echo "FAIL — tarball download from $TARBALL_URL was empty or failed." >&2
  exit 1
fi

# Verify each entry in package.json#files is present in the tarball.
# tar -tzf lists members under the "package/" prefix (npm convention).
TARBALL_CONTENTS=$(tar -tzf "$PROBE_TGZ")
MISSING=()
for required in $(node -p "require('./package.json').files.join('\n')"); do
  # Match either a directory ("playbooks/") or a top-level file ("settings.json")
  pattern="${required%/}/"
  if ! echo "$TARBALL_CONTENTS" | grep -q "^package/${pattern}\\|^package/${required}$"; then
    MISSING+=("$required")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  cat >&2 <<EOF
FAIL — tarball is missing required files-array entries: ${MISSING[*]}
This is the v0.11.0-regression class — package.json#files lost entries between local pack and registry upload.
Tarball preserved at $PROBE_TGZ for inspection.
Stop. Do NOT mark this release verified. Hotfix release required (npm versions are immutable).
EOF
  exit 1
fi

rm -f "$PROBE_TGZ"
echo "PASS — tarball contents match package.json#files."
```

### Step 6e — Confirm GitHub Release was created

```bash
if ! gh release view "${TAG}" --json name,tagName >/dev/null 2>&1; then
  cat >&2 <<EOF
FAIL — gh release view ${TAG} returned non-zero; the GitHub Release was not created.
Remediation:
  awk -v v="${NEW_VERSION}" '\$0 ~ "^## \\\\["v"\\\\]" {found=1; print; next} found && /^## \\[/ {exit} found {print}' CHANGELOG.md > /tmp/release-${TAG}.md
  gh release create "${TAG}" --notes-file /tmp/release-${TAG}.md
EOF
  exit 1
fi
echo "PASS — GitHub Release ${TAG} exists."
```

### Step 6f — Final verification gate (all channels)

Print a final summary line confirming all four distribution channels see the new version:

```bash
echo ""
echo "============================================"
echo "Release ${TAG} — Gate 5 (post-publish verification) PASSED"
echo "  - git ls-remote tag:       present"
echo "  - publish.yml run:         ${RUN_ID} (success)"
echo "  - npm ${PKG_NAME}@${NEW_VERSION}: present"
echo "  - tarball completeness:    matches package.json#files"
echo "  - gh release ${TAG}:        present"
echo "============================================"
```

Only after this banner prints is the release considered complete per `protocols/versioning-protocol.md §4.5`.

## After landing

State to the user, in this order:

1. The release commit SHA + tag name
2. **Gate 5 verification status** — confirm all five channels (git remote tag, publish.yml run, npm registry, tarball completeness, GitHub Release) returned positive per Step 6a-6e. If any failed, the release is **not complete** — surface the failure and the remediation command; do not proceed.
3. Whether `publish.yml` was triggered AND completed (the Step 6b run ID + outcome)
4. The Dependabot expectation for `agent-dashboard` (PR will open within ~24h)
5. Whether any follow-up release is queued (e.g., a known-deferred change)

## Failure modes (and what to do)

- **Hook blocks at commit time** — read the error message verbatim, fix the diff (it will name the invariant), retry. Do not use `--no-verify`.
- **`git describe` returns nothing** — first release before any tag exists. Use `0.0.0` as `prev` for severity-floor reasoning; emit `0.8.0` as the initial published version per user direction 2026-05-11.
- **Ambiguous classification** — surface to user. Do not guess. If the gap reflects a protocol weakness, propose an Org Designer amendment to `versioning-protocol.md` as the follow-up.
- **CI workflow fails after tag push** — surface the failure to the user with the workflow URL. Do not retry the tag — re-tagging after publish is a major incident class (npm packages are immutable once published).
- **Tag push silently fails (the v0.15.0 class)** — Step 6a polls `git ls-remote --tags origin` precisely to catch this. The local `git push origin v<new>` may exit 0 while origin never receives the tag (network blip, auth glitch, ref-update rejection). Step 6a fails loudly with the remediation command. Do NOT continue to Step 6b/6c without a confirmed tag-on-origin — the workflow won't have fired.
- **Tarball-incomplete after publish (the v0.11.0 files-array class)** — `npm publish` succeeds but `package.json#files` dropped directories so the tarball is missing content. Step 6c confirms version-presence; Step 6d's tarball probe (cold-pull via `npm view ... dist.tarball` + curl + `tar -tzf`) catches the v0.11.0 class at release time. If Step 6d fails, the remediation is to cut the next version with a corrected `package.json#files` — do NOT republish the broken version (npm immutability). Defense-in-depth via an independent `verify-publish.yml` CI workflow is deferred to v0.19.0 per the 2026-05-12 Gate 5 proposal; for v0.18.0, operator-side Step 6d is the v0.11.0-class catch.

## See also

- `protocols/versioning-protocol.md` — the spec this command operationalizes
- `protocols/changelog-protocol.md` — CHANGELOG and agent-changelog scope rules
- `protocols/framework-change-discipline.md` — what qualifies as a Tier 1 doctrinal change
- `.github/workflows/version-check.yml` — the CI gate (Gate 3) that backstops this command
- `.github/workflows/publish.yml` — the publish workflow triggered by tag push
