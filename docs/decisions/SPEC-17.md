# SPEC-17 decisions

Decisions for [SPEC-17 — Web: deviations, ledger, delivery tracker and reports](../specs/SPEC-17-web-deviations-ledger-tracker-reports.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0470 — Deviations type and PO filters come from the URL; Show resolved sets the status

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 1 (#87) · Status: decided
- Decision: `/deviations` lists open flags; the legacy "Show resolved" checkbox lists every status. The type and PO filters are URL search only (`?type=`, `?poId=`), with no control of their own.
- Alternatives: Type and PO selects on the toolbar.
- Why: C7; the legacy screen had only the search box and the checkbox.
- Reversible: yes.

### D-0471 — Resolve opens a confirm dialog with an optional note

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 1 (#87) · Status: decided
- Decision: Resolve opens "Resolve deviation?" with a "Note (optional)" field and posts `flags.acknowledge` with the trimmed note or null.
- Alternatives: Legacy one-click resolve with no note.
- Why: The spec asks for acknowledge with an optional note (INV-59); a dialog adds the note without changing the list.
- Reversible: yes.

### D-0472 — Flag rows carry the SRV of a flag on an SRV line

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 1 (#87) · Status: decided
- Decision: `zFlagRow` gains `srvId` and `srvNumber` (null unless the scope is an SRV line), read through left joins in `listFlags`.
- Alternatives: A second request per row; no SRV link.
- Why: The Document column links the SRV as legacy did; additive fields only.
- Reversible: yes.

### D-0473 — The deviations search matches what legacy matched

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 1 (#87 review) · Status: decided
- Decision: `flags.list` `q` is a `LIKE` match over the PO number, the SRV number, the type and scope codes, and the details' field, expected and actual values (`json_extract`); the count query has the same joins.
- Alternatives: PO number only.
- Why: C7; the legacy search and its frozen placeholder ("Search PO, SRV, type, qty...") covered these fields.
- Reversible: yes.

### D-0474 — Report lists take a search text; exports ignore it

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 4 (#87) · Status: decided
- Decision: `reports.pending` and `reports.reconciliation` take `q` (PO number or description); the tab exports cover the range without it.
- Alternatives: Filter the loaded page in the browser; pass `q` to the exports.
- Why: Legacy's search box narrowed only the screen; filtering in SQL keeps paging right.
- Reversible: yes.

### D-0475 — Report tabs default to yesterday to today

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 4 (#87) · Status: decided
- Decision: Without a range in the URL the tabs show yesterday..today (IST); Reset returns to it and keeps its slot while hidden.
- Alternatives: No default range.
- Why: The legacy screen's default ("last 1 day").
- Reversible: yes.

### D-0476 — No GC report control on /reports

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 4 (#87) · Status: decided
- Decision: `/reports` has no GC report control; the GC download is reached from DC detail (SPEC-18). SPEC-17 §2 and row 4 say so.
- Alternatives: Add a DC picker and GC download to `/reports`, as SPEC-17 §2 first read.
- Why: C7 freezes the element set and outranks the spec; the legacy reports screen had no GC control.
- Reversible: yes.

### D-0477 — Tracker rows say whether the lot is overdue

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 3 (#87) · Status: decided
- Decision: `zTrackerRow` gains `overdue`, from the domain's `deliveryDue`; the web highlights those rows.
- Alternatives: Derive it in the web from `daysToDue`.
- Why: C2; the item status also decides it, so only the domain rule can.
- Reversible: yes.

### D-0478 — Tracker chips are read from the URL; More Filters is a popover

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 3 (#87) · Status: decided
- Decision: A chip is on when the URL's ranges are its ranges; a date chip and a status card exclude each other. The legacy push-down filter panel opens as a popover.
- Alternatives: Chip state of its own; the push-down panel.
- Why: One source of truth with no effects; C8 forbids the panel moving the table.
- Reversible: yes.

### D-0479 — Ledger modules, sorts and payload

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 2 (#87) · Status: decided
- Decision: Entity types map to the legacy module labels and colours; no severity badge (audit rows have none); only Timestamp and Event sort (the API's keys); Log Details shows the row's values as JSON.
- Alternatives: A severity column with invented values.
- Why: C2/C18; no data for severity.
- Reversible: yes.

### D-0480 — Tracker Unit Price shows two decimals

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 3 (#87) · Status: decided
- Decision: Unit Price and Pending Value use `fmtMoney` with `gemc: false`.
- Alternatives: Add `isGemc` to tracker rows.
- Why: Tracker rows carry no GEMC flag; the legacy tracker showed two decimals.
- Reversible: yes.

### D-0481 — DataTable selection, row click and least width

- Date: 2026-10-15 · Spec/PR: SPEC-17 PRs 1-4 (#87) · Status: decided
- Decision: DataTable takes `selection` (header box over the rows on screen, row boxes; a row click toggles unless `onRowClick` is given; a click on a link in the row does not) and `onRowClick`. Its least width is the pixel columns plus 160px per percentage column, so a narrow window scrolls; sortable headers keep the header's uppercase.
- Alternatives: Selection state per screen; columns squeezed on narrow windows.
- Why: C8 and the legacy report tabs' row selection.
- Reversible: yes.

### D-0482 — SPEC-17 lists page by 10

- Date: 2026-10-15 · Spec/PR: SPEC-17 PRs 1-4 (#87) · Status: decided
- Decision: The four screens use the shared list default of 10 rows a page.
- Alternatives: Legacy 15 and 20.
- Why: One page size across the lists (SPEC-14 list defaults).
- Reversible: yes.

### D-0483 — Days Overdue keeps the legacy screen's wording

- Date: 2026-10-15 · Spec/PR: SPEC-17 PR 3 (#87) · Status: decided
- Decision: The badge reads "Nd overdue", "Today" or "Due in Nd".
- Alternatives: The export's wording.
- Why: C7; the screen's own labels are frozen.
- Reversible: yes.

### D-0591 — Daily Dispatch tab

- Date: 2026-10-15 · Spec/PR: SPEC-17 E2E FIX-3 (#94) · Status: decided
- Decision: A third `/reports` tab sharing the tabs' range (default yesterday to today; one day as both ends gives that day), with no row selection; the download is `Daily_Dispatch_<date>.xlsx` or `Daily_Dispatch_<from>_to_<to>.xlsx`, the heading's date the range.
- Alternatives: A single date picker, which would shift the header controls (C8).
- Why: Legacy had the endpoint but no screen; the owner wants the report back.

### D-0572 — Tracker overdue needs no received-qty change

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: Overdue stays "status Pending and delivery date past"; an item received in full is Closed (INV-63) and leaves the list.
- Alternatives: Subtract received qty in the tracker query.
- Why: The E2E count was high because no SRV rows linked (fixed by D-0565), not because of the rule.
- Reversible: yes.

### D-0573 — Status sort keeps the legacy group order

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: Sorting by status groups rows Pending, Delivered, Closed as legacy did; no change.
- Alternatives: Sort alphabetically.
- Why: The E2E check compared statuses alphabetically and so read grouped rows as ungrouped; the order is frozen UI (C7).
- Reversible: yes.

### D-0629 — Reports GEMC chip

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: The GEMC # column is 188 px (152 on Daily Dispatch, plain text); several numbers are cut inside the chip, with all of them in the title. Items Summary's Received is 92 px, so the tab's least width stays 1000 and the tabs move nothing at 1280.
- Alternatives: Size for several numbers.
- Why: One number is the common case; a cut chip border looked broken (N-UI).
- Reversible: yes.

### D-0633 — "Operations Insights" and "Daily Reports" stay

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: No label change: the sidebar item reads "Daily Reports" and the page title "Operations Insights".
- Alternatives: Rename either to match the other.
- Why: Legacy shows both, the sidebar item and the page title; both are frozen labels (C7).
- Reversible: yes.
