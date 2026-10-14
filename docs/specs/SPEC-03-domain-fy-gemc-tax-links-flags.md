# SPEC-03 — Domain: FY, GEMC, tax, links, guards, flags

Layer: L1. Architecture refs: §6.4, §6.5, §6.6, §6.7, §6.9, §6.10, §7.2 (guards), C2.

## 1. Summary

The second half of `packages/domain`: financial year and `(number, FY)` keys, GC defaults, GEMC detection and net
rates, invoice tax, SRV reference linking and item matching, ingestion and delete guards, document-line validation,
and reconciliation flag detection with fingerprints. Pure, table-driven, literal tests (C2). Services build their
write batches from these results; no other package computes FY, GEMC rates, tax or flags.

## 2. Scope

Core:

- FY (INV-21), document keys (INV-22..INV-25 domain parts), GC defaults (INV-26).
- GEMC number extraction and net rate from the GST-inclusive source rate (INV-16, INV-17, INV-19).
- Invoice line tax and header sums (INV-18, INV-41).
- SRV link resolution and SRV→PO item matching (INV-37, INV-39).
- Ingestion date guard (INV-42, INV-43), delete guards (INV-35), line validation for DC, DC-sourced and PO-direct
  invoices (INV-29, INV-31, INV-32), immutability check (INV-33).
- Flag detection, fingerprints and the desired-vs-stored diff (INV-52..INV-59).

Out of scope:

- Persisting flags, running detection inside batches: SPEC-08 (`recompute`).
- Candidate flags `RECEIVED_EXCEEDS_DISPATCHED`, `AMENDMENT_BELOW_DISPATCHED` (A-24; EC-01, EC-02).
- IGST selection: v1 computes CGST + SGST only (A2-4, EC-07).

## 3. Dependencies

- SPEC-02 (units, dates, quantities, status).
- Decisions: A-7, A-8, A-10, A-12, A-13, A-14, A-15, A-24, A-26; A2-3, A2-4, A2-5, A2-7.

## 4. Design

### 4.1 Modules (`packages/domain/src/`)

| File        | Exports                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fy.ts`     | `Fy` (`"2024-25"`), `fyOf(date)`, `docKey(number, fy)`                                                                                                                                     |
| `gc.ts`     | `defaultGc({ dcNumber, dcDate, gcNumber?, gcDate? })`                                                                                                                                      |
| `gemc.ts`   | `extractGemcNumber(remarks): string \| null`, `gemcNetRate(sourceRate: Money): Money`                                                                                                      |
| `tax.ts`    | `invoiceLineTax({ qty, rate, cgstPct, sgstPct, gemc })`, `invoiceTotals(lines)`                                                                                                            |
| `links.ts`  | `resolveDocLink(raw, srvDate, candidates)`, `matchSrvItem({ materialCode, poItemNo }, poItems)`                                                                                            |
| `guards.ts` | `acceptIncoming(storedDate, incomingDate)`, `deleteBlock(kind, links)`, `validateDcLines`, `validateDcInvoiceLines`, `validateDirectInvoiceLines`, `changedImmutableFields(before, after)` |
| `flags.ts`  | `FlagType`, `detectFlags(snapshot): DesiredFlag[]`, `fingerprint(flag)`, `diffFlags(desired, stored)`                                                                                      |

### 4.2 Rules

- **FY** (spec §2, §8; INV-21): April–March, `2025-03-31 -> 2024-25`, `2025-04-01 -> 2025-26`. `docKey` is the only
  way to build a lookup key for a DC/invoice/GC number (INV-24). Numbers compared after trimming surrounding
  whitespace, as legacy SRV linking does (A2 legacy behaviour; EC-16 records formatting differences).
- **GC** (spec §9, A2-5, INV-26): blank `gcNumber` → DC number; blank `gcDate` → DC date. Uniqueness within the DC's
  FY is enforced by the DB (SPEC-05) and the service (SPEC-11).
- **GEMC** (spec §4, A-12, A2-3): `extractGemcNumber` uses `/\bGEMC\s*[-:/]?\s*([A-Z0-9][A-Z0-9-]*)/i`
  (`"GEMC- 5116"` → `"5116"`; INV-19). `gemcNetRate(source) = round5(source / 1.18)` in integer arithmetic:
  `848.75 -> 719.27966`, `118 -> 100` (INV-16). It takes only the stored source rate, so repeated saves are
  idempotent (INV-17).
- **Tax** (spec §5, A2-4, INV-41): `taxable = round(qty × rate)`, `cgst = round(taxable × cgst% / 100)`,
  `sgst = round(taxable × sgst% / 100)`, `igst = 0`; round to 5 dp when the PO is GEMC, else 2 dp (A-12, INV-18);
  totals are sums of lines. `qty 3 × 719.27966, 9% + 9%, GEMC -> taxable 2157.83898, cgst 194.20551`.
- **Links** (spec §8, A-10, A-26, INV-37): a raw challan/invoice number links to the candidate with the same number
  in `fyOf(srvDate)`, else `null`. `DC 12 dated 2025-03-28`, SRV `2025-04-03` citing 12 → `null` (EC-03).
- **Item matching** (spec §3, A2-7, INV-39): match by material code; if the code is on several items, the SRV row's
  PO item number decides; no match → unmatched (EC-12).
- **Ingestion guard** (spec §4, INV-42, INV-43): accept when nothing stored or `incoming >= stored`; else skip.
- **Delete guard** (A-14, INV-35): DC blocked by an invoice or a linked SRV item; invoice by a linked SRV item; PO by
  any DC or invoice; SRV never. Returns a reason code that the API maps to a 409 and the UI to a plain sentence.
- **Line validation** (C6): DC lines `qty > 0`, items of one PO, no cap (A-7, INV-32); DC-sourced invoice lines are
  exactly the DC's lines with `qty = DC qty` and `rate = PO item rate`, else invalid (A-8, INV-29); PO-direct: at
  least one line, each `qty > 0`, no cap (spec §5, A-7, INV-31). `changedImmutableFields` lists qty/rate changes so
  the service rejects them (A-14, INV-33).
- **Flags** (spec §8, A-7, A-13, A-15, A-24): exactly six types (INV-58).

| Type                        | Detected when (tol 0.001)                                                                      | INV    |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| `QTY_MISMATCH`              | SRV line `ord_qty` differs from its PO item's `ord_qty`                                        | INV-52 |
| `DOC_NUMBER_CONFLICT`       | SRV line cites a challan/invoice number with no DC/invoice of that number in the SRV date's FY | INV-53 |
| `OVER_DISPATCH`             | `gtTol(dsp, ord)`: `10.002` vs `10` flags, `10.001` not                                        | INV-54 |
| `OVER_INVOICE`              | `gtTol(sum(all invoice qty), ord)`                                                             | INV-55 |
| `DOC_ON_CANCELLED_ITEM`     | a DC or invoice line exists on a cancelled item                                                | INV-56 |
| `MANUAL_ADJUSTMENT_OVERLAP` | `manual > 0` and a DC line on the item was created after `manual_set_at`                       | INV-57 |

`fingerprint` = type + scope + quantities + document ids (§6.9). `diffFlags(desired, stored)` returns only flags
to insert: a stored fingerprint is never duplicated, and a stored open flag whose condition disappeared is kept
open (spec §8, INV-59, EC-05). PO-direct invoices never raise `MANUAL_ADJUSTMENT_OVERLAP` (A-15, EC-10).

### 4.3 Snapshot input for flags

```ts
type PoFlagSnapshot = {
  poId: string;
  items: {
    id: string;
    ordQty: Qty;
    cancelled: boolean;
    dspQty: Qty;
    invoicedQty: Qty;
    manualDispatchedQty: Qty;
    manualSetAt: string | null;
    dcLines: { id: string; dcId: string; createdAt: string }[];
    invoiceLines: { id: string; invoiceId: string }[];
  }[];
  srvLines: {
    id: string;
    poItemId: string | null;
    ordQty: Qty;
    srvDate: IsoDate;
    challanNo: string | null;
    invoiceNo: string | null;
    resolvedDcId: string | null;
    resolvedInvoiceId: string | null;
  }[];
};
```

### 4.4 Error handling

Validation functions return lists of typed issues (`{ code, path, message }`); the API maps them to 400/409 bodies
(SPEC-07). No function throws on valid branded input.

## 5. Invariants

INV-16, INV-17 (domain part), INV-18, INV-19 (domain part; parser part in SPEC-06), INV-21, INV-22/23/24/25/26
(domain parts), INV-29, INV-31, INV-32, INV-33, INV-35 (domain part), INV-37, INV-39, INV-41, INV-42, INV-43,
INV-52..INV-59 (domain parts).

## 6. Testing strategy

Table-driven literal tests per INV row, using the examples above and in `INVARIANTS.md`. Property tests: `fyOf`
is constant within April–March; `gemcNetRate` never reads its own output (type-level: the input is a branded
`GemcSourceRate`); `diffFlags(desired, desired-as-stored)` is empty; detection is deterministic.

## 7. Acceptance criteria

- [ ] Every example in ARCHITECTURE §6.4–§6.7, §6.9, §6.10 and the related INV rows is a passing literal test.
- [ ] `FlagType` has exactly the six members (INV-58).
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                             | Scope / files           | Checks  | Done when                                                                                                                                                   |
| --- | --------------------------------- | ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FY, document keys and GC defaults | `src/{fy,gc}.ts`, tests | `check` | INV-21 boundaries pass; `docKey` distinguishes FYs; GC defaults (INV-26) pass.                                                                              |
| 2   | GEMC                              | `src/gemc.ts`, tests    | `check` | `848.75 -> 719.27966`, `118 -> 100`; regex cases pass (INV-16, INV-19); source-rate branding makes double division impossible (INV-17).                     |
| 3   | Tax                               | `src/tax.ts`, tests     | `check` | INV-41 example and 2-dp/5-dp cases pass; header equals the sum of lines (INV-18).                                                                           |
| 4   | Links and item matching           | `src/links.ts`, tests   | `check` | INV-37 (incl. EC-03 cross-FY) and INV-39 (incl. duplicate material code and EC-12 no match) pass.                                                           |
| 5   | Guards and line validation        | `src/guards.ts`, tests  | `check` | INV-29, -31, -32, -33, -35, -42, -43 tables pass, each with a negative case.                                                                                |
| 6   | Flag detection and diff           | `src/flags.ts`, tests   | `check` | Each of the six types has a positive and negative case (incl. the `10.002`/`10.001` boundary, EC-05, EC-10); `diffFlags` never duplicates and never closes. |

## 9. Open issues

- **Rounding mode** for `round5`/`round2` on exact ties (half-up vs half-even) is not stated by the spec.
  Conservative reading: half-up on the exact integer result (implementation detail); SPEC-12 invoice goldens from
  legacy output are the arbiter, and a mismatch is escalated rather than silently changed.
- **GST percentage unit**: percentages are held as integers in 1e-5 units like `Money` (implementation detail).
- **Number trimming** for links follows legacy behaviour (surrounding whitespace only); other formatting
  differences (leading zeros, prefixes) are not normalised (EC-16).
