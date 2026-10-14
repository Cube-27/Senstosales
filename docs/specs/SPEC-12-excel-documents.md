# SPEC-12 — DC, invoice and GC Excel documents

Layer: L6. Architecture refs: §6.7 (GC footer), §11.1, §14.1 (exports), C1, C7, C16; spec §9; A-2, A-12, A-26.

## 1. Summary

`packages/documents` produces the DC, invoice and guarantee-certificate workbooks. The **output** is frozen: a
document with any number of items looks like the legacy file (same cells, merges, styles, number formats, print
area and page breaks) (A-2, A-26, INV-69). The **mechanism** is free and must be the simplest efficient one: the
strategy chosen by the SPEC-01 spike (for example generating item rows directly rather than inserting rows into a
template). Golden tests compare 1, 20, 21 and 60-item documents with legacy output for the same synthetic input by
rendered content and layout, not bytes. Templates are de-branded copies: supplier identity cells become placeholders
filled from the supplier profile.

## 2. Scope

Core:
- De-branded templates `packages/documents/templates/{dc,invoice,gc}.xlsx` (identity cells → placeholders), made
  locally from the legacy templates and reviewed; only the de-branded copies are committed (C1).
- `xlsx-snapshot` test tool: workbook → JSON (cell values and types, styles, merges, number formats, column
  widths, row heights, print area, page breaks, page setup).
- Golden inputs (synthetic DC/invoice/GC at 1, 20, 21, 60 items; GEMC and non-GEMC invoices) and golden snapshots
  from legacy output for the same inputs (human task H5), reviewed and scanned.
- `buildDcWorkbook`, `buildInvoiceWorkbook`, `buildGcWorkbook`: pure functions from typed document data to an xlsx
  buffer. DC footer line `Guarantee Certificate No. {gc_number} Dt. {gc_date}` (spec §9, INV-36). Amounts with the
  legacy formats (2 dp; 5 dp for GEMC; A-12). Formatters from `packages/schemas`.
- Download routes: DC Excel, GC Excel, invoice Excel; files written through `Storage` (`exports/<ulid>.xlsx`) and
  returned as downloads with the legacy file names (`DC_<n>.xlsx`, `GC_<n>.xlsx`, `Invoice_<n>.xlsx`); the desktop
  shell offers Save-as (SPEC-14 platform adapter).

Out of scope:
- Report exports (SPEC-13); download buttons (SPEC-18).
- Any new document field or layout change (A-2).

## 3. Dependencies

- SPEC-04 (formatters), SPEC-11 (document data loaders), SPEC-07 (Storage).
- SPEC-01 PR 4 (strategy and snapshot format ADR).
- Human task H5 (legacy output generated from synthetic input outside the repo).

## 4. Design

### 4.1 Modules (`packages/documents/`)

| Path | Responsibility |
|---|---|
| `src/templates.ts` | load the embedded de-branded templates (bytes embedded at build; no `node:fs`, C12) |
| `src/dc.ts`, `src/invoice.ts`, `src/gc.ts` | builders |
| `src/layout.ts` | shared row/page-break helpers implementing the legacy pagination as observed in the goldens |
| `test/xlsx-snapshot.ts` | snapshot tool (test-only) |
| `test/inputs/*.json`, `test/golden/*.snapshot.json` | synthetic inputs and legacy-derived snapshots |
| `apps/api/src/routes/documents.ts`, `services/documents.ts` | load data → build → Storage → download |

### 4.2 Golden procedure

1. Synthetic inputs are committed (no real names, numbers or GSTIN-shaped values).
2. Outside the repo, the legacy app (read-only backup) is run with the de-branded templates and a synthetic supplier
   profile on those inputs (H5); its output files never enter the repo.
3. `xlsx-snapshot` converts each legacy file to JSON; the snapshots are scanned and reviewed, then committed.
4. Tests build each document with the new code and compare snapshots field by field, with a readable diff.

### 4.3 Error handling

Missing supplier profile → 409 `onboarding-required`; unknown DC/invoice → 404. Builders are total over valid data.

## 5. Invariants

INV-36, INV-60 (no flag cell), INV-69, INV-75 (synthetic goldens), INV-18 (5-dp GEMC amounts in output).

## 6. Testing strategy

Snapshot comparisons for every document × item count × GEMC variant; a test that the committed templates contain
only placeholders in identity cells; xlsx contents are not scanned (D-0010), so review checks them. Manual check once per PR that
the 60-item files open and print in Excel as the legacy ones do (reviewer artefact: screenshots of print preview
from synthetic data).

## 7. Acceptance criteria

- [ ] 1/20/21/60-item DC, invoice (GEMC and non-GEMC) and GC snapshots equal the legacy-derived goldens (L6 exit).
- [ ] The DC footer carries the GC line; GC has its own download.
- [ ] Committed templates and goldens contain no real data.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | De-branded templates and snapshot tool | `templates/*.xlsx`, `src/templates.ts`, `test/xlsx-snapshot.ts` + tests | `check`, `real-data-scan` | Snapshot tool round-trips a synthetic workbook; templates have placeholders only in identity cells and pass the scan. |
| 2 | Golden inputs and legacy snapshots | `test/inputs/*.json`, `test/golden/*.snapshot.json` (from H5) | `real-data-scan` | Snapshots exist for every document × count × variant; reviewer confirms no real data. |
| 3 | DC workbook | `src/{dc,layout}.ts`, tests | `check` | DC 1/20/21/60 goldens pass, GC footer line present (INV-36). |
| 4 | Invoice workbook | `src/invoice.ts`, tests | `check` | Invoice goldens pass for GEMC (5 dp) and non-GEMC (2 dp). |
| 5 | GC workbook | `src/gc.ts`, tests | `check` | GC goldens pass. |
| 6 | Download routes | `apps/api/src/{routes,services}/documents.ts`, tests | `check` | Each download returns the right file name and content type; the file is stored under `exports/`; 404/409 cases. |

## 9. Open issues

- **Text in legacy documents not described by the spec** (for example an amount-in-words line or fixed declaration
  text): reproduced exactly as the legacy output shows it (format freeze); any rule needed to produce it (such as
  Indian number words) is ported from the visible output and listed in DECISIONS. If a needed rule is ambiguous,
  it is escalated, not invented.
- **Download events.** Legacy wrote ledger events for downloads; ARCHITECTURE's `audit_log` holds one row per write
  batch, and a download is not a write. v1 does not log downloads; the ledger screen shows the audit rows. Owner to
  confirm (DECISIONS, `pending-owner`).
- Goldens depend on H5; rows 3–5 are `human` until row 2 merges.
