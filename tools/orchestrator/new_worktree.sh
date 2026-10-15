#!/bin/bash
# new_worktree.sh NAME BRANCH — fetch origin, then create the worktree $WORKTREE_ROOT/NAME on a new BRANCH off
# origin/main, and print its path. WORKTREE_ROOT is in C:/ form (config.sh).
# Exits 2 on bad arguments; exits 1, creating nothing, when the path is under an MSYS drive prefix (/c/, or C:/c/ as
# git makes it from /c/) or when git fails.
set -u
source "$(dirname "$0")/config.sh"
if [[ $# -ne 2 ]]; then echo "usage: new_worktree.sh NAME BRANCH" >&2; exit 2; fi
name=$1; branch=$2
if [[ -z $name || $name == */* || $name == *\\* || $name == . || $name == .. ]]; then
  echo "ERROR NAME must be a directory name under $WORKTREE_ROOT, not a path: $name" >&2
  exit 2
fi
dir="$WORKTREE_ROOT/$name"
lower=${dir,,}
lower=${lower//\\//}
if [[ $lower == /[a-z]/* || $lower == [a-z]:/"${lower:0:1}"/* ]]; then
  err "$dir is under an MSYS drive path; set WORKTREE_ROOT to a C:/... path"
fi
git fetch -q origin main || err "git fetch origin main failed"
git worktree add -q -b "$branch" "$dir" origin/main || err "git worktree add $dir failed"
echo "$dir"
