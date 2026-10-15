# SPEC-06 — BHEL parsers, anonymised fixtures and the corpus test

Layer: L3. Architecture refs: §7.1, §14.1 (parsers), §14.3, C1, C5, C17; spec §2, §4, §7.

## 1. Summary

`packages/parsers` turns BHEL PO and SRV HTML into Zod-validated `PoDocument` / `SrvDocument` values or a typed
`ParseError`. It is pure (string in, value out), carries no derived values and never executes page content (C5,
C17, INV-49). Golden tests run in CI on anonymised fixtures produced by a local anonymiser; a local-only corpus test
runs over `SENSTO_CORPUS_DIR` (INV-76). The parser's visible results must match what the legacy parser extracted
from the same pages (field by field); the code is new (C16).

## 2. Scope

Core:

- HTML utilities: UTF-8 decode with replacement, comment stripping, `&nbsp;` normalisation, label-based field
  lookup, header-text column mapping.
- Date parsing: `DD/MM/YYYY`, `DD-MON-YY`, `DD/MM/YY` → `IsoDate`.
- PO: header fields by label (PO number and date, enquiry, supplier code, order type, division, quotation, PO status
  code, amendment no, PO value, RC no, inspection, currency, net value, remarks); item table by header row;
  description continuation rows keyed by item number; extra lots; entry-allow non-date text kept as the lot note
  (spec §4, INV-46); GEMC number via the domain's `extractGemcNumber` (INV-19).
- SRV: skip HTML comments; the table whose header contains `SRV NO`; columns mapped by header text; every column
  read as printed (LOT NO and MATERIAL CODE optional; current pages have neither); rows grouped by
  `(po_number, srv_number)` and numbered in file order within their SRV; PO ITM 0 and repeated keys are kept; a row
  that cannot be read fails its SRV only (A2-10, INV-50, INV-112).
- PO and SRV pages are read verbatim: odd rows are kept for flagging, never merged or refused, and each row keeps its
  raw cells (INV-111).
- `tools/checks/src/anonymise-fixture.ts` (moved here from SPEC-00) and ~40 PO / ~30 SRV anonymised fixtures with
  expected JSON.
- `pnpm test:corpus` (parser assertions), skipped when `SENSTO_CORPUS_DIR` is unset, never in CI.

Out of scope:

- Persisting or guarding documents (SPEC-08); fetching pages (SPEC-19); Excel PO input (A2-2: HTML only).

## 3. Dependencies

- SPEC-02 (units, dates), SPEC-03 (`extractGemcNumber`), SPEC-04 (codecs).
- SPEC-01 PR 5 (parser approach).
- Human task H4 (`SENSTO_CORPUS_DIR` on the build machine).

## 4. Design

### 4.1 Modules (`packages/parsers/src/`)

| File                                         | Responsibility                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `types.ts`                                   | `PoDocument`, `SrvDocument` Zod schemas; `ParseError` (`code`, `message`, `location?`)     |
| `html.ts`                                    | decode, strip comments, normalise whitespace/`&nbsp;`, `findByLabel`, `mapColumnsByHeader` |
| `dates.ts`                                   | the three date formats → `IsoDate`                                                         |
| `po/header.ts`, `po/items.ts`, `po/index.ts` | `parsePo(html): Result<PoDocument, ParseError>`                                            |
| `srv/table.ts`, `srv/index.ts`               | `parseSrv(html): Result<SrvDocument[], ParseError>` (one file holds every SRV of one PO)   |
| `index.ts`                                   | public surface                                                                             |

Fixtures: `packages/parsers/fixtures/{po,srv}/<name>.html` with `<name>.expected.json`. cheerio parses; nothing
from the page is evaluated or fetched.

### 4.2 Document shapes (summary)

`PoDocument`: header fields above (quantities as `Qty`, money as `Money`, dates as `IsoDate`), `gemcNumber |
null`, `items[]` (`poItemNo`, `materialCode`, `description`, `drawingNo`, `unit`, `mtrlCat | null`, `ordQty`,
`rate` (as on the page; GST-inclusive for GEMC), `rcdQty`, `itemValue | null`, `rejQty | null`, `lots[]` (`lotNo`,
`delyQty`, `delyDate | null`, `entryAllowDate | null`, `entryAllowNote | null`, `destCode`, `rawRow`)), `rawHeader`
(label → text). Item and lot numbers may be 0.
`SrvDocument`: `poNumber`, `srvNumber`, `srvDate`, `rawHeader` (the first row), `items[]` (`rowNo`, `division`,
`poItemNo`, `subItemNo`, `pmirNo`, `srvItemNo`, `revNo`, `lotNo | null`, `materialCode | null`, `challanNo`,
`challanDate`, `invoiceNo`, `invoiceDate`, `financeDate`, `cnoteNo`, `cnoteDate`, `unit`, `ordQty`, `challanQty`,
`rcdQty`, `acceptedQty`, `rejQty` (each null when the cell is empty), `rawRow`). `parseSrv` returns
`{ srvs, failed }`: the SRVs it read (at least one) and, for each SRV it could not read, its number and error.

### 4.3 Anonymiser (`tools/checks/src/anonymise-fixture.ts`)

Local, one-time per fixture (A-26, INV-75): replaces every name, number and identifier (PO/SRV/challan/invoice
numbers, supplier and issuer identity, GSTIN, phone, e-mail, codes, descriptions) and keeps the markup and the
quantities. Replacements are consistent across a PO and its SRV file through a mapping file kept outside the repo
(`SENSTO_ANON_MAP`, gitignored location). The output is scanned (real-data scan) and reviewed before commit.

### 4.4 Error handling

Every failure is a `ParseError` with a stable `code` (`no-item-table`, `bad-date`, `bad-quantity`,
`no-srv-table`, …) and a plain message; the ingest job records it as a `job_event`
(SPEC-08). The parser never throws on any input string (property test).

## 5. Invariants

INV-19 (parser part), INV-46, INV-49, INV-50 (per-SRV failure part), INV-75, INV-76, INV-111, INV-112.

## 6. Testing strategy

- Golden: every fixture parses to its expected JSON exactly.
- Fixture coverage (§14.3): both page eras, GEMC, multi-item, multi-lot, short-closed (entry-allow note), amended
  POs, both SRV layouts, repeated challan numbers across FYs, a commented-out older table, and anonymised versions
  of files the legacy parser failed on.
- Property: random strings and truncated fixtures never throw.
- Corpus (local): no throw; every PO has items; every `ordQty > 0`; all dates parse. Output is pass/fail and ratios
  only, never identifiers or counts (C1).

## 7. Acceptance criteria

- [ ] Golden tests green in CI on ~40 PO and ~30 SRV anonymised fixtures (L3 exit).
- [ ] `pnpm test:corpus` passes locally on the owner's corpus (L3 exit); skipped with a notice when unset.
- [ ] Every committed fixture passes the real-data scan.
- [ ] The parser's extracted fields match the legacy parser's extraction on the same anonymised pages.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                      | Scope / files                                                                                                                      | Checks                    | Done when                                                                                                                |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Document types, anonymiser, first fixtures | `src/types.ts`, `tools/checks/src/anonymise-fixture.ts` + tests (synthetic HTML), first 5 PO and 5 SRV fixtures with expected JSON | `check`, `real-data-scan` | Types compile; anonymiser tests pass; fixtures pass the scan.                                                            |
| 2   | HTML utilities, dates, PO header           | `src/{html,dates}.ts`, `src/po/header.ts`, tests                                                                                   | `check`                   | All fixture PO headers match expected JSON; the three date formats pass literal tests.                                   |
| 3   | PO items, lots, continuation rows, GEMC    | `src/po/items.ts`, `src/po/index.ts`, tests                                                                                        | `check`                   | All PO fixtures match, including entry-allow notes (INV-46) and GEMC numbers (INV-19).                                   |
| 4   | SRV parser                                 | `src/srv/*.ts`, tests                                                                                                              | `check`                   | All SRV fixtures match (both layouts, commented table skipped); a duplicate item key yields `duplicate-srv-item-key`.    |
| 5   | Fixture completion and golden runner       | remaining fixtures to ~40/~30 per §6 coverage list, `test/golden.test.ts`, never-throws property test                              | `check`, `real-data-scan` | Every coverage category has at least one fixture; all goldens pass.                                                      |
| 6   | Corpus test                                | `tools/corpus/parsers.corpus.test.ts`, `pnpm test:corpus` script                                                                   | local                     | Skipped without `SENSTO_CORPUS_DIR`; on the owner's machine all assertions hold; failures listed by file-path hash only. |

## 9. Open issues

- **Two-digit years** in `DD-MON-YY` / `DD/MM/YY`: the century pivot follows what the legacy parser produced for
  the corpus (all dates are 20xx in practice); implementation detail, verified by the corpus test.
- **More than three quantity decimals** on a page: the file fails with `bad-quantity` (SPEC-02 Open issues); if
  the corpus test finds such a page, it becomes an `EDGE_CASES.md` row.
- The anonymiser mapping file lives outside the repo; losing it only means new fixtures get new synthetic values.
