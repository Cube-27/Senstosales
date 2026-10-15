#!/bin/bash
# new_worktree.sh NAME BRANCH — fetch origin, then create the worktree $WORKTREE_ROOT/NAME on a new BRANCH off
# origin/main, and print its path. WORKTREE_ROOT comes from config.sh in mixed form (C:/...), never an MSYS drive
# path: with path conversion off, git reads /c/Projects/x as C:\c\Projects\x and creates the worktree there.
# Exits 2 on bad arguments; exits 1, creating nothing, when the path is under a mangled drive prefix (/c/ or C:/c/)
# or when git fails.
set -u
source "$(dirname "$0")/config.sh"
if [[ $# -ne 2 ]]; then echo "usage: new_worktree.sh NAME BRANCH" >&2; exit 2; fi
name=$1; branch=$2
if [[ -z $name || $name == */* || $name == *\\* || $name == . || $name == .. ]]; then
  echo "ERROR NAME must be a directory name under $WORKTREE_ROOT, not a path: $name" >&2
  exit 2
fi
dir="$WORKTREE_ROOT/$name"
# /c/... left unconverted, or C:/c/... (a drive letter repeated as the first folder) as git made it from /c/....
drive=${dir:0:1}
if [[ $dir =~ ^/[A-Za-z]/ || ( $dir =~ ^[A-Za-z]:/[A-Za-z]/ && ${dir:3:1} == [${drive,}${drive^}] ) ]]; then
  err "$dir is under an MSYS drive path; set WORKTREE_ROOT to a C:/... path"
fi
git fetch -q origin main || err "git fetch origin main failed"
git worktree add -q -b "$branch" "$dir" origin/main || err "git worktree add $dir failed"
echo "$dir"
