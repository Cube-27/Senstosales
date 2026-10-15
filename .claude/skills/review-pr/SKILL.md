---
name: review-pr
description: Review one complete PR (implemented and simplified by its implementor, CI green; the reviewer never runs /simplify) against its spec row, the CLAUDE.md contract and the engineering principles, and return a merge verdict. Use before merging any PR, or when asked to review a branch or PR.
---

# Review a PR

A single reviewer with a verdict, not a panel. You did not write this code: read it adversarially, then judge it
pragmatically. Don't push commits; the author fixes. Adapted from pstack's `interrogate` (MIT, see `NOTICE`).

## 0. Only a complete PR, reviewed once

Review when the implementor hands over a finished PR with every check green on the head commit
(`tools/orchestrator/wait_ci.sh <n> <head-sha7>`). If CI is red, tell the implementor and stop. Don't run builds or
tests yourself; CI did.

## 1. Scope and intent

- `gh pr view <n>` and `gh pr diff <n>`. Read the spec row the PR claims, the spec's acceptance criteria and
  invariants, and the ARCHITECTURE sections it cites.
- Write the intent in one paragraph: what the PR must achieve and what it must not touch. A PR that doesn't match
  its row is the first finding.

## 2. Check, in this order

1. **Contract (`CLAUDE.md` §2).** Every violation is blocking: each project rule C1…Cn, a candidate built, model
   output executed, a denied-licence dependency, real data or a secret in the repo, a weakened check.
2. **Correctness.** Trace real call paths, not hypotheticals: a "what if X is null" finding counts only if a caller
   can pass null. Check idempotence for jobs, migrations and scripts.

   **Concurrent batches.** Every write use case states what happens when two requests build their batch from the
   same read before either commits. Each insert that can collide is idempotent (`ON CONFLICT DO NOTHING`) or the
   batch fails as a whole through a guarded statement (D-0124: `CASE … ELSE NULL` into a NOT NULL column); a guard on
   the UPDATE alone beside an unconditional insert is a defect. A test builds both batches before committing
   either. A missing statement, guard or test is an Act-on item.

3. **Proof.** Every acceptance criterion maps to a test or command that ran green. A test that would still pass if
   the function returned a wrong value proves nothing.
4. **Scope and simplicity.** Code outside the row, speculative options, single-caller wrappers, compatibility shims.
5. **Decisions.** Choices the spec didn't make are in the PR's `## Decisions`. Anything that should have been
   escalated (`CLAUDE.md` §4) is blocking.
6. **Recurring findings.** Check the diff against `docs/plans/RECURRING.md`; a repeat is an Act-on item, and its fix must add a check or regression test that would have caught it. A red
   quality gate is an Act-on item.
7. **Project conventions** (e.g. `docs/DESIGN.md` for UI): a deviation is an Act-on item.

## 3. Judge

Re-check each finding against the code. Drop: pre-existing issues and unchanged lines; anything a linter, type
checker or test would catch; nits a senior engineer wouldn't raise; intentional changes that follow from the row.

Sort every finding, one line of reason each:

- **Act on.** Correctness, security, contract or scope defects. These block the merge. More than 5 means you aren't
  filtering hard enough.
- **Consider.** Legitimate, but maybe not worth fixing now. A follow-up row is fine.
- **Noted.** Valid but not actionable at this stage.
- **Dismissed.** Wrong, a style preference, or missing context. Say why, so the owner can override you.

If all you have are nits, the code is fine; say so.

## 4. Verdict

Post the review as a PR comment (`gh pr review <n> --comment --body-file …`) with the intent, the buckets and one
verdict:

- `MERGE`: no Act-on items and CI green;
- `MERGE AFTER FIX`: merges once the listed Act-on items are fixed and CI is green again. There is no second review,
  so make each item specific enough that the fix is unambiguous;
- `ESCALATE`: needs the owner (`CLAUDE.md` §4); name the question.

Never approve with an Act-on item open or on red CI. Link each Act-on item to the code at the head commit
(`https://github.com/Cube-27/Senstosales/blob/<full-sha>/<path>#L<a>-L<b>`). End the comment with one line naming each
Act-on item's category, e.g. `Categories: path-traversal, missing-test`; the orchestrator tallies these.

Send the verdict and the Act-on list to the implementor (`herdr agent prompt <implementor> "…"`), then close your
own pane: `herdr pane close "$HERDR_PANE_ID"`. An idle reviewer pane holds memory. There is no re-review.
