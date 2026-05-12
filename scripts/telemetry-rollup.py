#!/usr/bin/env python3
"""
telemetry-rollup.py — aggregate <workspace>/_global/events.jsonl into a
metrics-rollup.json that the dashboard consumes.

Distinct from `rollup-metrics.py` (which rolls up `memory/framework-metrics.jsonl`,
a different file/schema for `agent.invoked` / `qe.smoke` / `critic.review`
events). This script targets the BL-035 telemetry layer's events.jsonl —
the per-workspace hook-fire stream introduced in v0.10.0 and extended in
v0.11.0.

USAGE:
    # Roll up the current workspace's events.jsonl:
    python3 .claude/scripts/telemetry-rollup.py

    # Custom paths (testing / cross-workspace rollup):
    python3 .claude/scripts/telemetry-rollup.py \\
        --events /path/to/events.jsonl \\
        --misfires /path/to/misfires.jsonl \\
        --out /path/to/metrics-rollup.json

OUTPUT:
    <workspace>/_global/metrics-rollup.json — JSON with:
      - meta: { generated_at, events_total, misfires_total, sessions_count }
      - by_source: {<source>: count}
      - by_type: {<type>: count}
      - by_source_type: { "<source>/<type>": count }
      - classifier_distribution: { "<subtype>": count } for source=prompt-router
      - nudge_ignored: { "<subtype>": count } for source=prompt-router-feedback
      - dispatch_gate_trips: total orchestrator-dispatch-gate blocks across sessions
      - misfires_by_source: { "<source>": count }

No external deps — stdlib only. Same constraint as the hook telemetry it reads.
Under 150 LOC excluding the header.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def _find_workspace() -> Path | None:
    """Mirror of _telemetry._find_workspace() — keep in sync."""
    candidates: list[Path] = []
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        candidates.append(Path(env) / ".claude" / "workspace")
        candidates.append(Path(env) / "workspace")
    here = Path(__file__).resolve()
    scripts_dir = here.parent
    candidates.append(scripts_dir.parent / "workspace")
    candidates.append(scripts_dir.parent / ".claude" / "workspace")
    for c in candidates:
        try:
            if c.is_dir():
                return c
        except OSError:
            continue
    return None


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return out


def _rollup(events: list[dict], misfires: list[dict]) -> dict:
    """Build the aggregation dict. Pure function — no I/O."""
    by_source: Counter[str] = Counter()
    by_type: Counter[str] = Counter()
    by_source_type: Counter[str] = Counter()
    classifier_distribution: Counter[str] = Counter()
    nudge_ignored: Counter[str] = Counter()
    dispatch_gate_trips = 0
    sessions: set[str] = set()

    for ev in events:
        source = str(ev.get("source", "—"))
        type_ = str(ev.get("type", "—"))
        subtype = str(ev.get("subtype", "—"))
        session_id = ev.get("session_id")
        if isinstance(session_id, str) and session_id and session_id != "unknown":
            sessions.add(session_id)

        by_source[source] += 1
        by_type[type_] += 1
        by_source_type[f"{source}/{type_}"] += 1

        if source == "prompt-router" and type_ == "classify":
            classifier_distribution[subtype] += 1
        if source == "prompt-router-feedback" and type_ == "nudge_ignored":
            nudge_ignored[subtype] += 1
        if source == "orchestrator-dispatch-gate" and type_ == "block":
            dispatch_gate_trips += 1

    misfires_by_source: Counter[str] = Counter()
    for mf in misfires:
        misfires_by_source[str(mf.get("source", "—"))] += 1

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "events_total": len(events),
            "misfires_total": len(misfires),
            "sessions_count": len(sessions),
        },
        "by_source": dict(by_source),
        "by_type": dict(by_type),
        "by_source_type": dict(by_source_type),
        "classifier_distribution": dict(classifier_distribution),
        "nudge_ignored": dict(nudge_ignored),
        "dispatch_gate_trips": dispatch_gate_trips,
        "misfires_by_source": dict(misfires_by_source),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Roll up telemetry events.jsonl.")
    parser.add_argument("--events", default=None, help="Path to events.jsonl (default: auto-discover).")
    parser.add_argument("--misfires", default=None, help="Path to misfires.jsonl (default: sibling of events).")
    parser.add_argument("--out", default=None, help="Path for the rollup JSON (default: alongside events.jsonl).")
    parser.add_argument("--stdout", action="store_true", help="Print rollup to stdout instead of writing a file.")
    args = parser.parse_args()

    if args.events:
        events_path = Path(args.events)
        misfires_path = Path(args.misfires) if args.misfires else events_path.parent / "misfires.jsonl"
        out_path = Path(args.out) if args.out else events_path.parent / "metrics-rollup.json"
    else:
        workspace = _find_workspace()
        if workspace is None:
            print("telemetry-rollup: no workspace found (set CLAUDE_PROJECT_DIR or pass --events).", file=sys.stderr)
            return 1
        global_dir = workspace / "_global"
        events_path = global_dir / "events.jsonl"
        misfires_path = global_dir / "misfires.jsonl"
        out_path = global_dir / "metrics-rollup.json"

    events = _read_jsonl(events_path)
    misfires = _read_jsonl(misfires_path)
    rollup = _rollup(events, misfires)

    if args.stdout:
        json.dump(rollup, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(rollup, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as e:
        print(f"telemetry-rollup: write failed: {e}", file=sys.stderr)
        return 1
    print(f"telemetry-rollup: wrote {out_path} ({rollup['meta']['events_total']} events, {rollup['meta']['misfires_total']} misfires)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
