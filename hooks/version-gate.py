#!/usr/bin/env python3
"""
PreToolUse hook — enforces protocols/versioning-protocol.md at the mechanical layer.

Gate 2 of the five-gate enforcement chain. Four invariants:

  1. Atomicity   — package.json "version" change must coincide with a CHANGELOG.md
                   entry whose heading matches the new version, in the same staged diff.
  2. Sequence    — the new version must be a legal SemVer successor to the last tag.
                   No skipping (0.7 -> 0.9), no going backwards (0.8 -> 0.7).
  3. Severity floor — if the staged diff removes/renames any file in agents/, commands/,
                      protocols/, or templates/, the bump must be MAJOR.
                      If it only adds files in those directories (no removals/renames),
                      MINOR is the floor.
                      The hook enforces the floor only; over-classification is always allowed.
  4. Branch-discipline (tag-time) — fires inside _check_tag(). When the operator runs
                      `git tag v<X>.<Y>.<Z>`, the current branch MUST be `main` (the trunk
                      that publish.yml's Layer A ancestry check pulls from), OR the HEAD
                      commit message must carry a non-empty
                      `[trunk-discipline-override: <reason>]` token in its TRAILER BLOCK
                      (the lines after the last blank line in the commit message, mirroring
                      git's Co-authored-by trailer convention). Prose mentions of the token
                      form in the commit BODY do not match — they get treated as
                      documentation, not as an operator-issued override. Codified in v0.24.0
                      per workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md;
                      tightened to trailer-only placement in v0.24.1 per
                      workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md after the
                      v0.24.0 self-bypass dogfood incident (publish.yml Layer A matched the
                      placeholder text in its own CHANGELOG documentation commit). Mirrors
                      tap-agents/.github/workflows/publish.yml Layer A — operator-side
                      ceiling under the CI mechanical floor.

Hook fires on:
  - Edit/Write where file_path endswith package.json or contains .claude-plugin/
  - Bash commands matching `git commit` or `git tag`

Exit 0  = allow.
Exit 2  = block, with an actionable message on stderr.

Other exits (e.g., subprocess crash) print a warning and allow — the hook must never
silently swallow a tool call. If the hook itself is broken, that's a discipline issue
to surface, not a license to bypass enforcement.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Shared telemetry helper — fail-open import. The gate's block semantics are
# unaffected if the helper is missing or fails to import.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


# Module-level state — stashed by main() so _block() can attach session_id
# + tool_name to the telemetry emit without rewriting every callsite.
_HOOK_PAYLOAD: dict = {}
_TOOL_NAME: str = ""


# --- helpers ------------------------------------------------------------------


def _project_dir() -> Path:
    """Resolve the framework root. CLAUDE_PROJECT_DIR is set by Claude Code at hook time."""
    raw = os.environ.get("CLAUDE_PROJECT_DIR")
    if not raw:
        return Path.cwd()
    return Path(raw)


def _run_git(*args: str) -> str:
    """Run a git command from the project dir. Returns stdout stripped, or '' on error."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=_project_dir(),
            capture_output=True,
            text=True,
            timeout=8,
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def _read_package_version() -> str | None:
    """Read the current 'version' field from package.json. Returns None if missing."""
    pkg = _project_dir() / "package.json"
    if not pkg.exists():
        return None
    try:
        data = json.loads(pkg.read_text())
        v = data.get("version")
        if isinstance(v, str):
            return v
    except (json.JSONDecodeError, OSError):
        pass
    return None


def _last_tag_version() -> str | None:
    """Return the version on the last release tag (v*) reachable from HEAD, or None."""
    raw = _run_git("describe", "--tags", "--abbrev=0", "--match", "v*")
    if not raw:
        return None
    # Tags are 'vX.Y.Z'; strip the leading 'v'.
    return raw[1:] if raw.startswith("v") else raw


SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$")


# Trunk-discipline override token. Format: [trunk-discipline-override: <reason>].
#
# Token recognition is restricted to the commit message's TRAILER BLOCK — the
# lines after the LAST blank line in the message, mirroring the convention
# git tooling uses for `Co-authored-by:` and other trailers. Prose mentions
# of the token form in the commit body (paragraphs above the trailer block)
# do NOT match; they get treated as documentation, not as an operator-issued
# override. See workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md for
# the tightening rationale + the v0.24.0 incident that motivated it.
#
# Regex notes:
#   - Whole-line anchored via re.match() against each individual trailer line
#     (anchored at start by match(); $-anchor at end of pattern via `[\s]*$`).
#   - Leading/trailing whitespace tolerated.
#   - Character class `[^\]<>]+` denies angle brackets in the reason text so
#     placeholder forms like `<reason>` are rejected at the regex level.
#   - A secondary _PLACEHOLDER_REASONS denylist catches bare placeholder words
#     ("reason", "todo", "...") case-insensitively.
TRUNK_OVERRIDE_PATTERN = re.compile(
    r"^\s*\[trunk-discipline-override:\s*([^\]<>]+?)\]\s*$",
)

# Reasons that suggest documentation/placeholder text rather than a real
# operator-issued override justification. Case-insensitive membership check.
_PLACEHOLDER_REASONS = frozenset({"reason", "todo", "..."})


def _has_trailer_override(commit_message: str) -> tuple[bool, str]:
    """Return (matched, reason) if a trunk-discipline override token is present
    in the commit message's trailer block, else (False, '').

    Trailer block = the lines after the LAST blank line in the message
    (Conventional-Commits trailer model). Edge cases:
      - No blank lines anywhere → fall back to the LAST non-empty line as the
        only candidate (covers one-line tag-message overrides).
      - Empty message → (False, '').

    Per workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md §3.2.
    """
    if not commit_message:
        return False, ""
    lines = commit_message.rstrip().split("\n")
    if not lines:
        return False, ""

    # Find the index of the last blank line. Trailers live AFTER that line.
    blank_indices = [i for i, line in enumerate(lines) if not line.strip()]
    if blank_indices:
        last_blank_idx = blank_indices[-1]
        trailer_block = lines[last_blank_idx + 1:]
    else:
        # No blank lines — treat the last line as the only candidate.
        trailer_block = [lines[-1]]

    for line in trailer_block:
        stripped = line.strip()
        m = TRUNK_OVERRIDE_PATTERN.match(stripped)
        if not m:
            continue
        reason = m.group(1).strip()
        if not reason:
            continue
        # Reject obvious placeholder reasons.
        if reason.lower() in _PLACEHOLDER_REASONS:
            continue
        return True, reason

    return False, ""


def _extract_trunk_override_reason(commit_message: str) -> str | None:
    """Return non-empty trimmed trunk-discipline override reason, or None.

    Back-compat shim around _has_trailer_override (v0.24.1+). Existing callers
    in _check_tag() continue to receive an Optional[str] without code changes.
    Restored shape from v0.24.0; the trailer-restriction tightening happens
    inside _has_trailer_override.
    """
    matched, reason = _has_trailer_override(commit_message)
    return reason if matched else None


def _parse_semver(v: str) -> tuple[int, int, int] | None:
    m = SEMVER_RE.match(v)
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def _is_legal_successor(prev: str, new: str) -> tuple[bool, str]:
    """Check that `new` is a legal SemVer step from `prev`. Returns (ok, reason)."""
    p = _parse_semver(prev)
    n = _parse_semver(new)
    if not p:
        return False, f"last tag version `{prev}` is not parseable SemVer"
    if not n:
        return False, f"proposed version `{new}` is not parseable SemVer"

    # Backwards check
    if n < p:
        return False, f"version `{new}` is not greater than last tag `{prev}` (going backwards)"
    if n == p:
        return False, f"version `{new}` is equal to last tag `{prev}` (no bump)"

    # Legal successors:
    #   PATCH: same MAJOR, same MINOR, PATCH = prev.PATCH + 1
    #   MINOR: same MAJOR, MINOR = prev.MINOR + 1, PATCH = 0
    #   MAJOR: MAJOR = prev.MAJOR + 1, MINOR = 0, PATCH = 0
    pm, pn, pp = p
    nm, nn, np_ = n

    if nm == pm and nn == pn and np_ == pp + 1:
        return True, "patch"
    if nm == pm and nn == pn + 1 and np_ == 0:
        return True, "minor"
    if nm == pm + 1 and nn == 0 and np_ == 0:
        return True, "major"

    return False, (
        f"version `{new}` is not a legal SemVer step from `{prev}`. "
        f"Legal successors of `{prev}`: "
        f"patch={pm}.{pn}.{pp + 1}, minor={pm}.{pn + 1}.0, major={pm + 1}.0.0"
    )


def _staged_diff_files() -> list[tuple[str, str]]:
    """Return list of (status, path) for staged files. Status is one of A/M/D/R<num>/C<num>/T."""
    raw = _run_git("diff", "--cached", "--name-status", "-z")
    if not raw:
        return []
    # -z output is NUL-separated. Renames produce: R100\0old\0new\0. Others: A\0path\0.
    parts = raw.split("\x00")
    files: list[tuple[str, str]] = []
    i = 0
    while i < len(parts):
        entry = parts[i].strip()
        if not entry:
            i += 1
            continue
        status = entry.split("\t")[0] if "\t" in entry else entry
        if status.startswith(("R", "C")):
            # Rename/copy: next two parts are old, new
            if i + 2 < len(parts):
                files.append((status, parts[i + 2]))
                i += 3
                continue
        # Plain status: status\tpath OR status on its own line then path on next
        if "\t" in entry:
            st, path = entry.split("\t", 1)
            files.append((st, path))
            i += 1
        else:
            if i + 1 < len(parts):
                files.append((status, parts[i + 1]))
                i += 2
            else:
                i += 1
    return files


VERSIONED_DIRS = ("agents/", "commands/", "protocols/", "templates/", "hooks/", "scripts/")


def _classify_severity_floor(files: list[tuple[str, str]]) -> str:
    """Return the severity floor based on staged diff: 'patch' | 'minor' | 'major'."""
    has_removal_or_rename = False
    has_addition = False
    for status, path in files:
        if not any(path.startswith(d) for d in VERSIONED_DIRS):
            continue
        if status.startswith(("D", "R")):
            has_removal_or_rename = True
        elif status.startswith("A"):
            has_addition = True
    if has_removal_or_rename:
        return "major"
    if has_addition:
        return "minor"
    return "patch"


def _changelog_has_heading_for(version: str) -> bool:
    """Check whether CHANGELOG.md contains a `## [<version>]` heading at any depth."""
    cl = _project_dir() / "CHANGELOG.md"
    if not cl.exists():
        return False
    try:
        body = cl.read_text()
    except OSError:
        return False
    return bool(re.search(rf"^##\s*\[{re.escape(version)}\]", body, re.MULTILINE))


def _changelog_staged_for(version: str) -> bool:
    """Check whether the *staged* diff of CHANGELOG.md introduces a heading for `version`."""
    raw = _run_git("diff", "--cached", "--", "CHANGELOG.md")
    if not raw:
        return False
    # Look for an added line that matches the heading shape.
    for line in raw.splitlines():
        if not line.startswith("+"):
            continue
        if re.search(rf"^##\s*\[{re.escape(version)}\]", line[1:]):
            return True
    return False


# --- gate logic ---------------------------------------------------------------


def _block_subtype(message: str) -> str:
    """Discriminate the version-gate block class from the reason string.

    Subtypes are stable consumer-facing values per protocols/telemetry-events.md.
    Map by phrase fragments that appear in the block message bodies in this file.
    """
    m = message.lower()
    if "semver sequence" in m or "not a legal semver step" in m or "going backwards" in m or "equal to last tag" in m:
        return "sequence"
    if "severity-floor" in m or "severity floor" in m:
        return "severity-floor"
    if "tag/package version mismatch" in m or "marketplace version drift" in m or "must be prefixed with 'v'" in m:
        return "matchup"
    if "branch-discipline" in m or "invariant 4" in m:
        return "branch-discipline"
    # All atomicity invariants: package.json without CHANGELOG, no staged heading,
    # missing 'version' field. Default bucket — the protocol enumerates four
    # subtypes so unmatched messages fall under atomicity rather than "unknown".
    return "atomicity"


def _block(message: str) -> None:
    """Exit 2 with `message` on stderr. Claude Code surfaces this back to the orchestrator."""
    sys.stderr.write("version-gate.py: " + message + "\n")
    # Telemetry emit — fail-open inside _telemetry. Module-level _HOOK_PAYLOAD
    # carries session_id + agent fields stashed by main() before any check
    # function ran.
    emit_event(
        source="version-gate",
        type="block",
        subtype=_block_subtype(message),
        agent_context="subagent" if (_HOOK_PAYLOAD.get("agent_id") or _HOOK_PAYLOAD.get("agent_type")) else "orchestrator",
        agent_type=_HOOK_PAYLOAD.get("agent_type"),
        agent_id=_HOOK_PAYLOAD.get("agent_id"),
        payload={"tool_name": _TOOL_NAME, "summary": message},
        session_id=_HOOK_PAYLOAD.get("session_id"),
    )
    sys.exit(2)


def _check_commit() -> None:
    """The full-discipline check that fires on `git commit`."""
    files = _staged_diff_files()
    pkg_changed = any(path == "package.json" for _, path in files)
    if not pkg_changed:
        # Not a release commit. Hook is silent.
        sys.exit(0)

    # Invariant 1: atomicity — CHANGELOG must also be in the staged diff
    cl_changed = any(path == "CHANGELOG.md" for _, path in files)
    if not cl_changed:
        _block(
            "package.json changed but CHANGELOG.md is not staged. "
            "Per protocols/versioning-protocol.md §4.2 invariant 1, the version bump and the "
            "CHANGELOG entry MUST land in the same commit. Stage CHANGELOG.md or unstage package.json."
        )

    new_version = _read_package_version()
    if not new_version:
        _block("package.json has no parseable 'version' field. Cannot proceed.")

    # Invariant 1b: CHANGELOG must have a heading matching the new version (in the staged diff)
    if not _changelog_staged_for(new_version):
        _block(
            f"package.json version is `{new_version}` but CHANGELOG.md has no staged heading "
            f"`## [{new_version}]`. Add a CHANGELOG entry for this version per Common Changelog format."
        )

    # Invariant 2: sequence — must be a legal SemVer successor to the last tag
    prev = _last_tag_version()
    if prev:
        ok, reason = _is_legal_successor(prev, new_version)
        if not ok:
            _block(
                f"SemVer sequence violation: {reason}. "
                f"Per protocols/versioning-protocol.md §4.2 invariant 2."
            )
        bump_kind = reason  # 'patch' | 'minor' | 'major'
    else:
        # No prior tag — first release. Accept any 0.x.y.
        bump_kind = "initial"

    # Invariant 3: severity floor
    if bump_kind != "initial":
        floor = _classify_severity_floor(files)
        order = {"patch": 0, "minor": 1, "major": 2}
        if order[bump_kind] < order[floor]:
            _block(
                f"Severity-floor violation: staged diff requires at least a `{floor}` bump "
                f"(per protocols/versioning-protocol.md §3.{ {'patch': 1, 'minor': 2, 'major': 3}[floor] }) "
                f"but the proposed bump is `{bump_kind}`. "
                f"Either reclassify the bump or split the removal/rename into its own release."
            )

    # Marketplace alignment — HARD check; _block()s (exit 2) on any version drift
    # between package.json and EITHER .claude-plugin manifest. (The comment here
    # previously claimed "soft check; warns but does not block" — that was wrong:
    # the code below has always called _block(). Corrected so a future maintainer
    # cannot "restore" a soft-check and silently delete enforcement.)
    plugin_path = _project_dir() / ".claude-plugin" / "plugin.json"
    if plugin_path.exists():
        try:
            plugin_data = json.loads(plugin_path.read_text())
            plugin_version = plugin_data.get("version")
            if plugin_version and plugin_version != new_version:
                _block(
                    f"Marketplace version drift: package.json is `{new_version}` but "
                    f".claude-plugin/plugin.json is `{plugin_version}`. "
                    f"Per protocols/versioning-protocol.md §6, these must match in the same commit."
                )
        except (json.JSONDecodeError, OSError):
            pass

    # Marketplace alignment (marketplace.json) — HARD check, mirrors the
    # plugin.json block above. marketplace.json carries the version NESTED at
    # plugins[*].version (no top-level field), so it needs its own iteration.
    # Every plugins[] entry whose name == 'tapagents' (or, defensively, every
    # entry carrying a version) must match package.json#version. Drift _block()s.
    # This closes the gap where sync treats the .claude-plugin/ manifests as
    # target-orphans and never bumps marketplace.json — the operator now aligns
    # it via scripts/bump-manifest-versions.ts and this gate enforces the result.
    marketplace_path = _project_dir() / ".claude-plugin" / "marketplace.json"
    if marketplace_path.exists():
        try:
            marketplace_data = json.loads(marketplace_path.read_text())
            plugins = marketplace_data.get("plugins")
            if isinstance(plugins, list):
                for entry in plugins:
                    if not isinstance(entry, dict):
                        continue
                    if entry.get("name") not in ("tapagents", None):
                        # A differently-named plugin entry — not under this
                        # framework's version contract; skip it.
                        if entry.get("name") is not None:
                            continue
                    entry_version = entry.get("version")
                    if entry_version and entry_version != new_version:
                        _block(
                            f"Marketplace version drift: package.json is `{new_version}` but "
                            f".claude-plugin/marketplace.json plugin `{entry.get('name', '<unnamed>')}` "
                            f"is `{entry_version}`. Per protocols/versioning-protocol.md §6, these must "
                            f"match in the same commit. Run scripts/bump-manifest-versions.ts to align."
                        )
        except (json.JSONDecodeError, OSError):
            pass

    sys.exit(0)


def _check_tag(command: str) -> None:
    """Validate `git tag` commands target a SemVer-shaped tag matching package.json.

    Four invariants run here:
      - tag has 'v' prefix
      - tag/package version match
      - (existing checks above)
      - invariant 4 (NEW v0.24.0): tag is being applied on main, OR HEAD commit
        message contains a non-empty `[trunk-discipline-override: <reason>]`
        token. Mirrors publish.yml Layer A; this is the operator-side ceiling.
    """
    # Common shapes: `git tag v0.8.0` or `git tag -a v0.8.0 -m '...'`
    m = re.search(r"\bgit\s+tag\b(?:\s+-[a-zA-Z]+)*\s+(v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?)", command)
    if not m:
        # Not a versioned tag op (could be `git tag -l`, `git tag -d`, etc.)
        sys.exit(0)
    tag = m.group(1)
    if not tag.startswith("v"):
        _block(
            f"Tag `{tag}` must be prefixed with 'v' (e.g., `v0.8.0`). "
            f"Per protocols/versioning-protocol.md §5."
        )
    tag_version = tag[1:]
    pkg_version = _read_package_version()
    if pkg_version and pkg_version != tag_version:
        _block(
            f"Tag/package version mismatch: tag is `{tag}` (=> {tag_version}) but "
            f"package.json is `{pkg_version}`. The tag MUST be applied to the release commit "
            f"whose package.json holds the matching version."
        )

    # Invariant 4 — branch-discipline (trunk-must-reflect-published-state).
    # Per protocols/versioning-protocol.md §5 (amended v0.24.0) + commands/release.md
    # Layer B Step 8, tags must be applied to the merged-main commit, not to a
    # feature or release branch. Mirrors tap-agents/.github/workflows/publish.yml
    # Layer A as the operator-side ceiling under the CI mechanical floor.
    #
    # Bypass: HEAD commit's message contains
    # `[trunk-discipline-override: <non-empty reason>]` in its TRAILER BLOCK
    # (the section after the last blank line; mirrors git's Co-authored-by
    # placement). Tightened from "anywhere in message" to "trailer-only" in
    # v0.24.1 per workspace/_global/v0.24.1-layer-a-regex-fix-2026-05-19.md
    # after the v0.24.0 self-bypass dogfood incident — prose mentions of the
    # token form in the body (e.g., CHANGELOG documentation) no longer match.
    current_branch = _run_git("rev-parse", "--abbrev-ref", "HEAD")
    if current_branch and current_branch != "main":
        head_msg = _run_git("log", "-1", "--format=%B")
        override_reason = _extract_trunk_override_reason(head_msg) if head_msg else None
        if not override_reason:
            _block(
                f"Branch-discipline violation (invariant 4): tag `{tag}` is being "
                f"created on branch `{current_branch}`, not `main`.\n"
                f"\n"
                f"Per protocols/versioning-protocol.md §5 (amended v0.24.0) + "
                f"commands/release.md Layer B Step 8, tags must be applied to the "
                f"merged-main commit, not to a feature or release branch. The "
                f"publish.yml Layer A ancestry check would refuse to publish from "
                f"a non-main-ancestor tag anyway; this hook is the operator-side "
                f"ceiling that catches the failure before tag-push.\n"
                f"\n"
                f"Remediation (Layer B flow):\n"
                f"  1. Open a PR from your release branch to main\n"
                f"  2. `gh pr merge --squash --delete-branch`\n"
                f"  3. `git checkout main && git pull origin main`\n"
                f"  4. Retry `git tag -a {tag} -m \"Release {tag}\"`\n"
                f"\n"
                f"If this is a genuine hotfix where back-merge-first is "
                f"operationally infeasible, add\n"
                f"  [trunk-discipline-override: <non-empty reason>]\n"
                f"to the release commit's message (amend if needed) before retrying. "
                f"The override is logged to events.jsonl and visible in `gh release "
                f"view` once published.\n"
                f"\n"
                f"See: workspace/_global/trunk-discipline-tech-strategy-2026-05-19.md"
            )

    sys.exit(0)


def _check_package_edit(file_path: str) -> None:
    """Soft-check: Edit/Write on package.json should normally come from /release flow.

    We do NOT block direct edits — the strict invariants run at commit time. But we warn
    if the new content changes 'version' without an accompanying CHANGELOG.md edit in the
    same Claude session. The orchestrator should re-invoke /release if it got out of band.
    """
    # No-op for v1 — commit-time enforcement is sufficient and avoids false positives during
    # legitimate /release flows that touch package.json before CHANGELOG.md.
    sys.exit(0)


# --- entry point --------------------------------------------------------------


def main() -> None:
    global _HOOK_PAYLOAD, _TOOL_NAME
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        # Malformed payload — don't block tool use over a hook framing issue.
        sys.exit(0)

    tool_name = payload.get("tool_name") or payload.get("tool") or ""
    tool_input = payload.get("tool_input") or {}

    # Stash for _block() so telemetry emit can attach session_id + tool_name
    # without threading them through every check function signature.
    _HOOK_PAYLOAD = payload
    _TOOL_NAME = tool_name

    if tool_name == "Bash":
        command = tool_input.get("command", "")
        # Match `git commit`, `git commit -m ...`, etc.
        if re.search(r"\bgit\s+commit\b", command):
            _check_commit()
            return
        if re.search(r"\bgit\s+tag\b", command):
            _check_tag(command)
            return
        sys.exit(0)
        return

    if tool_name in ("Edit", "Write"):
        file_path = tool_input.get("file_path", "")
        if file_path.endswith("package.json") or "/.claude-plugin/" in file_path:
            _check_package_edit(file_path)
            return
        sys.exit(0)
        return

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture
        emit_misfire(
            source="version-gate",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
            session_id=_HOOK_PAYLOAD.get("session_id") if isinstance(_HOOK_PAYLOAD, dict) else None,
        )
        raise
