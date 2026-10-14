#!/bin/bash
# wait_ci.sh PR SHA7 [TIMEOUT_MIN] — waits until every check run on commit SHA7 of the PR has finished, then prints
# them. SHA7 is a 7-40 hex-digit prefix of the head commit, matched as a prefix (as merge_pr.sh does). Waiting on
# the head SHA avoids reading the previous commit's results. Exits 0 only when every check passed (SUCCESS, NEUTRAL
# or SKIPPED; $CI_FIRST_JOB and $CI_GATE_CHECK only SUCCESS); 1 on a failed check, a moved head, or TIMEOUT_MIN
# (default 45). Right after a push GitHub may still report the old head, so a different head is an error once it is
# neither SHA7 nor the head seen first, or after 3 minutes.
# GitHub starts no pull_request workflow on a PR that conflicts with its base, so a conflicting PR is an error at
# once, and so is a head whose $CI_FIRST_JOB check has not appeared after WAIT_CI_NO_RUN_S seconds (default 300).
# With $CI_GATE_CHECK set (config.sh), that check must also report. WAIT_CI_POLL_S (default 15) is the poll interval.
source "$(dirname "$0")/config.sh"
pr=$1; sha=$2; deadline=$(( $(date +%s) + ${3:-45} * 60 )); lag_end=$(( $(date +%s) + 180 )); first=""
poll=${WAIT_CI_POLL_S:-15}; no_run_s=${WAIT_CI_NO_RUN_S:-300}; no_run_end=$(( $(date +%s) + no_run_s ))
err() { echo "ERROR $*" >&2; exit 1; }
[[ $sha =~ ^[0-9a-f]{7,40}$ ]] || err "usage: wait_ci.sh PR SHA7 [TIMEOUT_MIN] (SHA7: 7-40 hex digits)"

# Fails when the PR conflicts with its base; mergeable is UNKNOWN while GitHub is still computing it.
check_conflict() {
  local state=$1
  case "$state" in
    *CONFLICTING*|*DIRTY*) err "PR #$pr conflicts with main: rebase onto origin/main" ;;
    *) return 0 ;;
  esac
}

# True when the check list $2 ("<name> <status> <conclusion>" lines) has a check named exactly $1.
has_check() {
  [[ $'\n'"$2" == *$'\n'"$1 "* ]]
}

# Fails when the CI workflow has not started on the head by the grace deadline.
check_ci_started() {
  if ! has_check "$CI_FIRST_JOB" "$1" && (( $(date +%s) >= no_run_end )); then
    err "no workflow run for $sha after ${no_run_s}s and the PR does not conflict: check the workflow triggers or re-push"
  fi
  return 0
}

all_reported() {
  local checks=$1
  has_check "$CI_FIRST_JOB" "$checks" || return 1
  if [[ -n $CI_GATE_CHECK ]] && ! has_check "$CI_GATE_CHECK" "$checks"; then return 1; fi
  ! grep -qv ' COMPLETED ' <<< "$checks"
}

# True when $CI_FIRST_JOB and, if set, $CI_GATE_CHECK succeeded: a skipped or neutral required check is not a pass.
required_succeeded() {
  local name
  for name in "$CI_FIRST_JOB" ${CI_GATE_CHECK:+"$CI_GATE_CHECK"}; do
    grep -qxF "$name COMPLETED SUCCESS" <<< "$1" || return 1
  done
  return 0
}

while (( $(date +%s) < deadline )); do
  out=$(gh pr view "$pr" --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup --jq "
    \"\(.headRefOid) \(.mergeable) \(.mergeStateStatus)\",
    (.statusCheckRollup[] | select(.__typename==\"CheckRun\") | select(.name|test(\"$CI_IGNORE_CHECKS\")|not)
    | \"\(.name) \(.status) \(.conclusion)\")" 2>/dev/null)
  read -r head merge <<< "${out%%$'\n'*}"
  [[ -z $first ]] && first=$head
  if [[ -n $head && $head != "$sha"* ]]; then
    if [[ $head != "$first" ]] || (( $(date +%s) >= lag_end )); then err "head is no longer $sha (now $head)"; fi
    sleep "$poll"; continue   # GitHub has not caught up with the push yet
  fi
  [[ $head == "$sha"* ]] || { sleep "$poll"; continue; }   # gh failed; retry
  checks=$(tail -n +2 <<< "$out")
  check_conflict "$merge"
  check_ci_started "$checks"
  if all_reported "$checks"; then
    echo "$checks"
    if grep -qvE ' (SUCCESS|NEUTRAL|SKIPPED)$' <<< "$checks"; then err "a check did not pass"; fi
    required_succeeded "$checks" || err "a required check ($CI_FIRST_JOB${CI_GATE_CHECK:+, $CI_GATE_CHECK}) did not succeed"
    exit 0
  fi
  sleep "$poll"
done
err "timed out waiting for CI on $sha"
