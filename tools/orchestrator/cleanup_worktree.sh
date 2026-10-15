#!/bin/bash
# cleanup_worktree.sh WORKTREE BRANCH — after a merge: remove the worktree's throwaway containers, the worktree
# (retrying while a closing pane still holds it, every CLEANUP_RETRY_S seconds, default 5), and the remote and local
# branch. A worktree that can't be removed keeps its branches (exit 1); the remote branch is deleted only at the tip
# that was checked, so a commit pushed since is kept.
# It first checks that the work is merged, and removes nothing unless no PR of the branch is OPEN and each tip of the
# branch (local and remote) is the head of a MERGED PR or an ancestor of origin/main. Deleting the remote branch of
# an open PR makes GitHub close that PR. On refusal, or when GitHub can't be read, it exits 1 with an ERROR on stderr
# and keeps the worktree, the branches and the containers.
# WORKTREE is the name under $WORKTREE_ROOT of the worktree that has BRANCH checked out. It exits 2 before anything is
# checked or removed when WORKTREE is a path, names a directory that is not a registered worktree, or doesn't match
# BRANCH (BRANCH checked out elsewhere, or WORKTREE registered on another branch). Otherwise the worktree would look
# "already gone" and only the branches would be deleted, or another branch's worktree would be removed.
# Removes only containers named $CONTAINER_PREFIX-<worktree>* (config.sh), with their anonymous volumes; never
# another project's. With PRUNE_DOCKER_CACHE=1 it also prunes all build cache and dangling images.
set -u
source "$(dirname "$0")/config.sh"
if [[ $# -ne 2 ]]; then echo "usage: cleanup_worktree.sh WORKTREE BRANCH" >&2; exit 2; fi
wt=$1; branch=$2
dir="$WORKTREE_ROOT/$wt"
if [[ $wt == */* || $wt == *\\* ]]; then
  echo "ERROR WORKTREE must be a name under $WORKTREE_ROOT, not a path: $wt; removed nothing" >&2
  exit 2
fi
registered() {
  git -C "$main" worktree list --porcelain | grep -qxF "worktree $dir"
  return
}
if [[ -e $dir ]] && ! registered; then
  echo "ERROR $dir is not a registered worktree; removed nothing" >&2
  exit 2
fi
branch_dir=$(git -C "$main" worktree list --porcelain   | awk -v want="branch refs/heads/$branch" '/^worktree / { path = substr($0, 10) } $0 == want { print path }')
if [[ -n $branch_dir && $branch_dir != "$dir" ]]; then
  echo "ERROR $branch is checked out in $branch_dir, not $dir; removed nothing" >&2
  exit 2
fi
if [[ -z $branch_dir ]] && registered; then
  echo "ERROR $dir is not the worktree of $branch; removed nothing" >&2
  exit 2
fi
short=${wt//-/}   # spec-03-pr-8 -> spec03pr8
remote_tip=""     # origin/$branch as require_merged checked it

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
    [[ $ref == refs/remotes/* ]] && remote_tip=$tip
    grep -qx "MERGED $tip" <<< "$prs" && continue
    git -C "$main" merge-base --is-ancestor "$tip" origin/main 2>/dev/null \
      || refuse "$branch at $tip is in no merged PR and not in origin/main"
  done
  if [[ $found -eq 0 ]] && ! grep -q '^MERGED ' <<< "$prs"; then refuse "no branch $branch and no merged PR for it"; fi
  return 0
}

require_merged
if command -v docker >/dev/null 2>&1; then
  if names=$(docker ps -a --format '{{.Names}}' 2>/dev/null); then
    for c in $(grep -E "^$CONTAINER_PREFIX-($wt|$short)(-|$)" <<< "$names"); do
      docker rm -f -v "$c" >/dev/null && echo "removed container $c and its volumes"
    done
  else
    echo "warning: docker ps failed; containers named $CONTAINER_PREFIX-$wt* were not checked" >&2
  fi
fi
# The branches go only once the worktree is gone: a worktree still held by a process keeps its branch.
for _ in 1 2 3 4 5 6; do
  registered || break
  git -C "$main" worktree remove --force "$dir" 2>/dev/null && break
  sleep "${CLEANUP_RETRY_S:-5}"
done
if registered; then
  echo "ERROR could not remove the worktree $wt (a process may still hold it): kept it and the branch $branch" >&2
  exit 1
fi
# Leased on the tip require_merged checked, so a commit pushed since then is never deleted.
if [[ -n $remote_tip ]] && ! git -C "$main" push -q --force-with-lease="refs/heads/$branch:$remote_tip" origin \
  --delete "$branch" 2>/dev/null; then
  echo "warning: kept origin/$branch: it changed after the merge check, or the delete failed" >&2
fi
git -C "$main" branch -D "$branch" 2>/dev/null
if [[ $PRUNE_DOCKER_CACHE == 1 ]] && command -v docker >/dev/null 2>&1; then
  docker builder prune -af >/dev/null || echo "warning: build cache prune failed" >&2
  docker image prune -f >/dev/null || echo "warning: dangling image prune failed" >&2
fi
git -C "$main" pull -q --ff-only && git -C "$main" log --oneline -1
