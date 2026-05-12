#!/usr/bin/env python3
"""
emit-metric.py — append a structured framework event to framework-metrics.jsonl
                 AND (optionally) sync to the dashboard's PG-backed ingest endpoint.

The framework's observability layer: any Tier 1 / Tier 2 agent calls this
script when a canonical event happens. The script:

  1. Appends one JSON line to <framework-root>/.claude/memory/framework-metrics.jsonl
     — the LOCAL source of truth, used by the local-dev rollup script.

  2. (Tier 2, optional) POSTs the same event to the dashboard's
     /api/framework-metrics/ingest endpoint, where it lands in the
     framework_events PG table. The dashboard's reader prefers PG when
     available so the per-project panel + /admin/framework page render
     real data on Vercel.

The PG sync is BEST-EFFORT and gated on two env vars:
   - FRAMEWORK_METRICS_INGEST_URL    (e.g., http://localhost:3000/api/framework-metrics/ingest
                                        or https://your-vercel-url.app/api/...)
   - FRAMEWORK_METRICS_INGEST_SECRET (matches the dashboard env value)

If either is unset, the POST is skipped silently and JSONL-only behavior
continues (the original Tier 1 contract). A POST failure (network blip,
timeout, dashboard down, 5xx response) is logged to stderr but does NOT
fail the script — the JSONL write already succeeded.

USAGE FROM AN AGENT (Bash tool):
    python3 ~/path-to-framework/.claude/scripts/emit-metric.py \\
        --event agent.invoked \\
        --agent quality-engineer \\
        --project agent-dashboard \\
        --field trigger=scoping_phase \\
        --field artifact=workspace/agent-dashboard/test-plan.md

The script is intentionally minimal:
  - No external deps (Python stdlib only). Python 3 ships with macOS + Vercel
    runtime + most Linux distros — same constraint the existing hooks/
    scripts use. urllib.request handles the optional POST.
  - Append-only on the JSONL side. Never reads the JSONL back; agents that
    need rollups call the sibling rollup-metrics.py script.
  - No locking. JSONL append is atomic per-line on POSIX systems for writes
    < PIPE_BUF (4KB on Linux, 512B on older systems). Our events are well
    under that.
  - Refuses to emit if the framework root can't be located. Better to fail
    loudly than to silently lose events.

PRIVACY DISCIPLINE (per protocols/framework-metrics.md §4):
  Events MUST NOT include user PII, secrets, OAuth codes, encryption keys,
  full request bodies, or full artifact contents. Events DO include:
  structural metadata (agent name, project slug, phase, timestamp), counts,
  category labels, and stable identifiers (request-IDs, trace-IDs).
  Caller is responsible for sanitization; this script doesn't enforce it.
  The PG ingest endpoint enforces a top-level allowlist as defense-in-depth.

EXIT CODES:
  0 = JSONL append succeeded (PG sync may or may not have succeeded — see stderr)
  1 = framework root not found / metrics file unwritable / argument error

Per protocols/framework-metrics.md §3 (the emit primitive contract).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# PG sync timeout. Best-effort — script must not hang on a slow ingest
# endpoint. 2s is generous for a localhost POST and tight for a remote one.
INGEST_POST_TIMEOUT_SEC = 2.0


def post_to_ingest(record: dict) -> None:
    """
    Best-effort POST to the dashboard's framework-metrics ingest endpoint.

    Reads FRAMEWORK_METRICS_INGEST_URL + FRAMEWORK_METRICS_INGEST_SECRET
    from env. Skips silently if either is missing (Tier 1 / JSONL-only
    operators).

    Network failures + non-2xx responses are logged to stderr but do not
    raise — the JSONL write already succeeded; PG sync is opportunistic.
    """
    url = os.environ.get("FRAMEWORK_METRICS_INGEST_URL")
    secret = os.environ.get("FRAMEWORK_METRICS_INGEST_SECRET")
    if not url or not secret:
        return

    body = json.dumps(record, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=INGEST_POST_TIMEOUT_SEC) as resp:
            if resp.status >= 400:
                print(
                    f"emit-metric: ingest POST returned {resp.status} (event still in JSONL)",
                    file=sys.stderr,
                )
    except urllib.error.HTTPError as err:
        # 401 unauthorized = secret mismatch. 503 ingest_secret_not_configured
        # on the dashboard side. 400 bad_body = shape rejection. All are
        # surfaced to stderr so the operator can debug, but never fatal.
        print(
            f"emit-metric: ingest POST HTTP error {err.code}: {err.reason} (event still in JSONL)",
            file=sys.stderr,
        )
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        # Connection refused / timeout / network blip — common in local dev
        # when the dashboard isn't running. Silent in that case to avoid
        # noise on every emit.
        if os.environ.get("FRAMEWORK_METRICS_INGEST_VERBOSE"):
            print(
                f"emit-metric: ingest POST network error: {err} (event still in JSONL)",
                file=sys.stderr,
            )


def find_framework_root() -> Path:
    """
    Locate the framework root (.claude/) by walking upward from this script.
    The script lives at <root>/.claude/scripts/emit-metric.py — so the root
    is two levels up.
    """
    here = Path(__file__).resolve()
    candidate = here.parent.parent  # .claude/
    if candidate.name != ".claude" or not candidate.is_dir():
        raise SystemExit(
            f"emit-metric: expected to run from <framework-root>/.claude/scripts/, "
            f"but resolved to {here}. Cannot locate metrics file."
        )
    return candidate


def parse_field(raw: str) -> tuple[str, object]:
    """
    Parse a `key=value` argument. Values are interpreted in this order:
      1. JSON (so callers can pass numbers, booleans, lists, objects)
      2. Plain string fallback

    Examples:
      duration_ms=1234           → ("duration_ms", 1234)
      verdict=block              → ("verdict", "block")
      blocking=["a","b"]         → ("blocking", ["a", "b"])
      enabled=true               → ("enabled", True)
    """
    if "=" not in raw:
        raise SystemExit(f"emit-metric: --field expects key=value, got: {raw!r}")
    key, sep, value = raw.partition("=")
    key = key.strip()
    if not key:
        raise SystemExit(f"emit-metric: empty key in --field: {raw!r}")
    # Try JSON first; fall back to bare string.
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        parsed = value
    return key, parsed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Append a framework-metrics event to the JSONL log.",
        epilog=(
            "See protocols/framework-metrics.md for the canonical event "
            "taxonomy + privacy discipline."
        ),
    )
    parser.add_argument(
        "--event",
        required=True,
        help="Canonical event type (e.g., agent.invoked, critic.review).",
    )
    parser.add_argument(
        "--agent",
        required=False,
        help="Agent name emitting this event (e.g., quality-engineer).",
    )
    parser.add_argument(
        "--project",
        required=False,
        help="Project slug if event is project-scoped (e.g., agent-dashboard).",
    )
    parser.add_argument(
        "--field",
        action="append",
        default=[],
        help=(
            "Additional structured field as key=value. JSON-typed values "
            "supported. Can repeat: --field a=1 --field b=true."
        ),
    )

    args = parser.parse_args()

    # Build the event record. Required fields first (ts, event); optional
    # fields conditionally; structured user-fields merged last so they can
    # override (the JSONL consumer treats the first occurrence as canonical
    # if there's a collision, but we structure to avoid collisions here).
    record: dict[str, object] = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "event": args.event,
    }
    if args.agent:
        record["agent"] = args.agent
    if args.project:
        record["project"] = args.project

    for raw in args.field:
        key, value = parse_field(raw)
        # Don't allow user fields to clobber the reserved keys.
        if key in ("ts", "event", "agent", "project"):
            print(
                f"emit-metric: --field {key!r} collides with a reserved key; "
                f"choose a different name.",
                file=sys.stderr,
            )
            return 1
        record[key] = value

    # Locate the metrics file.
    try:
        root = find_framework_root()
    except SystemExit as err:
        print(err, file=sys.stderr)
        return 1

    metrics_path = root / "memory" / "framework-metrics.jsonl"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)

    line = json.dumps(record, ensure_ascii=False) + "\n"

    try:
        # Append in text mode with line-buffered I/O. POSIX guarantees
        # atomic single-line writes when the line is under PIPE_BUF; our
        # records are well under that.
        with open(metrics_path, "a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError as err:
        print(f"emit-metric: failed to append to {metrics_path}: {err}", file=sys.stderr)
        return 1

    # Tier 2 PG sync — best-effort, never fails the script.
    post_to_ingest(record)

    return 0


if __name__ == "__main__":
    sys.exit(main())
