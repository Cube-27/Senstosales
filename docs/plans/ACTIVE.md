# Implementation tracker

The live state of implementation. The orchestrator (`/run-plan`) decides its content and the implementor writes it
in its PR's tracker commit; a solo agent with no orchestrator updates it in its own PR (`CLAUDE.md` §3). One row is
one PR from a spec's PR plan (120 rows). Spec dependencies are in [`specs/README.md`](../specs/README.md). Work in
flight is read from open PRs and `spec-*` branches, not from this file.

A row is ready when everything it needs is available: the code it touches or builds on is merged, or what it needs
from unmerged work is fully specified (types, API shapes, table columns). Readiness is per row.

**Statuses:**

- `todo`
- `done (#n)`: merged, with the PR number.
- `blocked (D-NNNN)`: waits on an owner answer to that decision.
- `human`: waits on a human-only task (below).
- `deferred`: not in the current exit predicate.

Updated: 2026-10-15.

## Human-only tasks

Agents can't do these (secrets, accounts, purchases, data only a person may see). Rows that depend on them are
`human` until done; the Notes column of each spec table names the task.

| #   | Task                                                                                                                                  | Needed by                                 | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| H1  | Apply the `main` ruleset (required checks, linear history, no bypass) and turn on secret scanning and push protection (SPEC-00 §4.7). | SPEC-00 PR 4                              | todo             |
| H2  | ~~Owner adds the GitHub Actions secret `SENSTO_DENYLIST`.~~ The hashed denylist was dropped.                                          | —                                         | dropped (D-0010) |
| H3  | BHEL portal credentials and OTP mailbox, on the owner's machine only.                                                                 | SPEC-01 PR 2, SPEC-19 PR 6                | todo             |
| H4  | `SENSTO_CORPUS_DIR` set to the local BHEL corpus on the build machine.                                                                | SPEC-01 PR 5, SPEC-06 PR 6, SPEC-09 PR 3  | todo             |
| H5  | Run the legacy app on synthetic input and produce the golden output, outside the repo.                                                | SPEC-01 PR 4, SPEC-12 PR 2, SPEC-13 PR 1b | todo             |
| H6  | Tauri updater signing key as a release secret.                                                                                        | SPEC-20 PR 5                              | todo             |
| H7  | Fresh Windows VM install, upgrade and operations test.                                                                                | SPEC-20 (L8 exit), SPEC-21 PR 5           | todo             |
| H8  | Owner cutover: fresh import, review and sign-off.                                                                                     | SPEC-22 PR 2–3                            | todo             |

## Current focus

In flight: SPEC-13 PR 4, SPEC-12 PR 6, path-guard fix (#74). Next: SPEC-14 PR 1 after #74, then SPEC-07 PR 6 once every route is mounted. Waiting on owner: SPEC-00 PR 4 (H1), SPEC-01 PR 2 (H3), PR 4 (H5), PR 5 (H4), SPEC-06 PR 6 (H4), SPEC-09 PR 3 (H4), SPEC-12 PR 2 (H5), SPEC-13 PR 1b (H5).

## [SPEC-00 — Repo bootstrap and engineering foundations](../specs/SPEC-00-repo-bootstrap.md)

| PR  | Scope                                             | Status    | Notes |
| --- | ------------------------------------------------- | --------- | ----- |
| 1   | Bootstrap (setup session)                         | done (#1) |       |
| 2   | `build` and `audit` jobs, language and pin checks | done (#4) |       |
| 3   | Company-details check                             | done (#3) |       |
| 4   | Rulesets and repo settings                        | todo      | H1    |

## [SPEC-01 — Spikes (L0.5)](../specs/SPEC-01-spikes.md)

| PR  | Scope                                     | Status     | Notes |
| --- | ----------------------------------------- | ---------- | ----- |
| 1   | Spike: sidecar lifecycle                  | done (#13) |       |
| 2   | Spike: Edge login with captcha and OTP    | todo       | H3    |
| 3   | Spike: node:sqlite + Drizzle batch + D1   | done (#5)  |       |
| 4   | Spike: exceljs output fidelity 1/20/21/60 | todo       | H5    |
| 5   | Spike: parser feasibility                 | todo       | H4    |

## [SPEC-02 — Domain: units, quantities, received/rejected, status](../specs/SPEC-02-domain-quantities-receipt-status.md)

| PR  | Scope                               | Status     | Notes                  |
| --- | ----------------------------------- | ---------- | ---------------------- |
| 1   | Units, dates and tolerance          | done (#7)  |                        |
| 2   | Quantities                          | done (#8)  |                        |
| 3   | Received and rejected (date winner) | done (#9)  |                        |
| 4   | Item and PO status                  | done (#11) |                        |
| 5   | INV-64 single status source check   | done (#19) | before SPEC-08/SPEC-16 |

## [SPEC-03 — Domain: FY, GEMC, tax, links, guards, flags](../specs/SPEC-03-domain-fy-gemc-tax-links-flags.md)

| PR  | Scope                             | Status     | Notes |
| --- | --------------------------------- | ---------- | ----- |
| 1   | FY, document keys and GC defaults | done (#12) |       |
| 2   | GEMC                              | done (#14) |       |
| 3   | Tax                               | done (#15) |       |
| 4   | Links and item matching           | done (#16) |       |
| 5   | Guards and line validation        | done (#17) |       |
| 6   | Flag detection and diff           | done (#18) |       |

## [SPEC-04 — Schemas, route table and formatters](../specs/SPEC-04-schemas-routes-formatters.md)

| PR  | Scope                            | Status     | Notes |
| --- | -------------------------------- | ---------- | ----- |
| 1   | Primitives and enums             | done (#20) |       |
| 2   | Entities and API shapes          | done (#23) |       |
| 3   | Route table and typed client     | done (#27) |       |
| 4   | OpenAPI generation and freshness | done (#31) |       |
| 5   | Shared formatters                | done (#21) |       |

## [SPEC-05 — Database: schema, migrations, Db port, seed](../specs/SPEC-05-db-schema-migrations.md)

| PR  | Scope                                  | Status     | Notes |
| --- | -------------------------------------- | ---------- | ----- |
| 1   | Db port and node:sqlite executor       | done (#22) |       |
| 2   | Drizzle schema and custom types        | done (#25) |       |
| 3   | Migration 0001 and migrator            | done (#26) |       |
| 4   | D1 executor, dialect step and SQL lint | done (#33) |       |
| 5   | Version helper and seed                | done (#32) |       |

Follow-ups (not yet rows): po_id indexes on dc, invoice, srv and reconciliation_issue for correlated counts (#44 review); chunk multi-row inserts under D1's 100-bound-parameter limit (#43 review); INV rows for the delivery-tracker and dashboard rules; SRV search with a value range reads all candidate SRVs (#53 review). SRV ingest does not bump the PO version, so an overlapping DC create can write rcd_qty from a stale snapshot until the next recompute; SRV ingest race on links (#55); a DC create racing a DC edit that frees the same number (SRV items on a third PO) (#59 review); held-batch test for a DC delete committing between an invoice create's read and commit (#60 review); rename audit action delete-srv to srv.delete and align the buyer/settings action names (#67 review); move tickingClock into service-deps.ts (#67 review). Indexes on dc_item(dc_id), dc_item(po_item_id), invoice_item(invoice_id), srv_item(resolved_*) (#69 review).

## [SPEC-06 — BHEL parsers, anonymised fixtures and the corpus test](../specs/SPEC-06-bhel-parsers-fixtures.md)

| PR  | Scope                                      | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Document types, anonymiser, first fixtures | done (#24) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | HTML utilities, dates, PO header           | done (#28) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | PO items, lots, continuation rows, GEMC    | done (#30) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | SRV parser                                 | done (#29) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | Fixture completion and golden runner       | done (#34) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Corpus test                                | todo       | H4. Check (from #28 review): cheerio `text()` joins `<br>` and nested-table cell text with no space; `findByLabel`'s value-below ignores colspan. Check (from #29 review): SRV error locations name no table on multi-table pages; the SRV date is the first row's when rows of one SRV disagree. Check (from #30 review): an empty DELY QTY with a LOT NO fails the file (revisit with corpus). |

## [SPEC-07 — API foundation, startup, auth, onboarding and settings](../specs/SPEC-07-api-foundation-auth-settings.md)

| PR  | Scope                                                 | Status     | Notes |
| --- | ----------------------------------------------------- | ---------- | ----- |
| 1   | App factory, errors and guards                        | done (#35) |       |
| 2   | Node platform entry and adapters                      | done (#36) |       |
| 3   | Startup upgrade gate                                  | done (#39) |       |
| 4   | Simple login                                          | done (#38) |       |
| 5   | Onboarding, supplier, settings, buyers, BHEL password | done (#41) |       |
| 6   | Route conformance                                     | todo       |       |

## [SPEC-08 — Ingestion services and the job model](../specs/SPEC-08-ingestion-jobs.md)

| PR  | Scope                                  | Status     | Notes                                                                                                                                                    |
| --- | -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Jobs port, worker and job API          | done (#40) |                                                                                                                                                          |
| 2   | Source documents and recompute service | done (#37) |                                                                                                                                                          |
| 3   | PO ingest service and upload           | done (#42) | client splits uploads into requests of at most 10 MB of JSON-encoded body (D-0131)                                                                       |
| 4   | SRV ingest service and upload          | done (#43) |                                                                                                                                                          |
| 5   | Folder import jobs                     | done (#47) | finish() deletes files staged into the same id after documents() listed them; safe while the client stages the whole folder before starting (#47 review) |
| 6   | `recompute-all` job                    | done (#51) |                                                                                                                                                          |

## [SPEC-09 — Corpus import and report (local only)](../specs/SPEC-09-corpus-import-report.md)

| PR  | Scope                                       | Status     | Notes                                                                                                                      |
| --- | ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Corpus import runner                        | done (#54) |                                                                                                                            |
| 2   | Import report                               | done (#56) | report lists tooLarge pages so none is dropped silently (#54 review)                                                       |
| 3   | Corpus ingestion assertions and idempotency | todo       | H4; a default run overwrites the previous import-report.* in the temp folder; handle with the idempotency run (#56 review) |

## [SPEC-10 — PO, SRV, flags, audit, dashboard and search APIs](../specs/SPEC-10-po-srv-flags-read-api.md)

| PR  | Scope                                       | Status     | Notes |
| --- | ------------------------------------------- | ---------- | ----- |
| 1   | PO list, stats and detail                   | done (#44) |       |
| 2   | PO manual create, edit and delete           | done (#46) |       |
| 3   | Manual dispatched quantity                  | done (#49) |       |
| 4   | SRV list, by-PO list, detail and delete     | done (#45) |       |
| 5   | Flags and audit                             | done (#50) |       |
| 6   | Dashboard, search and delivery tracker data | done (#53) |       |

## [SPEC-11 — DC and invoice services and APIs](../specs/SPEC-11-dc-invoice-services.md)

| PR  | Scope                                            | Status     | Notes |
| --- | ------------------------------------------------ | ---------- | ----- |
| 1   | DC create and dispatchable items                 | done (#55) |       |
| 2   | DC header edit, delete, list, stats, detail      | done (#59) |       |
| 3   | DC-sourced invoice                               | done (#60) |       |
| 4   | PO-direct invoice and previews                   | done (#63) |       |
| 5   | Invoice header edit, delete, list, stats, detail | done (#65) |       |
| 6   | Cross-flow API suite                             | done (#67) |       |

## [SPEC-12 — DC, invoice and GC Excel documents](../specs/SPEC-12-excel-documents.md)

| PR  | Scope                                  | Status     | Notes                                                                        |
| --- | -------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| 1   | De-branded templates and snapshot tool | done (#61) |                                                                              |
| 2   | Golden inputs and legacy snapshots     | todo       | H5; include the manual 60-item print-preview check (SPEC-12 §6) (#68 review) |
| 3   | DC workbook                            | done (#64) |                                                                              |
| 4   | Invoice workbook                       | done (#68) |                                                                              |
| 5   | GC workbook                            | done (#73) | goldens from legacy code (H5 confirms in PR 2)                               |
| 6   | Download routes                        | done (#76) |                                                                              |

## [SPEC-13 — Reports and exports](../specs/SPEC-13-reports-exports.md)

| PR  | Scope                                               | Status     | Notes                                                                                          |
| --- | --------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| 1   | Export inventory and goldens                        | done (#62) | goldens from legacy code (H5 moved to PR 1b)                                                   |
| 1b  | Confirm goldens against H5 legacy output            | todo       | H5                                                                                             |
| 2   | Streaming writers and keyset paging                 | done (#58) |                                                                                                |
| 3   | Registers and list CSVs                             | done (#69) | make the last keyset key part's uniqueness typed or tested across a page boundary (#58 review) |
| 4   | Pending, reconciliation, export-selected, GC report | done (#75) |                                                                                                |
| 5   | Report lists and delivery-tracker export            | done (#66) |                                                                                                |

## [SPEC-14 — Web shell, frozen design system, DataTable and platform adapter](../specs/SPEC-14-web-shell-design-datatable.md)

| PR  | Scope                                 | Status | Notes                                                                                                                |
| --- | ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | App skeleton, router and query        | todo   | static.ts treats a last path segment containing a dot as a file; revisit if a web route can carry a dot (#36 review) |
| 2   | Frozen design carry-over              | todo   |                                                                                                                      |
| 3   | Design validators                     | todo   |                                                                                                                      |
| 4   | Shell components                      | todo   |                                                                                                                      |
| 5   | Primitives and FormField              | todo   |                                                                                                                      |
| 6   | DataTable, Pagination and list search | todo   |                                                                                                                      |
| 7   | Platform adapter                      | todo   |                                                                                                                      |
| 8   | Playwright harness and `e2e` job      | todo   |                                                                                                                      |

## [SPEC-15 — Web: onboarding, login, settings, dashboard and search](../specs/SPEC-15-web-onboarding-login-settings-dashboard.md)

| PR  | Scope                      | Status | Notes |
| --- | -------------------------- | ------ | ----- |
| 1   | Login and session handling | todo   |       |
| 2   | Onboarding                 | todo   |       |
| 3   | Settings                   | todo   |       |
| 4   | Dashboard                  | todo   |       |
| 5   | Global search              | todo   |       |

## [SPEC-16 — Web: PO and SRV screens, uploads and folder import](../specs/SPEC-16-web-po-srv-import.md)

| PR  | Scope                               | Status | Notes                                                                              |
| --- | ----------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| 1   | PO list                             | todo   | client splits uploads into requests of at most 10 MB of JSON-encoded body (D-0131) |
| 2   | PO detail and manual dispatched qty | todo   |                                                                                    |
| 3   | PO create and edit                  | todo   |                                                                                    |
| 4   | SRV list and detail                 | todo   |                                                                                    |
| 5   | Folder import and job progress      | todo   |                                                                                    |

## [SPEC-17 — Web: deviations, ledger, delivery tracker and reports](../specs/SPEC-17-web-deviations-ledger-tracker-reports.md)

| PR  | Scope             | Status | Notes |
| --- | ----------------- | ------ | ----- |
| 1   | Deviations screen | todo   |       |
| 2   | Ledger screen     | todo   |       |
| 3   | Delivery tracker  | todo   |       |
| 4   | Reports           | todo   |       |

## [SPEC-18 — Web: DC and invoice screens](../specs/SPEC-18-web-dc-invoice.md)

| PR  | Scope                       | Status | Notes                                                                                                                |
| --- | --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | DC list and detail          | todo   | static.ts treats a last path segment containing a dot as a file; revisit if a web route can carry a dot (#36 review) |
| 2   | DC create                   | todo   |                                                                                                                      |
| 3   | Invoice list and detail     | todo   |                                                                                                                      |
| 4   | Invoice create (both modes) | todo   |                                                                                                                      |
| 5   | Document flow e2e           | todo   |                                                                                                                      |

## [SPEC-19 — BHEL scraper and sync](../specs/SPEC-19-bhel-scraper-sync.md)

| PR  | Scope                                | Status     | Notes |
| --- | ------------------------------------ | ---------- | ----- |
| 1   | Scraper port, fake and sessions      | done (#77) |       |
| 2   | Playwright adapter: launch and login | todo       |       |
| 3   | HTTP session listing and fetch       | todo       |       |
| 4   | Scrape jobs and wizard API           | done (#77) |       |
| 5   | Sync wizard UI and tray status       | todo       |       |
| 6   | Live sync acceptance (human)         | todo       | H3    |

## [SPEC-20 — Desktop packaging and release](../specs/SPEC-20-desktop-packaging-release.md)

| PR  | Scope                                    | Status | Notes  |
| --- | ---------------------------------------- | ------ | ------ |
| 1   | Sidecar build                            | todo   |        |
| 2   | Tauri shell and sidecar lifecycle        | todo   |        |
| 3   | Plugin capabilities and tray             | todo   |        |
| 4   | NSIS installer and `desktop` job         | todo   |        |
| 5   | Versioning, updater and release workflow | todo   | H6, H7 |

## [SPEC-21 — Operations: backups, restore, logs and the operations guide](../specs/SPEC-21-operations-backup-logs.md)

| PR  | Scope                   | Status     | Notes                                      |
| --- | ----------------------- | ---------- | ------------------------------------------ |
| 1   | Backup job and rotation | done (#79) |                                            |
| 2   | Restore                 | done (#79) | Shell reload after restore pending SPEC-20 |
| 3   | Settings backup panel   | todo       |                                            |
| 4   | Logs                    | done (#79) | Shell log plugin pending SPEC-20           |
| 5   | Operations guide        | todo       | H7                                         |

## [SPEC-22 — Cutover](../specs/SPEC-22-cutover.md)

| PR  | Scope                           | Status | Notes |
| --- | ------------------------------- | ------ | ----- |
| 1   | Cutover procedure               | todo   |       |
| 2   | Fresh import and review (human) | todo   | H8    |
| 3   | Sign-off and retirement (human) | todo   | H8    |
