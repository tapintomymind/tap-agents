#!/usr/bin/env python3
"""
rollup-metrics.py — read framework-metrics.jsonl and produce summary stats.

Companion to emit-metric.py. Read by Org Designer (quarterly review) and EA
(weekly briefing). Both consumers want different time windows + different
groupings; the script supports both via flags.

USAGE:
    # EA's weekly briefing — last 7 days, grouped by agent + event:
    python3 .claude/scripts/rollup-metrics.py --window 7d --group-by agent,event

    # Org Designer's quarterly review — last 90 days, full breakdown:
    python3 .claude/scripts/rollup-metrics.py --window 90d --full

    # Per-project drill-down:
    python3 .claude/scripts/rollup-metrics.py --project tapagents-app --window 30d

OUTPUT:
    Markdown table by default (so it pastes cleanly into briefings /
    reportbacks). JSON output via --format=json for further processing.

NO EXTERNAL DEPS:
    Stdlib only — same constraint as emit-metric.py.

LIMITATIONS:
    - Loads the full JSONL into memory. At expected event volumes (a few
      thousand per quarter) this is fine; if the log grows past ~1M lines
      switch to a streaming aggregator.
    - No time-series visualization. Caller pipes the JSON output into
      whatever tool they want (matplotlib, gnuplot, jq + spark, etc.).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


def find_framework_root() -> Path:
    here = Path(__file__).resolve()
    candidate = here.parent.parent
    if candidate.name != ".claude" or not candidate.is_dir():
        raise SystemExit(
            f"rollup-metrics: expected <framework-root>/.claude/scripts/, got {here}"
        )
    return candidate


def parse_window(spec: str) -> timedelta:
    """Parse '7d', '90d', '24h', '4w' into a timedelta."""
    if not spec:
        raise SystemExit("--window required (e.g., 7d, 90d, 24h)")
    unit = spec[-1].lower()
    try:
        n = int(spec[:-1])
    except ValueError:
        raise SystemExit(f"rollup-metrics: bad window: {spec!r}")
    if unit == "d":
        return timedelta(days=n)
    if unit == "w":
        return timedelta(weeks=n)
    if unit == "h":
        return timedelta(hours=n)
    raise SystemExit(f"rollup-metrics: unknown window unit: {unit!r}")


def load_events(path: Path) -> list[dict]:
    if not path.exists():
        return []
    events: list[dict] = []
    with open(path, encoding="utf-8") as fh:
        for line_num, raw in enumerate(fh, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                events.append(json.loads(raw))
            except json.JSONDecodeError as err:
                print(
                    f"rollup-metrics: skipping malformed line {line_num}: {err}",
                    file=sys.stderr,
                )
    return events


def filter_events(
    events: Iterable[dict],
    *,
    window: timedelta | None,
    project: str | None,
) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - window if window else None
    out: list[dict] = []
    for ev in events:
        if cutoff is not None:
            ts_raw = ev.get("ts")
            if not isinstance(ts_raw, str):
                continue
            try:
                ts = datetime.fromisoformat(ts_raw)
            except ValueError:
                continue
            # Normalize naive timestamps to UTC for comparison.
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts < cutoff:
                continue
        if project is not None and ev.get("project") != project:
            continue
        out.append(ev)
    return out


def render_markdown(
    events: list[dict],
    *,
    group_by: list[str],
    window_label: str,
    project: str | None,
) -> str:
    if not events:
        scope = f"project={project}, " if project else ""
        return f"# Framework metrics rollup\n\n{scope}window={window_label}\n\n_No events in window._\n"

    # Build the grouped count.
    groups: Counter[tuple[str, ...]] = Counter()
    for ev in events:
        key = tuple(str(ev.get(field, "—")) for field in group_by)
        groups[key] += 1

    # Sort by count desc, then by key.
    rows = sorted(groups.items(), key=lambda kv: (-kv[1], kv[0]))

    out: list[str] = []
    scope = f" — project: `{project}`" if project else ""
    out.append(f"# Framework metrics rollup{scope}")
    out.append("")
    out.append(f"**Window:** last {window_label}  \\\n**Total events:** {len(events)}")
    out.append("")
    out.append("| " + " | ".join(group_by + ["count"]) + " |")
    out.append("|" + "|".join(["---"] * (len(group_by) + 1)) + "|")
    for key, count in rows:
        cells = list(key) + [str(count)]
        out.append("| " + " | ".join(cells) + " |")

    # Top-level event-type summary (always useful regardless of group_by).
    if "event" not in group_by:
        out.append("")
        out.append("## Event-type breakdown")
        out.append("")
        event_counter = Counter(str(ev.get("event", "—")) for ev in events)
        out.append("| event | count |")
        out.append("|---|---|")
        for ev_type, count in event_counter.most_common():
            out.append(f"| {ev_type} | {count} |")

    return "\n".join(out) + "\n"


def render_full(events: list[dict], *, window_label: str) -> str:
    """
    Full Org-Designer-quarterly view: per-project + per-agent + per-event
    cross-tab, plus anomaly heuristics.
    """
    if not events:
        return f"# Framework metrics — full rollup\n\nwindow={window_label}\n\n_No events._\n"

    out: list[str] = []
    out.append(f"# Framework metrics — full rollup ({window_label})")
    out.append("")
    out.append(f"**Total events:** {len(events)}")
    out.append("")

    # Per-project event volume.
    by_project: Counter[str] = Counter(str(ev.get("project", "<framework>")) for ev in events)
    out.append("## Per-project event volume")
    out.append("")
    out.append("| project | events |")
    out.append("|---|---|")
    for proj, count in by_project.most_common():
        out.append(f"| {proj} | {count} |")
    out.append("")

    # Per-agent invocation count (filter to agent.invoked).
    by_agent: Counter[str] = Counter(
        str(ev.get("agent", "—"))
        for ev in events
        if ev.get("event") == "agent.invoked" and ev.get("agent")
    )
    out.append("## Agent invocation frequency")
    out.append("")
    if by_agent:
        out.append("| agent | invocations |")
        out.append("|---|---|")
        for agent, count in by_agent.most_common():
            out.append(f"| {agent} | {count} |")
    else:
        out.append("_No `agent.invoked` events in window._")
    out.append("")

    # Critic blocks vs passes (signal of review-axis health).
    critic_events = [ev for ev in events if ev.get("event") == "critic.review"]
    if critic_events:
        verdict_counter: Counter[str] = Counter(
            str(ev.get("verdict", "—")) for ev in critic_events
        )
        out.append("## Critic verdict distribution")
        out.append("")
        out.append("| verdict | count |")
        out.append("|---|---|")
        for verdict, count in verdict_counter.most_common():
            out.append(f"| {verdict} | {count} |")
        out.append("")

    # QE smoke pass/fail signal.
    qe_events = [ev for ev in events if ev.get("event") == "qe.smoke"]
    if qe_events:
        out.append("## QE smoke runs")
        out.append("")
        out.append("| project | result | blocking_findings | timestamp |")
        out.append("|---|---|---|---|")
        for ev in qe_events[-10:]:  # most recent 10
            out.append(
                f"| {ev.get('project', '—')} | {ev.get('result', '—')} | "
                f"{ev.get('blocking_findings', '—')} | {ev.get('ts', '—')} |"
            )
        out.append("")

    # Anomaly heuristics — surface "no QE smoke in 30+ days for project X" etc.
    out.append("## Anomalies")
    out.append("")
    last_qe_per_project: dict[str, str] = defaultdict(lambda: "never")
    for ev in events:
        if ev.get("event") == "qe.smoke" and ev.get("project"):
            last_qe_per_project[str(ev["project"])] = str(ev.get("ts", "—"))
    if last_qe_per_project:
        out.append("Last QE smoke per project:")
        out.append("")
        for proj, ts in sorted(last_qe_per_project.items()):
            out.append(f"- `{proj}` — {ts}")
    out.append("")

    return "\n".join(out) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Roll up framework-metrics events.")
    parser.add_argument(
        "--window", default="90d", help="Time window: 7d, 30d, 90d, etc."
    )
    parser.add_argument(
        "--project",
        default=None,
        help="Optional project slug filter.",
    )
    parser.add_argument(
        "--group-by",
        default="event",
        help="Comma-separated fields to group by (e.g., agent,event). Default: event.",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Org Designer's quarterly-review shape: per-project + per-agent + verdicts + anomalies.",
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "json"],
        default="markdown",
        help="Output format. JSON is the raw filtered events.",
    )

    args = parser.parse_args()

    root = find_framework_root()
    metrics_path = root / "memory" / "framework-metrics.jsonl"

    events = load_events(metrics_path)
    window_td = parse_window(args.window)
    filtered = filter_events(events, window=window_td, project=args.project)

    if args.format == "json":
        json.dump(filtered, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    if args.full:
        sys.stdout.write(render_full(filtered, window_label=args.window))
    else:
        group_by = [g.strip() for g in args.group_by.split(",") if g.strip()]
        sys.stdout.write(
            render_markdown(
                filtered,
                group_by=group_by,
                window_label=args.window,
                project=args.project,
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
