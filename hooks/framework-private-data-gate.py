#!/usr/bin/env python3
"""
PreToolUse hook — framework private-data write guard (2026-06-02 remediation).

Layer 6 of the PreToolUse chain. BLOCKS a Write / Edit / NotebookEdit whose
proposed content would write a REAL private identifier into a framework file
that propagates to the public mirror. This is the third prevention layer behind
the sync-time `bare-codename` lint + `npm run verify-genericize` gate: it stops
the leak at AUTHORING time, before the bytes ever land on disk, so the operator
(or a subagent) is told to use a placeholder up front instead of relying on the
publish-time genericizer.

What it scans for (reuses the genericizer map as the single source of truth,
`scripts/sync-src/manifest.json5 → genericize`, + the secret-patterns):
  - bare project slugs (project_slugs)        → use `<project>`
  - compound slug identifiers (compound)       → use the rule's replacement
  - prod hosts (hosts, e.g. *.vercel.app)      → use `<deploy-url>`
  - Neon endpoint IDs (neon_endpoints)         → use `<neon-endpoint>`
  - private repo paths (repo_paths)            → use `<org>/<project>`
  - operator home path (runtime-derived)       → use `<framework-root>`
  - credential shapes (secret-patterns.ts)     → never commit a secret
  - the brand domain hq.tapintomymind.com is on the denylist as defense-in-depth

The operator home-path detector is DERIVED AT RUNTIME — `os.path.expanduser("~")`
plus the framework root computed from this file's own location (`__file__`). The
hook therefore carries NO verbatim operator path: at HQ the derivation reproduces
the operator's home (detection is behavior-preserved); in an adopter checkout the
manifest is not shipped (scripts/ is not in package.json#files) so the hook
fails open by design. Every other identifier is read from the manifest map at
runtime — so this hook bakes ONLY the public, protected strings
(`@tapintomymind/tap-agents`, `tapintomymind/tap-agents`, `hq.tapintomymind.com`),
all of which ship intact. Because it holds no private literal, the hook is graded
NORMALLY by the publish pipeline (no genericizer self-skip, no verify-genericize
self-skip) — the protected strings are allow-subtracted, the operator path is no
longer present, so the no-re-leak gate passes the file on its own merits.

NEVER blocks (false-positive guards):
  - the protected public package/repo name `@tapintomymind/tap-agents` /
    `tapintomymind/tap-agents` (masked out before scanning)
  - the genericize self-skip files (manifest.json5 + scripts/sync-src/*.ts) —
    they CARRY the codenames/rules by construction
  - files that are EXCLUDED from sync (per manifest exclude[]) or not in
    include[] — they never reach the public mirror, so a codename there is the
    operator's private working surface (e.g. memory/*, workspace/<slug>/*)
  - paths on manifest.genericize_exemptions
  - any file outside the framework HQ tree (Tier-2 project trees, etc.)
  - this hook editing ITSELF — it still carries the brand-domain DETECTOR literal
    (`_BRAND_DOMAIN`) by construction, so it stays on its own `_SELF_SKIP` so a
    self-edit does not trip the brand-domain detector. (This is the authoring-gate
    self-protection, distinct from the now-removed genericizer self-skip.)

Scope of FILE TYPES guarded: the genericizer scope set (.md/.py/.ts/.json/
.json5/.yml/.yaml).

Exit 0 = allow. Exit 2 = block with stderr naming the offending identifier +
the placeholder to use. Fail-OPEN on any internal error (a broken guard must
not wedge authoring) — the sync-time gates remain as the backstop.

Authenticity marker stderr lines (per hook-misdiagnosis-discipline.md):
    `Framework-private-data gate BLOCKED:`
    `TAPAGENTS_PRIVDATA_GATE_FIRED_V1`
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# Shared telemetry helper — fail-open import.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001 — fail-open telemetry import
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return


_HOOK_PAYLOAD: dict = {}
_TOOL_NAME: str = ""

# Genericizer scope (mirror of sync.ts GENERICIZE_SCOPE_EXT).
_SCOPE_EXT = re.compile(r"\.(md|py|ts|json|json5|yml|yaml)$")

# Files that legitimately carry codenames/rules by construction (mirror of
# sync.ts GENERICIZE_SELF_SKIP). Matched on the relative-POSIX path.
_SELF_SKIP = {
    "scripts/sync-src/secret-patterns.ts",
    "scripts/sync-src/sync.ts",
    "scripts/sync-src/sync.test.ts",
    "scripts/sync-src/verify-sync.ts",
    "scripts/sync-src/verify-genericize.ts",
    "scripts/sync-src/sync-codex.ts",
    "scripts/sync-src/manifest.json5",
    # This hook itself still carries DETECTOR literals by construction — the
    # brand-domain string (`_BRAND_DOMAIN`, which the authoring gate deliberately
    # does NOT protect-mask) and the secret-pattern regexes — so editing the hook
    # must not self-trip them. The operator home-path is no longer baked (it is
    # runtime-derived), so this entry is now an AUTHORING-GATE self-protection,
    # NOT a mirror of sync.ts GENERICIZE_SELF_SKIP: the hook was removed from the
    # genericizer self-skip (it holds no private literal) and is graded normally
    # by the publish pipeline. The other entries above DO mirror sync.ts.
    "hooks/framework-private-data-gate.py",
}

# Brand domain — on the denylist as defense-in-depth (matches the verify gate).
_BRAND_DOMAIN = "hq.tapintomymind.com"

# Always-protected substrings (never flagged). Masked out before scanning.
_PROTECT_DEFAULT = ["@tapintomymind/tap-agents", "tapintomymind/tap-agents"]


def _project_dir() -> Path:
    raw = os.environ.get("CLAUDE_PROJECT_DIR")
    if not raw:
        return Path.cwd()
    return Path(raw)


def _find_framework_root() -> Path | None:
    """Locate the framework HQ root (the dir containing scripts/sync-src/).

    The hook lives at <framework-root>/hooks/framework-private-data-gate.py, so
    the framework root is this file's parent's parent. Validate by checking for
    the sync manifest. Returns None if not found (then the hook fails open).
    """
    here = Path(__file__).resolve()
    candidate = here.parent.parent
    if (candidate / "scripts" / "sync-src" / "manifest.json5").exists():
        return candidate
    # Fallback: $CLAUDE_PROJECT_DIR/.claude
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        for c in (Path(env) / ".claude", Path(env)):
            if (c / "scripts" / "sync-src" / "manifest.json5").exists():
                return c
    return None


def _strip_json5_comments(text: str) -> str:
    """Best-effort JSON5 → JSON: strip // line comments and /* */ blocks, and
    trailing commas. Good enough to json.loads the manifest without a JSON5 dep
    (hooks are stdlib-only). Conservative: only strips // when not inside a
    string. Falls back are handled by the caller's try/except (fail-open)."""
    out = []
    i = 0
    n = len(text)
    in_str = False
    str_ch = ""
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == str_ch:
                in_str = False
            i += 1
            continue
        # not in string
        if c in ('"', "'"):
            in_str = True
            str_ch = c
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            # line comment — skip to EOL
            while i < n and text[i] != "\n":
                i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            # block comment — skip to */
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(c)
        i += 1
    joined = "".join(out)
    # Remove trailing commas before } or ]
    joined = re.sub(r",(\s*[}\]])", r"\1", joined)
    # Quote bare object keys (JSON5 allows unquoted identifier keys; json.loads
    # does not). Match an identifier immediately before a `:` that follows a
    # `{`, `,`, or line start. The manifest's keys are all simple identifiers.
    # This runs on the comment-stripped text; quoted-string values keep their
    # own quotes so a `"foo": "bar:baz"` value's inner colon is not a key.
    joined = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)', r'\1"\2"\3', joined)
    # Also handle a key at the very start (rare) — and keys after a newline that
    # the [{,] anchor missed because the preceding token was on a prior line.
    joined = re.sub(r'(^|\n)(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)', r'\1\2"\3"\4', joined)
    return joined


def _load_manifest(framework_root: Path) -> dict | None:
    path = framework_root / "scripts" / "sync-src" / "manifest.json5"
    try:
        raw = path.read_text(encoding="utf8")
        return json.loads(_strip_json5_comments(raw))
    except Exception:  # noqa: BLE001 — fail-open: a parse failure must not wedge authoring
        return None


def _glob_to_regex(glob: str) -> re.Pattern:
    pattern = glob[1:] if glob.startswith("!") else glob
    re_str = ""
    i = 0
    while i < len(pattern):
        c = pattern[i]
        if c == "*" and i + 1 < len(pattern) and pattern[i + 1] == "*":
            if i + 2 < len(pattern) and pattern[i + 2] == "/":
                re_str += "(?:.*/)?"
                i += 3
            else:
                re_str += ".*"
                i += 2
        elif c == "*":
            re_str += "[^/]*"
            i += 1
        elif c == "?":
            re_str += "[^/]"
            i += 1
        elif c == ".":
            re_str += "\\."
            i += 1
        elif c == "/" or re.match(r"[A-Za-z0-9_\-]", c):
            re_str += c
            i += 1
        else:
            re_str += "\\" + c
            i += 1
    return re.compile("^" + re_str + "$")


def _matches_any(path: str, patterns: list[str]) -> bool:
    matched = False
    for pat in patterns:
        negate = pat.startswith("!")
        if _glob_to_regex(pat).match(path):
            matched = not negate
    return matched


def _has_glob_chars(s: str) -> bool:
    return bool(re.search(r"[*?\[\]]", s))


def _in_sync_set(rel: str, manifest: dict) -> bool:
    include = manifest.get("include", []) or []
    exclude = manifest.get("exclude", []) or []
    explicit_include = any((not _has_glob_chars(p)) and p == rel for p in include)
    if not explicit_include and _matches_any(rel, exclude):
        return False
    if not _matches_any(rel, include) and not explicit_include:
        return False
    return True


def _rel_posix(abs_path: Path, framework_root: Path) -> str | None:
    """Relative-POSIX path of abs_path under framework_root, or None if outside."""
    try:
        rel = abs_path.resolve().relative_to(framework_root.resolve())
    except (ValueError, OSError):
        return None
    return rel.as_posix()


def _operator_home_paths(framework_root: Path | None) -> list[str]:
    """Derive the operator's home-path leak vectors AT RUNTIME — never a baked
    literal. Returns the absolute paths whose appearance in a synced file is the
    real operator-home leak. Two complementary derivations:

      1. The framework-root absolute path (from `__file__`, threaded in as
         `framework_root`). At HQ this resolves to exactly the value the manifest
         records as the operator home-path rule, so detection is behavior-
         preserved without the hook carrying the verbatim string.
      2. `os.path.expanduser("~")` — the current operator's home directory. This
         generalizes the detector to whichever user is authoring (operator at HQ,
         adopter in their own checkout) and stays correct if HQ ever moves.

    De-duplicated; empty/`/`-only candidates dropped (a degenerate `~` must never
    turn the detector into a match-everything regex)."""
    candidates: list[str] = []
    if framework_root is not None:
        candidates.append(str(framework_root))
    try:
        home = os.path.expanduser("~")
        if home and home != "~":
            candidates.append(home)
    except Exception:  # noqa: BLE001 — expanduser is best-effort; fail-open
        pass
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        c = c.rstrip("/")
        if not c or c == "" or seen.__contains__(c):
            continue
        seen.add(c)
        out.append(c)
    return out


def _build_detectors(manifest: dict, framework_root: Path | None) -> tuple[list[tuple[re.Pattern, str, str]], list[str]]:
    """Return (detectors, protect). Each detector is (compiled_regex, label,
    placeholder-hint). protect is the list of substrings to mask before scan."""
    g = manifest.get("genericize", {}) or {}
    detectors: list[tuple[re.Pattern, str, str]] = []

    for slug in g.get("project_slugs", []) or []:
        detectors.append((re.compile(r"\b" + re.escape(slug) + r"\b"), f"project slug '{slug}'", "<project>"))
    for r in g.get("compound", []) or []:
        detectors.append((re.compile(re.escape(r["find"])), f"compound id '{r['find']}'", r.get("replace", "<project>-…")))
    for r in g.get("hosts", []) or []:
        # find is regex source.
        detectors.append((re.compile(r["find"]), f"prod host /{r['find']}/", "<deploy-url>"))
    for r in g.get("neon_endpoints", []) or []:
        detectors.append((re.compile(re.escape(r["find"])), f"neon endpoint '{r['find']}'", "<neon-endpoint>"))
    for r in g.get("repo_paths", []) or []:
        detectors.append((re.compile(re.escape(r["find"])), f"private repo path '{r['find']}'", "<org>/<project>"))
    # Operator home-path. Derived at RUNTIME (framework-root-from-`__file__` +
    # expanduser("~")) — the hook carries NO verbatim operator path. Behavior is
    # preserved at HQ (the `__file__`-derived framework root equals the manifest's
    # operator home-path rule) and generalizes to the current operator. The bare-
    # username form stays unblocked at authoring time (it appears in author fields
    # legitimately); the home-PATH form is the real leak vector. See the manifest
    # `operator` rule for the publish-time genericizer counterpart.
    for home in _operator_home_paths(framework_root):
        detectors.append((re.compile(re.escape(home)), "operator home path", "<framework-root>"))
    # Brand domain — defense-in-depth (matches the verify gate denylist).
    detectors.append((re.compile(re.escape(_BRAND_DOMAIN)), f"brand domain '{_BRAND_DOMAIN}'", "(omit — ships only in the polished public README)"))

    protect = list(g.get("protect", []) or []) + _PROTECT_DEFAULT
    # The brand domain is on protect[] in the manifest (so the genericizer
    # leaves it alone), but at AUTHORING time we DO want to flag a new file
    # introducing it into a synced surface, so we deliberately do NOT add the
    # brand domain to the authoring-gate protect mask.
    protect = [p for p in protect if p != _BRAND_DOMAIN]
    return detectors, protect


def _scan_secrets(framework_root: Path, content: str) -> list[str]:
    """Reuse secret-patterns.ts via a regex re-derivation is brittle; instead we
    only run a SMALL high-signal subset here (the operator-identity + neon-conn +
    generic-postgres shapes most likely to be hand-typed). The full secret scan
    remains the sync-time HARD FAIL. Returns a list of hit labels."""
    hits: list[str] = []
    secret_res = [
        (re.compile(r"/Users/[a-z][a-z0-9_-]+/\.claude/projects/[^\"\s\)]+"), "operator auto-memory path"),
        (re.compile(r"\bpostgres(?:ql)?://[^@\s]+:[^@\s]+@[^/\s]+/[^\s'\"]+"), "postgres connection string with credentials"),
        (re.compile(r"\bnpm_[A-Za-z0-9]{30,}\b"), "npm token"),
        (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "github token"),
        (re.compile(r"sk-ant-[A-Za-z0-9_-]{40,}"), "anthropic api key"),
    ]
    for rx, label in secret_res:
        if rx.search(content):
            hits.append(label)
    return hits


def _extract_content(tool_name: str, tool_input: dict) -> str:
    """Pull the proposed-new content from the tool input per tool shape."""
    if tool_name == "Write":
        return str(tool_input.get("content", "") or "")
    if tool_name == "Edit":
        return str(tool_input.get("new_string", "") or "")
    if tool_name == "NotebookEdit":
        return str(tool_input.get("new_source", "") or "")
    return ""


def _block(message: str) -> None:
    sys.stderr.write("Framework-private-data gate BLOCKED:\n")
    sys.stderr.write(message + "\n")
    sys.stderr.write("TAPAGENTS_PRIVDATA_GATE_FIRED_V1\n")
    emit_event(
        source="framework-private-data-gate",
        type="block",
        subtype="private-identifier",
        agent_context="subagent" if (_HOOK_PAYLOAD.get("agent_id") or _HOOK_PAYLOAD.get("agent_type")) else "orchestrator",
        agent_type=_HOOK_PAYLOAD.get("agent_type"),
        agent_id=_HOOK_PAYLOAD.get("agent_id"),
        payload={"tool_name": _TOOL_NAME, "summary": message[:300]},
        session_id=_HOOK_PAYLOAD.get("session_id"),
    )
    sys.exit(2)


def main() -> None:
    global _HOOK_PAYLOAD, _TOOL_NAME
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    tool_name = payload.get("tool_name") or payload.get("tool") or ""
    tool_input = payload.get("tool_input") or {}
    _HOOK_PAYLOAD = payload
    _TOOL_NAME = tool_name

    if tool_name not in ("Write", "Edit", "NotebookEdit"):
        sys.exit(0)

    file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    if not file_path:
        sys.exit(0)

    framework_root = _find_framework_root()
    if framework_root is None:
        sys.exit(0)  # fail open — can't locate the framework tree

    rel = _rel_posix(Path(file_path), framework_root)
    if rel is None:
        sys.exit(0)  # outside the framework HQ tree (e.g. a Tier-2 project file)

    # Scope: only guard genericizer-scope file types.
    if not _SCOPE_EXT.search(rel):
        sys.exit(0)

    # Self-skip: files that carry codenames/rules by construction.
    if rel in _SELF_SKIP:
        sys.exit(0)

    manifest = _load_manifest(framework_root)
    if manifest is None:
        sys.exit(0)  # fail open — can't read the map

    # genericize_exemptions — file-scoped bypass.
    if rel in (manifest.get("genericize_exemptions", []) or []):
        sys.exit(0)

    # Only guard files that actually propagate to the public mirror. A codename
    # in an EXCLUDED file (memory/*, workspace/<slug>/*, etc.) is the operator's
    # private working surface and must NOT be blocked.
    if not _in_sync_set(rel, manifest):
        sys.exit(0)

    content = _extract_content(tool_name, tool_input)
    if not content:
        sys.exit(0)

    detectors, protect = _build_detectors(manifest, framework_root)

    # Mask protected substrings so they never trip a detector.
    scan = content
    for p in protect:
        scan = scan.replace(p, " ")

    findings: list[str] = []
    for rx, label, hint in detectors:
        if rx.search(scan):
            findings.append(f"  - {label}  → use placeholder {hint}")

    for secret_label in _scan_secrets(framework_root, scan):
        findings.append(f"  - {secret_label} (credential-shape; NEVER commit — also a sync HARD-FAIL)")

    if findings:
        # De-dup while preserving order.
        seen = set()
        uniq = []
        for f in findings:
            if f not in seen:
                seen.add(f)
                uniq.append(f)
        _block(
            f"`{rel}` propagates to the public mirror, and this {tool_name} would write real private data:\n"
            + "\n".join(uniq)
            + "\n\n"
            "Author clean — use the placeholder shown for each. The publish pipeline genericizes a\n"
            "KNOWN identifier set, but the framework discipline (CLAUDE.md 'Private-data discipline') is\n"
            "to author clean and never rely on the sweep. See scripts/sync-src/manifest.json5 → genericize.\n"
            "\n"
            "If this is a false positive (e.g. the file legitimately tracks slugs as content), add it to\n"
            "manifest.genericize_exemptions AND exclude[] — or, if it should not ship at all, exclude[] it."
        )

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — top-level misfire capture; fail open
        emit_misfire(
            source="framework-private-data-gate",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
            session_id=_HOOK_PAYLOAD.get("session_id") if isinstance(_HOOK_PAYLOAD, dict) else None,
        )
        # Fail open: a broken guard must not wedge authoring. The sync-time
        # bare-codename lint + verify-genericize remain the backstop.
        sys.exit(0)
