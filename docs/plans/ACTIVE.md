# Implementation tracker

The live state of implementation. The orchestrator (`/run-plan`) decides its content and the implementor writes it
in its PR's tracker commit; a solo agent with no orchestrator updates it in its own PR (`CLAUDE.md` §3). One row is
one PR from a spec's PR plan (119 rows). Spec dependencies are in [`specs/README.md`](../specs/README.md). Work in
flight is read from open PRs and `spec-*` branches, not from this file.

A row is ready when everything it needs is available: the code it touches or builds on is merged, or what it needs
from unmerged work is fully specified (types, API shapes, table columns). Readiness is per row.

**Statuses:**

- `todo`
- `done (#n)`: merged, with the PR number.
- `blocked (D-NNNN)`: waits on an owner answer to that decision.
- `human`: waits on a human-only task (below).
- `deferred`: not in the current exit predicate.

Updated: 2026-10-14.

## Human-only tasks

Agents can't do these (secrets, accounts, purchases, data only a person may see). Rows that depend on them are
`human` until done; the Notes column of each spec table names the task.

| #   | Task                                                                                                                                  | Needed by                                | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| H1  | Apply the `main` ruleset (required checks, linear history, no bypass) and turn on secret scanning and push protection (SPEC-00 §4.7). | SPEC-00 PR 4                             | todo             |
| H2  | ~~Owner adds the GitHub Actions secret `SENSTO_DENYLIST`.~~ The hashed denylist was dropped.                                          | —                                        | dropped (D-0010) |
| H3  | BHEL portal credentials and OTP mailbox, on the owner's machine only.                                                                 | SPEC-01 PR 2, SPEC-19 PR 6               | todo             |
| H4  | `SENSTO_CORPUS_DIR` set to the local BHEL corpus on the build machine.                                                                | SPEC-01 PR 5, SPEC-06 PR 6, SPEC-09 PR 3 | todo             |
| H5  | Run the legacy app on synthetic input and produce the golden output, outside the repo.                                                | SPEC-01 PR 4, SPEC-12 PR 2, SPEC-13 PR 1 | todo             |
| H6  | Tauri updater signing key as a release secret.                                                                                        | SPEC-20 PR 5                             | todo             |
| H7  | Fresh Windows VM install, upgrade and operations test.                                                                                | SPEC-20 (L8 exit), SPEC-21 PR 5          | todo             |
| H8  | Owner cutover: fresh import, review and sign-off.                                                                                     | SPEC-22 PR 2–3                           | todo             |

## Current focus

- In flight: SPEC-02 PR 4, SPEC-01 PR 1, tooling PR.
- Next: SPEC-03.
- Waiting on owner: SPEC-00 PR 4 (H1), SPEC-01 PR 2 (H3), PR 4 (H5), PR 5 (H4).

## [SPEC-00 — Repo bootstrap and engineering foundations](../specs/SPEC-00-repo-bootstrap.md)

| PR  | Scope                                             | Status    | Notes |
| --- | ------------------------------------------------- | --------- | ----- |
| 1   | Bootstrap (setup session)                         | done (#1) |       |
| 2   | `build` and `audit` jobs, language and pin checks | done (#4) |       |
| 3   | Company-details check                             | done (#3) |       |
| 4   | Rulesets and repo settings                        | todo      | H1    |

## [SPEC-01 — Spikes (L0.5)](../specs/SPEC-01-spikes.md)

| PR  | Scope                                     | Status    | Notes |
| --- | ----------------------------------------- | --------- | ----- |
| 1   | Spike: sidecar lifecycle                  | todo      |       |
| 2   | Spike: Edge login with captcha and OTP    | todo      | H3    |
| 3   | Spike: node:sqlite + Drizzle batch + D1   | done (#5) |       |
| 4   | Spike: exceljs output fidelity 1/20/21/60 | todo      | H5    |
| 5   | Spike: parser feasibility                 | todo      | H4    |

## [SPEC-02 — Domain: units, quantities, received/rejected, status](../specs/SPEC-02-domain-quantities-receipt-status.md)

| PR  | Scope                               | Status    | Notes |
| --- | ----------------------------------- | --------- | ----- |
| 1   | Units, dates and tolerance          | done (#7) |       |
| 2   | Quantities                          | done (#8) |       |
| 3   | Received and rejected (date winner) | done (#9) |       |
| 4   | Item and PO status                  | todo      |       |

## [SPEC-03 — Domain: FY, GEMC, tax, links, guards, flags](../specs/SPEC-03-domain-fy-gemc-tax-links-flags.md)

| PR  | Scope                             | Status | Notes |
| --- | --------------------------------- | ------ | ----- |
| 1   | FY, document keys and GC defaults | todo   |       |
| 2   | GEMC                              | todo   |       |
| 3   | Tax                               | todo   |       |
| 4   | Links and item matching           | todo   |       |
| 5   | Guards and line validation        | todo   |       |
| 6   | Flag detection and diff           | todo   |       |

## [SPEC-04 — Schemas, route table and formatters](../specs/SPEC-04-schemas-routes-formatters.md)

| PR  | Scope                            | Status | Notes |
| --- | -------------------------------- | ------ | ----- |
| 1   | Primitives and enums             | todo   |       |
| 2   | Entities and API shapes          | todo   |       |
| 3   | Route table and typed client     | todo   |       |
| 4   | OpenAPI generation and freshness | todo   |       |
| 5   | Shared formatters                | todo   |       |

## [SPEC-05 — Database: schema, migrations, Db port, seed](../specs/SPEC-05-db-schema-migrations.md)

| PR  | Scope                                  | Status | Notes |
| --- | -------------------------------------- | ------ | ----- |
| 1   | Db port and node:sqlite executor       | todo   |       |
| 2   | Drizzle schema and custom types        | todo   |       |
| 3   | Migration 0001 and migrator            | todo   |       |
| 4   | D1 executor, dialect step and SQL lint | todo   |       |
| 5   | Version helper and seed                | todo   |       |

## [SPEC-06 — BHEL parsers, anonymised fixtures and the corpus test](../specs/SPEC-06-bhel-parsers-fixtures.md)

| PR  | Scope                                      | Status | Notes |
| --- | ------------------------------------------ | ------ | ----- |
| 1   | Document types, anonymiser, first fixtures | todo   |       |
| 2   | HTML utilities, dates, PO header           | todo   |       |
| 3   | PO items, lots, continuation rows, GEMC    | todo   |       |
| 4   | SRV parser                                 | todo   |       |
| 5   | Fixture completion and golden runner       | todo   |       |
| 6   | Corpus test                                | todo   | H4    |

## [SPEC-07 — API foundation, startup, auth, onboarding and settings](../specs/SPEC-07-api-foundation-auth-settings.md)

| PR  | Scope                                                 | Status | Notes |
| --- | ----------------------------------------------------- | ------ | ----- |
| 1   | App factory, errors and guards                        | todo   |       |
| 2   | Node platform entry and adapters                      | todo   |       |
| 3   | Startup upgrade gate                                  | todo   |       |
| 4   | Simple login                                          | todo   |       |
| 5   | Onboarding, supplier, settings, buyers, BHEL password | todo   |       |
| 6   | Route conformance                                     | todo   |       |

## [SPEC-08 — Ingestion services and the job model](../specs/SPEC-08-ingestion-jobs.md)

| PR  | Scope                                  | Status | Notes |
| --- | -------------------------------------- | ------ | ----- |
| 1   | Jobs port, worker and job API          | todo   |       |
| 2   | Source documents and recompute service | todo   |       |
| 3   | PO ingest service and upload           | todo   |       |
| 4   | SRV ingest service and upload          | todo   |       |
| 5   | Folder import jobs                     | todo   |       |
| 6   | `recompute-all` job                    | todo   |       |

## [SPEC-09 — Corpus import and report (local only)](../specs/SPEC-09-corpus-import-report.md)

| PR  | Scope                                       | Status | Notes |
| --- | ------------------------------------------- | ------ | ----- |
| 1   | Corpus import runner                        | todo   |       |
| 2   | Import report                               | todo   |       |
| 3   | Corpus ingestion assertions and idempotency | todo   | H4    |

## [SPEC-10 — PO, SRV, flags, audit, dashboard and search APIs](../specs/SPEC-10-po-srv-flags-read-api.md)

| PR  | Scope                                       | Status | Notes |
| --- | ------------------------------------------- | ------ | ----- |
| 1   | PO list, stats and detail                   | todo   |       |
| 2   | PO manual create, edit and delete           | todo   |       |
| 3   | Manual dispatched quantity                  | todo   |       |
| 4   | SRV list, by-PO list, detail and delete     | todo   |       |
| 5   | Flags and audit                             | todo   |       |
| 6   | Dashboard, search and delivery tracker data | todo   |       |

## [SPEC-11 — DC and invoice services and APIs](../specs/SPEC-11-dc-invoice-services.md)

| PR  | Scope                                            | Status | Notes |
| --- | ------------------------------------------------ | ------ | ----- |
| 1   | DC create and dispatchable items                 | todo   |       |
| 2   | DC header edit, delete, list, stats, detail      | todo   |       |
| 3   | DC-sourced invoice                               | todo   |       |
| 4   | PO-direct invoice and previews                   | todo   |       |
| 5   | Invoice header edit, delete, list, stats, detail | todo   |       |
| 6   | Cross-flow API suite                             | todo   |       |

## [SPEC-12 — DC, invoice and GC Excel documents](../specs/SPEC-12-excel-documents.md)

| PR  | Scope                                  | Status | Notes           |
| --- | -------------------------------------- | ------ | --------------- |
| 1   | De-branded templates and snapshot tool | todo   |                 |
| 2   | Golden inputs and legacy snapshots     | todo   | H5              |
| 3   | DC workbook                            | todo   | needs 12-2 (H5) |
| 4   | Invoice workbook                       | todo   | needs 12-2 (H5) |
| 5   | GC workbook                            | todo   | needs 12-2 (H5) |
| 6   | Download routes                        | todo   |                 |

## [SPEC-13 — Reports and exports](../specs/SPEC-13-reports-exports.md)

| PR  | Scope                                               | Status | Notes |
| --- | --------------------------------------------------- | ------ | ----- |
| 1   | Export inventory and goldens                        | todo   | H5    |
| 2   | Streaming writers and keyset paging                 | todo   |       |
| 3   | Registers and list CSVs                             | todo   |       |
| 4   | Pending, reconciliation, export-selected, GC report | todo   |       |
| 5   | Report lists and delivery-tracker export            | todo   |       |

## [SPEC-14 — Web shell, frozen design system, DataTable and platform adapter](../specs/SPEC-14-web-shell-design-datatable.md)

| PR  | Scope                                 | Status | Notes |
| --- | ------------------------------------- | ------ | ----- |
| 1   | App skeleton, router and query        | todo   |       |
| 2   | Frozen design carry-over              | todo   |       |
| 3   | Design validators                     | todo   |       |
| 4   | Shell components                      | todo   |       |
| 5   | Primitives and FormField              | todo   |       |
| 6   | DataTable, Pagination and list search | todo   |       |
| 7   | Platform adapter                      | todo   |       |
| 8   | Playwright harness and `e2e` job      | todo   |       |

## [SPEC-15 — Web: onboarding, login, settings, dashboard and search](../specs/SPEC-15-web-onboarding-login-settings-dashboard.md)

| PR  | Scope                      | Status | Notes |
| --- | -------------------------- | ------ | ----- |
| 1   | Login and session handling | todo   |       |
| 2   | Onboarding                 | todo   |       |
| 3   | Settings                   | todo   |       |
| 4   | Dashboard                  | todo   |       |
| 5   | Global search              | todo   |       |

## [SPEC-16 — Web: PO and SRV screens, uploads and folder import](../specs/SPEC-16-web-po-srv-import.md)

| PR  | Scope                               | Status | Notes |
| --- | ----------------------------------- | ------ | ----- |
| 1   | PO list                             | todo   |       |
| 2   | PO detail and manual dispatched qty | todo   |       |
| 3   | PO create and edit                  | todo   |       |
| 4   | SRV list and detail                 | todo   |       |
| 5   | Folder import and job progress      | todo   |       |

## [SPEC-17 — Web: deviations, ledger, delivery tracker and reports](../specs/SPEC-17-web-deviations-ledger-tracker-reports.md)

| PR  | Scope             | Status | Notes |
| --- | ----------------- | ------ | ----- |
| 1   | Deviations screen | todo   |       |
| 2   | Ledger screen     | todo   |       |
| 3   | Delivery tracker  | todo   |       |
| 4   | Reports           | todo   |       |

## [SPEC-18 — Web: DC and invoice screens](../specs/SPEC-18-web-dc-invoice.md)

| PR  | Scope                       | Status | Notes |
| --- | --------------------------- | ------ | ----- |
| 1   | DC list and detail          | todo   |       |
| 2   | DC create                   | todo   |       |
| 3   | Invoice list and detail     | todo   |       |
| 4   | Invoice create (both modes) | todo   |       |
| 5   | Document flow e2e           | todo   |       |

## [SPEC-19 — BHEL scraper and sync](../specs/SPEC-19-bhel-scraper-sync.md)

| PR  | Scope                                | Status | Notes |
| --- | ------------------------------------ | ------ | ----- |
| 1   | Scraper port, fake and sessions      | todo   |       |
| 2   | Playwright adapter: launch and login | todo   |       |
| 3   | HTTP session listing and fetch       | todo   |       |
| 4   | Scrape jobs and wizard API           | todo   |       |
| 5   | Sync wizard UI and tray status       | todo   |       |
| 6   | Live sync acceptance (human)         | todo   | H3    |

## [SPEC-20 — Desktop packaging and release](../specs/SPEC-20-desktop-packaging-release.md)

| PR  | Scope                                    | Status | Notes  |
| --- | ---------------------------------------- | ------ | ------ |
| 1   | Sidecar build                            | todo   |        |
| 2   | Tauri shell and sidecar lifecycle        | todo   |        |
| 3   | Plugin capabilities and tray             | todo   |        |
| 4   | NSIS installer and `desktop` job         | todo   |        |
| 5   | Versioning, updater and release workflow | todo   | H6, H7 |

## [SPEC-21 — Operations: backups, restore, logs and the operations guide](../specs/SPEC-21-operations-backup-logs.md)

| PR  | Scope                   | Status | Notes |
| --- | ----------------------- | ------ | ----- |
| 1   | Backup job and rotation | todo   |       |
| 2   | Restore                 | todo   |       |
| 3   | Settings backup panel   | todo   |       |
| 4   | Logs                    | todo   |       |
| 5   | Operations guide        | todo   | H7    |

## [SPEC-22 — Cutover](../specs/SPEC-22-cutover.md)

| PR  | Scope                           | Status | Notes |
| --- | ------------------------------- | ------ | ----- |
| 1   | Cutover procedure               | todo   |       |
| 2   | Fresh import and review (human) | todo   | H8    |
| 3   | Sign-off and retirement (human) | todo   | H8    |
