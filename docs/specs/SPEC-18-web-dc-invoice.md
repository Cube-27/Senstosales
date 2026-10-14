# SPEC-18 — Web: DC and invoice screens

Layer: L6. Architecture refs: §6.5–§6.7, §6.9 (display), §11.1, §12.1 (forms), §12.3, §14.1 (e2e), C2, C6, C7, C8;
spec §5, §9; A-7, A-8, A-14, A-23; A2-6.

## 1. Summary

The DC and invoice list, detail and create screens as legacy shows them: user-typed numbers (no suggestion; INV-27),
DC dispatch quantities with no cap (warnings come back as flags after save; A-7), DC-sourced invoices locked to the
DC's quantities and PO rates (A-8), PO-direct invoices with `uninvoiced_qty` shown as information, header editing,
delete disabled with a plain reason while links exist (A-14), and Excel/GC downloads.

## 2. Scope

Core:

- `/dc`: list (legacy columns, flag badge column), list CSV export (SPEC-13), per-row Excel download.
- `/dc/:id`: header and lines, GC number/date, linked invoice and SRV items, header edit dialog (lines read-only;
  INV-33), delete disabled with reason (INV-35), DC Excel and GC downloads.
- `/dc/create`: choose a PO, dispatchable items with balances, enter quantities (any `qty > 0`; INV-32), type the DC
  number (INV-27), GC fields defaulting to DC number/date (INV-26); react-hook-form + `useFieldArray`; 409 collision
  messages name the number and FY.
- `/invoice`: list, list CSV export, per-row Excel download. `/invoice/:id`: header, lines, taxes, linked SRV items,
  header edit, delete with reason, Excel download.
- `/invoice/create`: DC-sourced mode (lines locked to DC qty and PO rate; INV-29) and PO-direct mode (select lines,
  `qty > 0`, uninvoiced shown, not enforced; INV-05, INV-31); totals via `useMemo` calling the single domain tax
  implementation re-exported through `packages/schemas` (C2, INV-41), never stored.

Out of scope:

- Cancel state (A-14); number suggestion (A2-6); multi-PO invoices (A-16).

## 3. Dependencies

- SPEC-14, SPEC-16 (PO pickers, linked documents), SPEC-11 (APIs), SPEC-12 (downloads), SPEC-13 (list CSVs).

## 4. Design

`routes/dc/{index,$id,create}.tsx`, `routes/invoice/{index,$id,create}.tsx`;
`components/modules/dc/*`, `components/modules/invoice/*`; downloads through `platform.saveAs`.

## 5. Invariants

INV-05, INV-26, INV-27, INV-29, INV-31, INV-32, INV-33, INV-35, INV-41, INV-60, INV-70, INV-71.

## 6. Testing strategy

E2E (§14.1): create a DC over pending (saves; the PO shows the `OVER_DISPATCH` badge), create its invoice, download
both Excel files and the GC; a DC-sourced invoice cannot change qty or rate in the UI; a duplicate `(number, FY)`
shows the 409 message in place; delete disabled with reason when linked. Layout: adding/removing item rows in the
create forms grows only the item list, never shifts the header fields or the totals block position relative to it
(the totals footer is reserved).

## 7. Acceptance criteria

- [ ] Numbers are typed by the user; no field is pre-filled with a suggested number.
- [ ] No quantity warning blocks a save.
- [ ] No interaction moves or resizes surrounding layout; loading/empty/error keep the same footprint; list tables
      use the fixed DataTable.
- [ ] Downloads work in the shell and in a plain browser.
- [ ] `pnpm verify` and every CI job green, including `e2e`.

## 8. PR plan

| #   | Title                       | Scope / files                                                                                                         | Checks         | Done when                                                                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------- |
| 1   | DC list and detail          | `routes/dc/{index,$id}.tsx`, `components/modules/dc/{DCList,DCDetail,DCHeaderEdit}.tsx`, e2e                          | `check`, `e2e` | Header edit, delete reason, Excel and GC downloads work.                                        |
| 2   | DC create                   | `routes/dc/create.tsx`, `components/modules/dc/DCForm.tsx`, e2e                                                       | `check`, `e2e` | DC over pending saves and shows the flag on the PO; collision message in place.                 |
| 3   | Invoice list and detail     | `routes/invoice/{index,$id}.tsx`, `components/modules/invoice/{InvoiceList,InvoiceDetail,InvoiceHeaderEdit}.tsx`, e2e | `check`, `e2e` | Header edit, delete reason and Excel download work.                                             |
| 4   | Invoice create (both modes) | `routes/invoice/create.tsx`, `components/modules/invoice/InvoiceForm.tsx`, e2e                                        | `check`, `e2e` | DC-sourced lines locked; PO-direct accepts any `qty > 0`; totals equal the API's stored totals. |
| 5   | Document flow e2e           | `apps/web/e2e/documents.spec.ts`                                                                                      | `e2e`          | PO → DC → invoice → downloads → SRV import linking the DC runs end to end on synthetic data.    |

## 9. Open issues

- Re-exporting the domain tax function through `packages/schemas` keeps one implementation (C2) while §4 lists
  `apps/web` as depending on `schemas` only; implementation detail.
