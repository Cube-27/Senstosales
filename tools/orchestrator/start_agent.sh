#!/bin/bash
# start_agent.sh NAME WORKTREE PROMPT [MIN_FREE_MB]
# Starts a claude herdr agent in $WORKTREE_ROOT/WORKTREE (config.sh), in its own tab of the caller's herdr workspace,
# checks that the pane's cwd really is that worktree (a wrong cwd stops at a trust prompt), then sends PROMPT.
# Refuses when free memory is below MIN_FREE_MB, or when a worker (any NAME not starting with "reviewer") would
# exceed MAX_WORKERS in this herdr workspace. Starts run one at a time (a lock in the git common dir, waited on for
# START_AGENT_LOCK_WAIT_S seconds, default 300). Prints "<pane> <status>", or "ERROR ..." on stderr and exits 1.
# Build paths here, never inline: in bash double quotes "...\$wt" collapses to a literal "$wt".
set -u
source "$(dirname "$0")/config.sh"
name=$1; wt=$2; prompt=$3; min_free=${4:-$MIN_FREE_MB}
# herdr agent names are lowercase; checked before memory or herdr is touched.
[[ $name =~ ^[a-z0-9][a-z0-9-]*$ ]] || err "agent name must be lowercase: '$name' (a-z, 0-9 and '-', not starting with '-')"
dir="$WORKTREE_ROOT/$wt"
path=$(native_path "$dir")

free=$(free_mb)
[[ $free =~ ^[0-9]+$ ]] || err "could not read free memory"
(( free >= min_free )) || err "low memory: ${free}MB free < ${min_free}MB"
[[ -d $dir ]] || err "no worktree $dir"
# Without --workspace herdr uses whichever workspace has focus, which may belong to another project.
workspace=${HERDR_WORKSPACE_ID:-}
[[ -n $workspace ]] || err "HERDR_WORKSPACE_ID is unset: run this from a herdr pane"
# One start at a time: two parallel starts would read the same worker count and could pass MAX_WORKERS together.
# mkdir is atomic; the lock lives in the git common dir, shared by every worktree, and goes on exit.
lock=$(git rev-parse --git-common-dir)/start_agent.lock
for (( waited = 0; ; waited++ )); do
  if mkdir "$lock" 2>/dev/null; then trap 'rmdir "$lock" 2>/dev/null' EXIT; break; fi
  (( waited < ${START_AGENT_LOCK_WAIT_S:-300} )) \
    || err "another start_agent.sh holds $lock; if none is running, remove that directory"
  sleep 1
done
if [[ $name != reviewer* ]]; then
  agents=$(workspace_agents) || err "could not list the agents of workspace $workspace"
  workers=$(grep -c -v -e '^reviewer' -e '^$' <<< "$agents")
  (( workers < MAX_WORKERS )) || err "worker limit: $workers alive in workspace $workspace, max $MAX_WORKERS"
fi

# One tab per agent, labelled with its name. Prompt suggestions are off in agent panes: Enter submits the grey
# suggested prompt, so an agent can act on an instruction nobody typed.
pane=$(herdr tab create --workspace "$workspace" --cwd "$path" --label "$name" --no-focus \
  --env CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false 2>/dev/null \
  | json_field result.root_pane.pane_id)
[[ -n $pane ]] || err "tab create failed"
close_and_fail() {
  local reason=$1
  herdr pane close "$pane" >/dev/null 2>&1
  err "$reason; closed pane $pane"
  return 1
}
herdr agent start "$name" --kind claude --pane "$pane" --timeout 60000 >/dev/null 2>&1
cwd=$(herdr agent get "$name" 2>/dev/null | json_field result.agent.cwd)
[[ $cwd == "$path" ]] || close_and_fail "$name cwd is '$cwd', expected '$path'"
status() {
  herdr agent get "$name" | json_field result.agent.agent_status
  return 0
}
# A prompt sent while the agent is still loading can be dropped: wait up to 15 s for a turn, resend once, then fail.
started() {
  local _
  for _ in $(seq 15); do
    case $(status) in
      working|blocked) return 0 ;;
      *) sleep 1 ;;
    esac
  done
  return 1
}
for attempt in 1 2; do
  herdr agent prompt "$name" "$prompt" >/dev/null 2>&1 || close_and_fail "prompt to $name failed"
  if started; then echo "$pane $(status)"; exit 0; fi
  [[ $attempt == 1 ]] && echo "WARN $name idle after the prompt; resending" >&2
done
close_and_fail "$name never started a turn"
