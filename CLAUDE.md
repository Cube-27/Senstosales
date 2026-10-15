# CLAUDE.md — rules for agents working in this repo

SenstoSales: a supplier-side ERP for BHEL purchase orders: upload POs and SRVs, create DCs and invoices, and track quantities. See `README.md`. Coding agents implement it, mostly autonomously, from the specs. The
owner is involved only for the escalations listed below. Read this file fully before doing anything.

## 1. Read order

1. `docs/plans/ACTIVE.md`: its "Current focus" section and your spec's table (plus "Follow-ups" if your spec is
   named there).
2. The spec for your work in `docs/specs/`: its design, invariants, acceptance criteria, and your PR's row in the
   PR plan.
3. `docs/ARCHITECTURE.md` §2 and only the sections your spec cites. **§2 (the contract, C1–Cn) is binding on every
   change.** Read it once per session.
4. Decisions you must stay consistent with: your spec's `docs/decisions/SPEC-NN.md` (large files: scan the `### D-`
   headings, read the entries your rows touch), the "Index of open items" in `docs/DECISIONS.md`, and any D-ID
   you are pointed to (`grep -rn "### D-NNNN" docs/DECISIONS.md docs/decisions`).
5. `docs/ENGINEERING.md`: how to write code here. Read it once per session.

**Never read `ACTIVE.md`, `ARCHITECTURE.md` or `DECISIONS.md` in full**: together they cost tens of thousands of
tokens. Find sections with `grep -n "^#"` and read line ranges.

`ARCHITECTURE.md` is the single source of truth. Where a spec and the architecture disagree, stop and escalate
(§5). You may read every project document. Never read, copy or quote private data into the repo: the owner's local BHEL corpus (`SENSTO_CORPUS_DIR`), the legacy database, or anything under `C:/Projects/SenstoSales-private`. The legacy code backup may be read for business rules and visible output only (C16).

## 2. Hard rules

The contract, copied from `docs/ARCHITECTURE.md` §2 (that file wins if they ever differ). Breaking one is a defect
even when it "fixes" something.

- **(C1)** No real data in the repo: no supplier name, GSTIN, address, person's name, real PO/SRV/DC/invoice number, identifying record counts, business plans, DB files, real HTML pages or local data paths. Fixtures are anonymised or synthetic (§14.3). Private inputs are read only from env-var paths (`SENSTO_CORPUS_DIR`). _Enforced by: `real-data-scan` CI job and hook; review._
- **(C2)** Business rules come from the spec or Appendix A, never from invention. Each is implemented once in `packages/domain`, cites its `INV-NN`, and has a table-driven test with literal expected values. Nothing else computes quantities, status, FY, GEMC rates, tax or flags. _Enforced by: Review; Oxlint import boundaries; `INVARIANTS.md` (INV-01..INV-65)._
- **(C3)** Quantities are integer milli-units and money integer 1e-5 units end to end; dates are `YYYY-MM-DD` strings (IST calendar dates). No floats or `Date` objects in domain code, columns or arithmetic. _Enforced by: Branded types; Oxlint bans in `packages/domain`._
- **(C4)** Every write use case builds one `WriteBatch` and commits it once. Ids (ULID) are generated in the service. No triggers, views, interactive transactions or SQL that D1 cannot run. _Enforced by: `Db` port has no `transaction()`; D1 dialect CI step (INV-84)._
- **(C5)** PO and SRV data enter only through `packages/parsers` from BHEL HTML. The legacy DB is never an input. Derived columns are written only by service batches. _Enforced by: Boundaries; review (INV-49)._
- **(C6)** No hard caps on DC or invoice creation. The only creation-time rejections are malformed input (qty <= 0, unknown ids, `(number, FY)` collision) and the DC-sourced invoice rule (qty = DC qty, rate = PO rate). _Enforced by: API tests._
- **(C7)** User flows and the set of on-screen elements are frozen: no flow changes and no added or removed elements, routes, labels or columns. Minor visual changes are allowed when they reduce maintenance, improve performance or increase consistency. CSV/Excel layouts are frozen cell for cell. `globals.css` tokens change only through an ADR; standard roles use `role-*` classes; no `!important`, no ad-hoc `dark:` colour fixes, no local formatters; shared UI comes from the single registry. _Enforced by: Ported design validators; export golden tests; review._
- **(C8)** No interaction moves or resizes anything around it: fixed table layout with explicit widths, reserved page height with padded rows, a pager that never moves, and loading/empty/error states in the same footprint. _Enforced by: DataTable e2e bounding-box test._
- **(C9)** Startup is read-only for DB schema and content. The only sanctioned mutation is the version-gated upgrade step, always after a backup. No runtime endpoint resets the database, deletes or prunes the audit log. _Enforced by: Startup test asserts no writes; route-table review._
- **(C10)** The API binds to `127.0.0.1` and rejects any non-loopback `Host`. Never weakened or made configurable for the local build. _Enforced by: API test (non-loopback Host -> 400)._
- **(C11)** No user-facing security friction: no forced password change, login backoff, complexity rules or CLI-only recovery. Plain language and fewest steps in every flow. _Enforced by: Review (INV-80)._
- **(C12)** Core packages depend on ports only. `node:*`, Playwright, Tauri and filesystem modules are imported only in `platform/*` adapters and `apps/desktop`. _Enforced by: Oxlint `no-restricted-imports` (INV-85)._
- **(C13)** Dependencies under AGPL, GPL, SSPL, Commons Clause or non-commercial licences are refused; LGPL is avoided. SPDX expressions matched by whole identifier. _Enforced by: `licenses` CI job with CycloneDX SBOM (INV-77)._
- **(C14)** Nothing in the Candidates register (§17) or `EDGE_CASES.md` is built without owner approval recorded in Appendix A. _Enforced by: Review (INV-88)._
- **(C15)** Hard guardrails: no source file over 800 lines (Oxlint `max-lines`) and no function over complexity 15 (Oxlint `complexity`); generated files and lockfiles excluded; the fix is a split, never a suppression. A bug or review finding that recurs becomes a check or a regression test in the PR that fixes it. No coverage gates. _Enforced by: Oxlint (`vp lint`) in `check`; RECURRING.md; review._
- **(C16)** Legacy code may be read for business rules and visible output (UI/UX, export formats), never copied verbatim and never as a model for implementation: match the output, build it the simplest efficient way. _Enforced by: Review (INV-91)._
- **(C17)** BHEL page content is data, never executed. The portal origin is a constant; PO ids are validated `^\d{1,10}$`; file locations come from the Storage port, never from a request. _Enforced by: Scraper unit tests; review._
- **(C18)** When an agent finds, while coding, an edge case the spec does not cover, it records the case as a new `EC-NN` row in `EDGE_CASES.md` (case, example, why deferred, found in) and implements the spec's behaviour (or, where the spec is silent, the frozen legacy behaviour). It never invents handling for the case. _Enforced by: Review; PR template checkbox (INV-92)._

Generic rules:

- **Build only core.** Anything in ARCHITECTURE's candidates register is not built until the owner admits it. If a
  task asks for one, stop and point at this rule; log evidence for one in `DECISIONS.md` as `needs-owner`.
- **Never execute model output.** Generated code, queries or selectors are data run by our own interpreters.
- **Public repo.** No real customer, user or company data, no business terms, no
  secrets, no captures of real systems. Fixtures are synthetic and use reserved names (`example.com`, `.test`).
- **Dependency licences.** No dependencies under AGPL, GPL, SSPL or non-commercial licences. LGPL is allowed but
  avoided. CI enforces this.
- **Checks are never weakened.** Never skip hooks (`--no-verify`), lower a threshold, add a suppression to pass a
  check, or use an admin bypass of the branch rules.

## 3. How work runs

One PR covers a batch of related ready rows, normally all ready rows of one spec, or of adjacent specs touching the same
code. Target 30-80 changed files or about 1500-4000 changed lines; split only when a row waits on a human task or on
unmerged code, or the PR would pass ~4000 lines. Branch `spec-NN/pr-A-B-<name>`, worktree `spec-NN-pr-A-B`. Commit row
by row; the tracker commit marks every row in the batch `done (#n)`. One `/simplify` pass and one review per PR,
regardless of size. Project skills in `.claude/skills/` hold the procedures:

| Skill           | Who runs it               | Does                                                                                                                                                                                             |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/run-plan`     | The orchestrator          | Assigns batches of ready rows to workers (at most 4 at once; reviewers don't count), hands out decision IDs, merges `READY` PRs one at a time on green CI, keeps the tracker current, escalates. |
| `/implement-pr` | A worker                  | Takes one batch of rows from `todo` to an open, verified PR: tests first, then code, self-review, PR body. Owns the PR until it merges.                                                          |
| `/review-pr`    | A fresh reviewer          | One verdict per PR against its spec rows, §2 and `docs/ENGINEERING.md`: `MERGE`, `MERGE AFTER FIX` or `ESCALATE`.                                                                                |
| `/pickup`       | Anyone starting a session | Resumes in-flight rows from the trail, or pauses cleanly.                                                                                                                                        |

Worktrees live in `C:/Projects/SenstoSales-worktrees/spec-NN-pr-A-B` (beside the repo, never inside it), on branch
`spec-NN/pr-A-B-<short-name>`. Never work in the main checkout.

**Shared files.** With an orchestrator running, it gives each implementor a decision-ID range at assignment; the
implementor writes its rows (`done (#n)`) to `ACTIVE.md` and its decisions to the decisions log (`DECISIONS.md`,
"Where an entry goes") in the PR's tracker commit, before its first `READY`. "Current focus" is refreshed only when
it materially changes, by the implementor the orchestrator asks. Workers put their decisions in the PR body
(`## Decisions`). A solo agent with no orchestrator uses the next free IDs.

`main` requires a PR for every change, including tracker updates. Work in flight is read from open PRs and
`spec-*` branches, not from ACTIVE.md. Never merge without a `MERGE` or `MERGE AFTER FIX` verdict from someone other
than the author (every listed fix made) and green CI. One review per PR, no re-review. Agents never merge directly:
`tools/orchestrator/merge_pr.sh` is the only merge path; never run `gh pr merge` yourself.

## 4. Decisions: decide and log, or escalate

**Decide yourself and record it** (status `decided`, through the PR body or the decisions log per §3): implementation
choices within one spec's scope that don't change ARCHITECTURE, a public API shape, a schema other specs rely on,
or a §2 rule. For example internal module structure, a library among licence-clean equivalents, naming, error
messages, or the most conservative reading of a genuinely ambiguous spec detail. Don't log trivial choices.

**Escalate** (§5) when:

- the change would alter or contradict `ARCHITECTURE.md` or `OPEN_QUESTIONS.md`;
- it would build a candidate from the candidates register;
- it needs credentials, secrets, paid accounts, or anything only a human can do;
- it changes a public API or a table other specs depend on, beyond what the spec defines;
- two specs contradict each other;
- the same failure persists after three honest attempts.

## 5. Escalation procedure

1. Record a `needs-owner` decision: the question, the options, your recommendation, and what is blocked. Copy it
   as a row to `OPEN_QUESTIONS.md`. This copy is the only change an agent makes to that file without owner
   approval.
2. The row becomes `blocked (D-NNNN)`. The orchestrator writes both; working solo, you do.
3. Move on to the next ready row. Don't wait idle; the owner answers asynchronously.

## 6. Editing documents

- `ARCHITECTURE.md` and `OPEN_QUESTIONS.md` change only with owner approval. When approved, add a revision-log row
  and keep the specs consistent in the same change.
- Specs follow one template (`docs/specs/README.md`). Clarifying edits that don't change the architecture are
  allowed and logged in the spec's decisions file.
- A spec that adds an invariant appends its row to `docs/INVARIANTS.md`. Invariants are never removed.
- `ACTIVE.md`, `DECISIONS.md` and `docs/decisions/` are working documents: current, short and factual. In
  `ACTIVE.md`, a spec whose rows are all done collapses to one line under "Done specs"; its open notes move to
  "Follow-ups" unless a row not done already carries them.
- Write plainly. No marketing language, and no claim that isn't backed by a test or a measured result.

## 7. Commands

Needs: Node 26+, pnpm 11 (`corepack enable`), Git Bash on Windows. Run from the repo root.

```sh
pnpm install         # dependencies
pnpm hooks           # once per clone: the `vp staged` pre-commit hook (fmt, lint, real-data scan --staged)
pnpm verify          # CI only, never run locally: everything CI runs, in CI's order; stops at the first failure
pnpm start           # builds apps/web, then runs the app on 127.0.0.1 and prints its address; Ctrl+C stops it
pnpm format          # vp fmt --write (Oxfmt)
pnpm test <files>    # only the files you changed; locally at most two workers. Run tools through pnpm, never npx
```

The checks CI runs, by job (every job must pass before merge). Each is a root script, so `pnpm verify` runs them all:

```sh
pnpm check:code        # check: vp check (Oxfmt + Oxlint), language (INV-90), status-source (INV-64), migration SQL lint
                       # and D1 dialect step (INV-84), design validators (INV-66), tsc -b, vp test run (incl. tools)
pnpm check:real-data   # real-data-scan (C1); exceptions only in tools/checks/real-data-allow.txt
pnpm check:licenses    # licenses (C13), plus a CycloneDX SBOM artifact in CI
pnpm check:build       # build: pnpm -r build, then the web shell bundle budget (INV-104)
pnpm check:audit       # audit: pnpm audit --prod at high, action pins and read-only permissions (INV-108)
pnpm check:desktop     # desktop (Windows CI only, not in verify: installs, runs and uninstalls the app; SPEC-20)
```

Tooling is Vite+ (`vp`): Oxlint for lint (including the C15 limits `max-lines` 800 and `complexity` 15), Oxfmt for
formatting, Vitest for tests (import from `vite-plus/test`). There is no ESLint or Prettier.
