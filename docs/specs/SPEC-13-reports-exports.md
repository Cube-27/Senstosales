# SPEC-13 — Reports and exports

Layer: L6. Architecture refs: §6.2 (Accepted), §6.9 (no flag column; clamping), §9 (lists), §10.4 (cell safety),
§11.2, §14.1, C7; A-2, A-7, A-16.

## 1. Summary

The report data behind `/reports` and `/delivery-tracker` and every CSV/Excel export, with the legacy column set,
order, headers, number and date formats, file type and file name (A-2, INV-68). Exports stream: keyset-paged
queries feed an exceljs `WorkbookWriter` or a CSV writer through `hono/streaming`, with no row cap (INV-99). Exports
never gain a flag column (INV-60) and show data as it stands, clamping nothing except `balance >= 0` (INV-61).
Daily-dispatch is dropped (A-16, INV-87). Formatters come from `packages/schemas` so screen and export agree.

## 2. Scope

Core — the kept exports (§11.2), each pinned by a golden:

| Export | Legacy visible output to match |
|---|---|
| PO register | xlsx, landscape |
| DC register | xlsx |
| Invoice register | xlsx |
| Pending items | xlsx (date-range file name variant) |
| Reconciliation report (all, or one PO) | xlsx, landscape |
| Export-selected (selected POs' reconciliation rows) | xlsx |
| Guarantee-certificate report | the GC workbook of SPEC-12 for the chosen DC |
| Delivery tracker | xlsx, with the screen's filters |
| DC list and invoice list exports from the list screens | CSV (see Open issues) |

- Inventory first: for each export, the exact columns, header text, order, formats, sheet setup and file name are
  recorded in `packages/documents/src/reports/catalog.ts` from the legacy visible output (A-2, C16).
- Report list endpoints (paged JSON with the same columns) for the `/reports` tabs and the delivery tracker.
- Streaming writers: xlsx (`WorkbookWriter`) and CSV; keyset pagination helper in repositories.
- Cell safety (§10.4, INV-94): text values from users or BHEL pages are written as string cells, never formulas;
  CSV text cells starting with `=`, `+`, `-` or `@` get a leading `'`. Numeric columns keep their legacy number
  formats.
- Accepted column = `rcd_qty` (A2-8, INV-09).

Out of scope:
- Daily-dispatch, procurement/analytics (A-16); new columns or formats (A-2); flag columns (A-2).
- The `/reports` and `/delivery-tracker` screens (SPEC-17).

## 3. Dependencies

- SPEC-10 (read services), SPEC-11 (DC/invoice data), SPEC-12 (GC workbook, snapshot tool), SPEC-04 (formatters).
- Human task H5 (legacy export output for the synthetic dataset).

## 4. Design

### 4.1 Modules

| Path | Responsibility |
|---|---|
| `packages/documents/src/reports/catalog.ts` | one definition per export: columns (key, header, width, format), sheet setup, file name, type |
| `packages/documents/src/stream/{xlsx,csv}.ts` | streaming writers over an async row iterator; cell safety |
| `apps/api/src/repositories/keyset.ts` | keyset paging over a stable sort key |
| `apps/api/src/{routes,services}/reports.ts` | report lists and exports |
| `apps/api/src/{routes,services}/delivery-tracker.ts` | export (list/stats in SPEC-10) |
| `packages/documents/test/reports/*` | synthetic dataset, goldens (snapshot JSON for xlsx, text for CSV) |

### 4.2 Streaming

`GET /api/reports/<name>/export?<filters>` → service builds an async iterator of keyset pages → writer streams to
the response with the catalog's file name. A synthetic 10k-row dataset is exported in tests with memory checked to
stay flat (no full materialisation).

### 4.3 Error handling

Invalid filters → 400; an error mid-stream aborts the response (the client shows a plain failure); nothing is
cached.

## 5. Invariants

INV-09, INV-60, INV-61, INV-68, INV-87, INV-94 (new), INV-99 (new).

## 6. Testing strategy

Goldens per export on one synthetic dataset (values, headers, order, formats, merges, file name); CSV goldens as
exact text; cell-safety tests (`=1+1` text stays text; CSV `-` prefix on text only); 10k-row streaming test;
report list endpoints return the same rows as the exports for the same filters.

## 7. Acceptance criteria

- [ ] Every kept export matches its legacy-derived golden (INV-68).
- [ ] No export has a flag column; no clamping except balance.
- [ ] Exports stream with no row cap.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | Export inventory and goldens | `reports/catalog.ts` (definitions), synthetic dataset, goldens from H5 | `check`, `real-data-scan` | Every export in §2 has a catalog entry and a golden; reviewer confirms they match the legacy visible output. |
| 2 | Streaming writers and keyset paging | `stream/{xlsx,csv}.ts`, `repositories/keyset.ts`, tests | `check` | 10k-row synthetic export streams with flat memory; cell-safety tests pass (INV-94, INV-99). |
| 3 | Registers and list CSVs | PO/DC/invoice registers, DC list CSV, invoice list CSV: services, routes, tests | `check` | Goldens pass for all five. |
| 4 | Pending, reconciliation, export-selected, GC report | services, routes, tests | `check` | Goldens pass; Accepted = rcd (INV-09); balance clamped only. |
| 5 | Report lists and delivery-tracker export | report list endpoints, `delivery-tracker` export, tests | `check` | List rows equal export rows for the same filters; tracker golden passes. |

## 9. Open issues

- **List CSVs.** The legacy DC and invoice list screens export CSV through endpoints that ARCHITECTURE §11.2 does
  not name, and the legacy UI saved them under `.xlsx` file names while the server produced CSV. Under A-2 the
  exports are kept with the output the user actually received; the file-name/content mismatch is a legacy bug.
  Conservative reading: keep CSV content and give the file a `.csv` name (a bug fix allowed by A-2). Owner to
  confirm; ARCHITECTURE §11.2 should list them (escalated, not edited here).
- **Cell safety vs number formats.** §10.4 says Excel/CSV cells are written as strings, but INV-68 freezes number
  formats. Conservative reading: the string rule applies to text values; numeric values stay numeric with their
  legacy formats. Recorded as INV-94; owner to confirm.
- **GC report** is the same workbook as the SPEC-12 GC download, reached from the reports screen.
