# SPEC-17 — Web: deviations, ledger, delivery tracker and reports

Layer: L5 (deviations, ledger) and L6 (tracker export, reports). Architecture refs: §6.9, §8.2 (`audit_log`),
§11.2, §12.2, §12.3, C7, C8; spec §8; A-2, A-16, A-23, A-24, A-26.

## 1. Summary

The four reporting screens, with their legacy layouts and labels: `/deviations` (reconciliation flags, with
acknowledge), `/system/ledger` (the read-only audit log), `/delivery-tracker` (list, stats, smart filters, export)
and `/reports` (the legacy report tabs minus daily-dispatch, with exports and export-selected). Downloads go through
the platform adapter (Save-as in the desktop shell, a browser download otherwise).

## 2. Scope

Core:
- `/deviations`: flags list (type, status, PO filters), the six v1 types with plain labels (INV-58), acknowledge
  with an optional note (INV-59), links to the PO and SRV.
- `/system/ledger`: audit list with filters; read-only; no delete or prune control (INV-83).
- `/delivery-tracker`: list, stats, smart filter chips, export button (SPEC-13).
- `/reports`: legacy tabs except daily-dispatch (A-16, INV-87); each tab a DataTable over the report list endpoint;
  export buttons and export-selected (SPEC-13); GC report for a chosen DC.

Out of scope:
- New report columns or exports (A-2); a flag column in any export (INV-60).

## 3. Dependencies

- SPEC-14, SPEC-10 (flags, audit, tracker data), SPEC-13 (report lists and exports).

## 4. Design

`routes/{deviations,system/ledger,delivery-tracker,reports}.tsx`;
`components/modules/{deviations,ledger,delivery-tracker,reports}/*`; download through `platform.saveAs`.

## 5. Invariants

INV-58, INV-59, INV-60, INV-61, INV-67, INV-70, INV-71, INV-83, INV-87.

## 6. Testing strategy

E2E with synthetic data: acknowledge a flag (§14.1) and see it move to acknowledged with no other change; switch
report tabs, filters and chips without layout shift; export downloads a file whose name equals the catalog name;
ledger shows the audit rows of earlier actions.

## 7. Acceptance criteria

- [ ] `/reports` has no daily-dispatch tab; every remaining tab exports with its legacy format.
- [ ] No interaction (tabs, chips, filters, paging, sort, acknowledge) moves or resizes surrounding layout;
      loading/empty/error keep the same footprint.
- [ ] Light/dark screenshots match legacy (review artefacts).
- [ ] `pnpm verify` and every CI job green, including `e2e`.

## 8. PR plan

| # | Title | Scope / files | Checks | Done when |
|---|---|---|---|---|
| 1 | Deviations screen | `routes/deviations.tsx`, `components/modules/deviations/*`, e2e | `check`, `e2e` | Acknowledge e2e passes; filters keep layout. |
| 2 | Ledger screen | `routes/system/ledger.tsx`, `components/modules/ledger/*`, e2e | `check`, `e2e` | Audit rows listed and filterable; no delete control. |
| 3 | Delivery tracker | `routes/delivery-tracker.tsx`, `components/modules/delivery-tracker/*`, e2e | `check`, `e2e` | Chips and stats work without shift; export downloads the tracker file. |
| 4 | Reports | `routes/reports.tsx`, `components/modules/reports/*`, e2e | `check`, `e2e` | Each tab lists and exports; export-selected and GC report download; no daily-dispatch tab. |

## 9. Open issues

- The `/reports` sidebar label stays as legacy even though daily-dispatch is dropped (labels frozen, A-2).
