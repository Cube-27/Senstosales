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

Updated: 2026-10-16.

## Human-only tasks

Agents can't do these (secrets, accounts, purchases, data only a person may see). Rows that depend on them are
`human` until done; the Notes column of each spec table names the task.

| #   | Task                                                                                                                                                                                                                      | Needed by                                 | Status           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| H1  | Apply the `main` ruleset (required checks, linear history, no bypass) and turn on secret scanning and push protection (SPEC-00 §4.7).                                                                                     | SPEC-00 PR 4                              | todo             |
| H2  | ~~Owner adds the GitHub Actions secret `SENSTO_DENYLIST`.~~ The hashed denylist was dropped.                                                                                                                              | —                                         | dropped (D-0010) |
| H3  | BHEL portal credentials and OTP mailbox, on the owner's machine only.                                                                                                                                                     | SPEC-01 PR 2, SPEC-19 PR 6                | todo             |
| H4  | `SENSTO_CORPUS_DIR` set to the local BHEL corpus on the build machine.                                                                                                                                                    | SPEC-01 PR 5, SPEC-06 PR 6, SPEC-09 PR 3  | todo             |
| H5  | Run the legacy app on synthetic input and produce the golden output, outside the repo.                                                                                                                                    | SPEC-01 PR 4, SPEC-12 PR 2, SPEC-13 PR 1b | todo             |
| H6  | Tauri updater signing key as a release secret.                                                                                                                                                                            | SPEC-20 PR 5                              | todo             |
| H7  | Fresh Windows VM install, upgrade and operations test.                                                                                                                                                                    | SPEC-20 (L8 exit), SPEC-21 PR 5           | todo             |
| H8  | Owner cutover: fresh import, review and sign-off.                                                                                                                                                                         | SPEC-22 PR 2–3                            | todo             |
| H9  | Copy the `sonar.issue.ignore.multicriteria` entries in `.sonarcloud.properties` into SonarCloud → Project Settings → Analysis scope → Ignore issues on multiple criteria (automatic analysis does not read them, D-0518). | Every PR (Sonar noise)                    | todo             |

## Current focus

In flight: SPEC-13 PR 4, SPEC-12 PR 6, path-guard fix (#74). Next: SPEC-14 PR 1 after #74, then SPEC-07 PR 6 once every route is mounted. Waiting on owner: SPEC-00 PR 4 (H1), SPEC-01 PR 2 (H3), PR 4 (H5), PR 5 (H4), SPEC-06 PR 6 (H4), SPEC-09 PR 3 (H4), SPEC-12 PR 2 (H5), SPEC-13 PR 1b (H5).

## Done specs

Full rows are in git history.

- [SPEC-02 — Domain: units, quantities, received/rejected, status](../specs/SPEC-02-domain-quantities-receipt-status.md): PRs 1–5 (#7, #8, #9, #11, #19)
- [SPEC-03 — Domain: FY, GEMC, tax, links, guards, flags](../specs/SPEC-03-domain-fy-gemc-tax-links-flags.md): PRs 1–6 (#12, #14, #15, #16, #17, #18)
- [SPEC-04 — Schemas, route table and formatters](../specs/SPEC-04-schemas-routes-formatters.md): PRs 1–5 (#20, #23, #27, #31, #21)
- [SPEC-05 — Database: schema, migrations, Db port, seed](../specs/SPEC-05-db-schema-migrations.md): PRs 1–5 (#22, #25, #26, #33, #32)
- [SPEC-07 — API foundation, startup, auth, onboarding and settings](../specs/SPEC-07-api-foundation-auth-settings.md): PRs 1–6 (#35, #36, #39, #38, #41, #80)
- [SPEC-08 — Ingestion services and the job model](../specs/SPEC-08-ingestion-jobs.md): PRs 1–6 (#40, #37, #42, #43, #47, #51)
- [SPEC-10 — PO, SRV, flags, audit, dashboard and search APIs](../specs/SPEC-10-po-srv-flags-read-api.md): PRs 1–6 (#44, #46, #49, #45, #50, #53)
- [SPEC-11 — DC and invoice services and APIs](../specs/SPEC-11-dc-invoice-services.md): PRs 1–6 (#55, #59, #60, #63, #65, #67)
- [SPEC-14 — Web shell, frozen design system, DataTable and platform adapter](../specs/SPEC-14-web-shell-design-datatable.md): PRs 1–8 (#78, #82)
- [SPEC-15 — Web: onboarding, login, settings, dashboard and search](../specs/SPEC-15-web-onboarding-login-settings-dashboard.md): PRs 1–5 (#83)
- [SPEC-16 — Web: PO and SRV screens, uploads and folder import](../specs/SPEC-16-web-po-srv-import.md): PRs 1–5 (#84)
- [SPEC-17 — Web: deviations, ledger, delivery tracker and reports](../specs/SPEC-17-web-deviations-ledger-tracker-reports.md): PRs 1–4 (#87)
- [SPEC-18 — Web: DC and invoice screens](../specs/SPEC-18-web-dc-invoice.md): PRs 1–5 (#88)

## Follow-ups

Open notes, not yet rows. Notes on rows not done stay on those rows.

- SPEC-10: INV rows for the delivery-tracker and dashboard rules.
- SPEC-10 (#53 review): SRV search with a value range reads all candidate SRVs.
- SPEC-08/SPEC-11 (#55): SRV ingest does not bump the PO version, so an overlapping DC create can write rcd_qty from a stale snapshot until the next recompute; SRV ingest race on links.
- SPEC-11 (#59 review): a DC create racing a DC edit that frees the same number (SRV items on a third PO).
- SPEC-11 (#60 review): held-batch test for a DC delete committing between an invoice create's read and commit.
- SPEC-05 (#80 simplify): indexes on the remaining FK lookups: srv_item(srv_id), srv_item(po_item_id), po_lot(po_item_id), reconciliation_issue(scope_id).
- SPEC-08 PR 5 (#47 review): finish() deletes files staged into the same id after documents() listed them; safe while the client stages the whole folder before starting.
- SPEC-16 (#84): light/dark screenshots of the PO and SRV screens (§7); `/po` e2e for paging bounding boxes and the blocked-delete reason once SPEC-18 can create a DC (now ct suite and unit tests).
- SPEC-16 (#84): PO rows and items show received under Accepted (INV-09) in the UI; the API could return `acceptedQty` as SRV does.
- SPEC-16 (#84 review): `JobProgress` shows "Waiting to start" while `jobs.detail` keeps failing, and the folder-import dialog stays busy; the by-PO SRV popover shows the first 100 SRVs.
- Quality (#89): three tests time out only under full-suite load and pass alone: `dashboard.test.tsx` "stat cards" (1 s `waitFor`, cold start), `po-form.test.tsx` "creates a PO" and `apps/api/test/d1-params.test.ts` "DC list at 100 a page" (5 s).
- SPEC-14/16 (#84): an `authed` e2e fixture for the default-password login the SPEC-16 spec does in its own `beforeEach`.
- SPEC-17 (#87): `hooks/useSearchText.ts` (from #84, used by every list screen) still has a `useEffect`; the no-effects lint check will flag it.
- SPEC-17 (#87): `apps/api/test/d1-params.test.ts` "the DC list at 100 a page" creates 100 DCs one after another and timed out once at 5.4 s (5 s limit) in a cold `pnpm verify`; it ran in 1.1-2.9 s on reruns.
- SPEC-19/20 (#90, D-0537): ship playwright-core beside the sidecar (Tauri resources, installer, desktop smoke test) and pass `createPlaywrightScraper()` in `run()`; until then the packaged app offers no BHEL sync. playwright-core reads its own `package.json`, `browsers.json` and `lib/` at run time, so it cannot live inside the SEA bundle. SPEC-19 PR 6 waits on it (or on a dev run of `main.ts` with the adapter).
- SPEC-17 (#87): `validate-colors` reads an apostrophe in a comment inside `cn(...)` as a string start and flags the next class string.
- SPEC-18 (#88): static.ts treats a last path segment containing a dot as a file; revisit if a web route can carry a dot (#36 review).
- SPEC-18 (#88 review): `LineTable` clips its right-hand columns in a narrow window (`overflow-x-auto`); DC and invoice list values format every row as non-GEMC (list rows carry no `isGemc`).
- SPEC-18 (#88): DC detail reads `po.detail` only for Received; `dc.detail` could carry it (D-0486).

## E2E fixes (2026-10-15)

Fixes from the owner's real-data test (owner-approved 2026-10-15, ARCHITECTURE rev 1.8 onward).

| Batch | Scope                                                                                       | Status     | Notes                                                                                |
| ----- | ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| FIX-1 | SRV parser reads every column; LOT NO and material optional; odd rows kept; per-SRV failure | done (#92) | Migration 0004; D-0550..D-0557.                                                      |
| FIX-1 | PO parser: REMARKS below, INSPECTION BY, inline labels, MTRL CAT, ITEM VALUE, rows kept     | done (#92) | GEMC from the remarks only.                                                          |
| FIX-1 | Migrations 0003 (document fields) and 0004 (verbatim source rows)                           | done (#92) | 0003 columns serve FIX-3; 0004 indexes serve FIX-2.                                  |
| FIX-1 | SRV detail shows the SRV's own source fields                                                | done (#92) | SRV list ordQty, value, material and rate follow FIX-2's `(po, po_item_no)` linking. |
| FIX-1 | Docs: ARCHITECTURE §7.1, §7.3, §8.2, A2-3, A2-10; SPEC-06, SPEC-08; INV-50, INV-111..112    | done (#92) | EC-60 resolved.                                                                      |

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

## [SPEC-06 — BHEL parsers, anonymised fixtures and the corpus test](../specs/SPEC-06-bhel-parsers-fixtures.md)

| PR  | Scope                                      | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Document types, anonymiser, first fixtures | done (#24) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | HTML utilities, dates, PO header           | done (#28) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | PO items, lots, continuation rows, GEMC    | done (#30) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | SRV parser                                 | done (#29) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | Fixture completion and golden runner       | done (#34) |                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | Corpus test                                | todo       | H4. Check (from #28 review): cheerio `text()` joins `<br>` and nested-table cell text with no space; `findByLabel`'s value-below ignores colspan. Check (from #29 review): SRV error locations name no table on multi-table pages; the SRV date is the first row's when rows of one SRV disagree. Check (from #30 review): an empty DELY QTY with a LOT NO fails the file (revisit with corpus). |

## [SPEC-09 — Corpus import and report (local only)](../specs/SPEC-09-corpus-import-report.md)

| PR  | Scope                                       | Status     | Notes                                                                                                                      |
| --- | ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Corpus import runner                        | done (#54) |                                                                                                                            |
| 2   | Import report                               | done (#56) | report lists tooLarge pages so none is dropped silently (#54 review)                                                       |
| 3   | Corpus ingestion assertions and idempotency | todo       | H4; a default run overwrites the previous import-report.* in the temp folder; handle with the idempotency run (#56 review) |

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

## [SPEC-19 — BHEL scraper and sync](../specs/SPEC-19-bhel-scraper-sync.md)

| PR  | Scope                                | Status     | Notes                                          |
| --- | ------------------------------------ | ---------- | ---------------------------------------------- |
| 1   | Scraper port, fake and sessions      | done (#77) |                                                |
| 2   | Playwright adapter: launch and login | done (#90) |                                                |
| 3   | HTTP session listing and fetch       | done (#90) |                                                |
| 4   | Scrape jobs and wizard API           | done (#77) |                                                |
| 5   | Sync wizard UI and tray status       | done (#86) |                                                |
| 6   | Live sync acceptance (human)         | todo       | H3; needs the sidecar follow-up below (D-0537) |

## [SPEC-20 — Desktop packaging and release](../specs/SPEC-20-desktop-packaging-release.md)

| PR  | Scope                                    | Status     | Notes  |
| --- | ---------------------------------------- | ---------- | ------ |
| 1   | Sidecar build                            | done (#81) |        |
| 2   | Tauri shell and sidecar lifecycle        | done (#81) |        |
| 3   | Plugin capabilities and tray             | done (#81) |        |
| 4   | NSIS installer and `desktop` job         | done (#81) |        |
| 5   | Versioning, updater and release workflow | todo       | H6, H7 |

## [SPEC-21 — Operations: backups, restore, logs and the operations guide](../specs/SPEC-21-operations-backup-logs.md)

| PR  | Scope                   | Status     | Notes                                      |
| --- | ----------------------- | ---------- | ------------------------------------------ |
| 1   | Backup job and rotation | done (#79) |                                            |
| 2   | Restore                 | done (#79) | Shell reload after restore pending SPEC-20 |
| 3   | Settings backup panel   | done (#86) |                                            |
| 4   | Logs                    | done (#79) | Shell log plugin: SPEC-20 (#81)            |
| 5   | Operations guide        | todo       | H7                                         |

## [SPEC-22 — Cutover](../specs/SPEC-22-cutover.md)

| PR  | Scope                           | Status | Notes |
| --- | ------------------------------- | ------ | ----- |
| 1   | Cutover procedure               | todo   |       |
| 2   | Fresh import and review (human) | todo   | H8    |
| 3   | Sign-off and retirement (human) | todo   | H8    |
