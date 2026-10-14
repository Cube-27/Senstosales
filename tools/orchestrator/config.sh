#!/bin/bash
# Shared settings for tools/orchestrator/*.sh. Sourced by each script, never run on its own. Every value can be
# overridden by an environment variable of the same name. Edit the defaults here once per project.

# The main checkout: the first entry of `git worktree list` (e.g. C:/Projects/acme on Windows).
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
REPO_NAME=$(basename "$main")
# Agent worktrees live beside the repo, never inside it: <main>/../<repo>-worktrees/<name>.
WORKTREE_ROOT=${WORKTREE_ROOT:-"$(dirname "$main")/$REPO_NAME-worktrees"}

# The first job of the CI workflow. wait_ci.sh treats "no check of this name after WAIT_CI_NO_RUN_S" as "no
# workflow run" (GitHub starts no pull_request workflow on a PR that conflicts with its base).
CI_FIRST_JOB=${CI_FIRST_JOB:-check}
# An optional external quality gate reported as a check run (e.g. "SonarCloud Code Analysis"). When set, wait_ci.sh
# also waits for it. Empty: none.
CI_GATE_CHECK=${CI_GATE_CHECK:-}
# Regex of check-run names to ignore (advisory bots). "^$" ignores nothing.
CI_IGNORE_CHECKS=${CI_IGNORE_CHECKS:-^$}

# Throwaway containers that agents start are named <prefix>-<worktree>-*; cleanup removes only these.
CONTAINER_PREFIX=${CONTAINER_PREFIX:-$(tr '[:upper:]' '[:lower:]' <<< "$REPO_NAME" | tr -c 'a-z0-9\n' '-')}
# 1: cleanup_worktree.sh also prunes all Docker build cache and dangling images after a merge.
PRUNE_DOCKER_CACHE=${PRUNE_DOCKER_CACHE:-0}

# Owner limits: live workers (reviewers don't count) and the free-memory floor for any start.
MAX_WORKERS=${MAX_WORKERS:-4}
MIN_FREE_MB=${MIN_FREE_MB:-1500}

# json_field PATH: prints the field at PATH (dot-separated, e.g. result.agent.pane_id) of the JSON on stdin. Fails,
# printing nothing, when the input is not JSON or the field is missing.
json_field() {
  node -e 'let value = JSON.parse(require("fs").readFileSync(0, "utf8"));
for (const key of process.argv[1].split(".")) value = value[key];
if (value === undefined) process.exit(1);
console.log(value);' "$1"
}

# Free physical memory in MB, or nothing when it can't be read. Windows (Git Bash), Linux, macOS.
free_mb() {
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -c "[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)" 2>/dev/null \
      | tr -d '\r'
  elif [[ -r /proc/meminfo ]]; then
    awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo
  elif command -v vm_stat >/dev/null 2>&1; then
    vm_stat | awk '/page size of/ { ps = $8 } /Pages free/ { f = $3 } /Pages inactive/ { i = $3 }
      END { print int((f + i) * ps / 1048576) }'
  fi
  return 0
}

# "<name> <status>" for each named herdr agent in this project's herdr workspace ($HERDR_WORKSPACE_ID), sorted. Other
# workspaces belong to other projects and are never counted, watched or closed. Fails when HERDR_WORKSPACE_ID is unset
# or herdr or the parse fails, so a failed poll is told apart from an empty list.
workspace_agents() {
  local agents
  [[ -n ${HERDR_WORKSPACE_ID:-} ]] || return 1
  agents=$(set -o pipefail; herdr agent list 2>/dev/null | node -e '
for (const a of JSON.parse(require("fs").readFileSync(0, "utf8")).result.agents)
  if (a.name && a.workspace_id === process.argv[1]) console.log(a.name, a.agent_status);' \
    "$HERDR_WORKSPACE_ID" 2>/dev/null) || return 1
  sort <<< "$agents"
  return 0
}

# A path in the form herdr reports cwd in: Windows-style under Git Bash, unchanged elsewhere.
native_path() {
  cygpath -w "$1" 2>/dev/null || echo "$1"
  return 0
}
