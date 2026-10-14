#!/bin/bash
# cleanup_worktree.sh WORKTREE BRANCH — after a merge: remove the worktree's throwaway containers, the worktree
# (retrying while a closing pane still holds it), and the remote and local branch.
# It first checks that the work is merged, and removes nothing unless no PR of the branch is OPEN and each tip of the
# branch (local and remote) is the head of a MERGED PR or an ancestor of origin/main. Deleting the remote branch of
# an open PR makes GitHub close that PR. On refusal, or when GitHub can't be read, it exits 1 with an ERROR on stderr
# and keeps the worktree, the branches and the containers.
# Removes only containers named $CONTAINER_PREFIX-<worktree>* (config.sh), with their anonymous volumes; never
# another project's. With PRUNE_DOCKER_CACHE=1 it also prunes all build cache and dangling images.
set -u
source "$(dirname "$0")/config.sh"
if [[ $# -ne 2 ]]; then echo "usage: cleanup_worktree.sh WORKTREE BRANCH" >&2; exit 2; fi
wt=$1; branch=$2
dir="$WORKTREE_ROOT/$wt"
short=${wt//-/}   # spec-03-pr-8 -> spec03pr8

refuse() {
  echo "ERROR $1: kept the worktree $wt, the branch $branch and the containers" >&2
  exit 1
}

# Every tip of the branch, local and remote, must be the head of a MERGED PR or already in origin/main: a branch name
# reused after a merge, or a commit pushed after it, is unmerged work. An OPEN PR refuses outright.
require_merged() {
  local prs tip ref found=0
  prs=$(gh pr list --head "$branch" --state all --json state,headRefOid --jq '.[] | "\(.state) \(.headRefOid)"') \
    || refuse "could not read the PRs of $branch"
  if grep -q '^OPEN ' <<< "$prs"; then refuse "a PR for $branch is open"; fi
  git -C "$main" fetch -q --prune origin || refuse "could not fetch origin"
  for ref in "refs/heads/$branch" "refs/remotes/origin/$branch"; do
    tip=$(git -C "$main" rev-parse -q --verify "$ref^{commit}") || continue
    found=1
    grep -qx "MERGED $tip" <<< "$prs" && continue
    git -C "$main" merge-base --is-ancestor "$tip" origin/main 2>/dev/null \
      || refuse "$branch at $tip is in no merged PR and not in origin/main"
  done
  if [[ $found -eq 0 ]] && ! grep -q '^MERGED ' <<< "$prs"; then refuse "no branch $branch and no merged PR for it"; fi
  return 0
}

require_merged
if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "^$CONTAINER_PREFIX-($wt|$short)(-|$)"); do
    docker rm -f -v "$c" >/dev/null && echo "removed container $c and its volumes"
  done
fi
for _ in 1 2 3 4 5 6; do git -C "$main" worktree remove --force "$dir" 2>/dev/null && break; sleep 5; done
git -C "$main" push -q origin --delete "$branch" 2>/dev/null
git -C "$main" branch -D "$branch" 2>/dev/null
if [[ $PRUNE_DOCKER_CACHE == 1 ]] && command -v docker >/dev/null 2>&1; then
  docker builder prune -af >/dev/null || echo "warning: build cache prune failed" >&2
  docker image prune -f >/dev/null || echo "warning: dangling image prune failed" >&2
fi
git -C "$main" pull -q --ff-only && git -C "$main" log --oneline -1
