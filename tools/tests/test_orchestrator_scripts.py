"""Behaviour of tools/orchestrator shell scripts, run through bash with stub `gh` and `herdr` on PATH."""

import json
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


@pytest.mark.parametrize(
    ("checks", "env", "code"),
    [
        (["check COMPLETED SKIPPED"], {}, 1),
        (["check COMPLETED NEUTRAL"], {}, 1),
        (["check COMPLETED SUCCESS", "advisory COMPLETED NEUTRAL", "docs COMPLETED SKIPPED"], {}, 0),
        (["check COMPLETED SUCCESS", "Quality Gate COMPLETED SKIPPED"], {"CI_GATE_CHECK": "Quality Gate"}, 1),
        (["check COMPLETED SUCCESS", "Quality Gate COMPLETED SUCCESS"], {"CI_GATE_CHECK": "Quality Gate"}, 0),
    ],
)
def test_wait_ci_requires_the_first_job_and_the_gate_to_succeed(
    tmp_path: Path, checks: list[str], env: dict[str, str], code: int
) -> None:
    lines = " ".join(f'"{line}"' for line in [f"{HEAD} MERGEABLE CLEAN", *checks])
    stubs = {"gh": f'printf "%s\\n" {lines}'}
    result = run_script(tmp_path, "wait_ci.sh", ["1", HEAD[:7], "1"], stubs, {"WAIT_CI_POLL_S": "1", **env})

    assert result.returncode == code


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


def agents(*entries: tuple[str, str, str]) -> str:
    """`herdr agent list` output for (name, status, workspace) entries."""
    listed = [{"name": n, "agent_status": s, "workspace_id": w, "pane_id": f"{w}:p{n}"} for n, s, w in entries]
    return json.dumps({"result": {"agents": listed}})


AGENT_A = agents(("impl-a", "working", "w1"))
NO_AGENTS = agents()
WATCH_ENV = {"INTERVAL": "0", "MIN_FREE_MB": "0", "HERDR_WORKSPACE_ID": "w1"}


def test_watch_agents_ignores_agents_of_other_workspaces(tmp_path: Path) -> None:
    other = ("uat-tester2", "idle", "w14")
    responses = [agents(("impl-a", "working", "w1"), other), agents(other)]
    stubs = {"herdr": herdr_sequence(tmp_path, responses), "gh": "exit 0"}
    result = run_script(tmp_path, "watch_agents.sh", [], stubs, WATCH_ENV)

    # An idle agent of another workspace would have exited first with SETTLED uat-tester2 idle.
    assert (result.returncode, result.stdout) == (0, "GONE impl-a\n")


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


def git(cwd: Path, *args: str) -> str:
    return subprocess.run([GIT, *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def merged_worktree(tmp_path: Path) -> tuple[Path, Path]:
    """An origin, its clone `app`, and worktree app-worktrees/spec-01-pr-1 on branch `spec-01/pr-1-x`, merged."""
    origin, main = tmp_path / "origin.git", tmp_path / "app"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", "-q", str(origin), str(main))
    for key, value in [("user.email", "t@example.test"), ("user.name", "t"), ("commit.gpgsign", "false")]:
        git(main, "config", key, value)
    git(main, "commit", "-q", "--allow-empty", "-m", "init")
    git(main, "push", "-q", "-u", "origin", "main")
    worktree = tmp_path / "app-worktrees" / "spec-01-pr-1"
    git(main, "worktree", "add", "-q", "-b", "spec-01/pr-1-x", str(worktree))
    git(worktree, "commit", "-q", "--allow-empty", "-m", "work")
    git(worktree, "push", "-q", "origin", "spec-01/pr-1-x")
    git(main, "merge", "-q", "--ff-only", "spec-01/pr-1-x")
    git(main, "push", "-q", "origin", "main")
    return main, origin


def run_cleanup(
    main: Path, tmp_path: Path, docker: str = "exit 0", worktree: str = "spec-01-pr-1"
) -> subprocess.CompletedProcess[str]:
    path = f"{stub_bin(tmp_path, {'gh': 'exit 0', 'docker': docker})}{os.pathsep}{os.environ['PATH']}"
    return subprocess.run(
        [BASH, str(ORCHESTRATOR / "cleanup_worktree.sh"), worktree, "spec-01/pr-1-x"],
        cwd=main,
        env={**os.environ, "PATH": path, "CLEANUP_RETRY_S": "0"},
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def branches(main: Path, origin: Path) -> tuple[str, str]:
    return git(main, "branch", "--list", "spec-01/pr-1-x"), git(origin, "branch", "--list", "spec-01/pr-1-x")


def test_cleanup_removes_a_merged_worktree_and_its_branches(tmp_path: Path) -> None:
    main, origin = merged_worktree(tmp_path)
    result = run_cleanup(main, tmp_path)

    assert result.returncode == 0, result.stderr
    assert not (tmp_path / "app-worktrees" / "spec-01-pr-1").exists()
    assert branches(main, origin) == ("", "")


def test_cleanup_keeps_the_branches_when_the_worktree_cannot_be_removed(tmp_path: Path) -> None:
    main, origin = merged_worktree(tmp_path)
    git(main, "worktree", "lock", str(tmp_path / "app-worktrees" / "spec-01-pr-1"))  # --force alone can't remove it
    result = run_cleanup(main, tmp_path)

    assert result.returncode == 1
    assert "could not remove the worktree spec-01-pr-1" in result.stderr
    assert branches(main, origin) == ("+ spec-01/pr-1-x", "spec-01/pr-1-x")


@pytest.mark.parametrize("separator", ["/", "\\"])
def test_cleanup_refuses_a_worktree_path_and_removes_nothing(tmp_path: Path, separator: str) -> None:
    main, origin = merged_worktree(tmp_path)
    result = run_cleanup(main, tmp_path, worktree=separator.join(["..", "app-worktrees", "spec-01-pr-1"]))

    assert result.returncode == 2
    assert "not a path" in result.stderr
    assert (tmp_path / "app-worktrees" / "spec-01-pr-1").is_dir()
    assert branches(main, origin) == ("+ spec-01/pr-1-x", "spec-01/pr-1-x")


@pytest.mark.parametrize("worktree", ["spec-02-pr-1", ".", ".."])
def test_cleanup_refuses_a_directory_that_is_not_a_registered_worktree(tmp_path: Path, worktree: str) -> None:
    main, origin = merged_worktree(tmp_path)
    (tmp_path / "app-worktrees" / "spec-02-pr-1").mkdir()
    result = run_cleanup(main, tmp_path, worktree=worktree)

    assert result.returncode == 2
    assert "is not a registered worktree" in result.stderr
    assert (tmp_path / "app-worktrees" / "spec-02-pr-1").is_dir()
    assert branches(main, origin) == ("+ spec-01/pr-1-x", "spec-01/pr-1-x")


def test_cleanup_warns_when_docker_cannot_list_containers(tmp_path: Path) -> None:
    main, _ = merged_worktree(tmp_path)
    result = run_cleanup(main, tmp_path, docker="exit 1")

    assert result.returncode == 0, result.stderr
    assert "warning: docker ps failed" in result.stderr


def herdr_dispatch(tmp_path: Path, listing: str, agent: dict[str, str] | None = None) -> str:
    """A `herdr` stub: `agent list` prints LISTING, `agent get` prints AGENT (or fails), `tab create` fails, and
    `pane close` is recorded in herdr-closed."""
    (tmp_path / "herdr-list").write_text(listing, encoding="utf-8")
    get = json.dumps({"result": {"agent": agent}}) if agent else ""
    (tmp_path / "herdr-get").write_text(get, encoding="utf-8")
    base = tmp_path.as_posix()
    return (
        'case "$1 $2" in\n'
        f'  "agent list") cat "{base}/herdr-list" ;;\n'
        f'  "agent get") [[ -s "{base}/herdr-get" ]] || exit 1; cat "{base}/herdr-get" ;;\n'
        f'  "pane close") echo "$3" >> "{base}/herdr-closed" ;;\n'
        "  *) exit 1 ;;\n"
        "esac"
    )


def start_agent(tmp_path: Path, listing: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    (tmp_path / "worktrees" / "spec-09-pr-1").mkdir(parents=True, exist_ok=True)
    env = {"HERDR_WORKSPACE_ID": "w1", "MAX_WORKERS": "2", "WORKTREE_ROOT": str(tmp_path / "worktrees"), **(env or {})}
    stubs = {"herdr": herdr_dispatch(tmp_path, listing)}
    return run_script(tmp_path, "start_agent.sh", ["impl-x", "spec-09-pr-1", "go", "0"], stubs, env)


def test_start_agent_counts_workers_of_its_own_workspace_only(tmp_path: Path) -> None:
    others = [(f"impl-{n}", "working", "w14") for n in range(3)]
    result = start_agent(tmp_path, agents(("reviewer-pr1", "working", "w1"), ("impl-a", "working", "w1"), *others))

    # Past the limit check (1 worker of 2 in w1), it stops at the stubbed tab create.
    assert result.stderr.endswith("ERROR tab create failed\n")


def test_start_agent_refuses_past_the_worker_limit(tmp_path: Path) -> None:
    result = start_agent(tmp_path, agents(("impl-a", "working", "w1"), ("impl-b", "idle", "w1")))

    assert result.stderr == "ERROR worker limit: 2 alive in workspace w1, max 2\n"


def test_start_agent_waits_for_another_start_then_gives_up(tmp_path: Path) -> None:
    (tmp_path / "repo").mkdir()
    git(tmp_path / "repo", "init", "-q")
    (tmp_path / "repo" / ".git" / "start_agent.lock").mkdir()
    result = start_agent(tmp_path, agents(), {"START_AGENT_LOCK_WAIT_S": "1"})

    assert result.returncode == 1
    assert "another start_agent.sh holds" in result.stderr


@pytest.mark.parametrize(
    ("workspace", "stdout", "closed"), [("w1", "closed impl-a w1:p1\n", "w1:p1"), ("w14", "gone impl-a\n", "")]
)
def test_close_agent_closes_only_agents_of_its_own_workspace(
    tmp_path: Path, workspace: str, stdout: str, closed: str
) -> None:
    agent = {"name": "impl-a", "pane_id": f"{workspace}:p1", "workspace_id": workspace, "agent_status": "idle"}
    stubs = {"herdr": herdr_dispatch(tmp_path, agents(), agent)}
    result = run_script(tmp_path, "close_agent.sh", ["impl-a"], stubs, {"HERDR_WORKSPACE_ID": "w1"})

    assert (result.returncode, result.stdout) == (0, stdout)
    closed_file = tmp_path / "herdr-closed"
    assert (closed_file.read_text(encoding="utf-8").strip() if closed_file.exists() else "") == closed
