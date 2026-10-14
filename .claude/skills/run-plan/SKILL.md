---
name: run-plan
description: Orchestrate implementation from docs/plans/ACTIVE.md with minimal owner involvement — assign ready PR rows to workers, sequence and merge on green, keep the tracker and decisions log current, escalate only what CLAUDE.md requires. Use when asked to run, continue or orchestrate the implementation.
---

# Run the plan

You are the orchestrator. You don't write feature code. You assign rows, sequence merges, merge, and keep
`ACTIVE.md` and `DECISIONS.md` true. You decide the tracker content (decision IDs, "Current focus") and send it with
`YOUR TURN`; the implementor writes it in the PR's last commit. Adapted from pstack's autonomous-run and orchestrate
playbooks (MIT, see `NOTICE`).

Requires herdr (`HERDR_ENV=1`). Without it, run `/implement-pr` solo instead.

## 0. Frame (once per session)

1. Read `CLAUDE.md`, `docs/ENGINEERING.md`, `docs/plans/ACTIVE.md`, `docs/specs/README.md` (dependencies), and the
   open items in `docs/DECISIONS.md`.
2. Write the exit predicate as something countable. Take it from the owner's request; the default is "every row of
   the current layer is `done`, CI on `main` is green". It goes under "Current focus" with the next `YOUR TURN`.
3. Run `/pickup` if open PRs or `spec-*` branches exist from an earlier session.

## 1. Loop

Repeat until the predicate holds, or nothing is runnable. `main` requires a PR for every change and agents never
use an admin bypass, so tracker updates travel inside PRs, and work in flight is read from GitHub (open PRs,
`spec-*` branches), not from ACTIVE.md.

1. **Ready set.** A row is ready when it is `todo`, has no open PR or `spec-*` branch, and everything it needs is
   available: the code it builds on is merged, or what it needs from unmerged work is fully specified. Readiness is
   per row. `human` and `blocked` rows are skipped.
2. **Assign.** At most `MAX_WORKERS` (default 4) workers alive at once; reviewers don't count. Every start needs
   `MIN_FREE_MB` (default 1500) free. `start_agent.sh` refuses past either limit. Name reviewers `reviewer*`,
   everything else is a worker. Run independent ready rows in parallel; two workers never run rows that edit the
   same migration or generated file. For each assignment:
   - create the worktree off fresh `origin/main` at `C:/Projects/SenstoSales-worktrees/spec-NN-pr-M` on branch
     `spec-NN/pr-M-<short-name>`;
   - `tools/orchestrator/start_agent.sh <name> spec-NN-pr-M "<prompt>"` with: "Run `/implement-pr` for SPEC-NN
     PR M. An orchestrator assigned you this row. Own the PR through `/implement-pr` §6 until it merges."
3. **Review and merge.** The implementor owns its PR and starts one reviewer once the PR is implemented,
   simplified and CI is green. The reviewer sends its items back to the implementor; with
   `MERGE AFTER FIX` it fixes them and gets CI green; there is no second review. The implementor then hands the
   PR back to you with `READY <sha7>` on green CI. After each merge, close the implementor's tab and worktree and
   any processes it started, then tell the next waiting implementor to rebase.
   **Plugin prompts** that land in the orchestrator session are forwarded, never run here (the orchestrator
   writes no code and runs no reviews): `/simplify` is always the implementor's, before it opens the PR; code
   review is the reviewer's, which the implementor starts. A reviewer never runs `/simplify`.
   Then it comments `READY <sha7>`. You don't rebase, fix or edit PRs yourself.
   - CI red after 3 honest attempts: escalate (§2).
   - To merge, pick the next `READY` PR and send its implementor `YOUR TURN` with the next free decision IDs and the
     new "Current focus" text. It rebases, adds the tracker commit and comments `READY` again. Then:
     `if tools/orchestrator/merge_pr.sh <n> <sha7>; then tools/orchestrator/close_agent.sh <impl> &&
     tools/orchestrator/cleanup_worktree.sh <worktree> <branch>; fi`
     Never chain with `;`: a pane that didn't close keeps its worktree. Never run `gh pr merge` yourself (the merge guard denies it). A failed merge leaves the
     PR open: retry.
   - **Merge strictly one at a time.** `YOUR TURN` goes to one implementor only, after the previous merge, so IDs
     never clash and every merge is tested against the real `main`.
   - `ESCALATE`: follow §2.
4. **CI on main.** Check `main` is green before and after every merge. A red `main` comes before any new
   assignment: one worker fixes it, other merges wait.

## 1a. Processes (never hang the machine)

- **One watcher.** Run `tools/orchestrator/watch_agents.sh` as a tracked background task (never with `&`). It exits
  with `SETTLED <name> <status>`, `GONE <name>`, `LOWMEM <MB>` or `PRCOMMENT <n>` (a new `READY`, `BLOCKED` or
  `ESCALATE` comment). Handle the event, then start it again. `IGNORE=<a>,<b>` skips agents deliberately waiting.
  Exit 2 means another watcher holds the pidfile: keep yours if you have one, otherwise stop the stray and restart.
- **Memory.** On `LOWMEM`, close idle panes and remove leftover project containers first. Never touch other
  projects' containers or processes.
- **Close what's done.** Close the implementor's and reviewer's panes once the PR merges.
- **Start agents only through `start_agent.sh`.** It builds and checks the cwd; a wrong cwd stalls at a trust
  prompt.

## 2. Escalation (the only times the owner is involved)

For the `CLAUDE.md` §4 list, or a dead end after 3 attempts:

1. Add a `needs-owner` entry to DECISIONS.md (question, options, recommendation, what is blocked) and copy it as a
   row to OPEN_QUESTIONS.md.
2. Mark the affected rows `blocked (D-NNNN)`. Do 1–2 in a small `chore(plan): escalate …` PR from its own worktree;
   it touches only tracker files, so its one `/review-pr` is short, but it still needs that verdict (`CLAUDE.md` §3).
3. Notify the owner once, briefly.
4. **Keep going** with other ready rows.

Never without the owner: changing ARCHITECTURE.md or OPEN_QUESTIONS.md (beyond the escalation copy), admitting a
candidate, touching secrets, force-pushing or rewriting `main`, bypassing branch rules, deleting data.

## 2a. Self-improvement

- After each review, read its `Categories:` line (and any quality-gate findings). When a category shows up a second
  time, or a fixed bug comes back, add it to `docs/plans/RECURRING.md`, and in the same change add a **check** (type,
  lint rule, `tools/` scan, CI step) or a **regression test** that fails on it; only where neither can catch it, add
  a **skill rule** to `/implement-pr` or `/review-pr` naming the finding.
- Your own slips count too: fix the procedure or a `tools/orchestrator/` script, not just the instance.
- These go through a normal PR with a fresh reviewer, ahead of new rows.

## 3. Stop

Stop when the predicate holds, or every remaining row is `human` or `blocked`. A plateau is not a stop; a red
`main` is not a stop. Never weaken a check, skip a hook, or mark a row `done` without a merged PR.

**Final report** (short): the predicate and its state; rows merged with PR numbers; rows blocked (D-IDs); human
tasks now due (H-numbers); the next ready rows.

## Cost discipline

One reviewer per PR; no panels, no parallel attempts at the same row. A fresh worker per row. Don't re-verify what
a merged PR's CI already proved.
