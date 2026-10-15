# SPEC-06 decisions

Decisions for [SPEC-06 — BHEL parsers, anonymised fixtures and the corpus test](../specs/SPEC-06-bhel-parsers-fixtures.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0075 — Parser document shapes

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `PoDocument`/`SrvDocument` are strict Zod objects over the wire codecs, and a fixture's expected JSON is the encoded form. Header fields not on the page are `null`; `amendNo` is a non-negative integer; `destCode`, `division` and `poStatusCode` are text. `rejQty` (PO) and `ordQty`/`acceptedQty` (SRV) are `null` when the page has no such column. PO `rawHeader` is label as printed -> cleaned cell text for every header label the parser reads; SRV `rawHeader` is column header -> the SRV's first row text. A PO needs at least one item; an SRV file (`zSrvFile`) holds at least one SRV, all of one PO.
- Alternatives: Plain domain values in the JSON; empty strings for absent fields; codes as integers (legacy).
- Why: SPEC-06 §4.2 names the fields but not absence or `rawHeader` keys; null for absent text is the most conservative reading, and text codes keep leading zeros.
- Reversible: yes — edit the types and the expected JSON.

### D-0076 — First fixtures are synthetic, modelled on the legacy labels

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: The first 5 PO and 5 SRV fixtures are hand-written with invented values, using the header labels and column headers the legacy parser reads. Assumed PO eras: era 1 has label|value cells, `DD/MM/YYYY` and no REJ QTY column; era 2 has labels above values, `DD-MON-YY`, REJ QTY and descriptions keyed by item number. Assumed SRV layouts: A (`SRV NO`, `RECVD QTY`, `ACPT QTY`, …) and B (`SRV NUMBER`, `RECEIVED QTY`, no ordered or accepted column).
- Alternatives: Wait for H4 and anonymise real pages.
- Why: No corpus access (H4) and no real pages in the repo (C1). PR 5 (anonymised pages) and PR 6 (corpus test) check the real era and layout differences.
- Reversible: yes — PR 5 can replace or extend the fixtures.

### D-0077 — Anonymiser replacement rules

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: Kept: entities; real calendar dates in the three page formats; decimal (no leading zero, at most 5 places) and comma-grouped numbers, each only as a whole run; a fixed label, unit and month vocabulary; layout attributes, the `<meta http-equiv>` tag and `<style>` bodies. Everything else (every bare integer, every run of letters, marks and digits in any script, comment text, `id`/`name`/`content`/`href`/`value`/`title` values) is replaced by a same-shape random token through the mapping, never the original, a label word, GSTIN- or mobile-shaped, and avoiding values already mapped. Script bodies are dropped. Paths are compared after resolving symlinks: page under `SENSTO_CORPUS_DIR`, mapping outside the repo.
- Alternatives: Keep short whole-cell integers; column-aware classification.
- Why: C1 forbids real DC and invoice numbers, which are short integers on SRV pages; INV-75 keeps quantities, which BHEL prints with decimals. Where they conflict, privacy wins; the mapping keeps item and lot numbers consistent across a PO and its SRV file.
- Reversible: yes — local tool.

### D-0078 — Initial ParseError codes

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `ParseError.code` is `no-item-table | no-srv-table | bad-date | bad-quantity | duplicate-srv-item-key` (the codes SPEC-06 §4.4 names); later PRs extend the union.
- Alternatives: An open string code.
- Why: Stable codes for `job_event` (SPEC-08).
- Reversible: yes.

### D-0079 — Parser fixture pages are data: not formatted, not analysed by Sonar

- Date: 2026-10-14 · Spec/PR: SPEC-06 PR 1 (#24) · Status: decided
- Decision: `vp fmt` ignores `packages/parsers/fixtures/**/*.html`, and `.sonarcloud.properties` excludes `packages/parsers/fixtures/**` from SonarCloud analysis.
- Alternatives: Pretty-printed fixtures; rewriting pages as modern HTML (doctype, `lang`, `<th>`, no `width`/`cellpadding`) to pass Sonar's Web rules and 3% duplication gate.
- Why: Fixtures stand in for BHEL pages and must keep the legacy markup the parser meets; the formatter re-laid every cell, Sonar flagged the legacy attributes, and fixtures repeat by nature. Like the lockfile they are data; all code stays analysed.
- Reversible: yes — delete the ignore pattern and the properties file.

### D-0080 — PO header label cells match the whole cell text

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: A label is found only when the whole cleaned cell text matches its anchored pattern; inline `LABEL: value` cells are not read.
- Alternatives: The legacy substring search with a filter on "DETAILS" values.
- Why: Whole-cell matching cannot pick up headings like "PURCHASE ORDER DETAILS" and needs no filters; all fixtures match. The PR 6 corpus test will show if any page needs more.
- Reversible: yes — widen the patterns.

### D-0081 — Label value orientation from the parser's label vocabulary

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: The value is the cell to the right unless that cell is itself a known label, then the cell below; a label with an empty value yields "" and a later occurrence with a value wins.
- Alternatives: The legacy per-field "below/adjacent/any" preference with an uppercase "label-like" heuristic.
- Why: The heuristic treats uppercase values such as `INR` as labels and drops them; the parser's own vocabulary is exact.
- Reversible: yes.

### D-0082 — Page date formats and two-digit years

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: Only the spec's three formats (one- or two-digit day and month accepted, month names case-insensitive); a two-digit year is 20YY.
- Alternatives: A century pivot; accepting ISO or DD-MM-YYYY too.
- Why: SPEC-06 §2 and §9 (legacy `normalize_date` read all two-digit years as 20YY).
- Reversible: yes.

### D-0083 — New ParseError codes and header number reading

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: `missing-field`, `bad-po-number` and `bad-number` added (SPEC-06 §4.4 lists codes with "…"); header amounts have comma grouping removed before the domain's `parseMoney`; an empty AMEND NO is 0.
- Alternatives: Reuse `bad-quantity` for amounts; fail on an empty AMEND NO.
- Why: Stable, specific codes for the ingest job event; comma stripping and the 0 default match the legacy parser (`safe_to_int`).
- Reversible: yes.

### D-0090 — GEMC number filled from the header

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 2 (#28) · Status: decided
- Decision: `gemcNumber` is set in `parsePoHeader` from REMARKS rather than in PR 3.
- Alternatives: Leave it to PR 3's `parsePo`.
- Why: It depends only on a header field, so fixture headers match their expected JSON whole.
- Reversible: yes.

### D-0108 — SRV header vocabulary and row selection

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: Columns are matched by whole header text, case-insensitively, using the legacy alias list (`PO NO`/`PO NUMBER`/`PURCHASE ORDER`, `SRV DATE`/`DATE`/`RECEIPT DATE`, `LOT NO`/`LOT`, `RECVD`/`RECEIVED`/`RECD QTY`, `CHL DT`, `TAX INV`, …). Every table whose first row has `SRV NO`/`SRV NUMBER` is read. Rows with fewer than 5 cells, or whose SRV number has no digit (totals, notes), are skipped, as legacy did.
- Alternatives: Read only the first SRV table; substring header matching.
- Why: Matches the legacy parser's extraction (SPEC-06 §7); whole-cell matching follows D-0080.
- Reversible: yes.

### D-0109 — SRV empty cells and malformed values

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: An empty received or rejected cell is 0; an empty ordered or accepted cell is null. Comma grouping is removed. A negative or non-numeric quantity is `bad-quantity` (EC-22). An empty PO number, SRV date or item key is `missing-field`. An item key that is not a positive integer is `bad-number`. A bad SRV, challan or invoice date is `bad-date`; an empty challan or invoice date is null. The SRV date and `rawHeader` come from the SRV's first row.
- Alternatives: Legacy's strip-every-non-digit reading (`-1` → 1, `N/A` → 0); null received or rejected quantities.
- Why: SPEC-06 §4.4 makes malformed input a typed failure, consistent with D-0083; the non-null `rcdQty`/`rejQty` follow D-0075 and legacy ingestion's 0 default.
- Reversible: yes.

### D-0110 — `mixed-po-numbers` ParseError code

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 4 (#29) · Status: decided
- Decision: An SRV file with rows of more than one PO fails with `mixed-po-numbers`, located at the first row that differs. Rows are grouped by SRV number within that one PO, which equals grouping by `(po_number, srv_number)`.
- Alternatives: Return SRVs of several POs; drop the differing rows.
- Why: SPEC-06 §4.1 and `zSrvFile`: one file holds the SRVs of one PO.
- Reversible: yes.

### D-0111 — PO item cells: what is required, what defaults

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: The item table must have PO ITM, MATERIAL CODE, UNIT, PO RATE, ORD QTY and RCD QTY columns, else `missing-field` at the column header. An item row needs a material code, rate and ordered quantity. An empty RCD QTY or REJ QTY cell is 0 (legacy `safe_to_float`); `rejQty` is null when the table has no REJ QTY column. A lot needs a whole LOT NO above 0 and a DELY QTY. DELY DATE is a page date or empty (null). DEST CODE is text or null. Malformed cells fail the file (`bad-quantity`, `bad-number`, `bad-date`) rather than being defaulted.
- Alternatives: The legacy parser's silent defaults (0, lot 1, skipping the row) for every bad cell.
- Why: SPEC-06 §4.4 gives stable error codes, and the §6 corpus test asserts that every date parses, so failing loudly is the conservative reading. Empty received and rejected cells keep the legacy 0 because they are common on unreceived items.
- Reversible: yes. Relax the checks if the PR 6 corpus test shows real pages need it.

### D-0112 — No synthetic lot for an item without lot rows

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: An item whose page shows no lot gets `lots: []`. The legacy default lot (lot 1, delivery quantity = ordered quantity, no dates, dest 0) and its spreading of received and rejected quantities across lots are not ported.
- Alternatives: Port the default lot.
- Why: A document carries only what the page says (INV-49), and lots are planning only with no distribution (ARCHITECTURE §6.2, INV-06).
- Reversible: yes.

### D-0113 — Drawing-number pattern without backtracking

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: The prefix after `DRG`/`DRAWING` is matched with no overlapping quantifiers: `[ .-]*`, then optionally `NO[.-]*\s*`, then optionally `:\s*`. The legacy lookahead `(?=\s|ITEM|VAR|REV|,|$)` is applied in code to the greedy run of number characters. Matches of 5 or more characters are kept, distinct, in code-unit order, joined by `, `.
- Alternatives: The legacy regex as it was, which SonarCloud flags as super-linear (S8786).
- Why: The output matches the legacy pattern for drawing numbers of 5 or more characters, except in odd separator orders such as `DRG NO : 123` (now read, where legacy read nothing).
- Reversible: yes.

### D-0114 — Shared parse-result helpers in `src/fields.ts`

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 3 (#30) · Status: decided
- Decision: `fail`, `readQty` and `readMoney` (comma grouping removed) live in one module of `packages/parsers`. The PO header and items use it, and it is open to the SRV parser.
- Alternatives: A copy in each parser module.
- Why: One rule for how page numbers are read and how failures are reported.
- Reversible: yes.

### D-0127 — Synthetic fixtures with independently computed expected JSON

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: The parser fixtures added in PR 5 are synthetic. A one-off generator, kept outside the repo, writes each page and its expected JSON from one plain description; the expected values are computed from that description, never by running the parser. Cases with tricky parser rules (repeated item row, replaced lot, item 100+ description) have hand-written expected values. Only the pages and JSON are committed.
- Alternatives: Anonymise corpus pages (the corpus may not be read in this row); commit the generator as a tool.
- Why: C1. Committed fixtures are data reviewed as written; a committed generator would be a second, unreviewed model of the page format.
- Reversible: yes.

### D-0128 — Legacy-failure files covered by synthetic stand-ins

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: The SPEC-06 §6 category "files the legacy parser failed on" is covered by `legacy-item-100-description` (EC-23) and `legacy-drawing-separators` (D-0113) until anonymised corpus cases exist.
- Alternatives: Leave the category empty until H4.
- Why: Those are the documented cases where legacy extraction differs.
- Reversible: yes. Add anonymised corpus cases after SPEC-06 PR 6.

### D-0129 — Header value spelled like a label (EC-26)

- Date: 2026-10-15 · Spec/PR: SPEC-06 PR 5 (#34) · Status: decided
- Decision: v1 keeps the current `findByLabel` behaviour: a value such as `RC` beside `ORD-TYPE` reads as the `RC NO` label, so the field takes the cell below. A unit test in `po-header.test.ts` pins it; no fixture relies on it.
- Alternatives: Change the label lookup (inventing handling, C18).
- Why: Found while building the fixtures; neither the spec nor any decision covers it. The SPEC-06 PR 6 corpus test shows whether real pages have such values.
- Reversible: yes.
