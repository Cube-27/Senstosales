# SPEC-08 — Ingestion services and the job model

Layer: L4. Architecture refs: §4.1 (`Jobs`, `Storage`), §6.2, §6.3, §6.9, §6.10, §7.2, §7.3, §7.4, §14.1, C4,
C5, C6; spec §3, §4, §7, §8.

## 1. Summary

The write path for BHEL documents and the background jobs that drive it. A PO file and an SRV file are each
ingested in exactly one `WriteBatch` (A-3): guard → upsert → link resolution → recompute derived quantities and
status → flag detection → audit row. Raw HTML is stored first so a parser fix can re-parse without re-scraping.
Jobs are table-backed with exactly one running job; folder import, recompute-all and (later) scrape and backup
jobs share the same worker. The `recompute` service built here is the single place that turns stored rows into
derived columns and flags; DC/invoice/manual-quantity services (SPEC-10, -11) reuse it.

## 2. Scope

Core:

- `Jobs` port and in-process worker over `job`/`job_event`: enqueue, claim, progress (`total, done, skipped, failed,
  current`) per document, cancel between documents, single active job (partial unique index + in-process lock; a
  second start is 409 with a plain message; INV-98). Job API: start, list, detail with events, cancel.
- Source documents: raw HTML → `Storage` (`html/po/<po>.html`, `html/srv/<po>.html`) and a `source_document` row
  (sha256, doc date, job id) before parsing (INV-107).
- `recompute(poId)`: loads the PO snapshot, calls domain quantities/receipt/status/flags, returns statements for
  derived columns, PO totals and status, and new flags (INV-14, INV-59, INV-84).
- PO ingest: date guard (INV-42), header/items/lots upsert, GEMC source and net rates (INV-16, INV-17), cancel /
  restore items absent / present in an amended PO (INV-48), never writes DCs, invoices, manual qty or derived
  dispatch directly (INV-47), winner re-evaluated after accept (INV-45).
- SRV file ingest: an SRV that cannot be read is reported and the file's other SRVs are stored; repeated keys
  are stored as printed (INV-50, A2-10); per `(po_number, srv_number)` date guard (INV-43);
  replace `srv`/`srv_item`; match items (INV-39); store raw numbers and resolve links in the SRV date's FY (INV-37,
  INV-38); "PO not found" SRVs stored without effect (INV-40); recompute each affected PO; flags; audit. All or
  nothing per file.
- Uploads: `POST /api/po/upload`, `POST /api/srv/upload` (JSON, ≤ 10 MB per file) ingest each file through the same
  services and return per-file results (accepted / skipped older / failed with reason).
- Folder import (A-6, §7.4): the web side reads the chosen folder's files and uploads them to a staging area in
  `Storage`; `po.import-folder` / `srv.import-folder` jobs ingest the staged keys, POs first. Skips and failures are
  job events (INV-44, INV-50); the job summary lists counts, skipped and failed files with reasons, and flags by
  type, and stays in the job row.
- `recompute-all` job: rebuilds derived columns and flags from stored rows; never at startup (§7.3, C9).

Out of scope:

- Scrape jobs and the scraper (SPEC-19); `backup` job (SPEC-21); the import UI (SPEC-16).
- The local corpus import runner and report (SPEC-09).
- `RECEIVED_EXCEEDS_DISPATCHED` and other candidate flags (A-24).

## 3. Dependencies

- SPEC-03 (domain rules), SPEC-05 (schema, Db), SPEC-06 (parsers), SPEC-07 (app, ports, errors).
- Decisions: A-3, A-6, A-7, A-10, A-13, A-24, A-26; A2-1, A2-7, A2-9, A2-10.

## 4. Design

### 4.1 Modules (`apps/api/src/`)

| Path                                             | Responsibility                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `ports/jobs.ts`                                  | `Jobs` port: `enqueue(type, params)`, `claim()`, `progress()`, `isCancelRequested()`, `finish()` |
| `platform/node/job-runner.ts`                    | in-process worker loop, single-flight lock                                                       |
| `services/jobs.ts`, `routes/jobs.ts`             | start/list/detail/cancel; staging upload for folder import                                       |
| `services/source-documents.ts`                   | store raw HTML, `source_document` rows                                                           |
| `services/recompute.ts`                          | `recomputePo(poId): Statement[]`; `recomputeAll()`                                               |
| `services/po-ingest.ts`                          | `ingestPoFile(html, ctx): FileResult`                                                            |
| `services/srv-ingest.ts`                         | `ingestSrvFile(html, ctx): FileResult`                                                           |
| `routes/{po-upload,srv-upload}.ts`               | upload endpoints                                                                                 |
| `repositories/{po,srv,dc,invoice,flags,jobs}.ts` | rows for snapshots and statements                                                                |

### 4.2 Batches

```
PO file:  parse (outside batch) → load stored po_date → acceptIncoming? no → FileResult.skipped (job event only)
          yes → upsert po, items (rate_source, rate = gemcNetRate), lots; cancel/restore items
              → attach stored SRVs of this po_number that were "PO not found" (match items, INV-39)
              → recomputePo → new flags → audit row → commit (one batch)
SRV file: parse (unreadable SRVs reported) → for each (po, srv) with acceptIncoming:
              replace srv + srv_items (match items, resolve links in fyOf(srv_date))
          → recomputePo for each affected PO → new flags → audit row → commit (one batch)
```

A failing statement rolls back the file; previous data stays; the job continues with the next file (INV-50).

### 4.3 Error handling

Per file: `ParseError` → failed (reason = parse code + message); DB error → failed with a plain reason; an older
document → skipped. Job-level: an unexpected exception marks the job `failed` with its error; cancel marks it
`cancelled` after the current document.

## 5. Invariants

INV-03..INV-07 and INV-10..INV-15 (persisted through `recompute`), INV-14, INV-15, INV-16, INV-17, INV-37, INV-38,
INV-39, INV-40, INV-42, INV-43, INV-44, INV-45, INV-47, INV-48, INV-50, INV-51, INV-52, INV-53, INV-59, INV-84,
INV-98 (new), INV-107 (new).

## 6. Testing strategy

API tests with in-memory node:sqlite and the anonymised parser fixtures plus synthetic HTML built in tests:

- Older PO skipped, no flag, job event recorded (INV-42, INV-44); same-date re-ingest leaves `dsp_qty` unchanged
  (INV-47).
- SRV then PO gives the same quantities as PO then SRV (INV-15); SRV delete back to PO values (INV-13 via SPEC-10
  delete, covered there).
- Amended PO missing an item → item cancelled; reappearing → restored (INV-48); a DC on it later raises
  `DOC_ON_CANCELLED_ITEM` (SPEC-11).
- An SRV file none of whose SRVs can be read fails and keeps the previous SRV data; one unreadable SRV fails
  alone (INV-50, A2-10).
- Cross-FY challan not linked and no flag; a number resolved to another PO's DC → `DOC_NUMBER_CONFLICT` (INV-37,
  EC-03, INV-53 (revised 2026-10-15, owner; ARCHITECTURE rev 1.11)); SRV `ord_qty` differing →
  `QTY_MISMATCH`.
- SRV for an unknown PO stored, listed "PO not found", no flag (INV-40).
- Second job start → 409; cancel stops between documents; progress counts match.
- Re-running detection never duplicates a flag (INV-59).

## 7. Acceptance criteria

- [ ] Each PO file and SRV file commits in exactly one batch or not at all.
- [ ] Raw HTML is stored and recorded before parsing.
- [ ] Folder import of the synthetic fixture set completes with the expected summary.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                  | Scope / files                                                                                                       | Checks  | Done when                                                                                                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Jobs port, worker and job API          | `ports/jobs.ts`, `platform/node/job-runner.ts`, `services/jobs.ts`, `routes/jobs.ts`, `repositories/jobs.ts`, tests | `check` | Second start → 409; cancel honoured between documents; progress written per document.                                                        |
| 2   | Source documents and recompute service | `services/{source-documents,recompute}.ts`, repositories, tests                                                     | `check` | Raw HTML stored before parse; `recomputePo` writes derived columns, PO totals/status and new flags from a seeded synthetic PO, idempotently. |
| 3   | PO ingest service and upload           | `services/po-ingest.ts`, `routes/po-upload.ts`, tests                                                               | `check` | INV-42, -44, -45, -47, -48 API tests pass; GEMC source/net stored; one batch per file.                                                       |
| 4   | SRV ingest service and upload          | `services/srv-ingest.ts`, `routes/srv-upload.ts`, tests                                                             | `check` | INV-37..INV-40, INV-43, INV-50, INV-52, INV-53 API tests pass.                                                                               |
| 5   | Folder import jobs                     | staging upload route, `po.import-folder` / `srv.import-folder` handlers, job summary, tests                         | `check` | A synthetic folder of good, older and broken files yields the right summary; other files still commit.                                       |
| 6   | `recompute-all` job                    | handler in `services/recompute.ts`, tests                                                                           | `check` | After corrupting derived columns in a test DB, the job restores them and adds no duplicate flags; never runs at startup.                     |

## 9. Open issues

- **Folder import transport.** C17 says file locations never come from a request, so the API does not read a
  user-chosen path; the web/desktop side reads the folder and uploads contents to staging (implementation detail
  satisfying C17 and the plain-browser requirement of §12.4). Staged files are deleted after the job (stored HTML
  under `html/` is kept).
- **Uploads outside jobs.** Legacy uploads returned per-file results synchronously; v1 keeps that for the upload
  buttons (each file still one batch) and uses jobs for folder import. Implementation detail.
- **SRVs stored before their PO.** SRVs are keyed by `po_number` (§8.2), so when the PO arrives the PO batch
  attaches them and the date winner counts them (spec §3). Conservative reading of A2-9 ("stored; listed with PO not
  found") plus spec §3; implementation detail.
- **Which PO a skipped SRV belongs to** is irrelevant to recompute (nothing changes), so skipped SRVs trigger no
  recompute; implementation detail.
