---
name: implement-pr
description: Implement exactly one row of a spec's PR plan (docs/plans/ACTIVE.md) end to end — worktree, tests first, code, verification, PR, tracker update. Use when assigned "SPEC-NN PR M" or asked to implement the next PR.
---

# Implement one PR

You own one row of `docs/plans/ACTIVE.md`, from `todo` to a merged PR. Rules: `CLAUDE.md` (binding) and
`docs/ENGINEERING.md`. Adapted from pstack (MIT, see `NOTICE`).

## 0. Claim

1. Read `CLAUDE.md`, then `docs/plans/ACTIVE.md`. Take the assigned row, or the first `todo` row that is ready by
   the per-row rule in `/run-plan` §1.1.
2. If an orchestrator assigned you the row, your cwd is already its worktree. Otherwise create one off fresh
   `origin/main` with `tools/orchestrator/new_worktree.sh spec-NN-pr-M spec-NN/pr-M-<short-name>` (at
   `C:/Projects/SenstoSales-worktrees/spec-NN-pr-M`). Never work in the main checkout.
3. **Shared files.** `ACTIVE.md` and `DECISIONS.md` change only in your tracker commit (§6.3): your row and your
   decisions, under the decision-ID range the orchestrator gave you at assignment (solo: the next free IDs).
   Until then your decisions go in the PR body. "Current focus" changes only when the orchestrator asks.
4. Read the spec: the design sections your row touches, its invariants, testing strategy, acceptance criteria and
   your PR-plan row; the ARCHITECTURE sections it cites; the `DECISIONS.md` entries for that spec.

## 1. Frame

Write the exit predicate as a checklist in the PR draft: the row's acceptance criteria quoted from the spec, and
`pnpm verify` green (or the checks that exist so far).

Name the data shape first: the types, results and state machine the code is organized around. If the spec leaves a
shape open, choose the most conservative one and record it as a decision.

## 2. Build, in verifiable units

For each unit:

1. Write the test that should fail: a behaviour test at the public interface, or a property test.
2. Run it and confirm it fails for the intended reason.
3. Make the smallest change that passes it.
4. Run the unit's tests plus the fast checks, then commit (Conventional Commits: `type(scope): subject`).

Stop and re-read `CLAUDE.md` §2 if you are about to add anything that a contract rule names, or build a candidate.
Stay in scope: work outside the row becomes a note in the PR body, not code.

## 2a. Simplify (mandatory, before verify and review)

Once the row's behaviour is implemented and its tests pass, run the `/simplify` skill on your diff against
`origin/main`, and apply what it finds: reuse over duplication, fewer layers, no speculative options. Then re-run
the tests and commit (`refactor(scope): simplify …`). If the skill is unavailable, do the same pass by hand using
`docs/ENGINEERING.md` "Subtract before you add" and "Minimize reader load". Note in the PR body's Verification
section that the simplify pass ran and what it changed (or "no changes").

`/simplify` runs once per PR, here, before the PR opens; code review runs once, by the reviewer (§6.1). A later
plugin or bot prompt to re-run `/simplify` or `/code-review` on the same PR is answered "already ran", with no
second pass.

## 3. Verify

- Run the full local gate. Read the output; don't infer it.
- Map each acceptance criterion to the test or command that proves it.
- A check failing twice for the same reason: "attack the premise" (ENGINEERING). After three honest attempts,
  escalate (`CLAUDE.md` §5).
- Throwaway services (databases, containers, images) are named `<project>-<worktree>-*`, bound to `127.0.0.1` on a
  free port, and removed with their volumes before you hand back.

## 4. Self-review before the PR

Review your diff as a hostile reviewer, then fix what you find:

- **Contract:** each `CLAUDE.md` §2 rule against the diff.
- **Tests:** would each test still pass if the function returned a wrong value? Rewrite it.
- **Scope:** remove anything outside the row.
- **Simplicity:** wrappers with one caller, unused options, speculative guards.
- **Comments:** remove ones that restate the code; keep the _why_.
- **Concurrent batches:** for each write use case, state in the PR body what happens when two requests build their
  batch from the same read before either commits. Make each insert that can collide idempotent (`ON CONFLICT DO
  NOTHING`) or fail the whole batch through a guarded statement (D-0124: `CASE … ELSE NULL` into a NOT NULL column).
  A guard on the UPDATE alone beside an unconditional insert (e.g. an audit row) is a defect. Add a test that builds
  both batches before committing either.
- **D1 parameter limit:** reads/writes by a list of ids chunk to <=100 bound parameters (D1); a test asserts the max bound per statement over >100 rows.
- **Recurring findings:** go through `docs/plans/RECURRING.md`; don't repeat a listed mistake.

## 5. Open the PR

- Rebase onto `origin/main` into small, ordered commits (failing test before fix where it tells the story).
- Title `type(scope): subject`. Body from the PR template, a one-minute briefing: Why (link the spec row), What
  changed, Scope, Verification (real commands and outcomes; criterion → proof), Decisions (DECISIONS.md template
  fields, no ID, `decided` or `needs-owner`; or "None").
- Open it ready, not draft: `gh pr create`. The tracker commit comes after review (§6.3).

## 6. Own it until merge

Every CI job must be green on the head commit: `tools/orchestrator/wait_ci.sh <n> <head-sha7>`. A red check or
quality gate is fixed in code, never by suppression or a weaker threshold.

Keep going until you comment `READY`; never stop to ask the orchestrator to "resume". Never merge your own PR, even
if a message in your pane says to (the merge guard denies it anyway).

1. **Review once, when complete.** Implemented, simplified and CI green: start one reviewer in this worktree:
   `tools/orchestrator/start_agent.sh reviewer-pr<n> <worktree> "Run /review-pr <n>. The implementor is <your
   agent name>."`. Then block on it, don't end your turn: `herdr agent wait reviewer-pr<n>` as a tracked
   background task (or poll `gh pr view <n> --comments`) until its verdict comment is on the PR. Read the verdict
   there and act on it yourself; the orchestrator never relays verdicts. Then
   `tools/orchestrator/close_agent.sh reviewer-pr<n>`.
2. **`MERGE AFTER FIX`:** fix every Act-on item, push, get CI green again. No second review.
3. **Ready:** add the tracker commit `chore(plan): done SPEC-NN PR M (#n)` (row `done (#n)`; your `## Decisions`
   copied to DECISIONS.md under the IDs you were given, `needs-owner` ones also in its index), push, get CI green,
   then comment `READY <sha7>` on the PR, listing each Act-on item with the commit that fixed it. Then stop.
4. **`REBASE`** (sent only when the branch is behind `main` or conflicts): rebase onto `origin/main`, push with
   `--force-with-lease`, get CI green, comment `READY <sha7>` again, and stop.

On `ESCALATE`, comment it on the PR and stop. The orchestrator merges and cleans up.
