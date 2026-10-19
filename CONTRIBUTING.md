# Contributing

SenstoSales is built mostly by coding agents working from the specs, and the same rules apply to every
contributor. Read `CLAUDE.md` before changing anything: its §2 (ARCHITECTURE §2, the contract) is binding on every
change.

## Before you start

- What is in progress and what is next: `docs/plans/ACTIVE.md`.
- Work is one row of a spec's PR plan (`docs/specs/`): one branch, one PR.
- How to write code here: `docs/ENGINEERING.md`. The invariants your change must keep: `docs/INVARIANTS.md`.

## Setup and checks

Setup is in `README.md`. Install the git hooks once per clone (`pnpm hooks`; they cover every worktree): the
`vp staged` pre-commit hook runs fmt, lint and the real-data scan on staged files. Locally, run the tests for the
files you changed (`pnpm test <files>`) and fmt/lint on them; CI runs everything, and every CI job must pass before
merge. Each job runs a root script; `pnpm verify` runs them all in CI's order (CI only, never locally):

```sh
pnpm check:code        # check: vp check (Oxfmt + Oxlint), language (INV-90), status-source (INV-64), migration SQL lint
                       # and D1 dialect step (INV-84), design validators (INV-66), tsc -b, vp test run (incl. tools)
pnpm check:real-data   # real-data-scan (C1); exceptions only in tools/checks/real-data-allow.txt
pnpm check:licenses    # licenses (C13), plus a CycloneDX SBOM artifact in CI
pnpm check:build       # build: pnpm -r build, then the web shell bundle budget (INV-104)
pnpm check:audit       # audit: pnpm audit --prod at high, action pins and read-only permissions (INV-108)
pnpm check:e2e         # e2e (Windows): Playwright on Edge against the built SPA and the shared components (C8)
pnpm check:desktop     # desktop (Windows CI only, not in verify: installs, runs and uninstalls the app; SPEC-20)
```

## Pull requests

- Title in Conventional Commits form: `type(scope): subject`, e.g. `feat(api): reject empty batch requests`.
- Fill in `.github/pull_request_template.md`: why, what changed, scope, verification, decisions, checklist.
- Tests come first and test behaviour: call the code the way its users do and assert the exact result.
- Merge needs green CI and is done by someone other than the author. Hooks and checks are never skipped or
  weakened.

## Decisions and escalation

Implementation choices within a spec's scope are decided and logged in the decisions log (`docs/DECISIONS.md`,
"Where an entry goes", and the PR body under `## Decisions`). Changes to `docs/ARCHITECTURE.md` or `docs/OPEN_QUESTIONS.md`,
candidates, secrets and paid accounts are escalated to the owner (`CLAUDE.md` §4 and the `/escalate` skill).

## Licensing

The project is AGPL-3.0-only (`LICENSE`). Dependencies under AGPL, GPL, SSPL or non-commercial licences are not
accepted; CI enforces the deny-list. Third-party material is attributed in `NOTICE`.
