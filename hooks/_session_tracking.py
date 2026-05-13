"""
Shared helpers for the session-tracking hook stack (BL-055).

The three hooks (`session-tracking-register.py` SessionStart,
`session-tracking-files.py` PreToolUse, `session-tracking-seal.py` Stop)
all need to:

  - Locate the framework workspace (`.claude/workspace/`)
  - Read & write `<workspace>/_global/active-sessions.md` as a typed YAML-ish
    block-list (the schema in `protocols/session-coordination-protocol.md` Rule 1)
  - Persist/lookup the binding between **Claude Code's `session_id`** (from
    each hook's stdin payload — stable across orchestrator + all subagent
    dispatches inside one Claude Code instance) and the **TapAgents
    session-id** (`<YYYY-MM-DDTHH-MM>-<scope>`) we write into the manifest.

Subagent attribution: the empirical finding (architect dispatch, 2026-05-12)
is that env-inheritance through Agent dispatches is structurally impossible —
hook scripts are subprocesses; their `os.environ` mutations die when the
subprocess exits and don't propagate to Claude Code's main process, let alone
to a forked subagent context. Path (a) "set TAPAGENTS_SESSION_ID env"
therefore CANNOT work.

Path (b), the chosen approach: persist the binding to disk keyed by
`payload.session_id` (Claude Code's own session identifier, present in every
hook payload's stdin JSON). The existing `stop-dispatch-monitor.py` already
relies on this — it thresholds dispatch-gate blocks WITHIN one session,
counting orchestrator + subagent events that share `payload.session_id`. So
this is the same primitive at a different layer.

Sidecar layout:

    <workspace>/_global/sessions/<cc_session_id>.json

Schema:

    {
      "tapagents_session_id":  "<YYYY-MM-DDTHH-MM>-<scope>",
      "cc_session_id":         "<from-payload>",
      "started":               "<iso8601-z>",
      "scope":                 "<auto — pending first cross-cutting edit> | <one-line>",
      "files_in_flight":       ["<path>", ...],
      "status":                "in-progress" | "sealed" | "partial",
      "last_updated":          "<iso8601-z>",
      "auto_*":                 (filled by Stop hook when sealing)
    }

Two writers: SessionStart materializes the sidecar; PreToolUse mutates
`files_in_flight` + `scope` + `last_updated`; Stop reads to decide auto-seal
and writes the final fields. The active-sessions.md text manifest is a
formatted PROJECTION of these sidecars — the JSON sidecar is the source of
truth (avoids reparsing YAML-ish blocks under concurrent writes).

Schema-version contract: the sidecar carries a `schema_version` integer
(`SCHEMA_VERSION` constant below). Bump on schema-breaking changes. Future
hooks that find sidecars with mismatched versions should warn + skip rather
than corrupt them.

Cross-cutting scope: `is_cross_cutting_path()` matches the path against
`protocols/session-coordination-protocol.md §31-46`. The PreToolUse hook
calls this to decide whether the edit triggers registration. Non-cross-
cutting paths (project `src/`, single-project workspace artifacts) are
intentionally ignored to keep the manifest's signal-to-noise high.

Fail-open contract: every public function in this module catches all
exceptions and returns a sentinel (None / False / empty). Session-tracking
is best-effort; broken state never blocks the hook chain.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# Bump on schema-breaking changes. Future hooks reading older sidecars
# should warn + skip rather than corrupt them.
SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# Workspace discovery (mirrors _telemetry.py)
# ---------------------------------------------------------------------------

def find_workspace() -> Path | None:
    """Locate the active workspace/ dir across both Tier 1 / Tier 2 layouts.

    Mirrors `_telemetry._find_workspace()`. If we ever diverge from
    `_telemetry`, fix both files in one commit.
    """
    candidates: list[Path] = []
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        candidates.append(Path(env) / ".claude" / "workspace")
        candidates.append(Path(env) / "workspace")
    here = Path(__file__).resolve()
    hooks_dir = here.parent
    candidates.append(hooks_dir.parent / "workspace")
    candidates.append(hooks_dir.parent / ".claude" / "workspace")
    for c in candidates:
        try:
            if c.is_dir():
                return c
        except OSError:
            continue
    return None


# ---------------------------------------------------------------------------
# Sidecar I/O — the source of truth for session state
# ---------------------------------------------------------------------------

def sessions_dir(workspace: Path) -> Path | None:
    """Return `<workspace>/_global/sessions/`, creating it if missing.

    Returns None on any failure — caller is fail-open.
    """
    try:
        d = workspace / "_global" / "sessions"
        d.mkdir(parents=True, exist_ok=True)
        return d
    except OSError:
        return None


def _safe_session_filename(cc_session_id: str) -> str:
    """Sanitize a Claude Code session_id into a safe filename basename.

    Claude Code session_ids are typically UUIDs; this is belt+suspenders for
    forward-compat if the format changes. Keeps alnum, dash, underscore.
    """
    safe = "".join(ch for ch in cc_session_id if ch.isalnum() or ch in "-_")
    return safe[:128] or "unknown"


def sidecar_path(workspace: Path, cc_session_id: str) -> Path | None:
    """Return the sidecar JSON path for a given Claude Code session_id."""
    sd = sessions_dir(workspace)
    if sd is None:
        return None
    return sd / (_safe_session_filename(cc_session_id) + ".json")


def read_sidecar(workspace: Path, cc_session_id: str) -> dict | None:
    """Read the sidecar JSON; return parsed dict or None if missing/invalid.

    A sidecar with mismatched `schema_version` is treated as missing — the
    hook should not mutate cross-version state without an explicit migration.
    """
    p = sidecar_path(workspace, cc_session_id)
    if p is None or not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("schema_version") != SCHEMA_VERSION:
        return None
    return data


def write_sidecar(workspace: Path, cc_session_id: str, data: dict) -> bool:
    """Write the sidecar JSON atomically (temp-file + rename).

    Returns True on success, False on any failure. Fail-open caller pattern.
    """
    p = sidecar_path(workspace, cc_session_id)
    if p is None:
        return False
    data = dict(data)
    data["schema_version"] = SCHEMA_VERSION
    tmp = p.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        os.replace(tmp, p)
        return True
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return False


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    """UTC ISO-8601 with Z suffix. Matches `_telemetry._now_iso()`."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_session_id_token() -> str:
    """`<YYYY-MM-DDTHH-MM>` portion — filename-safe (hyphens, not colons)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M")


# ---------------------------------------------------------------------------
# Cross-cutting scope matcher (protocol §31-46)
# ---------------------------------------------------------------------------

# Regex-based matching against the path string. The matcher MUST be tolerant
# of how the path is supplied — Claude Code's PreToolUse passes a `file_path`
# field that may be absolute (`/Users/.../App Development/.claude/...`) OR
# repo-relative (`.claude/protocols/foo.md`). The protocol's scope list is
# written in repo-relative shape with a `.claude/` prefix; we normalize by
# stripping any prefix up to and including the LAST `.claude/` segment.
#
# Patterns are ordered by frequency-of-edit so the common cases hit fast.
# Each entry: (pattern, reason-label). The label flows into the
# telemetry event subtype + the auto-stub `scope` line.
_CROSS_CUTTING_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Memory files — shared lessons-learned / patterns / runtime gotchas.
    # Pattern matches anything under .claude/memory/ except node_modules.
    (re.compile(r"\.claude/memory/.+\.md$"), "memory"),
    # Backlog (cross-cutting per backlog-protocol)
    (re.compile(r"\.claude/memory/backlog\.md$"), "backlog"),
    (re.compile(r"\.claude/workspace/_global/backlog\.json$"), "backlog"),
    # Agent contracts, including _planned/
    (re.compile(r"\.claude/agents/(?:_planned/)?[^/]+\.md$"), "agent-contract"),
    # Protocols
    (re.compile(r"\.claude/protocols/[^/]+\.md$"), "protocol"),
    # Templates
    (re.compile(r"\.claude/templates/[^/]+\.md$"), "template"),
    # CHANGELOG (framework)
    (re.compile(r"\.claude/CHANGELOG\.md$"), "changelog"),
    # Cross-cutting plan files under any project's .claude/docs/
    (re.compile(r"\.claude/docs/[^/]+\.md$"), "cross-cutting-plan"),
    # Decision packets
    (re.compile(r"\.claude/workspace/[^/]+/decision-packet-[^/]+\.md$"), "decision-packet"),
]


def is_cross_cutting_path(file_path: str) -> tuple[bool, str | None]:
    """Decide if a PreToolUse target path is cross-cutting per protocol §31-46.

    Returns (True, reason_label) when the path matches; (False, None) otherwise.
    Used by the PreToolUse hook to gate registration — non-cross-cutting
    edits (project `src/`, single-project workspace artifacts) SHOULD NOT
    trigger session-tracking entries.

    Path-format tolerance: this matcher works against absolute paths
    (`/Users/.../App Development/.claude/foo`) and repo-relative paths
    (`.claude/foo`) equivalently — the regex anchors on the `.claude/`
    segment, which is unique enough across both layouts that false-
    positives across sibling workspaces are vanishingly rare.
    """
    if not isinstance(file_path, str) or not file_path:
        return (False, None)
    # Normalize: drop any prefix up to the LAST .claude/ occurrence. This
    # collapses `/Users/.../.claude/foo` and `.claude/foo` and
    # `.claude/.claude/foo` (defensive) into a stable `.claude/foo` shape.
    idx = file_path.rfind(".claude/")
    if idx >= 0:
        normalized = file_path[idx:]
    else:
        # Not under any .claude/ directory — not cross-cutting in our model.
        # (Memory files, agent contracts, protocols, etc. are ALL .claude/-rooted.)
        return (False, None)
    for pattern, label in _CROSS_CUTTING_PATTERNS:
        if pattern.search(normalized):
            return (True, label)
    return (False, None)


# ---------------------------------------------------------------------------
# active-sessions.md rendering (projection of sidecars)
# ---------------------------------------------------------------------------

# Header block kept identical to the existing file so the projection doesn't
# disturb human-curated front-matter. The hook stack only ever appends to /
# updates entries in the "Active entries" section; it does NOT rewrite the
# header or sealed-archive sections.

_ACTIVE_SESSIONS_HEADER = """# Active Sessions

Sessions currently working in this workspace. Per `protocols/session-coordination-protocol.md` rule 1: all sessions touching cross-cutting workspace files MUST read this file before editing and append/update their own entry.

## Format

```yaml
## <session-id>
started: <ISO datetime>
scope: <one sentence — what this session is doing>
files_in_flight:
  - <relative path from workspace root>
  - <relative path>
status: in-progress | sealed | paused
last_updated: <ISO datetime>
completion_note: <optional, on sealing>
```

**Session-id format:** `<YYYY-MM-DDTHH-MM>-<short-scope>` (hyphens in time portion to keep filename-safe). Examples:

- `2026-05-06T14-30-v15-phase0`
- `2026-05-06T11-30-uiux-activation`
- `2026-05-06T15-33-bl013-multiuser-security`

**Update** the `last_updated` field whenever work transitions, or every ~20-30 min during in-flight work.

**Seal** when done: change `status` to `sealed`, add `completion_note: <one-line>`, do NOT delete. Sealed entries stay as historical record; quarterly cleanup prunes entries older than 30 days.

---

## Active entries

(In-flight sessions appear below this line. Newest at top. Sealed entries fall through to the next section.)

"""


def active_sessions_path(workspace: Path) -> Path:
    return workspace / "_global" / "active-sessions.md"


def render_entry(data: dict) -> str:
    """Render one sidecar dict into the manifest's YAML-ish block format.

    Mirrors the existing entries (rule 1 schema) so a manual reader sees
    the same shape, whether human-authored or auto-emitted.
    """
    lines: list[str] = []
    lines.append(f"## {data.get('tapagents_session_id', 'unknown')}")
    lines.append(f"started: {data.get('started', '?')}")
    lines.append(f"scope: {data.get('scope', '?')}")
    lines.append("files_in_flight:")
    files = data.get("files_in_flight") or []
    if not files:
        lines.append("  []")
    else:
        for f in files:
            lines.append(f"  - {f}")
    lines.append(f"status: {data.get('status', 'in-progress')}")
    lines.append(f"last_updated: {data.get('last_updated', '?')}")
    if data.get("completion_note"):
        lines.append(f"completion_note: {data['completion_note']}")
    # Auto-seal fields, only if present
    for key in ("auto_sealed", "auto_seal_merge", "auto_seal_outcome"):
        if data.get(key):
            lines.append(f"{key}: {data[key]}")
    if data.get("auto_seal_files"):
        lines.append("auto_seal_files:")
        for f in data["auto_seal_files"]:
            lines.append(f"  - {f}")
    lines.append("auto_emitted: true")
    lines.append("")
    return "\n".join(lines)


def _read_manifest_text(workspace: Path) -> str:
    """Read the manifest; bootstrap with the standard header if missing."""
    p = active_sessions_path(workspace)
    if not p.exists():
        return _ACTIVE_SESSIONS_HEADER
    try:
        return p.read_text()
    except OSError:
        return _ACTIVE_SESSIONS_HEADER


# Marker regex that lets us find an existing auto-emitted entry for a given
# tapagents_session_id. We delimit auto-emitted entries with HTML comments so
# the in-place update is robust against varied whitespace/formatting between
# human-authored and auto-emitted entries.
def _entry_marker(tapagents_id: str) -> tuple[str, str]:
    return (
        f"<!-- session-tracking:auto-entry:{tapagents_id}:begin -->",
        f"<!-- session-tracking:auto-entry:{tapagents_id}:end -->",
    )


def upsert_entry(workspace: Path, data: dict) -> bool:
    """Insert-or-update an auto-emitted entry in active-sessions.md.

    The entry is wrapped in HTML-comment sentinels keyed by
    `tapagents_session_id` so subsequent updates replace the same block in
    place. Newly created entries are inserted right after the `## Active
    entries` header (newest-at-top per the file's documented convention).

    Returns True on success, False on any failure.
    """
    tapagents_id = data.get("tapagents_session_id")
    if not tapagents_id:
        return False
    begin, end = _entry_marker(tapagents_id)
    rendered = render_entry(data)
    block = f"{begin}\n{rendered}{end}\n\n"

    text = _read_manifest_text(workspace)

    # Replace-in-place if marker pair exists.
    pattern = re.compile(
        re.escape(begin) + r".*?" + re.escape(end) + r"\n*",
        re.DOTALL,
    )
    if pattern.search(text):
        new_text = pattern.sub(block, text, count=1)
    else:
        # Insert after the "## Active entries" header. The header line +
        # the parenthetical caption follow.
        anchor = "## Active entries\n\n(In-flight sessions appear below this line. Newest at top. Sealed entries fall through to the next section.)\n\n"
        if anchor in text:
            new_text = text.replace(anchor, anchor + block, 1)
        else:
            # No anchor found — append at end as a safe fallback rather than
            # silently dropping the entry.
            sep = "" if text.endswith("\n") else "\n"
            new_text = text + sep + block

    p = active_sessions_path(workspace)
    tmp = p.with_suffix(p.suffix + ".tmp")
    try:
        tmp.write_text(new_text)
        os.replace(tmp, p)
        return True
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return False


# ---------------------------------------------------------------------------
# Git helpers (for the Stop hook's auto-seal decision)
# ---------------------------------------------------------------------------

def _project_dir() -> Path:
    raw = os.environ.get("CLAUDE_PROJECT_DIR")
    return Path(raw) if raw else Path.cwd()


def files_landed_on_main_since(started_iso: str) -> set[str]:
    """Return set of file paths that landed on `main` since `started_iso`.

    The Stop hook uses this to decide auto-seal: an entry's
    `files_in_flight` is sealed iff all listed paths appear in the returned
    set. We list only `main` because the protocol's auto-seal contract is
    explicit: shipping = merged-to-main.

    Returns an empty set on any failure (git not installed, not a repo,
    timeouts) — fail-open: a Stop hook that can't reach git just leaves the
    entry in-progress.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(_project_dir()), "log", f"--since={started_iso}",
             "--name-only", "--pretty=format:", "main"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return set()
        paths = {
            line.strip()
            for line in result.stdout.splitlines()
            if line.strip()
        }
        return paths
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return set()


def latest_main_sha() -> str | None:
    """Return the current `main` HEAD SHA (short form), or None on failure.

    Used by the Stop hook's `auto_seal_merge` field. "Latest main" is the
    coarser-but-correct attribution: the precise merge commit per file is
    expensive to compute and the protocol's existing auto-seal shape
    (used by promote-to-prod.sh) is content with "the SHA the seal saw."
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(_project_dir()), "rev-parse", "--short", "main"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        sha = result.stdout.strip()
        return sha or None
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


# ---------------------------------------------------------------------------
# Path-normalization helper for files_in_flight entries
# ---------------------------------------------------------------------------

def normalize_for_manifest(file_path: str, workspace: Path) -> str:
    """Convert an absolute path into the repo-relative shape the manifest expects.

    Per `protocols/session-coordination-protocol.md` Rule 1 path-format
    contract: `files_in_flight` entries MUST be full repo-relative paths
    from the framework workspace root (the directory containing `.claude/`).
    Basenames-alone are forbidden — the auto-seal matcher needs path
    precision to avoid cross-monorepo false-positives.

    Strategy: anchor on `.claude/` — if the path contains it, the relative
    path is `.claude/...`. Otherwise return the input unchanged (the caller
    is supplying an already-relative path, or a path the matcher won't
    auto-seal anyway).
    """
    if not isinstance(file_path, str) or not file_path:
        return file_path
    idx = file_path.rfind(".claude/")
    if idx >= 0:
        return file_path[idx:]
    return file_path
