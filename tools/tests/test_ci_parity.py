"""`pnpm verify` runs everything CI runs: each CI job runs one root `check:*` script (as `pnpm check:x` or as that
script's exact command), and `verify` chains every one of them in CI's job order."""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def ci_jobs() -> dict[str, list[str]]:
    """Job name -> its `run:` commands, from the two-space-indented keys under `jobs:` in ci.yml."""
    text = (REPO / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    jobs: dict[str, list[str]] = {}
    current = ""
    for line in text.split("\njobs:\n", 1)[1].splitlines():
        if job := re.fullmatch(r"  ([\w-]+):", line):
            current = job.group(1)
            jobs[current] = []
        elif current and (run := re.fullmatch(r"\s+- run: (.+)", line)):
            jobs[current].append(run.group(1).strip())
    return jobs


def scripts() -> dict[str, str]:
    return json.loads((REPO / "package.json").read_text(encoding="utf-8"))["scripts"]


def check_script_of(commands: list[str]) -> list[str]:
    by_command = {command: name for name, command in scripts().items() if name.startswith("check:")}
    found = [m.group(1) for c in commands if (m := re.fullmatch(r"pnpm (check:[\w-]+)", c))]
    return found + [by_command[c] for c in commands if c in by_command]


def test_every_ci_job_runs_exactly_one_check_script() -> None:
    assert {job: len(check_script_of(commands)) for job, commands in ci_jobs().items()} == {
        "check": 1,
        "real-data-scan": 1,
        "licenses": 1,
        "tools": 1,
        "build": 1,
        "audit": 1,
    }


def test_verify_chains_every_ci_check_script_in_job_order() -> None:
    in_ci = [check_script_of(commands)[0] for commands in ci_jobs().values()]

    assert scripts()["verify"] == " && ".join(f"pnpm {name}" for name in in_ci)
