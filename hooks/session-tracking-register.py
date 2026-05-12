#!/usr/bin/env python3
"""
SessionStart hook — auto-register a session in active-sessions.md (BL-055).

Fires on every session start (startup / resume / clear / compact) alongside
the existing `session-start-brief.py` orchestrator-briefing hook. Both hooks
listen to the SessionStart event; ordering inside the chain doesn't matter
because their effects are independent (briefing emits stdout JSON,
registration writes to disk).

Per `protocols/session-coordination-protocol.md` Rule 1: every cross-cutting
session must have an `active-sessions.md` entry. The May 6 manual-discipline
version of this rule demonstrably failed (six days of zero new entries while
four concurrent feature branches collided on the v0.13.1 slot — see BL-055
provenance). This hook removes the manual step: every session start writes a
**stub** entry; subsequent cross-cutting edits materialize it; Stop seals it.

Stub contract:

    {
      "tapagents_session_id": "<YYYY-MM-DDTHH-MM>-pending-<hash>",
      "cc_session_id":        "<from-payload>",
      "started":              "<iso8601>",
      "scope":                "<auto — pending first cross-cutting edit>",
      "files_in_flight":      [],
      "status":               "in-progress",
      "last_updated":         "<iso8601>"
    }

The `tapagents_session_id` initial value carries `pending-<short-hash>`
because we don't yet know the scope; the PreToolUse hook upgrades the id
when the first cross-cutting edit lands (the scope-label from the matcher
becomes the suffix).

The stub is rendered to active-sessions.md immediately so a sibling Claude
Code instance can see the in-flight intent BEFORE any cross-cutting edit
fires. The cost is one extra "## pending-..." entry per session that does
no cross-cutting work — acceptable; the Stop hook prunes those (it skips
sealing an empty-files entry and surfaces it in the completion_note for
the rare case the operator did real work outside the cross-cutting scope).

Resume / compact behavior: on `source=resume` or `source=compact`, the
SessionStart hook fires again for the SAME Claude Code session_id. We
upsert (not duplicate) — if a sidecar already exists for this
cc_session_id, we leave it alone (preserves accumulated files_in_flight)
and just bump `last_updated`. A `resume_count` counter on the sidecar
tracks how many SessionStart events this session has seen, for forensic
debug.

Wired in: `.claude/settings.json` -> `hooks.SessionStart`.

Stdin payload (Claude Code SessionStart hook):
    { "source": "startup"|"resume"|"clear"|"compact",
      "session_id": "<uuid>", ... }

Output: empty stdout (briefing is the other SessionStart hook's job).
Exit 0 always — registration is best-effort, never blocking.

Telemetry: emits `session.tracking.auto_register` (subtype = source).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

# Telemetry — fail-open.
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _telemetry import emit_event, emit_misfire  # type: ignore[import-not-found]
except Exception:  # noqa: BLE001
    def emit_event(**_kwargs) -> None:  # type: ignore[no-redef]
        return

    def emit_misfire(**_kwargs) -> None:  # type: ignore[no-redef]
        return

# Shared session-tracking lib — fail-open.
try:
    from _session_tracking import (
        find_workspace,
        now_iso,
        now_session_id_token,
        read_sidecar,
        upsert_entry,
        write_sidecar,
    )
except Exception:  # noqa: BLE001
    def find_workspace():  # type: ignore[no-redef]
        return None

    def now_iso():  # type: ignore[no-redef]
        return ""

    def now_session_id_token():  # type: ignore[no-redef]
        return ""

    def read_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return None

    def upsert_entry(*_a, **_kw):  # type: ignore[no-redef]
        return False

    def write_sidecar(*_a, **_kw):  # type: ignore[no-redef]
        return False


def read_payload() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def _short_hash(cc_session_id: str) -> str:
    """Stable 6-char hash of the Claude Code session_id for the stub label.

    Different Claude Code sessions starting in the same minute would
    otherwise collide on `<YYYY-MM-DDTHH-MM>-pending`; this disambiguates.
    """
    if not cc_session_id:
        return "000000"
    h = hashlib.sha256(cc_session_id.encode("utf-8")).hexdigest()
    return h[:6]


def main() -> int:
    payload = read_payload()
    source = payload.get("source", "startup")
    cc_session_id = payload.get("session_id") or ""

    workspace = find_workspace()
    if workspace is None:
        # No workspace yet — pre-bootstrap session. Nothing to register.
        # Emit a single fire event so the absence is observable in telemetry.
        emit_event(
            source="session-tracking-register",
            type="fire",
            subtype="no-workspace",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={"summary": "no workspace dir; skipping registration"},
            session_id=cc_session_id or None,
        )
        return 0

    # Upsert: if sidecar already exists (resume/compact), bump last_updated +
    # increment resume_count, leave files_in_flight intact.
    existing = read_sidecar(workspace, cc_session_id)
    if existing is not None:
        existing["last_updated"] = now_iso()
        existing["resume_count"] = int(existing.get("resume_count") or 0) + 1
        existing["last_source"] = source
        write_sidecar(workspace, cc_session_id, existing)
        upsert_entry(workspace, existing)
        emit_event(
            source="session-tracking-register",
            type="fire",
            subtype=source if source in {"startup", "resume", "clear", "compact"} else "unknown",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            payload={
                "summary": f"resume of existing session {existing.get('tapagents_session_id')}",
                "resume_count": existing["resume_count"],
            },
            session_id=cc_session_id or None,
        )
        return 0

    # Fresh session — write a stub.
    token = now_session_id_token()
    suffix = f"pending-{_short_hash(cc_session_id)}"
    tapagents_id = f"{token}-{suffix}"
    started = now_iso()
    stub = {
        "tapagents_session_id": tapagents_id,
        "cc_session_id": cc_session_id,
        "started": started,
        "scope": "<auto — pending first cross-cutting edit>",
        "files_in_flight": [],
        "status": "in-progress",
        "last_updated": started,
        "resume_count": 0,
        "last_source": source,
    }
    write_sidecar(workspace, cc_session_id, stub)
    upsert_entry(workspace, stub)

    emit_event(
        source="session-tracking-register",
        type="fire",
        subtype=source if source in {"startup", "resume", "clear", "compact"} else "unknown",
        agent_context="orchestrator",
        agent_type=None,
        agent_id=None,
        payload={
            "summary": f"registered stub {tapagents_id}",
            "tapagents_session_id": tapagents_id,
        },
        session_id=cc_session_id or None,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        emit_misfire(
            source="session-tracking-register",
            error=type(e).__name__ + ": " + str(e)[:200],
            payload={},
        )
        # Re-raise so Claude Code sees a non-zero exit if Stop ever wants
        # to surface the misfire. The hook's primary effect (registration)
        # is already best-effort.
        raise
