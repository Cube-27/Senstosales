# SPEC-10 — PO, SRV, flags, audit, dashboard and search APIs

Layer: L4. Architecture refs: §6.2, §6.8, §6.9, §6.11, §8.1 (versioning), §9, §12.2 (linked documents), §14.1;
spec §1, §3, §4, §6, §8.

## 1. Summary

The read endpoints behind the frozen PO, SRV, deviations, ledger, dashboard, delivery-tracker and search screens,
plus the PO-side writes that are not ingestion: manual PO create/edit, PO delete, SRV delete, the item-level manual
dispatched quantity (A-15) and flag acknowledgement. Every list follows one convention (`page`, `pageSize`, `sort`,
`dir`, typed filters, `total`). Every write is one batch that calls `recompute` (SPEC-08). Response fields are those
the frozen screens show (A-2); quantity columns lead and status is a badge and filter (A-9).

## 2. Scope

Core:

- PO: list (filters: status, flag presence, text in the PO or GEMC number or an item description; sorts on the visible columns), stats, detail (header, items with
  `ord/dsp/rcd/rej/balance/uninvoiced`, Accepted = `rcd` (INV-09), status, cancelled marker, lots with entry-allow
  note, open flags per item, linked DC/invoice/SRV counts and popover lists bypassing pagination; INV-73).
- PO manual create and edit (legacy `/po/create` flow): GEMC items take the GST-inclusive rate and store the derived
  net (INV-20); a blank GEMC field falls back to the GEMC number in the remarks (A2-3); the PO value is the sum of
  the lines, while a PO read from a BHEL page keeps its PO-VALUE (INV-115); `version` check (INV-95); recompute; audit
  (revised 2026-10-15, owner; ARCHITECTURE rev 1.11).
- PO delete: blocked while any DC or invoice exists (INV-35); otherwise removes the PO, its items, lots and flags in
  one batch (SRVs of the PO become "PO not found"; Open issues).
- Manual dispatched quantity: `PUT /api/po/:id/items/:itemId/manual-dispatched` `{ qty >= 0, note? }`; sets
  `manual_set_at`; audit row with before/after (INV-08); recompute (OVER_DISPATCH may follow).
- SRV: list (flat), list grouped by PO (legacy by-PO view), stats, detail (items, raw challan/invoice numbers, resolved
  links, flags), delete (never blocked; recompute restores PO-winner values; INV-13, INV-14).
- Flags: list (filters type, status, PO), stats and open count, acknowledge with optional note (INV-59: no business
  data changes).
- Audit: list read-only with filters (entity, action, date); no delete (INV-83).
- Dashboard: summary KPIs and recent activity as the legacy dashboard shows, plus the open-flag count (INV-60);
  insights/forecast dropped (INV-87). Periods by document date, `fy` (the current FY) by default (INV-113); Pending
  Dispatch clamped per item (INV-114); received counts only SRV lines on a PO item (INV-40) (revised 2026-10-15, owner; ARCHITECTURE rev 1.11).
- Search: global search across PO, DC, invoice and SRV numbers and material codes as legacy; FY shown for DC and
  invoice hits (INV-24).
- Delivery tracker: paged list and stats for the screen (export in SPEC-13).

Out of scope:

- DC and invoice endpoints (SPEC-11); exports and reports (SPEC-13); screens (SPEC-15..18).

## 3. Dependencies

- SPEC-07 (app, auth), SPEC-08 (`recompute`, repositories).
- Decisions: A-2, A-9, A-13, A-14, A-15, A-16, A-24, A-26; A2-8, A2-9.

## 4. Design

### 4.1 Modules (`apps/api/src/`)

`routes/{po,srv,flags,audit,dashboard,search,delivery-tracker}.ts`;
`services/{po,po-manual-qty,srv,flags,audit,dashboard,search,delivery-tracker}.ts`;
`repositories/{po-list,srv-list,flags,audit,dashboard,search,delivery-tracker}.ts` (plain rows; sorting and filters
in SQL over stored derived columns; no business values computed in repositories).

### 4.2 List convention

`?page=1&pageSize=25&sort=<column>&dir=asc|desc&<filters>` validated by `zListQuery` (unknown sort column → 400);
response `{ items, total }`. Page sizes are the legacy options. Sort keys are an allowlist per list.

### 4.3 Error handling

Delete blocked → 409 `{ code: 'delete-blocked', message: '<plain reason>', details: { reason } }`; version mismatch
→ 409; manual qty `< 0` → 400.

## 5. Invariants

INV-08, INV-09, INV-13, INV-14, INV-20, INV-24, INV-35 (PO, SRV), INV-40, INV-57 (detection on later DCs is in
SPEC-11; set/clear here), INV-59, INV-60 (dashboard count), INV-61, INV-65 (field order of list shapes), INV-73,
INV-83, INV-87, INV-95.

## 6. Testing strategy

API tests per endpoint (happy, 400, 401, 404, 409) on synthetic data built through the ingestion services:

- Manual qty `(ord 10, manual 4) -> dsp 4, balance 6`, audit row with before/after; `-1` → 400.
- Delete PO with a DC → 409 with reason; without → gone.
- Delete the last SRV → `rcd/rej` back to the PO document's values.
- Acknowledge a flag: status changes, no other row changes (table hashes before/after).
- GEMC manual edit with `848.75` stores source `848.75`, net `719.27966`; re-saving unchanged keeps both.
- Lists: sort allowlist, filters, `total`, page boundaries.

## 7. Acceptance criteria

- [ ] Every frozen PO/SRV/deviations/ledger/dashboard/tracker/search screen field is served by these endpoints.
- [ ] All writes are single batches with an audit row; reads never write.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                       | Scope / files                                                                  | Checks  | Done when                                                                                                           |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | PO list, stats and detail                   | `routes/po.ts` (reads), `services/po.ts`, `repositories/po-list.ts`, tests     | `check` | List convention, filters and sorts tested; detail returns quantities, lots, flags and linked-document counts/lists. |
| 2   | PO manual create, edit and delete           | `services/po.ts` (writes), routes, tests                                       | `check` | GEMC inclusive-rate case (INV-20); version conflict 409; delete blocked by documents (INV-35).                      |
| 3   | Manual dispatched quantity                  | `services/po-manual-qty.ts`, route, tests                                      | `check` | INV-08 literal case and audit before/after; negative rejected; OVER_DISPATCH raised when it passes ord.             |
| 4   | SRV list, by-PO list, detail and delete     | `routes/srv.ts`, `services/srv.ts`, `repositories/srv-list.ts`, tests          | `check` | "PO not found" listed (INV-40); delete restores PO-winner values (INV-13).                                          |
| 5   | Flags and audit                             | `routes/{flags,audit}.ts`, services, repositories, tests                       | `check` | Acknowledge changes nothing else (INV-59); audit is read-only (INV-83).                                             |
| 6   | Dashboard, search and delivery tracker data | `routes/{dashboard,search,delivery-tracker}.ts`, services, repositories, tests | `check` | Fields match the legacy screens' visible values for a synthetic dataset; insights/forecast absent.                  |

## 9. Open issues

- **SRVs of a deleted PO.** Spec §4 says delete the PO to reload older data; the SRV rows keep `po_number` and
  become "PO not found" (A2-9) until the PO is ingested again, when the next PO batch re-links them by
  `po_number`. Conservative reading consistent with A2-9; implementation detail.
- **Search ranking and fields** follow the legacy visible results; implementation detail.
- **PO stats and dashboard KPIs** keep the legacy set of numbers; each must be expressible from stored derived
  columns (no new computation outside the domain).
