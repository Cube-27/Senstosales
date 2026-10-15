# SPEC-12 decisions

Decisions for [SPEC-12 — DC, invoice and GC Excel documents](../specs/SPEC-12-excel-documents.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0007 — Downloads are not logged

- Date: 2026-10-14 · Spec/PR: SPEC-12 PR 6 · Status: decided
- Decision: v1 writes no audit or ledger row for document or export downloads; the ledger screen shows the audit rows.
- Alternatives: Log download events as legacy did.
- Why: `audit_log` holds one row per write batch and a download is not a write (SPEC-12 Open issues).
- Reversible: yes — add an event write to the download routes.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0278 — De-branded templates rebuilt by a committed tool

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: `tools/gen/src/debrand-templates.ts` rebuilds each legacy template through exceljs from a per-file plan. Labels are kept, identity cells become placeholders, and every other value is cleared. Document properties are blanked (exceljs writes `Unknown` for an empty author), created and modified dates are fixed, and headers and footers are dropped. The tool reads the legacy folder from `SENSTO_LEGACY_TEMPLATES_DIR`; legacy files never enter the repo.
- Alternatives: Commit edited copies of the legacy files; generate the templates entirely from code.
- Why: Anything the plan doesn't name is cleared, so the rebuild drops hidden legacy content (merged-cell leftovers, metadata, shared strings) while the visible layout stays frozen (C1, C7, C16). The tool is reproducible for reviewers and later fixes.
- Reversible: yes.

### D-0279 — What stays in a template

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: Constant text stays as it appears in the legacy template, even where legacy code rewrites the same text on every document. Values filled per document are cleared, keeping their styles and number formats. Identity cells get `{supplier.name}`, `{supplier.address}`, `{supplier.gstin}`, `{supplier.contact}`, `{supplier.state}` and `{supplier.stateCode}` (`zSupplier` fields), plus `{supplier.description}` (DC/GC letterhead line 2) and `{supplier.jurisdiction}` (invoice "SUBJECT TO … JURISDICTION").
- Alternatives: Clear every cell legacy code writes; keep the jurisdiction city as a fixed label.
- Why: The templates show the frozen document as legacy did. The jurisdiction line names the supplier's city, so it is identity.
- Reversible: yes.
- Follow-up: `zSupplier` has no `description` or `jurisdiction` field (legacy read the description from a `supplier_description` setting). SPEC-12 PR 3 and PR 4 source both; the most conservative reading is `invoiceDefaults` keys.

### D-0280 — Invoice template sheet named `Sheet1`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: The invoice template's sheet is `Sheet1`.
- Alternatives: Keep the legacy sheet name.
- Why: The legacy sheet was named after a real invoice number (C1). Legacy code never renames the sheet, so goldens made with this template (H5) carry `Sheet1`.
- Reversible: yes.

### D-0281 — Templates embedded as a generated base64 module

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: `pnpm gen:templates` writes `packages/documents/src/templates.generated.ts`, checked by a freshness test. `templateBytes()` decodes with `atob`.
- Alternatives: Bundler `?inline` imports; read the files at runtime.
- Why: SPEC-12 §4.1 and C12 require bytes embedded at build and no `node:fs`, without tying the core package to a bundler. This follows the migrations generator.
- Reversible: yes.

### D-0282 — xlsx snapshot format

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 1 (#61) · Status: decided
- Decision: One entry per sheet: name, state, cells, sorted merges, columns, rows, page breaks and page setup. Cells are keyed by address with type, value and style; an empty border and a `none` fill are dropped, and rich text is recorded as its text. Columns and rows are `{ size?, hidden? }`. Page breaks come from the sheet XML. Page setup records all 12 keys, with Excel's default where the file omits one.
- Alternatives: Wait for the SPEC-01 PR 4 ADR (blocked on H5); compare bytes.
- Why: SPEC-12 PR 1 needs a format now. A writer that omits a default and one that writes it should compare equal. ADR 0003 can revise the format before SPEC-12 PR 2's goldens are committed.
- Reversible: yes; goldens are regenerated with the tool.

### D-0297 — SPEC-12 PR 3 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: The DC goldens are derived from the legacy DC writer's visible output, read from its code (C16). SPEC-12 PR 2 (H5) confirms them against real legacy output and fixes any difference.
- Alternatives: Keep PR 3 blocked on H5.
- Why: H5 is unavailable; same approach as SPEC-13 PR 1. Unblocks PR 4 to PR 6.
- Reversible: yes.

### D-0298 — Supplier description and jurisdiction come from `invoiceDefaults`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: The DC/GC letterhead description is `supplier.invoiceDefaults.description`, the invoice jurisdiction `supplier.invoiceDefaults.jurisdiction`; a missing key leaves the text empty. A document's own supplier name, address, GSTIN and contact win over the profile's when set and not blank (`documentSupplier`).
- Alternatives: A new `supplier` column; a `settings` row as legacy had.
- Why: The most conservative reading named in D-0279: no schema or API change, and `settings` holds GST percentages and preferences, not identity.
- Reversible: yes.

### D-0299 — DC golden format

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Each golden is compact JSON: file name, page setup, every non-empty value, sorted merges, row heights and hidden rows, and `styleRows` segments naming the template row each output row takes its cell styles from. Tests project `xlsx-snapshot` output onto it; column widths and the empty sheets are checked against the template.
- Alternatives: A full `xlsx-snapshot` dump per golden.
- Why: A full dump repeats every template style per row and can't be reviewed; these goldens are hand-derived.
- Reversible: yes.

### D-0300 — The legacy DC row-height layout is reproduced

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Rows inserted for items past the eighth shift the cells and merges below but not the row heights, as legacy's openpyxl `insert_rows` did. Past eight items the template's hidden spacer row shows, and rows below the template's last row print at the default height.
- Alternatives: Move heights with their rows.
- Why: The output is frozen (A-2, INV-69); H5 compares against legacy output.
- Reversible: yes.

### D-0301 — Legacy DC text not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Reproduced exactly (SPEC-12 §9): `GST Bill No. <invoice> Dt.`, `Guarantee Certificate No. <gc>   Dt. <date>` (three spaces; INV-36 paraphrases it with one), `Dimension Report <our ref>`, `TC No  dt.  Of`, `Lot No.`, `Consignment Value of BHEL PO <value>`, `<invoice>  Dt.`, `Date: <dd/mm/yyyy>`, `Consignee` when there is none, `<qty>  <UNIT>` (upper-cased, `NO` when missing); an item row grows 18 points per 95 description characters.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen; these are the strings legacy wrote.
- Reversible: yes.

### D-0302 — DC department number prints as a number when it is all digits

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: A digits-only `departmentNo` that is a safe integer is written as a number cell (`0456` -> 456); other text stays text.
- Alternatives: Always text.
- Why: Legacy's column was INTEGER, so SQLite stored digit-only values as numbers.
- Reversible: yes.

### D-0303 — DC consignment value is exact, rounded per line

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: `sumMoney(items.map(qtyValue))`, as the API's DC list computes it, printed with `fmtFixed` (2 dp, 5 dp on GEMC). Legacy summed floats; the two differ only on exact half-cent ties, where D-0021 rounds half away from zero.
- Alternatives: Re-implement float summing.
- Why: C3; the same value the DC list shows.
- Reversible: yes.

### D-0304 — Empty text cells; `autoPageBreaks` not written

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: Where legacy wrote `""` the cell is left empty, and filled placeholder text is right-trimmed (legacy stripped `Tel. No. `). Legacy's `autoPageBreaks=False` flag is not written: exceljs has no setting for it, it only changes on-screen break display, and the snapshot doesn't record it.
- Alternatives: Write empty strings; post-process the sheet XML.
- Why: No visible difference; SPEC-12 PR 2 (H5) shows whether the snapshot needs them.
- Reversible: yes.

### D-0305 — SPEC-12 §4.1 golden file names clarified

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 3 (#64) · Status: decided
- Decision: SPEC-12 §4.1 and the PR 2 row now name the goldens `test/golden/<document>-<n>.json` (for example `dc-20.json`) in the D-0299 format, replacing `*.snapshot.json`.
- Alternatives: Rename the files to `*.snapshot.json`.
- Why: They are not `xlsx-snapshot` dumps (D-0299); the name should not suggest one. PR 4 and PR 5 follow it.
- Reversible: yes.

### D-0324 — SPEC-12 PR 4 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided (orchestrator)
- Decision: As D-0297, for the invoice: the goldens are derived from the legacy invoice writer's visible output (C16); SPEC-12 PR 2 (H5) confirms them.
- Alternatives: Keep PR 4 blocked on H5.
- Why: H5 is unavailable.
- Reversible: yes.

### D-0325 — Invoice golden format: number formats and copied fonts

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Invoice goldens add `numFmts` (`[first, last, columns, format]`) and `fontFrom` (cell -> template cell) to D-0299's `styleRows`; the golden checks are shared in `test/golden.ts`.
- Alternatives: List every formatted cell; a full snapshot dump.
- Why: Legacy sets formats per cell over the copied styles; ranges keep the goldens reviewable.
- Reversible: yes.

### D-0326 — The legacy invoice row layout is reproduced

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: An inserted item row takes the last template item row's styles, B:H merge and height; rows below keep the height of their row number (as D-0300). Up to three items, one blank item row shows under them and the rest are hidden.
- Alternatives: Move heights with their rows.
- Why: The output is frozen (A-2, INV-69).
- Reversible: yes.

### D-0327 — Legacy invoice text not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Reproduced (SPEC-12 §9): `GEMC:- <no> Dt:-<dd-mm-yyyy>` (`GEMC:-  Dt:-` when not GEMC); `By Loading Vehicle`; `BUYER` with no buyer name; `No Description`; the unit as stored, `NO` when missing (not upper-cased); 1 packet per item, the item count as total; `Total Amount (In Words) :- …`, `CGST (in words)  : …`, `SGST (in words)  : …`; the supplier block in the GSTIN line's font.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen.
- Reversible: yes.

### D-0328 — Amount in words

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: `fmtAmountWords` (`packages/schemas`) ports legacy's words: Crore/Lakh/Thousand, `Hundred and`, `and Paise …` when paise > 0, paise rounded half up from the exact amount (D-0021; legacy rounded a float). Paise can reach `One Hundred` and 1000 crore or more throws, as in legacy (EC-49).
- Alternatives: Carry paise into rupees; extend past 999 crore.
- Why: Either changes visible output or invents a rule.
- Reversible: yes.

### D-0329 — Invoice number cells are exact; the invoice's own GST percentages

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Number cells hold the exact decimal of the stored integer (`Number(moneyToString(m))`) and formats round on screen; totals are `invoiceTotals` of the stored lines, the qty total `sumQty`; the rate cells print the invoice's `cgstPct`/`sgstPct`, where legacy read the current settings.
- Alternatives: Float sums; current settings; `moneyNumber` (2 dp).
- Why: C3; the percentages are copied onto the invoice at creation (A2-4), so the printed rates match its amounts.
- Reversible: yes.

### D-0330 — Invoice GEMC formats follow `po.isGemc`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The 5-dp formats apply when the PO is GEMC, the flag the stored amounts were rounded by; legacy checked for a non-blank invoice GEMC number.
- Alternatives: The invoice's `gemcNumber`.
- Why: They agree whenever the GEMC number came from the PO (D-0291), and the format always matches the amounts' precision.
- Reversible: yes.

### D-0331 — Invoice items in PO item order

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: Invoice lines print sorted by PO item number, like the DC.
- Alternatives: Insert order.
- Why: Legacy ordered them by a random UUID, so there was no order to keep.
- Reversible: yes.

### D-0332 — Invoice header date fallbacks

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The challan date is the DC's, or the invoice date on a PO-direct invoice; the buyer's order date is the invoice's, else the PO date, as legacy.
- Alternatives: Blank.
- Why: The format is frozen.
- Reversible: yes.

### D-0333 — Invoice download name

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: `Invoice_<number>.xlsx` with the DC's sanitising rule (`documentFileName` in `layout.ts`), falling back to `Invoice_invoice.xlsx` as the legacy invoice route did.
- Alternatives: The DC's `export` fallback.
- Why: The legacy names differ.
- Reversible: yes.

### D-0334 — Blank invoice buyer prints `BUYER`

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 4 (#68) · Status: decided
- Decision: The builder prints the invoice's stored buyer fields; a blank name prints `BUYER`, blank fields stay empty. Legacy's fallback to buyer settings and the default buyer row is not carried: v1 has no such settings and `buyer` has no address (EC-46).
- Alternatives: Fill from the `buyer` table in SPEC-12 PR 6.
- Why: The most conservative reading; no new data source.
- Reversible: yes.

### D-0345 — SPEC-12 PR 5 re-scoped: goldens from the legacy code

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided (orchestrator)
- Decision: As D-0297 and D-0324, for the GC: the goldens are derived from the legacy GC writer's visible output (C16); SPEC-12 PR 2 (H5) confirms them.
- Alternatives: Keep PR 5 blocked on H5.
- Why: H5 is unavailable.
- Reversible: yes.

### D-0346 — The GC is built from the DC inputs

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided
- Decision: `GcDocument` is a subset of `DcDocument` (supplier; DC number, dates, GC number and date, consignee; PO number and date; items), and the GC goldens `gc-N` are built from `inputs/dc-N.json`.
- Alternatives: Separate `gc-N` input files copying the DC ones.
- Why: Legacy printed the GC from the same DC detail data; one input set keeps H5 to one run per count.
- Reversible: yes.

### D-0347 — Legacy GC text and layout not described by the spec

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 5 (#73) · Status: decided
- Decision: Reproduced (SPEC-12 §9): `<gc>  dt. <dd/mm/yyyy>`, `<po>  dt. <date>`, `<dc>  dt. <date>` in I9–I11, trimmed (`<po>  dt.` with no PO date); the guarantee text with `24 Months` (legacy overwrote the template's `24 Month`); `For <supplier name>` after 17 spaces; `<qty>  <UNIT>` in column J; unused item rows stay visible; item rows grow 17 points per 95 description characters; always `fitToHeight: 0`; print area `B1:J<34 + inserted rows>`.
- Alternatives: None that keeps the format frozen.
- Why: The format is frozen (A-2, INV-69).
- Reversible: yes.

### D-0355 — Downloads are typed by their file extension

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 6 (#76) · Status: decided
- Decision: `sendFile` sets `Content-Type` from the download name: Hono's media types plus xlsx, else `application/octet-stream`. OpenAPI keeps the generic `application/octet-stream` (D-0117).
- Alternatives: `application/octet-stream` for every file; a content type in each handler's result.
- Why: SPEC-12 PR 6 asks for the right content type, and the name already names the format.
- Reversible: yes, one function.

### D-0356 — The Excel document reads are their own queries

- Date: 2026-10-15 · Spec/PR: SPEC-12 PR 6 (#76) · Status: decided
- Decision: `dcForDocument`/`invoiceForDocument` (`repositories/documents.ts`) join the PO's number, date and GEMC flag, a DC's invoice number and an invoice's source DC; `findDcWithPo`/`findInvoiceWithPo` are unchanged.
- Alternatives: Add `poDate` to those finders.
- Why: They carry the PO version for write guards and feed the detail API; the documents need different columns.
- Reversible: yes.
