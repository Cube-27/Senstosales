# SPEC-13 decisions

Decisions for [SPEC-13 — Reports and exports](../specs/SPEC-13-reports-exports.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0005 — Cell safety applies to text cells only

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 2 · Status: decided
- Decision: Text values from users or BHEL pages are written as string cells (CSV text cells starting with `=`, `+`, `-`, `@` get a leading `'`); numeric values stay numeric with their legacy number formats (INV-94).
- Alternatives: Write every cell as a string, as §10.4 literally reads.
- Why: INV-68 freezes the legacy number formats; formulas can only enter through text (SPEC-13 Open issues).
- Reversible: yes — one writer function.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0006 — DC and invoice list exports named `.csv`

- Date: 2026-10-14 · Spec/PR: SPEC-13 PR 3 · Status: decided
- Decision: The DC and invoice list exports keep their CSV content and get a `.csv` file name.
- Alternatives: Keep the legacy `.xlsx` name on CSV content; produce real xlsx.
- Why: The legacy name/content mismatch is a bug fix A-2 allows. ARCHITECTURE §11.2 does not list these exports yet; adding them is an owner edit (SPEC-13 Open issues).
- Reversible: yes — a file-name constant.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0258 — The xlsx writer streams through a readable-stream PassThrough

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: The xlsx writer gives exceljs a `readable-stream` PassThrough and yields its chunks as an `AsyncGenerator<Uint8Array>`, so routes can pipe it through `hono/streaming` and `packages/documents/src` imports no `node:*` module (C12).
- Alternatives: A `node:stream` adapter under `packages/documents/src/platform/node` with an export port injected into the API; a duck-typed sink.
- Why: exceljs's `WorkbookWriter` needs a Node-style writable; readable-stream is the userland stream library (MIT, browser-capable) that exceljs's own stack uses. A port would add wiring with no second adapter.
- Reversible: yes — one function.

### D-0259 — The xlsx writer paces itself every 50 rows

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: The xlsx writer yields to the event loop every 50 rows and waits for drain while the reader is not reading.
- Alternatives: No pacing (measured heap grows linearly with rows); pacing on output progress (can deadlock while deflate waits for input).
- Why: exceljs hands sheet XML to an asynchronous deflate without backpressure, and node:sqlite resolves at once, so an unpaced export buffers the whole sheet. Measured flat at 50k–400k rows.
- Reversible: yes — a constant.

### D-0260 — Export cells are string, number or null

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Cells are `string | number | null`. Strings are text (string cells; CSV prefix rule); numbers stay numeric with the column's number format; dates and quantities arrive already formatted or scaled by the services through the shared formatters (SPEC-13 PR 3).
- Alternatives: Typed date and quantity cells in the writer.
- Why: Keeps INV-94 in one place by JS type and leaves layouts and formats to the catalog (SPEC-13 PR 1) and goldens.
- Reversible: yes.

### D-0261 — CSV form: UTF-8 without BOM, CRLF, RFC 4180 quoting

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided; BOM part superseded by D-0287
- Decision: CSV is UTF-8 with no BOM, CRLF line endings and RFC 4180 quoting; headers are quoted by the same rule but never prefixed.
- Alternatives: LF endings; a BOM.
- Why: No golden exists yet (H5). This is the conventional CSV form; SPEC-13 PR 3's exact-text goldens confirm or change it in one place (`line`).
- Reversible: yes.

### D-0262 — Keyset key parts name a selected field

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Keyset key parts name a selected field (`{ by, dir, field }`) rather than computing their value in JS. A nullable column is keyed as `COALESCE(column, value)`. The last part must be the id.
- Alternatives: `of: (row) => value` accessors (can drift from the SQL, e.g. CAST vs `Number`); row-value comparisons (cannot mix directions).
- Why: The cursor then always holds the exact SQL value it is compared with.
- Reversible: yes.

### D-0263 — unzipper 0.12 for exceljs

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 2 (#58) · Status: decided
- Decision: Override `exceljs>unzipper` to `^0.12.3`.
- Alternatives: Allow-list the unlicensed `buffers@0.1.1` (weakens C13's check); a different Excel library (exceljs is the named library).
- Why: exceljs 4.4 pins unzipper 0.10, whose `binary` -> `buffers` chain declares no licence, and the licences job denies it. unzipper 0.12 drops the chain and keeps the `Parse` API exceljs's stream reader uses; exceljs loads unzipper eagerly, so `"-"` is not possible.
- Reversible: yes — remove the override when exceljs updates.

### D-0283 — SPEC-13 PR 1 re-scoped: goldens from the legacy code, H5 confirmation in PR 1b

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: The report goldens are derived from the legacy code's visible export output (headers, order, formats, merges, file names). A new row, SPEC-13 PR 1b (todo, H5), confirms them against real legacy output.
- Alternatives: Keep PR 1 blocked on H5.
- Why: H5 is unavailable; reading visible output is allowed by C16 and unblocks SPEC-13 PR 3–5.
- Reversible: yes.

### D-0284 — Report golden format

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: A report workbook golden is compact JSON: file name, sheet, widths, page setup, footer, named exceljs styles, merges and a cell grid of `value` or `{ v, s }`; a merged range carries its top-left cell's style. A CSV golden is exact bytes.
- Alternatives: The SPEC-12 xlsx snapshot format (D-0282).
- Why: The goldens are written by hand and must be readable; SPEC-13 PR 3 projects writer output onto this shape.
- Reversible: yes.

### D-0285 — Fixed column widths in list workbooks

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: Each list-workbook column has a fixed width: header length + 2 and at least 12, 30 for names, 60 for descriptions. Legacy fitted each column to its longest value, at most 60.
- Alternatives: Two passes, or a max-length query before streaming.
- Why: The streaming `WorkbookWriter` writes column widths before the first row (INV-99). Widths are not cell content, so this is a minor visual change that C7 allows for performance.
- Reversible: yes.

### D-0286 — Export file names are the legacy server's

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: `PO_Register.xlsx`, `DC_Register.xlsx`, `Invoice_Register.xlsx`, `Items_Summary[_<from>_to_<to>].xlsx`, `PO_Reconciliation_Report.xlsx`, `PO_Reconciliation_<po>.xlsx`, `GC_<dc>.xlsx`, `Delivery_Tracker_<YYYYMMDD>_<HHMM>.xlsx` (IST), `DC_List_Export_<po or All>.csv`, `Invoice_List_Export.csv`; numbers cleaned as legacy did (`..`, `/`, `\` to `_`, at most 50 characters).
- Alternatives: The legacy browser's fallback names (`<type>_report.xlsx`, `Selected_Summary.xlsx`).
- Why: SPEC-13 §2 names the date-range variant, which only the server produced; D-0006 keeps the `.csv` names.
- Reversible: yes.

### D-0287 — CSV exports start with a UTF-8 BOM

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: CSV exports start with a UTF-8 BOM, as the legacy CSV writer did; CRLF line ends and minimal quoting stay. Supersedes D-0261's no-BOM choice; SPEC-13 PR 3 adds the BOM in `csvChunks`.
- Alternatives: No BOM (D-0261).
- Why: D-0261 chose no BOM only because no golden existed and left the goldens to confirm or change it; the legacy output has the BOM.
- Reversible: yes.

### D-0288 — CSV numbers without a trailing `.0`

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: CSV numbers are plain decimals (`11`, `1.25`); legacy wrote Python's `str(float)` (`11.0`).
- Alternatives: Reproduce `11.0`.
- Why: A spreadsheet reads both as the same cell value; the `.0` is a float artefact, as in D-0055.
- Reversible: yes.

### D-0289 — Edge-case readings EC-39 to EC-45

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 1 (#62) · Status: decided
- Decision: EC-39 (DC list Status, Pending Qty) and EC-40 (invoice list Delivered Qty, Status, Pending Qty) as legacy, through the resolved SRV links; EC-41 packets 0 and an empty description row; EC-42 one-PO reconciliation as item rows; EC-43 export-selected as the selected POs' reconciliation rows (D-0100); EC-44 the install's supplier name; EC-45 the bare `Report` sheet.
- Alternatives: Per row in EDGE_CASES.md.
- Why: C18. In the synthetic dataset the EC-39 legacy formulas agree with the item balance, so `dc-list.csv` holds under either reading; the other goldens depend on their readings: `invoice-list.csv` on EC-40, `pending.json` on EC-41, `reconciliation-one-po.json` on EC-42, `export-selected.json` on EC-43, `po-register.json` on EC-44, `po-register-empty.json` on EC-45.
- Reversible: yes.

### D-0313 — Lists and exports read one keyset order

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `listKey` builds the key (the chosen sort, then the default order, then the id) and `pageOfRows` counts the rows and keeps one page. The pending and reconciliation lists and the tracker list read rows this way; the tracker list moves from the in-memory comparator sort onto it, keeping D-0241's order. A default part the chosen sort already has is dropped.
- Alternatives: Keep in-memory sorting for lists and keyset only for exports, then test that they agree.
- Why: A list's rows equal its export's rows by construction (SPEC-13 PR 5's done-when).
- Reversible: yes.

### D-0314 — Lists read in 5,000-row keyset pages

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `LIST_READ_PAGE = 5000`; exports keep the 500 default.
- Alternatives: `COUNT(*)` plus an OFFSET page (only possible where nothing is filtered in JS).
- Why: One query for an ordinary list, as before; bounded memory past that.
- Reversible: yes.

### D-0315 — Report rows carry the export columns

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `zPendingRow` and `zReconciliationRow` gain `poItemNo` and `poDate`; pending gains `unit` and reconciliation gains `balanceQty`.
- Alternatives: Keep the SPEC-04 shapes, so exports could not be built from the list rows.
- Why: SPEC-13 §2: the lists have the same columns as the exports.
- Reversible: yes.

### D-0316 — Reconciliation range defaults to the 30 days to today

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Without both `from` and `to`, the range is today − 30 to today. With `poId`, the range is ignored.
- Alternatives: No default, which would list every PO.
- Why: C18: the legacy tab's behaviour where the spec is silent.
- Reversible: yes.

### D-0317 — Pending means balance > TOL, tested in SQL

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `balance_qty > TOL`, i.e. `gtTol(balance, 0)` (INV-02), legacy's `> 0.001`.
- Alternatives: Test in JS after reading every dated item.
- Why: Items with nothing to supply are never fetched, and the tolerance still comes from the domain.
- Reversible: yes.

### D-0318 — Report default orders

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Pending: PO number as a number, then item number. Reconciliation: PO date newest first, then PO number and item number. Both break ties on the item id, and a chosen sort goes first.
- Alternatives: Legacy's single sort column with no tie-break.
- Why: Matches the goldens and gives stable pages.
- Reversible: yes.

### D-0319 — Tracker pending-value sort key is a REAL product

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: Sort by `CAST(balance_qty AS REAL) * rate_u5` in SQL, used only for ordering; the value shown is `qtyValue`.
- Alternatives: An integer product (can pass 2^63, and comes back to the cursor inexactly past 2^53); a stored pending-value column (a schema change).
- Why: The export streams in SQL order (INV-99).
- Reversible: yes.

### D-0320 — Pending documents and GEMC numbers

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: A row's DCs and invoices are those with a line on the item, oldest first. Its GEMC numbers are the item's invoices' distinct non-blank numbers, else the PO's.
- Alternatives: None in the spec.
- Why: The legacy pending query does this.
- Reversible: yes.

### D-0321 — IST date and minute helper beside the Clock port

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `istDateTime(instant)` and `IST_OFFSET_MINUTES` in `ports/clock.ts`. The node clock's `today()`, `istDayStart` and the tracker file name use them; one clock reading names the file and dates its rows.
- Alternatives: A `nowIst()` port method, which every fake clock would need.
- Why: The tracker file name needs the IST minute, and the offset lives in one place.
- Reversible: yes.

### D-0322 — Days Overdue wording

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 5 (#66) · Status: decided
- Decision: `N days overdue`, `Due Today`, `Due in N days`, always plural, as legacy (`fmtDaysToDue`).
- Alternatives: Singular for one day.
- Why: Frozen export text (INV-68).
- Reversible: yes.

### D-0335 — Export writers load on the first export

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Services import only `@senstosales/documents/catalog` (a new subpath; type-only exceljs imports). The writers come in through a dynamic `import("@senstosales/documents")` when an export starts.
- Alternatives: A static import of the package index.
- Why: exceljs and the embedded templates added about 0.8 s to every API start (measured with services import timing) for a feature used on demand.
- Reversible: yes.

### D-0336 — Streamed downloads are a pull-based ReadableStream, not `hono/streaming`

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: A file handler may return `StreamedFile { fileName, chunks }`, served as a pull-based `ReadableStream` (highWaterMark 0): a source error fails the body and a client cancel closes the source.
- Alternatives: `hono/streaming`'s `stream()`, as ARCHITECTURE §11.2 names it.
- Why: That helper closes the body normally when the source throws, so a failed export arrives as a short file that looks complete, and it keeps draining the source after the client disconnects. SPEC-13 §4.3 wants a failed download. The plain stream is what the helper wraps, with no read-ahead.
- Reversible: yes, one function.

### D-0337 — The keyset tie-break is a typed primary key

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `Keyset<Row> = { parts, id }`, with `id.by` a column branded `isPrimaryKey: true` (#58 review). One row per table row is still the caller's job; this is documented on `Keyset`.
- Alternatives: Only a test across a page boundary.
- Why: The compiler rejects a non-unique tie-break for every caller.
- Reversible: yes.

### D-0338 — List CSVs stream in the default order; a chosen sort holds the rows to sort them

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Pages are read in the list's default order (date desc, number as a number desc, id desc). When the query names a sort, the filtered rows are collected and stable-sorted with the list's own comparators, so ties keep the default order.
- Alternatives: Computing totals in SQL so they can be keyset sort keys (would compute quantities outside the domain, C2).
- Why: Ordered/dispatched/received/value are domain totals. The screen already sorts the same rows in memory (D-0246, D-0268), and the default-order export is the INV-99 path.
- Reversible: yes.

### D-0339 — Register orders and filters

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: Each register is newest first by its date (PO date with no date last), then number as a number desc, then id desc, filtered on that date. PO register `items_count` counts every item row of the PO, `total_qty` is the stored PO ordered total, and `total_tax` is CGST + SGST + IGST. A DC register row with no lines shows 0 and 0; the DC list CSV leaves such a DC out, as the list does.
- Alternatives: Date only (an unstable order between equal dates).
- Why: The catalog records date newest first; the tie-breaks make pages total and match the lists.
- Reversible: yes.

### D-0340 — EC-39/EC-40 tolerance

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: The DC list Status uses the 0.001 tolerance EC-39 states (`gte` with `TOL`). The invoice list Status compares Delivered Qty ≥ invoice quantity exactly, because EC-40 states no tolerance.
- Alternatives: Tolerance on both.
- Why: C18, the EC text as written.
- Reversible: yes.

### D-0341 — The report dataset is a `@senstosales/documents` test subpath export

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `"./test/reports/dataset"` in `packages/documents/package.json`, so API tests seed the same dataset the goldens were worked from.
- Alternatives: A fixtures workspace package; a copy in the API tests.
- Why: One dataset, no copy, no new package. The goldens are read from disk by path.
- Reversible: yes.

### D-0342 — Export number cells come from shared formatters

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 3 (#69) · Status: decided
- Decision: `qtyNumber(q)` and `moneyNumber(m)` in `packages/schemas/src/formatters.ts`, 2 dp half up in integer arithmetic (as `roundDiv`).
- Alternatives: Rounding in the writer per column.
- Why: D-0260 says services scale through the shared formatters, so screen and export agree.
- Reversible: yes.

### D-0350 — Empty text cells in the pending summary are styled blanks

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: A `""` value is written as a blank cell with its style; `pending.json` records these cells as `"v": null`, and the golden projection allows `{ v: null, s }`.
- Alternatives: Keep `""` in the golden.
- Why: Legacy's xlsxwriter writes an empty string as a formatted blank, and exceljs reads an empty string cell back as null.
- Reversible: yes.

### D-0351 — Print options for streamed sheets

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: `addStreamedSheet` writes `<printOptions>` from the page setup (centring, grid lines, headings) through exceljs's private `_writePageMargins`/`_write`; re-check when exceljs is bumped (#75 review).
- Alternatives: Build the summary in memory with the non-streaming workbook (breaks INV-99).
- Why: exceljs 4.4's `WorksheetWriter` never writes print options, and the summary is horizontally centred; the pending golden pins the output.
- Reversible: yes.

### D-0352 — Pending summary numbers and text as legacy

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: The quantity text (`10 NOS`), Dispatch Delivered and the TOTAL are exact to 3 dp; a missing description falls back to the material code, then `No Description`; lists are joined with `,`.
- Alternatives: The list workbooks' 2-dp rounding.
- Why: The legacy summary wrote the raw values and `COALESCE(description, material_code, 'No Description')`.
- Reversible: yes.

### D-0353 — Export-selected selection handling

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: A PO selected twice is written once and an unknown id is skipped; POs are ordered by number with the lists' numeric comparison, each PO's items read with the `BY_PO_NUMBER` keyset.
- Alternatives: 404 on an unknown id.
- Why: Legacy ignored ids it did not find; C6 allows rejecting unknown ids only at document creation.
- Reversible: yes.

### D-0354 — Not-found answers for the one-PO and GC exports

- Date: 2026-10-15 · Spec/PR: SPEC-13 PR 4 (#75) · Status: decided
- Decision: An unknown `poId` on the reconciliation export answers 404 `po-not-found`, an unknown `dcId` on the GC report 404 `dc-not-found`; with no supplier yet the GC report answers `onboarding-required`.
- Alternatives: An empty workbook.
- Why: The file name needs the PO or DC number.
- Reversible: yes.
