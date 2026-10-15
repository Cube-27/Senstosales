# SPEC-02 decisions

Decisions for [SPEC-02 — Domain: units, quantities, received/rejected, status](../specs/SPEC-02-domain-quantities-receipt-status.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0020 — Signed decimals parse

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: `parseQty`/`parseMoney` accept an optional leading `-`; `-0` parses to `0`. Rejecting qty <= 0 at creation stays in the API (C6).
- Alternatives: Reject any sign in the domain parsers.
- Why: `uninvoiced` may be negative (INV-05), so the formatters print negatives, and the INV-01 round-trip property needs parse to accept what format prints.
- Reversible: yes — one regex and its table rows.

### D-0021 — roundMoney tie rule

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: `roundMoney(m, 2 | 5)` rounds exact ties half away from zero in integer arithmetic (`848.755 -> 848.76`, `-848.755 -> -848.76`). This applies D-0009 (half-up) and fixes its meaning for negative amounts.
- Alternatives: Half-even; half toward +infinity for negatives.
- Why: The spec states no tie rule (SPEC-03 §9). SPEC-12 legacy goldens arbitrate, and a mismatch is escalated.
- Reversible: yes — one domain function and its table tests.

### D-0022 — Range

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: A decimal whose scaled integer exceeds `Number.MAX_SAFE_INTEGER` is a parse error, never a lossy number.
- Alternatives: `bigint` units.
- Why: C3 requires exact values; safe integers cover far more than any quantity or amount, and `number` keeps the columns and arithmetic simple.
- Reversible: costly — `bigint` would change every unit type.

### D-0023 — INV-02 example value

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 1 (#7) · Status: decided
- Decision: The tolerance example becomes `9.999` in INV-02, INV-62, ARCHITECTURE §6.11 (rev 1.3) and SPEC-02 §4.3. The old `9.9995` has four decimals, which a `Qty` cannot hold (INV-01), and `parseQty("9.9995")` is rejected (SPEC-02 §9). The rule is unchanged.
- Alternatives: Keep the text and treat 9.9995 as illustrative.
- Why: An example the types cannot express cannot be a literal test (C2).
- Reversible: yes — a doc edit.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0024 — PO header totals columns

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 2 (#8) · Status: decided
- Decision: `computePoTotals` returns `{ ordQty, dspQty, rcdQty, rejQty, balanceQty }` summed over active items; `balanceQty` is the sum of item balances, not `ord − max(rcd, dsp)` over the totals. No uninvoiced total.
- Alternatives: Also total `uninvoicedQty`; derive the header balance from the header totals.
- Why: The spec does not name the totals. The legacy PO list sums exactly these five per item (pending = sum of item balances), and the frozen PO list columns are Pending, Dispatched, Received, Accepted (= rcd, INV-09) and Rejected (C7).
- Reversible: yes — one domain function and its table.

### D-0025 — Cancelled item: only balance is zeroed

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 2 (#8) · Status: decided
- Decision: For a cancelled item, `computeItemQuantities` returns balance 0 and computes dsp and uninvoiced by the normal formulas; `computePoTotals` excludes the item from header totals.
- Alternatives: Zero every derived value of a cancelled item.
- Why: A-13 and INV-07 name only balance and header totals. Documents on a cancelled item stay visible and are flagged (`DOC_ON_CANCELLED_ITEM`, INV-56), so their dispatched and invoiced quantities should still show.
- Reversible: yes.

### D-0026 — Date winner from the input's SRV lines

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 3 (#9) · Status: decided
- Decision: `computeReceipt` takes the winner from the dates of the SRV lines in its input (`dateWinner(poDate, srvLines.map(srvDate))`). Which lines count (every SRV line on the PO item) is the caller's choice in SPEC-08 `recompute`, per the §4.2 shape.
- Alternatives: A separate PO-level SRV date list in `ReceiptInput`.
- Why: SPEC-02 §4.2 fixes the input shape with `srvDate` on each line; adding a field would change a shape other specs consume. ARCHITECTURE §6.3 takes `MAX(srv_date)` over the same rows it sums.
- Reversible: yes — one input field.

### D-0027 — Item status input shape

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 4 (#11) · Status: decided
- Decision: `itemStatus` takes `ItemStatusInput = { ordQty, dspQty, rcdQty, cancelled }`, the derived quantities from `computeItemQuantities` and `computeReceipt`, not their raw lines.
- Alternatives: Take `ItemQuantityInput` and recompute dsp inside `itemStatus`.
- Why: SPEC-02 §4.1 names `itemStatus(input)` without defining `input`; derived inputs keep the status rule (INV-62) independent of the quantity formulas and avoid computing dsp twice.
- Reversible: yes — one input type.

### D-0028 — poStatus takes item statuses including Cancelled

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 4 (#11) · Status: decided
- Decision: Callers pass every item's status to `poStatus`, which ignores `Cancelled`; no statuses, or all Cancelled, gives Closed (A2-13, EC-06).
- Alternatives: Callers filter to active items first.
- Why: INV-64 derives PO status over active items; filtering inside `poStatus` keeps that rule in one place instead of in every caller.
- Reversible: yes.

### D-0048 — Mechanism for INV-64 CI check

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 5 (#19) · Status: decided
- Decision: `tools/checks/src/status-source.ts`, run in `check:code`, scans production `.ts`/`.tsx` line by line outside `packages/domain/src/status.ts`. It fails on a function named for item or PO status, and on a status literal produced by `return`, `=>`, `?`/`??`/`&&`/`||`, an assignment (JS or SQL `SET`, spaces around `=`) or SQL `THEN`/`ELSE`. Comparisons, SQL `WHERE`/`AND`/`OR`/`ON`/`HAVING` filters, JSX attributes, `case` labels, arrays and maps pass.
- Alternatives: An Oxlint rule (its built-in rules can't express "only in file X"); an AST walker (heavier, not needed yet); matching any `*status*` name (false positives on job, reconciliation and HTTP status).
- Why: The simplest check that catches a second implementation while leaving consumers free to filter and display status (INV-64, INV-65). Multi-line declarations and statuses built from imported constants can evade it; review covers those (C2). A SQL `WHERE` on its own line before `status = '…'` is flagged; keep the keyword and the comparison on one line.
- Reversible: yes.

### D-0049 — Status value list is literal in the check

- Date: 2026-10-14 · Spec/PR: SPEC-02 PR 5 (#19) · Status: decided
- Decision: The check spells out `Pending|Delivered|Closed|Cancelled` instead of importing a runtime list from `packages/domain`.
- Alternatives: Export the status values from `status.ts` and build the pattern from them.
- Why: It keeps the row out of the domain's public API; the domain union changes only through an owner decision, and then the check's pattern needs the same edit.
- Reversible: yes.
