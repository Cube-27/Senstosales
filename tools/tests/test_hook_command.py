"""The merge-guard hook command in `.claude/settings.json`, run through bash as Claude Code runs it, with a stub
`python` on PATH: it must deny (exit 2) whenever the guard can't run, never fail open."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
BASH = shutil.which("bash")
pytestmark = pytest.mark.skipif(BASH is None, reason="needs bash")


def hook_command() -> str:
    settings = json.loads((REPO / ".claude" / "settings.json").read_text(encoding="utf-8"))
    return settings["hooks"]["PreToolUse"][0]["hooks"][0]["command"]


def run_hook(tmp_path: Path, stubs: dict[str, str], command: str) -> subprocess.CompletedProcess[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in stubs.items():
        stub = bin_dir / name
        stub.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8", newline="\n")
        stub.chmod(0o755)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    env = {**os.environ, "PATH": str(bin_dir), "CLAUDE_PROJECT_DIR": str(REPO)}
    return subprocess.run(
        [BASH, "-c", hook_command()], input=payload, env=env, capture_output=True, text=True, check=False
    )


def real_python() -> str:
    return f'exec "{Path(sys.executable).as_posix()}" "$@"'


def test_allows_a_plain_command(tmp_path: Path) -> None:
    assert run_hook(tmp_path, {"python": real_python()}, "git status").returncode == 0


def test_denies_a_direct_merge(tmp_path: Path) -> None:
    assert run_hook(tmp_path, {"python": real_python()}, "gh pr merge 7").returncode == 2


def test_prefers_python_over_a_broken_python3_stub(tmp_path: Path) -> None:
    stubs = {"python": real_python(), "python3": "exit 9009"}
    assert run_hook(tmp_path, stubs, "git status").returncode == 0


def test_denies_when_the_interpreter_cannot_run(tmp_path: Path) -> None:
    result = run_hook(tmp_path, {"python": "exit 9009"}, "git status")

    assert result.returncode == 2
    assert "merge guard" in result.stderr


def test_denies_when_no_python_is_on_path(tmp_path: Path) -> None:
    result = run_hook(tmp_path, {}, "git status")

    assert result.returncode == 2
    assert "merge guard" in result.stderr
