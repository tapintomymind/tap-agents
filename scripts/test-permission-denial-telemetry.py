#!/usr/bin/env python3
"""Focused coverage for permission-denial telemetry privacy/classification."""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOKS_DIR = ROOT / "hooks"
sys.path.insert(0, str(HOOKS_DIR))

from _telemetry import _command_shape, emit_harness_block  # noqa: E402


def _load_permission_denial_capture():
    path = HOOKS_DIR / "permission-denial-capture.py"
    spec = importlib.util.spec_from_file_location("permission_denial_capture", path)
    if spec is None or spec.loader is None:
        raise AssertionError("could not load permission-denial-capture.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _assert_secret_absent(value: object) -> None:
    text = json.dumps(value, sort_keys=True)
    forbidden = (
        "opensesame",
        "postgres://user:pass@localhost/db",
        "anthropic-secret",
        "OPENAI_API_KEY=opensesame",
        "DATABASE_URL=postgres://user:pass@localhost/db",
        "ANTHROPIC_API_KEY=anthropic-secret",
    )
    for needle in forbidden:
        if needle in text:
            raise AssertionError(f"secret leaked into telemetry: {needle}")


def test_command_shape_env_prefixes() -> None:
    cases = {
        "OPENAI_API_KEY=opensesame npm run dev": "npm <arg> <arg>",
        "DATABASE_URL=postgres://user:pass@localhost/db npx drizzle-kit push": "npx <arg> <arg>",
        "ANTHROPIC_API_KEY=anthropic-secret python3 -m pytest": "python3 -m <arg>",
        "OPENAI_API_KEY=opensesame DATABASE_URL=postgres://user:pass@localhost/db npm test": "npm <arg>",
        "DATABASE_URL= npm test": "npm <arg>",
        "OPENAI_API_KEY=opensesame": "<env-only>",
    }
    for command, expected in cases.items():
        actual = _command_shape(command)
        if actual != expected:
            raise AssertionError(f"unexpected shape for {command!r}: {actual!r}")
        _assert_secret_absent(actual)


def test_emit_harness_block_redacts_env_prefixes() -> None:
    original_project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        (project / "workspace").mkdir()
        os.environ["CLAUDE_PROJECT_DIR"] = str(project)
        emit_harness_block(
            tool_name="Bash",
            tool_input={
                "command": "OPENAI_API_KEY=opensesame DATABASE_URL=postgres://user:pass@localhost/db npm run dev",
            },
            block_kind="harness_block",
            denial_source="claude-code-permission",
            denial_surface="PermissionDenied",
            denial_signal="permission-denied",
            denial_summary="Claude Code permission layer blocked the tool call",
            agent_context="orchestrator",
            agent_type=None,
            agent_id=None,
            session_id="test-session",
        )
        events_path = project / "workspace" / "_global" / "events.jsonl"
        event = json.loads(events_path.read_text(encoding="utf-8").strip())
        payload = event["payload"]
        if payload["command_shape"] != "npm <arg> <arg>":
            raise AssertionError(payload["command_shape"])
        if "cmd=npm <arg> <arg>" not in payload["summary"]:
            raise AssertionError(payload["summary"])
        _assert_secret_absent(event)
    if original_project_dir is None:
        os.environ.pop("CLAUDE_PROJECT_DIR", None)
    else:
        os.environ["CLAUDE_PROJECT_DIR"] = original_project_dir


def test_framework_classification_requires_exact_markers() -> None:
    capture = _load_permission_denial_capture()
    broad = capture.classify_denial("blocked: generic harness text")
    if broad[0] == "framework_hook":
        raise AssertionError("generic blocked text classified as framework hook")

    dispatch_without_marker = capture.classify_denial("Orchestrator-dispatch gate BLOCKED: edit inline")
    if dispatch_without_marker[0] == "framework_hook":
        raise AssertionError("orchestrator text without marker classified as framework hook")

    dispatch_with_marker = capture.classify_denial(
        "Orchestrator-dispatch gate BLOCKED: edit inline\nTAPAGENTS_DISPATCH_GATE_FIRED_V1"
    )
    if dispatch_with_marker[:3] != (
        "framework_hook",
        "framework-hook",
        "TAPAGENTS_DISPATCH_GATE_FIRED_V1",
    ):
        raise AssertionError(dispatch_with_marker)


def main() -> int:
    test_command_shape_env_prefixes()
    test_emit_harness_block_redacts_env_prefixes()
    test_framework_classification_requires_exact_markers()
    print("permission-denial telemetry tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
