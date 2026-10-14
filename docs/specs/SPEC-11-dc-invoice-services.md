# SPEC-11 — DC and invoice services and APIs

Layer: L6. Architecture refs: §5.2, §6.5, §6.6, §6.7, §6.9, §6.10, §8.1, §9, §14.1, C6; spec §1, §2, §5, §8, §9.

## 1. Summary

Creating, editing and deleting delivery challans and GST invoices. No hard caps (A-7): the only creation-time
rejections are malformed input, unknown ids, a `(number, FY)` collision, and the DC-sourced invoice rule (qty = DC
qty, rate = PO rate; A-8) (C6). Every write is one batch: insert/update → recompute the PO (dispatched, invoiced,
status) → flag detection (`OVER_DISPATCH`, `OVER_INVOICE`, `DOC_ON_CANCELLED_ITEM`, `MANUAL_ADJUSTMENT_OVERLAP`) →
re-resolve SRV links for the affected `(number, FY)` → audit row. Numbers are typed by the user (A2-6). Tests use
synthetic DCs and invoices only (A-19).

## 2. Scope

Core:

- DC: dispatchable items of a PO (item quantities and balances for the create form), create (lines on items of one
  PO, any `qty > 0`; INV-32), header edit (header fields only; INV-33), delete (blocked by an invoice or a linked SRV
  item; INV-35), list, stats, detail (lines, linked invoice, linked SRV items, flags). GC number/date default to the DC
  number/date and are unique in the DC's FY (INV-26).
- Invoice, DC-sourced: exactly the DC's lines, `qty = DC qty`, `rate = PO item rate`, else 400 and nothing written
  (INV-29); one invoice per DC (409; INV-28).
- Invoice, PO-direct: one PO (INV-30), at least one line, each `qty > 0`, no cap (INV-31); its quantities count in
  `dsp_qty` (INV-03).
- Tax at creation with the settings' GST rates copied onto the invoice, buyer snapshot, 2/5-dp rounding (INV-41,
  INV-18).
- Previews: from a DC and from a PO (shows `uninvoiced_qty` as information, not a cap; INV-05).
- Invoice header edit, delete (blocked by a linked SRV item), list, stats, detail.
- FY from the document date; on date edit FY is recomputed, a `(number, FY)` collision is 409 and nothing changes,
  and SRV links to the old and new keys are re-resolved in the same batch (INV-25, EC-14).
- Optimistic `version` on `dc` and `invoice` (INV-95).

Out of scope:

- Excel generation and downloads (SPEC-12); registers and exports (SPEC-13); screens (SPEC-18).
- Cancel state (A-14, INV-34); multi-PO invoices (A-16); IGST (A2-4, EC-07); number suggestions (A2-6).

## 3. Dependencies

- SPEC-03 (validation, tax, FY, GC, links, flags), SPEC-08 (`recompute`, link re-resolution helper), SPEC-10 (PO
  reads), SPEC-07 (settings for GST rates, buyers).
- Decisions: A-7, A-8, A-10, A-12, A-13, A-14, A-15, A-16, A-19; A2-4, A2-5, A2-6.

## 4. Design

### 4.1 Modules (`apps/api/src/`)

`routes/{dc,invoice}.ts`; `services/{dc,invoice,invoice-preview,links}.ts` (`links.ts`:
`reresolveLinks(keys: DocKey[]): Statement[]`, also used by SPEC-08); `repositories/{dc,invoice}.ts`.

### 4.2 Batches

```
DC create:      validateDcLines → insert dc (+ gc defaults) + dc_items → recomputePo → flags
                → reresolveLinks([dc (number, fy)]) → audit → commit
DC header edit: version check → changedImmutableFields empty? → new fy → update → reresolveLinks(old, new) → audit
DC delete:      deleteBlock('dc') → delete dc + dc_items → recomputePo → reresolveLinks → audit
Invoice create: validate (DC-sourced or direct) → tax lines → insert invoice + items → recomputePo → flags
                → reresolveLinks([invoice (number, fy)]) → audit
```

Unique-index violations (number, GC number, `dc_id`) map to 409 with a message naming the number and FY.

### 4.3 Error handling

400 for invalid lines (code per issue: `qty-not-positive`, `line-not-on-po`, `dc-qty-mismatch`, `rate-mismatch`,
`no-lines`); 404 unknown PO/DC/items; 409 for collisions, a second invoice on a DC, blocked deletes, version
conflicts, and edits touching line qty or rate.

## 5. Invariants

INV-03, INV-05, INV-18, INV-22, INV-23, INV-24, INV-25, INV-26, INV-28, INV-29, INV-30, INV-31, INV-32, INV-33,
INV-34, INV-35, INV-37, INV-41, INV-51, INV-54, INV-55, INV-56, INV-57, INV-95.

## 6. Testing strategy

The §14.1 API flows with synthetic data:

- DC over pending saves and raises `OVER_DISPATCH`; `qty 0` → 400.
- DC-sourced invoice with another qty or rate → 400, nothing written; a second invoice on the DC → 409.
- Manual dispatched qty, then a real DC → `MANUAL_ADJUSTMENT_OVERLAP`; a PO-direct invoice instead → no overlap
  flag (EC-10).
- DC 10 + PO-direct 10 on ord 10 → `dsp 20`, `OVER_DISPATCH` and `OVER_INVOICE` (EC-13).
- DC on a cancelled item → `DOC_ON_CANCELLED_ITEM`.
- Delete blocked by an invoice / by an SRV link → 409 with reason.
- DC 100 in FY 2024-25 and 2025-26 both save; a second DC 100 in 2025-26 → 409; DC 344 and invoice 344 in one FY
  both save.
- Re-dating DC 7 from 2025-04-02 to 2025-03-30 drops the SRV link and raises `DOC_NUMBER_CONFLICT` (EC-14);
  re-dating into a colliding key → 409, nothing changes.
- Creating a DC whose `(number, FY)` an earlier SRV cited links that SRV item.
- Tax: `qty 3 × 719.27966, 9 % + 9 %, GEMC → taxable 2157.83898, cgst 194.20551`; header = sum of lines.

## 7. Acceptance criteria

- [ ] No quantity condition blocks a DC or invoice save (C6, INV-51).
- [ ] Every DC/invoice write is one batch with recompute, flags, link re-resolution and an audit row.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                            | Scope / files                                                                               | Checks  | Done when                                                                                                         |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | DC create and dispatchable items                 | `services/dc.ts` (create), `services/links.ts`, `routes/dc.ts`, `repositories/dc.ts`, tests | `check` | OVER_DISPATCH, DOC_ON_CANCELLED_ITEM, overlap and GC default/uniqueness tests pass; `(number, FY)` collision 409. |
| 2   | DC header edit, delete, list, stats, detail      | `services/dc.ts`, routes, repositories, tests                                               | `check` | Immutable lines (INV-33); FY recompute and re-link (INV-25, EC-14); delete guard (INV-35); version 409.           |
| 3   | DC-sourced invoice                               | `services/invoice.ts` (DC mode), `routes/invoice.ts`, `repositories/invoice.ts`, tests      | `check` | INV-28, INV-29 and the tax example pass; GST rates and buyer copied onto the invoice.                             |
| 4   | PO-direct invoice and previews                   | `services/invoice.ts` (direct mode), `services/invoice-preview.ts`, routes, tests           | `check` | INV-30, INV-31, OVER_INVOICE, EC-13 pass; previews show uninvoiced without capping.                               |
| 5   | Invoice header edit, delete, list, stats, detail | `services/invoice.ts`, routes, repositories, tests                                          | `check` | Immutability, FY recompute and re-link, delete guard, version 409.                                                |
| 6   | Cross-flow API suite                             | `test/flows/documents.flow.test.ts`                                                         | `check` | Every §14.1 DC/invoice flow listed in §6 passes end to end on one synthetic dataset.                              |

## 9. Open issues

- **Legacy invoice-to-challan cross-check.** The legacy SRV ingestion also compared a linked invoice's DC with the
  SRV's challan; the spec does not state it and ARCHITECTURE §6.10 does not carry it. v1 links challan and invoice
  numbers independently (spec §8); recorded as `EC-17` in `EDGE_CASES.md`.
- **Which header fields are editable** is the set the legacy edit dialogs expose (A-14, A-2); implementation detail
  read from the legacy UI.
