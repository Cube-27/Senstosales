#!/bin/bash
# merge_pr.sh PR SHA7 — the only sanctioned merge path. Squash-merges PR only if wait_ci.sh reports every check
# passed on commit SHA7, and only if SHA7 is still the PR's head when the merge runs (--match-head-commit). Never
# chain `gh pr merge` after a wait with `;`: a failed wait must stop the merge. The merge-guard hook denies
# `gh pr merge` typed as a tool call; this script's own call is not a tool call, so it passes.
# A spec PR (branch spec-NN/...) must carry its tracker commit: its diff must touch docs/plans/ACTIVE.md.
# Open PRs based on the PR's branch are first retargeted to its base; a failed retarget refuses the merge.
# Safe to rerun: a PR already MERGED at SHA7 exits 0 without merging again. When `gh pr merge` fails, the PR state is
# re-read for MERGE_CONFIRM_S seconds (default 30): exits 0 if the PR is MERGED at the expected head, else 1.
set -eu
source "$(dirname "$0")/config.sh"
pr=${1:-}; sha=${2:-}
[[ $pr =~ ^[0-9]+$ && $sha =~ ^[0-9a-f]{7,40}$ ]] || err "usage: merge_pr.sh PR SHA7 (SHA7: 7-40 hex digits)"
tracker=docs/plans/ACTIVE.md

# "<state> <head sha> <branch>" of the PR, or nothing when gh fails.
pr_state() { gh pr view "$pr" --json state,headRefOid,headRefName --jq '"\(.state) \(.headRefOid) \(.headRefName)"' 2>/dev/null || true; }

# Recurring: GitHub answered a merge with a GraphQL error although the merge went through, and a retry then added an
# empty duplicate commit. Trust the PR state, never the exit code alone.
read -r state head branch <<< "$(pr_state)"
[[ -n $branch ]] || err "cannot read the state of PR #$pr"
if [[ $state == MERGED && $head == "$sha"* ]]; then echo "already merged: PR #$pr at $head"; exit 0; fi

bash "$(dirname "$0")/wait_ci.sh" "$pr" "$sha"
full=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
if [[ $full != "$sha"* ]]; then err "head is $full, not $sha"; fi

# Recurring: a spec PR was merged without the YOUR TURN tracker commit. A failed `gh pr diff` also refuses. Checked
# once the head is verified, so it reads the diff that gets merged.
if [[ $branch =~ ^spec-[0-9]+/ ]] && ! gh pr diff "$pr" --name-only | grep -qxF "$tracker"; then
  err "PR #$pr ($branch) does not touch $tracker: the tracker commit is missing. Send YOUR TURN and wait for READY before merging."
fi
# GitHub deletes a merged PR's head branch and closes every open PR based on it (#43, stacked on #42, was closed).
# Retarget those to the merged PR's base first; a failed list or retarget refuses the merge.
base=$(gh pr view "$pr" --json baseRefName --jq .baseRefName) || err "cannot read the base of PR #$pr"
stacked=$(gh pr list --state open --base "$branch" --json number --jq '.[].number') \
  || err "cannot list the open PRs based on $branch"
for n in $stacked; do
  gh pr edit "$n" --base "$base" >/dev/null || err "cannot retarget PR #$n from $branch to $base; not merging PR #$pr"
  echo "retargeted PR #$n from $branch to $base"
done
if gh pr merge "$pr" --squash --match-head-commit "$full"; then exit 0; fi

end=$(( $(date +%s) + ${MERGE_CONFIRM_S:-30} ))
while :; do
  read -r state head _ <<< "$(pr_state)"
  if [[ $state == MERGED && $head == "$full" ]]; then echo "merged despite the gh error: PR #$pr at $full"; exit 0; fi
  (( $(date +%s) < end )) || break
  sleep 3
done
err "merge of PR #$pr failed (state: ${state:-unknown})"
