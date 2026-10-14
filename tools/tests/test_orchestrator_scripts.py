"""Behaviour of tools/orchestrator shell scripts, run through bash with stub `gh` and `herdr` on PATH."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
ORCHESTRATOR = REPO / "tools" / "orchestrator"
BASH = shutil.which("bash")
GIT = shutil.which("git") or "git"
pytestmark = pytest.mark.skipif(BASH is None, reason="needs bash")

HEAD = "0123456789abcdef0123456789abcdef01234567"


def stub_bin(tmp_path: Path, stubs: dict[str, str]) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name, body in stubs.items():
        stub = bin_dir / name
        stub.write_text(f"#!/bin/bash\n{body}\n", encoding="utf-8", newline="\n")
        stub.chmod(0o755)
    return bin_dir


def run_script(
    tmp_path: Path, script: str, args: list[str], stubs: dict[str, str], env: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    # A throwaway repo as cwd: the scripts read `git worktree list`, and watch_agents.sh keeps its pidfile in the
    # git common dir, which must not be the real repo's while an orchestrator's watcher may be running.
    repo = tmp_path / "repo"
    if not repo.exists():
        repo.mkdir()
        subprocess.run([GIT, "init", "-q"], cwd=repo, check=True)
    path = f"{stub_bin(tmp_path, stubs)}{os.pathsep}{os.environ['PATH']}"
    return subprocess.run(
        [BASH, str(ORCHESTRATOR / script), *args],
        cwd=repo,
        env={**os.environ, **env, "PATH": path},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


# `gh pr view` as wait_ci.sh asks for it: the head line, then one line per check run.
GH_GREEN = f'printf "%s\\n" "{HEAD} MERGEABLE CLEAN" "check COMPLETED SUCCESS"'


@pytest.mark.parametrize("sha", [HEAD[:7], HEAD[:12], HEAD])
def test_wait_ci_accepts_the_head_by_any_prefix_length(tmp_path: Path, sha: str) -> None:
    result = run_script(tmp_path, "wait_ci.sh", ["1", sha, "1"], {"gh": GH_GREEN}, {"WAIT_CI_POLL_S": "1"})

    assert (result.returncode, result.stdout) == (0, "check COMPLETED SUCCESS\n")


def test_wait_ci_rejects_a_sha_too_short_to_identify_a_commit(tmp_path: Path) -> None:
    result = run_script(tmp_path, "wait_ci.sh", ["1", "0123"], {"gh": GH_GREEN}, {"WAIT_CI_POLL_S": "1"})

    assert result.returncode == 1
    assert "ERROR" in result.stderr


def herdr_sequence(tmp_path: Path, responses: list[str]) -> str:
    """A `herdr` stub that prints the next response on each call and repeats the last; `FAIL` exits 1."""
    for index, response in enumerate(responses):
        (tmp_path / f"herdr-{index}").write_text(response, encoding="utf-8")
    counter = (tmp_path / "herdr-calls").as_posix()
    last = len(responses) - 1
    return (
        f'n=$(cat "{counter}" 2>/dev/null || echo 0); echo $((n + 1)) > "{counter}"; (( n > {last} )) && n={last}\n'
        f'f="{tmp_path.as_posix()}/herdr-$n"; [[ $(cat "$f") == FAIL ]] && exit 1; cat "$f"'
    )


AGENT_A = '{"result": {"agents": [{"name": "impl-a", "agent_status": "working"}]}}'
NO_AGENTS = '{"result": {"agents": []}}'
WATCH_ENV = {"INTERVAL": "0", "MIN_FREE_MB": "0"}


def test_watch_agents_reports_the_last_agent_gone(tmp_path: Path) -> None:
    stubs = {"herdr": herdr_sequence(tmp_path, [AGENT_A, NO_AGENTS]), "gh": "exit 0"}
    result = run_script(tmp_path, "watch_agents.sh", [], stubs, WATCH_ENV)

    assert (result.returncode, result.stdout) == (0, "GONE impl-a\n")


def test_watch_agents_treats_a_failed_herdr_poll_as_no_news(tmp_path: Path) -> None:
    stubs = {"herdr": herdr_sequence(tmp_path, [AGENT_A, "FAIL", "FAIL", "FAIL", NO_AGENTS]), "gh": "exit 0"}
    result = run_script(tmp_path, "watch_agents.sh", [], stubs, WATCH_ENV)

    # Only the real empty list after the failed polls reports GONE; the failures alone would not.
    assert (result.returncode, result.stdout) == (0, "GONE impl-a\n")
    assert (tmp_path / "herdr-calls").read_text(encoding="utf-8").strip() == "5"
