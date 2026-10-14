#!/bin/bash
# merge_pr.sh PR SHA7 — the only sanctioned merge path. Squash-merges PR only if wait_ci.sh reports every check
# passed on commit SHA7, and only if SHA7 is still the PR's head when the merge runs (--match-head-commit). Never
# chain `gh pr merge` after a wait with `;`: a failed wait must stop the merge. The merge-guard hook denies
# `gh pr merge` typed as a tool call; this script's own call is not a tool call, so it passes.
# A spec PR (branch spec-NN/...) must carry its tracker commit: its diff must touch docs/plans/ACTIVE.md.
# When `gh pr merge` fails, the PR state is re-read for MERGE_CONFIRM_S seconds (default 30): exits 0 if the PR is
# MERGED at the expected head, else 1.
set -eu
pr=$1; sha=$2
err() { echo "ERROR $*" >&2; exit 1; }
tracker=docs/plans/ACTIVE.md

# Recurring: a spec PR was merged without the YOUR TURN tracker commit. A failed `gh pr diff` also refuses.
branch=$(gh pr view "$pr" --json headRefName --jq .headRefName)
if [[ $branch =~ ^spec-[0-9]+/ ]] && ! gh pr diff "$pr" --name-only | grep -qxF "$tracker"; then
  err "PR #$pr ($branch) does not touch $tracker: the tracker commit is missing. Send YOUR TURN and wait for READY before merging."
fi

bash "$(dirname "$0")/wait_ci.sh" "$pr" "$sha"
full=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
if [[ $full != "$sha"* ]]; then err "head is $full, not $sha"; fi
if gh pr merge "$pr" --squash --match-head-commit "$full"; then exit 0; fi

# Recurring: GitHub answered a merge with a GraphQL error although the merge went through, and a retry then added an
# empty duplicate commit. Trust the PR state, never the exit code alone, and never retry the merge here.
end=$(( $(date +%s) + ${MERGE_CONFIRM_S:-30} ))
while :; do
  state=$(gh pr view "$pr" --json state,headRefOid --jq '"\(.state) \(.headRefOid)"' 2>/dev/null) || state=""
  if [[ $state == "MERGED $full" ]]; then echo "merged despite the gh error: PR #$pr at $full"; exit 0; fi
  (( $(date +%s) < end )) || break
  sleep 3
done
err "merge of PR #$pr failed (state: ${state:-unknown})"
