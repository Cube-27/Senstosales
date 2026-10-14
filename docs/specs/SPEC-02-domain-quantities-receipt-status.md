# SPEC-02 — Domain: units, quantities, received/rejected, status

Layer: L1. Architecture refs: §5, §6.1, §6.2, §6.3, §6.8 (domain part), §6.11, C2, C3.

## 1. Summary

The first half of `packages/domain`: exact units and tolerance, the per-item quantity formulas, the date-winner
rule for received and rejected quantities, and item and PO status. Pure functions over plain typed snapshots, no
I/O and no runtime dependencies (C2, C12). Every function cites its INV row and has a table-driven test with literal
expected values taken from ARCHITECTURE §6 and `INVARIANTS.md`. Services (SPEC-08, -10, -11) call these functions;
nothing else computes quantities or status (C2).

## 2. Scope

Core:

- `Qty` (integer milli-units), `Money` (integer 1e-5 units), `IsoDate` (`YYYY-MM-DD`) branded types; exact decimal
  string conversion; sums; tolerance helpers `gte`, `gtTol` (INV-01, INV-02).
- `dsp_qty`, `balance_qty`, `uninvoiced_qty`, PO header totals over active items (INV-03..INV-08).
- Date winner and `rcd_qty`/`rej_qty` (INV-10..INV-13, INV-15).
- Item status and PO status (INV-62..INV-64; A2-13).

Out of scope:

- FY, GEMC, tax, links, guards, flags: SPEC-03.
- Persistence of derived values and recompute triggers: SPEC-08 (`recompute` service).
- Display formatting: SPEC-04 formatters.

## 3. Dependencies

- SPEC-00 PR 1 (workspace, Oxlint domain bans).
- Decisions: A-7, A-9, A-11, A-13, A-15; A2-8, A2-13.

## 4. Design

### 4.1 Modules (`packages/domain/src/`)

| File            | Exports                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `units.ts`      | `Qty`, `Money`, `parseQty(s)`, `parseMoney(s)`, `qtyToString`, `moneyToString`, `sumQty`, `gte`, `gtTol`, `TOL` (= 1 milli-unit), `roundMoney(m, dp: 2 \| 5)` |
| `dates.ts`      | `IsoDate`, `parseIsoDate(s)` (validates calendar date), `compareIsoDate`                                                                                      |
| `quantities.ts` | `computeItemQuantities(input): ItemQuantities`, `computePoTotals(items)`                                                                                      |
| `receipt.ts`    | `dateWinner(poDate, srvDates): 'po' \| 'srv'`, `computeReceipt(input): { rcd, rej, winner }`                                                                  |
| `status.ts`     | `itemStatus(input): ItemStatus`, `poStatus(itemStatuses): PoStatus`                                                                                           |
| `index.ts`      | public surface                                                                                                                                                |

### 4.2 Types

```ts
type ItemQuantityInput = {
  ordQty: Qty;
  cancelled: boolean;
  dcDispatch: Qty[]; // every DC line on the item
  directInvoiceQty: Qty[]; // PO-direct invoice lines on the item
  dcInvoiceQty: Qty[]; // DC-sourced invoice lines on the item (not added to dsp; INV-03)
  manualDispatchedQty: Qty; // A-15, default 0
  rcdQty: Qty; // from receipt.ts
};
type ItemQuantities = { dspQty: Qty; balanceQty: Qty; uninvoicedQty: Qty }; // uninvoiced may be negative (INV-05)
type ReceiptInput = {
  poDate: IsoDate;
  poRcdQty: Qty;
  poRejQty: Qty | null;
  srvLines: { srvDate: IsoDate; rcdQty: Qty | null; acceptedQty: Qty | null; rejQty: Qty | null }[];
};
type ItemStatus = "Pending" | "Delivered" | "Closed" | "Cancelled";
type PoStatus = "Pending" | "Delivered" | "Closed";
```

Conversion is by string scaling, never through a float: `"2.5" -> 2500`, `"848.75" -> 84875000`; more fractional
digits than the unit holds are a parse error (implementation detail: inputs from parsers and the API are validated
before conversion, so rounding never happens silently).

### 4.3 Rules (literal examples are the tests)

- `dsp = sum(dcDispatch) + sum(directInvoiceQty) + manualDispatchedQty` (spec §3, A-15). `DC 4 + its invoice 4 +
  direct 3 -> 7` (INV-03); `(ord 10, DC 0, manual 4) -> dsp 4, balance 6` (INV-08).
- `balance = max(0, ord − max(rcd, dsp))`, rejected never used (spec §3, A-11, INV-04): `(10, 4, 6) -> 4`;
  `(10, 12, 0) -> 0`; `(10, 10, rcd 10, rej 3) -> 0`. Cancelled item: balance 0 and excluded from header totals
  (A-13, INV-07).
- `uninvoiced = ord − sum(dcInvoiceQty + directInvoiceQty)` (INV-05): `(10, invoiced 12) -> −2`.
- No allocation to lots (INV-06): no function takes lots.
- Date winner (spec §3, INV-10): no SRV → PO; `max(srvDate) >= poDate` → SRV (tie SRV); else PO.
  SRV wins: `rcd = sum(rcd if non-zero else accepted else 0)`, `rej = sum(rej)` cumulative over all lines (INV-11,
  INV-12): `SRV1 (rcd 0, accepted 5) + SRV2 (rcd 3) -> 8`. PO wins: `rcd = poRcdQty`, `rej = poRejQty ?? 0`
  (INV-12, INV-13), including after the last SRV is deleted. Input order never matters (INV-15, property test).
- Accepted column = `rcd` (A2-8, INV-09): no separate accepted value is computed.
- Item status (spec §6, INV-62): cancelled → Cancelled (INV-63); else `gte(rcd, ord)` → Closed; else `gte(dsp, ord)`
  → Delivered; else Pending. `(10,0,0) Pending; (10,4,0) Pending; (10,9.999,0) Delivered; (10,10,10) Closed;
  (10,0,10) Closed`.
- PO status (A-9, INV-64), over active items only: all Closed → Closed; all Delivered or Closed → Delivered; else
  Pending. Items `(10, dsp 20)` and `(10, dsp 0)` → Pending. No active items → Closed (A2-13, EC-06).

### 4.4 Error handling

Parse functions return a result type (`{ ok: true, value } | { ok: false, error }`); compute functions are total
over valid branded inputs and never throw.

## 5. Invariants

INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08 (domain part), INV-09 (domain part: no separate
accepted value), INV-10, INV-11, INV-12, INV-13 (domain part), INV-15 (domain property), INV-62, INV-63, INV-64.
Each becomes `active (packages/domain/...test.ts)` in the PR that adds its test.

## 6. Testing strategy

One `describe` per INV row, table-driven, literal values only (C2). Property tests (fast-check, MIT): decimal
string round-trip for `Qty`/`Money`; `0.1 + 0.2` qty sums to exactly `300`; receipt results independent of line
order; status monotone in `dsp` and `rcd`.

## 7. Acceptance criteria

- [ ] Every example in ARCHITECTURE §6.1–§6.3 and §6.11 is a passing literal test.
- [ ] `packages/domain` has no runtime dependency and no `Date`, `parseFloat` or `toFixed` (lint).
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                               | Scope / files                                                                                    | Checks  | Done when                                                                                                               |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Units, dates and tolerance          | `packages/domain/src/{units,dates}.ts`, `units.test.ts`, `dates.test.ts`                         | `check` | INV-01, INV-02 literal and property tests pass; invalid decimals and dates are rejected.                                |
| 2   | Quantities                          | `src/quantities.ts`, `quantities.test.ts`                                                        | `check` | INV-03..INV-08 tables pass, including cancelled-item header totals and negative uninvoiced.                             |
| 3   | Received and rejected (date winner) | `src/receipt.ts`, `receipt.test.ts`                                                              | `check` | INV-10..INV-13 tables and the order-independence property (INV-15) pass, including the last-SRV-deleted case.           |
| 4   | Item and PO status                  | `src/status.ts`, `status.test.ts`                                                                | `check` | INV-62..INV-64 tables pass, including the mixed-item PO and the all-cancelled PO (A2-13).                               |
| 5   | INV-64 single status source check   | CI check (`tools/checks`) that no status function exists outside `packages/domain/src/status.ts` | `check` | The check fails on a status function added elsewhere and passes on `main`; lands before SPEC-08/SPEC-16 consume status. |

## 9. Open issues

- Rejecting extra fractional digits rather than rounding is the conservative reading of C3 (implementation
  detail). If a BHEL document carries more than three quantity decimals, the parser fails that file with a typed
  reason (SPEC-06), and the case is recorded in `EDGE_CASES.md`.
