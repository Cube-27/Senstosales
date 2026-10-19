# Contributing

SenstoSales is built mostly by coding agents working from the specs, and the same rules apply to every
contributor. Read `CLAUDE.md` before changing anything: its §2 (ARCHITECTURE §2, the contract) is binding on every
change.

## Before you start

- What is in progress and what is next: `docs/plans/ACTIVE.md`.
- Work is one row of a spec's PR plan (`docs/specs/`): one branch, one PR.
- How to write code here: `docs/ENGINEERING.md`. The invariants your change must keep: `docs/INVARIANTS.md`.

## Setup and checks

Setup is in `README.md`; every command, including the checks CI runs, is in `CLAUDE.md` §7. Install the git hooks
once per clone (they cover every worktree). Run `pnpm verify` before you open a PR: it runs what CI runs. Every CI
job must pass before merge.

## Pull requests

- Title in Conventional Commits form: `type(scope): subject`, e.g. `feat(api): reject empty batch requests`.
- Fill in `.github/pull_request_template.md`: why, what changed, scope, verification, decisions, checklist.
- Tests come first and test behaviour: call the code the way its users do and assert the exact result.
- Merge needs green CI and is done by someone other than the author. Hooks and checks are never skipped or
  weakened.

## Decisions and escalation

Implementation choices within a spec's scope are decided and logged in the decisions log (`docs/DECISIONS.md`,
"Where an entry goes", and the PR body under `## Decisions`). Changes to `docs/ARCHITECTURE.md` or `docs/OPEN_QUESTIONS.md`,
candidates, secrets and paid accounts are escalated to the owner (`CLAUDE.md` §4–§5).

## Licensing

The project is AGPL-3.0-only (`LICENSE`). Dependencies under AGPL, GPL, SSPL or non-commercial licences are not
accepted; CI enforces the deny-list. Third-party material is attributed in `NOTICE`.
