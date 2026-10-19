# SPEC-00 — Repo bootstrap and engineering foundations

Layer: L0. Architecture refs: §2 (C1–C18), §4 (layout), §14.2 (CI and repo), §14.3 (real-data scan), §16 (stack).

## 1. Summary

Create the pnpm TypeScript monorepo, the local verify gate, hooks, CI, branch rulesets and root documents that
every later spec builds on. Nothing here implements product behaviour. Its purpose is to
make the contract (ARCHITECTURE §2) mechanically enforced from the first commit: no real data (C1), the licence
deny-list (C13), the import boundaries (C12), the size and complexity guardrails (C15), and the merge path
(INV-89).

**Most of this spec is done in the setup session itself**, before any implementor starts.
PR 1 below is exactly that bootstrap and is marked `done` in `docs/plans/ACTIVE.md` when it merges. The remaining
rows are the parts of L0 that the setup session leaves for later; the checks that only make sense once there is
code to check (design validators, e2e, desktop build, D1 dialect, fixture anonymiser) are owned by the specs that
need them (§9 of this spec lists where each went).

## 2. Scope

Core:

- pnpm workspace per ARCHITECTURE §4: `packages/{domain,schemas,db,parsers,documents,scraper}`,
  `apps/{api,web,desktop}`, `tools/{checks,corpus,gen,release,start}`; TypeScript strict, ESM, `tsc -b` project
  references; TypeScript 7; Node 26 LTS; the Vite+ toolchain (`vp`: Oxlint, Oxfmt, Vitest) everywhere.
- Local verify gate `pnpm verify`, running what CI runs, in CI order, failing first.
- A `vp staged` pre-commit hook on staged files (< 10 s on a one-file change), installed once per clone.
- CI (`.github/workflows/ci.yml`): every action pinned to a full commit SHA with a version comment;
  `permissions: contents: read`; concurrency with cancel-in-progress; `pnpm install --frozen-lockfile`; no
  release-age quarantine, `trustPolicy: no-downgrade` (D-0001). Jobs: `check`, `licenses`,
  `real-data-scan` (setup session), then `build` and `audit` (PR 2). `e2e` comes with SPEC-14, `desktop` with SPEC-20.
- Lint guardrails (C15): Oxlint (`vp lint`) `max-lines` (800, error) and `complexity` (15, error) on all source; generated files and lockfiles excluded; the fix is a split, never a suppression (an inline disable of either rule is refused by a check in `tools/checks/src/no-guardrail-disable.ts`
  and by review). Boundaries (C2, C12, INV-85) via Oxlint `no-restricted-imports`; domain bans (C3: `parseFloat`,
  `toFixed`, `Date`) scoped to `packages/domain`.
- Licence deny-list (AGPL, GPL, SSPL, Commons Clause, non-commercial; LGPL avoided) by whole SPDX identifier, plus a
  CycloneDX SBOM artefact (C13, INV-77).
- Real-data scan (C1, INV-74) in CI and the pre-commit hook.
- Branch ruleset on `main`; secret scanning and push protection.
- Root files: `CLAUDE.md` (§1 sources of truth, §2 contract C1–C18 copied from ARCHITECTURE, §3 how work runs, §4
  decide vs escalate; only rules that apply to every task), `AGENTS.md` (one-line pointer to `CLAUDE.md`),
  `README.md`, `CONTRIBUTING.md`, `NOTICE` (with the pstack MIT block), `LICENSE` (exists, AGPL-3.0), PR template,
  `.gitignore`, `.gitattributes`; `docs/ENGINEERING.md`, `docs/DECISIONS.md`, `docs/plans/{ACTIVE,RECURRING}.md`.
- Agent procedures as project skills in `.claude/skills/` (§4.9).

Out of scope:

- Product behaviour (SPEC-01 onward).
- Coverage-percentage or ratchet gates; any size gate other than C15's two.
- Candidates (ARCHITECTURE §17): nothing in CI or layout anticipates them beyond the ports.

## 3. Dependencies

- None (first spec).
- Owner decisions: A-1 (TypeScript), A-19 (public AGPL repo, deny-list, no real data), A-20 (CrawlerAIv2-style
  process), A-22 (legacy read only for business rules and visible output).

## 4. Design

### 4.1 Repo layout

```
/
  README.md  CLAUDE.md  AGENTS.md  CONTRIBUTING.md  NOTICE  LICENSE  VERSION
  package.json  pnpm-workspace.yaml  pnpm-lock.yaml  tsconfig.base.json  tsconfig.json
  vite.config.ts (Vite+: lint, fmt, test, staged)  .gitignore  .gitattributes
  .github/workflows/ci.yml  .github/pull_request_template.md
  .claude/skills/<name>/SKILL.md
  docs/  ARCHITECTURE.md INVARIANTS.md EDGE_CASES.md OPEN_QUESTIONS.md DECISIONS.md ENGINEERING.md
         plans/{ACTIVE,RECURRING}.md  specs/  adr/
  packages/{domain,schemas,db,parsers,documents,scraper}/{package.json,tsconfig.json,src/index.ts}
  apps/{api,web,desktop}/...
  tools/checks/  tools/corpus/  tools/gen/  tools/release/  tools/start/
```

Each package has one smoke test until its spec fills it. Worktrees live in a sibling directory of the main
checkout (`<main>/../SenstoSales-worktrees/spec-NN-pr-M`, branch `spec-NN/pr-M-<slug>`), never inside it.

### 4.2 Toolchain

| Tool      | Choice                                                                                                                                                                         | Notes                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Runtime   | Node 26 LTS (`engines`, `.nvmrc`)                                                                                                                                              | Type stripping runs `tools/**/*.ts` directly.        |
| Packages  | pnpm workspaces, `--frozen-lockfile` in CI; supply-chain settings in `pnpm-workspace.yaml`: `minimumReleaseAge: 0` (no release-age quarantine) and `trustPolicy: no-downgrade` | D-0001; no `.npmrc`                                  |
| Language  | TypeScript 7 strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), ESM, `tsc -b` project references                             | INV-90                                               |
| Toolchain | Vite+ (`vp`), not version-pinned through a catalog (owner)                                                                                                                     | One config, one CLI. No ESLint or Prettier (D-0002). |
| Lint      | Oxlint via `vp lint`: `max-lines` 800 and `complexity` 15 as errors, `no-restricted-imports` boundaries                                                                        | C15, C12                                             |
| Format    | Oxfmt via `vp fmt`                                                                                                                                                             |                                                      |
| Tests     | Vitest via `vp test`; tests import from `vite-plus/test`                                                                                                                       | Playwright arrives with SPEC-14.                     |
| Hooks     | `vp staged`                                                                                                                                                                    | Part of Vite+; no separate hook manager.             |

Exact versions are fixed when the lockfile is created; every dependency passes the deny-list.

### 4.3 Verify gate and scripts

Root scripts: `pnpm verify` = `vp fmt --check` → `vp lint` → `tsc -b` → `vp test` → real-data scan → licence check, the
order CI uses; `pnpm test:corpus` (local only, SPEC-06/09). `pnpm verify` is the command implementors run before
opening a PR.

### 4.4 Hooks (`vp staged`)

Pre-commit, staged files only: `vp fmt`, `vp lint` on staged TS, real-data scan `--staged`. Full typecheck and
tests stay in `pnpm verify` and CI. Budget: < 10 s on a one-file change. Installed once per clone (hooks live in
the git common dir, so every worktree has them).

### 4.5 CI jobs

| Job              | Runner  | Steps                                                                                                                                                                                                                                                                                    | Added by                   |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `check`          | ubuntu  | install (frozen), `pnpm check:code`: `vp check` (Oxfmt, Oxlint guardrails and boundaries), the INV-90 language check (PR 2), `tsc -b`, `vp test run` (the build runs once, in `build`); generated-file freshness (`regenerate && git diff --exit-code`) once a spec adds generated files | PR 1                       |
| `licenses`       | ubuntu  | `pnpm check:licenses`: `pnpm licenses list` → `tools/checks/src/license-check.ts` deny-list over the full dependency tree; CycloneDX SBOM uploaded with the report as the `license-report` artefact                                                                                      | PR 1                       |
| `real-data-scan` | ubuntu  | `node tools/checks/src/real-data-scan.ts` (`pnpm check:real-data`) over all tracked files; needs no install                                                                                                                                                                              | PR 1 (`mobile` rule: PR 3) |
| `build`          | ubuntu  | `pnpm -r build`                                                                                                                                                                                                                                                                          | PR 2                       |
| `audit`          | ubuntu  | `pnpm audit --prod` at `high`, plus the action-pin check (INV-108)                                                                                                                                                                                                                       | PR 2                       |
| `e2e`            | windows | Playwright                                                                                                                                                                                                                                                                               | SPEC-14 PR 8               |
| `desktop`        | windows | Tauri build and smoke                                                                                                                                                                                                                                                                    | SPEC-20 PR 4               |

Further steps added to `check` by later specs: D1 dialect and migration-SQL lint (SPEC-05), design validators and
token parity (SPEC-14), bundle budget (SPEC-14), OpenAPI freshness (SPEC-04).

### 4.6 Real-data scan (`tools/checks/src/real-data-scan.ts`)

- Input: tracked files (CI) or staged files (`--staged`). Reports `path:line` and a rule name only, never the
  matched value (public CI logs).
- Rules (PR 1): `gstin`, GSTIN-shaped strings (`[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]`);
  `local-data-path`, local data paths (a `Downloads` folder path, absolute paths under a named user profile);
  `database-file`, database files (`*.db`, `*.sqlite*`, or the SQLite header in any file);
  `html-outside-fixtures`, any HTML file outside `packages/parsers/fixtures/` and `packages/scraper/fixtures/`
  (only synthetic HTML fixtures live there; no other HTML); `document-outside-fixtures`, binary documents (xlsx,
  xls, docx, pdf, zip) outside `packages/documents/{templates,test}/`.
- Excel and other binary documents may be committed where that rule allows, and their contents are not scanned:
  templates and goldens need realistic sample data (D-0010). Review keeps real data out of them.
- Company-details check (PR 3): a `mobile` line rule for Indian mobile numbers (optional `+91` or `0` prefix, then
  10 digits starting 6–9, bounded by non-digits), and the gitignored plain-text file
  `tools/checks/company-details.local.txt` (one value per line: company name, address lines, phone numbers,
  e-mails), matched case-insensitively as substrings. That file is read by the pre-commit hook and local
  `pnpm verify`; when it is absent (CI, forks) that part is skipped silently. No secret, no hashing, no added CI
  time (D-0010).
- Allowlist `tools/checks/real-data-allow.txt`: `path:rule` entries with a one-line justification, for documented
  synthetic test literals only. Tests of the scan construct their planted values at run time (string
  concatenation), so the repo never contains them.

### 4.7 Rulesets and repo settings (human task H1)

Ruleset on `main`: PR required, required checks (`check`, `licenses`, `real-data-scan`, then `build`,
`audit`, `e2e`, `desktop` as each exists), linear history, no force-push or deletion, no bypass actors. Secret
scanning and push protection on. The applied `gh api` commands are recorded in `docs/DECISIONS.md`.

### 4.8 Root documents (required content)

- `CLAUDE.md`: §2 copies C1–C18 verbatim from ARCHITECTURE §2 (with C15 and C16 as amended: hard 800-line and
  complexity-15 limits, fixed by splitting; legacy code read only for business rules and visible output, never as an
  implementation model). C15 says: a bug or review finding that recurs becomes a check or a regression test in the
  PR that fixes it, and is listed in `docs/plans/RECURRING.md`. Specs cite `spec §n` / `A-n` / `INV-NN`;
  uncovered edge cases go to `EDGE_CASES.md` (C18).
- `README.md`: product paragraph (ARCHITECTURE §1), AGPL-3.0, how to start, layout, "Agents: read CLAUDE.md before
  changing anything."
- `NOTICE`: the pstack MIT block (four skills and `ENGINEERING.md` are adapted from it); third-party notices added
  by later specs (fonts in SPEC-14).
- PR template: Why, What changed, Scope, Verification, Decisions, Checklist with: no real data (C1); rules cited by
  INV; edge cases recorded in `EDGE_CASES.md` (C18, INV-92); no candidate built (C14); C15 limits hold.

### 4.9 Agent procedures

- `CLAUDE.md` holds only the rules that apply to every task; situational procedures are project skills in
  `.claude/skills/<name>/SKILL.md`, each with a description that says when to invoke it (for example
  `implement-pr`: branch → change, tests first → targeted checks → PR → green CI → one bot pass).
- The build-time multi-agent orchestration (scripts under `tools/orchestrator/` and the plan, review and pickup
  skills) was deleted once the product was built (owner, 2026-10-19). Agents never merge their own PR (INV-89).

### 4.10 Error handling

Not applicable (no runtime behaviour). Each check exits non-zero with one line per failure.

## 5. Invariants

Established here: INV-74 (scan), INV-77 (licences), INV-85 (boundaries), INV-89 (no self-merge), INV-90 (language
check, PR 2), INV-108 (action pins, new), INV-109 (size and complexity guardrails, new). Reviewed from here on:
INV-88, INV-91, INV-92.

## 6. Testing strategy

- Unit tests for every check in `tools/checks/src` (`tools/checks/test/`, Vitest, run in `check`).
- Planted violations, constructed at run time or added and removed within the PR: a denied-licence dev dependency
  fails `licenses`; a GSTIN-shaped string and a local data path fail `real-data-scan`; a 801-line file and a
  complexity-16 function fail `check`; a `node:fs` import from `packages/domain` fails `check`.
- One smoke test per package.

## 7. Acceptance criteria

- [ ] Fresh clone → `pnpm install` → `pnpm verify` passes.
- [ ] A trivial PR is green on every CI job and cannot merge without them; a direct push to `main` is refused.
- [ ] Any source file over 800 lines or any function over complexity 15 fails `check`; inline disables of those
      rules are refused; generated files and lockfiles are excluded.
- [ ] `CLAUDE.md` states that a recurring bug or review finding becomes a check or a regression test in the fixing
      PR.
- [ ] The real-data scan prints `path:line` and rule only, never the value.
- [ ] Every action in every workflow is pinned to a 40-hex SHA.

## 8. PR plan

| #   | Title                                             | Scope / files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Checks                    | Done when                                                                                                                                                                                        |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Bootstrap (setup session)                         | Root docs (`CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `NOTICE`), `.claude/skills/*` with `/simplify` in `implement-pr`, `.claude/settings.json` merge guard, `tools/orchestrator/*`, `tools/tests/*`, `.github/workflows/ci.yml` (`check`, `licenses`, `tools`, `real-data-scan`), PR template, `vp staged` hook, pnpm workspace skeleton, `tsconfig.base.json`, `vite.config.ts` with Oxlint C15 guardrails and C12 boundaries, `tools/checks/src/license-check.ts`, `tools/checks/src/real-data-scan.ts` (pattern rules), `docs/{ENGINEERING,DECISIONS}.md`, `docs/plans/{ACTIVE,RECURRING}.md` | all four jobs             | A trivial PR is green on the four jobs; the guard denies `gh pr merge`. Marked done in ACTIVE.md by the setup session.                                                                           |
| 2   | `build` and `audit` jobs, language and pin checks | `ci.yml` (`build`: `pnpm -r build`; `audit`: `pnpm audit --prod --audit-level high`), `tools/checks/src/action-pins.ts` (INV-108), `tools/checks/src/language.ts` (INV-90: production sources under `packages/*/src`, `apps/*/src` are `.ts`/`.tsx`), tests in `tools/checks/test/`                                                                                                                                                                                                                                                                                                                              | `build`, `audit`, `check` | An unpinned `uses:` and a `.js` file in `packages/domain/src` each fail (planted, then removed).                                                                                                 |
| 3   | Company-details check                             | `tools/checks/src/real-data-scan.ts` (`mobile` line rule; substring match against `tools/checks/company-details.local.txt` when present), `.gitignore` entry for that file, `tools/checks/real-data-allow.txt` format check, tests with values built at run time                                                                                                                                                                                                                                                                                                                                                 | `real-data-scan`, `check` | A planted value from the local file and a planted mobile number are each blocked by the staged hook; with the file absent the scan passes silently; synthetic test values are built at run time. |
| 4   | Rulesets and repo settings                        | `gh api` ruleset commands applied (human H1); the applied JSON recorded as a `docs/DECISIONS.md` entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                         | A direct push to `main` is refused; a PR with a red required check cannot merge; secret scanning and push protection are on.                                                                     |

## 9. Open issues

- **Moved out of SPEC-00** (owner instruction during setup): fixture anonymiser → SPEC-06 PR 1; design validators,
  token parity, bundle budget and the `e2e` job → SPEC-14; D1 dialect step and migration-SQL lint → SPEC-05 PR 4;
  OpenAPI freshness → SPEC-04 PR 4; `desktop` job and release workflow → SPEC-20.
- **Rust in the Tauri shell.** Tauri 2 needs a minimal Rust entry (`apps/desktop/src-tauri/src/main.rs`). INV-90
  says all production code is TypeScript. Conservative reading: the language check covers `packages/*/src` and
  `apps/{api,web}/src` and `apps/desktop/src` (TS); the generated Tauri scaffold under `src-tauri/` holds no logic
  (sidecar control lives in TS, SPEC-20). Owner to confirm (D-0008, `pending-owner`).
- **Rule names for the scan** (`gstin`, `local-data-path`, `database-file`, `html-outside-fixtures`,
  `document-outside-fixtures`, and `mobile` and `company-details` from PR 3) are an implementation detail.
