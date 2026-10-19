# CLAUDE.md — rules for agents working in this repo

SenstoSales: a supplier-side ERP for BHEL purchase orders: upload POs and SRVs, create DCs and invoices, and track
quantities. See `README.md`. The product is built; coding agents maintain it. This file holds only the rules that
apply to every task; situational procedures are skills in `.claude/skills/` (`implement-pr`, `escalate`,
`edit-docs`).

## 1. Sources of truth

- `docs/ARCHITECTURE.md` is the single source of truth. **§2 (the contract, C1–Cn) is binding on every change**;
  §2 below copies it. Where a spec and the architecture disagree, stop and escalate (§4).
- `docs/ENGINEERING.md`: how to write code here. Read it once per session.
- Read only what the change needs. Never read `ACTIVE.md`, `ARCHITECTURE.md` or `DECISIONS.md` in full: together
  they cost tens of thousands of tokens. Find sections with `grep -n "^#"` and read line ranges.
- You may read every project document. Never read, copy or quote private data into the repo: the owner's local BHEL
  corpus (`SENSTO_CORPUS_DIR`), the legacy database, or anything under `C:/Projects/SenstoSales-private`. The legacy
  code backup may be read for business rules and visible output only (C16).

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

Every change goes through a PR: `main` takes PRs only. Work in a worktree beside the repo
(`C:/Projects/SenstoSales-worktrees/<name>`), never in the main checkout. Flow: branch off fresh `origin/main` →
change, tests first → targeted checks → PR → green CI → answer any bot threads once → done. The `/implement-pr`
skill holds the steps. Agents never merge their own PR (INV-89). Work in flight is read from open PRs, not from
`ACTIVE.md`.

Never run the full suite locally: no `pnpm verify`, `pnpm check:code`, unfiltered `vp test run`, repo-wide `tsc -b`
or the full e2e. Run only the tests for the files you changed and fmt/lint on the changed files; CI runs everything
(the checks by job are in `CONTRIBUTING.md`). Run tools through pnpm, never `npx`. In shell commands write `C:/...`
paths, never `/c/...`.

```sh
pnpm install                    # dependencies (Node 26+, pnpm 11)
pnpm test <files>               # only the files you changed; locally at most two workers
pnpm exec vp check <files>      # format and lint the files you changed (`pnpm format` rewrites formatting)
```

Tooling is Vite+ (`vp`): Oxlint for lint (including the C15 limits), Oxfmt for formatting, Vitest for tests (import
from `vite-plus/test`). There is no ESLint or Prettier.

Write plainly: no marketing language, and no claim that isn't backed by a test or a measured result.

## 4. Decisions: decide and log, or escalate

**Decide yourself and record it** (status `decided`, in the PR body and the decisions log): implementation
choices within one spec's scope that don't change ARCHITECTURE, a public API shape, a schema other specs rely on,
or a §2 rule. For example internal module structure, a library among licence-clean equivalents, naming, error
messages, or the most conservative reading of a genuinely ambiguous spec detail. Don't log trivial choices.

**Escalate** with the `/escalate` skill, never decide, when:

- the change would alter or contradict `ARCHITECTURE.md` or `OPEN_QUESTIONS.md`;
- it would build a candidate from the candidates register;
- it needs credentials, secrets, paid accounts, or anything only a human can do;
- it changes a public API or a table other specs depend on, beyond what the spec defines;
- two specs contradict each other;
- the same failure persists after three honest attempts.

Editing `docs/` (architecture, specs, invariants, the tracker, decisions): the `/edit-docs` skill.
