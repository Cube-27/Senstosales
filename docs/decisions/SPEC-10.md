# SPEC-10 decisions

Decisions for [SPEC-10 — PO, SRV, flags, audit, dashboard and search APIs](../specs/SPEC-10-po-srv-flags-read-api.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0172 — PO list text filter

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `q` matches the PO number or the GEMC number, case-insensitively, with `%` and `_` taken literally.
- Alternatives: The legacy LIKE without escaping; also matching material codes.
- Why: Legacy searched the PO number, supplier name and GEMC number, and the supplier is always ours.
- Reversible: yes.

### D-0173 — PO list order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The default is PO date descending. Every sort is followed by PO date descending, then PO number descending, then id. PO numbers sort as integers, with the text as a tiebreak. Status sorts by the legacy rank Pending < Delivered < Closed. A missing value sorts first ascending.
- Alternatives: Text order for PO numbers; alphabetical status.
- Why: Matches the legacy list's visible order.
- Reversible: yes.

### D-0174 — PO list filter semantics

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `valueMin`/`valueMax` compare `COALESCE(po_value, 0)`, and stats sum a missing value as 0. `flagged=true` keeps POs with at least one open flag and `flagged=false` keeps POs with none; `gemc=false` keeps non-GEMC POs.
- Alternatives: Exclude POs with no value; treat `false` as "no filter".
- Why: Legacy treated a missing value as 0; `false` is the plain reading of a boolean filter.
- Reversible: yes.

### D-0175 — PO item count counts every item

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: `itemCount` includes cancelled items.
- Alternatives: Active items only.
- Why: Legacy counted every item row, and the detail still lists cancelled items.
- Reversible: yes.

### D-0176 — PO uninvoiced total from the domain

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The list row's `uninvoicedQty` is computed per page by the domain's `poUninvoicedQty` over the stored item columns, and is not stored.
- Alternatives: A `po.uninvoiced_qty_m` column persisted by recompute.
- Why: No such column exists in ARCHITECTURE §8.2, and C2 keeps the sum in the domain. Uninvoiced is not a sort key, so SQL never needs it.
- Reversible: yes.

### D-0177 — PO detail flags and lists order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 1 (#44) · Status: decided
- Decision: The detail returns open flags only, oldest first. Lots are ordered by lot number; linked documents by document date, oldest first.
- Alternatives: Include acknowledged flags.
- Why: SPEC-10 §2 names open flags; the flags screen (PR 5) shows acknowledged ones.
- Reversible: yes.

### D-0194 — SRV list totals computed in the service

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The service loads the lines of every SRV the SQL filters keep (text, date range, PO number), totals them with the domain's `srvTotals`, then applies the value range, sorts and pages in memory; both views and the stats share this path. This departs from the SPEC-10 §4.1 wording (sorting and filters in SQL) to keep INV-11 out of SQL (C2).
- Alternatives: Aggregates in SQL with `COALESCE(NULLIF(rcd,0), accepted, 0)` (as legacy); stored per-SRV total columns.
- Why: SRV totals are not stored derived columns; computing INV-11 in SQL would place a business rule outside `packages/domain` (C2), and a stored column changes the schema.
- Reversible: yes.

### D-0195 — SRV value

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Value = Σ (line received × the matched PO item's rate), each line rounded once to 5 dp; an unmatched line, or one of a PO not in the system, adds 0.
- Alternatives: The SRV item rate (not stored, D-0107); rounding to 2 dp.
- Why: The legacy SRV list's Value column (C7 frozen visible value), with the exact rounding rule (D-0021).
- Reversible: yes.

### D-0196 — SRV list ordered column

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The flat list shows Σ ordered of the distinct PO items the SRV is matched to; the by-PO view shows the PO's stored `ord_qty`; a PO not in the system shows 0.
- Alternatives: The SRV page's own ORD QTY.
- Why: What the legacy lists show.
- Reversible: yes.

### D-0197 — Accepted shows received on the SRV screens

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Lists, stats and detail show Accepted as the line's received quantity (`srvLineShown`).
- Alternatives: The stored accepted quantity, which the legacy SRV list summed.
- Why: INV-09, A2-8 and EC-11 ("v1: Accepted shows 10"); the `zSrvListRow` schema says the same.
- Reversible: yes.

### D-0198 — SRV stats

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Counts and sums over the SRVs the filters keep, the value range applied per SRV; `poCount` is the number of distinct PO numbers among them.
- Alternatives: Separate stats per view.
- Why: D-0096: stats take the same filters as their list.
- Reversible: yes.

### D-0199 — SRV text filter

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: `q` matches the SRV number, the PO number or any item's invoice number.
- Alternatives: SRV and PO number only.
- Why: The legacy search fields; the invoice number lives on items here.
- Reversible: yes.

### D-0200 — SRV list order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Without a sort, newest first (SRV date, SRV number, id; by-PO: latest SRV date, PO number); a chosen sort breaks ties by that default order; SRV and PO numbers sort numerically.
- Alternatives: Ties in the chosen direction.
- Why: The legacy default is `srv_date DESC`; stable pages need a total order.
- Reversible: yes.

### D-0201 — Flags on SRV detail and delete

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: The detail returns the open flags scoped to the SRV's items; delete leaves flags in place.
- Alternatives: Delete the flags of the deleted items.
- Why: ARCHITECTURE §6.9 and INV-59: flags remain until acknowledged, even when their condition disappears; the PO detail shows open flags too.
- Reversible: yes.

### D-0202 — SRV delete audit row

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 4 (#45) · Status: decided
- Decision: Audit action `delete-srv`, entity `srv`, `before` = PO number, SRV number, SRV date and item count.
- Alternatives: `srv.delete`.
- Why: Matches the `delete-buyer` naming.
- Reversible: yes.

### D-0211 — Manual PO form stored through PO ingest

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Create and edit build `PoValues` from the form and store them with `storePoStatements`, the same batch as upload, so cancel/restore (INV-48), SRV matching of "PO not found" SRVs (INV-39, INV-40) and recompute apply alike.
- Alternatives: A separate manual write path.
- Why: Legacy mapped the form to the scraper format and ran its ingest; one store path keeps the rules in one place.
- Reversible: yes.

### D-0212 — What a manual PO edit keeps

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Amendment no., BHEL status code, PO value and net value, the PO document's rcd/rej per item, the manual dispatched qty and the lots' entry-allow date/note are kept from the stored rows. A new manual PO has amend 0, no PO value, rcd 0 and rej null.
- Alternatives: Clear them.
- Why: The form has no fields for them, and clearing them would silently change received quantities and status.
- Reversible: yes.

### D-0213 — An item left out of a manual edit is cancelled

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: As for a re-ingested PO (INV-48); sending it again restores it.
- Alternatives: Delete the item.
- Why: Items may carry DC, invoice or SRV lines; legacy's edit ran through ingest.
- Reversible: yes.

### D-0214 — Default lot on the manual form

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: An item sent without lots gets lot 1 of the ordered quantity, due on the PO date, as the legacy form did.
- Alternatives: No lot.
- Why: Frozen legacy behaviour (C18).
- Reversible: yes.

### D-0215 — Manual PO form checks

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: 400 for no PO date, no items, a duplicate item number, ordered qty <= 0 or rate <= 0, each with a field path.
- Alternatives: Client-side only, as legacy.
- Why: Malformed input; recompute needs the PO date, and a duplicate item number would otherwise be a 500.
- Reversible: yes.

### D-0216 — GEMC on the manual form

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: A PO is GEMC when the form's GEMC number field is not blank, and a blank field is stored as null.
- Alternatives: Derive it from the remarks (INV-19), as for uploads.
- Why: The legacy form has its own GEMC number field and legacy decided GEMC from it.
- Reversible: yes.

### D-0217 — PO number on manual create and edit

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: Create with a stored number is 409 `po-exists`; an edit that changes the number is 400 `po-number-changed`.
- Alternatives: Upsert, as legacy create did.
- Why: An upsert from the create form would silently overwrite a PO; legacy refused a different number on edit.
- Reversible: yes.

### D-0218 — Stale version mapped once

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: `app.onError` maps the db `ConflictError` to 409 `stale-version` for every route.
- Alternatives: Map it per service.
- Why: Every versioned entity (PO, DC, invoice) needs the same answer.
- Reversible: yes.

### D-0219 — PO delete keeps SRVs and raw HTML

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 2 (#46) · Status: decided
- Decision: The delete removes flags, lots, items and the PO (SPEC-10 §2). SRVs stay with `po_id` and `po_item_id` cleared, and stored source documents stay (INV-107).
- Alternatives: Delete the SRVs too.
- Why: SPEC-10 §9 open issue and A2-9.
- Reversible: yes.

### D-0220 — Setting the manual quantity bumps the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: The manual dispatched quantity batch starts with `updateWithVersion(po, poId, versionRead, {})`, where the version is read before the recompute snapshot.
- Alternatives: Leave the version alone, as recompute does (D-0142). Add a `version` to the request body.
- Why: It is a user edit of the PO. An ingest or edit that loaded its snapshot earlier fails instead of writing `dsp_qty` from stale rows, and this batch fails the same way if another versioned write landed after its read. The route table fixes the body shape, so the version comes from the read.
- Reversible: yes.

### D-0221 — An omitted note clears the stored manual note

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: `{ qty }` without `note` stores `manual_note = NULL`. The quantity and note are set together.
- Alternatives: Keep the previous note when `note` is omitted.
- Why: This is the conservative reading of `{ qty >= 0, note? }`: the note describes the current quantity, so a stale note never stays attached to a new quantity.
- Reversible: yes.

### D-0222 — `manual_set_at` is set on every change

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 3 (#49) · Status: decided
- Decision: Every successful set stamps `manual_set_at = now`, including a change back to 0.
- Alternatives: Stamp only when `qty > 0`.
- Why: SPEC-10 §2 says the endpoint "sets `manual_set_at`" with no condition. INV-57 already ignores it while the quantity is 0.
- Reversible: yes.

### D-0226 — Acknowledging an acknowledged flag is a 409 that writes nothing

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: Acknowledging a flag that is already acknowledged answers 409 `flag-acknowledged` and writes nothing; the first note and time stay. This holds for concurrent requests too: the update sets `status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE NULL END`, so a losing request fails its NOT NULL constraint and its batch, audit row included, rolls back (the check of D-0124). The port reports it as stale `reconciliation_issue`, and the service maps that to the same 409.
- Alternatives: Overwrite the note and time; answer 200 with no change; guard the update in its WHERE clause only (a losing request would still write an audit row and answer 200).
- Why: INV-59 makes acknowledgement a one-way `open -> acknowledged` step. Overwriting would lose the first acknowledgement, and a silent 200 would hide that the note was not saved.
- Reversible: yes.

### D-0227 — Flag and audit text filters

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: The flags list `q` matches the PO number. The audit list `q` matches the action, entity type or entity id.
- Alternatives: Also match the flag details or the audit before/after values.
- Why: These are the identifying text columns each screen shows; the JSON values are not searchable columns.
- Reversible: yes.

### D-0228 — Audit date filter uses IST calendar dates

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: The audit list's `from`/`to` are IST calendar dates (C3), applied to the stored UTC `at` as `[from 00:00 IST, to + 1 day 00:00 IST)`. The bounds are computed on the constant side, so the column is compared as stored.
- Alternatives: UTC dates.
- Why: Every date the user sees is an IST calendar date.
- Reversible: yes.

### D-0229 — Audit row for acknowledging a flag

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 5 (#50) · Status: decided
- Decision: Action `flag.acknowledge`, entity type `reconciliation_issue`, entity id the flag id; before and after are `{ status, note }`.
- Alternatives: `acknowledge-flag`; entity type `flag`.
- Why: Matches the `<entity>.<verb>` actions of the newer services and the table name as entity type.
- Reversible: yes.

### D-0238 — Tracker rows

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: One row per lot with a delivery date, carrying its item's stored quantities; the item is open while Pending or Delivered. Overdue: before today and Pending. Due soon: today to today + 7 and Pending. Due this month: in today's month and open.
- Alternatives: The legacy per-lot FIFO allocation of dispatched and received quantities.
- Why: No quantity is allocated to a lot (INV-06); the buckets keep the legacy tracker's date rules and its not-dispatched and not-received tests, read from the stored item status.
- Reversible: yes.

### D-0239 — Tracker value filter and pending value

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `valueMin`/`valueMax` compare the lot's scheduled value (lot qty × rate), as the legacy filter does. A row's `pendingValue` is its item's balance × rate; stats sum the pending value once per item.
- Alternatives: Filter on the pending value; sum the row values.
- Why: Legacy filter semantics; with item-level balances a per-lot sum would count an item with several lots more than once.
- Reversible: yes.

### D-0240 — Tracker stats and the status toggle

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: The three counts ignore `status`; `pendingValue` follows it; the other filters narrow both.
- Alternatives: Apply `status` to everything.
- Why: As legacy: the cards are the toggles and keep their counts while one is active.
- Reversible: yes.

### D-0241 — Tracker default order

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: Delivery date descending, then PO number (numeric), item number, lot number and lot id; a chosen sort breaks ties by that order. A missing entry date or material code sorts first ascending.
- Alternatives: Ties in the chosen direction.
- Why: The legacy default is `dely_date DESC`; stable pages need a total order (as D-0173, D-0200).
- Reversible: yes.

### D-0242 — Dashboard periods and counts

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `month` starts on the 1st of today's month, `30d` 30 days back. PO value, ordered, dispatched and pending dispatch value cover POs dated in the period; invoiced value and quantity cover invoices dated in it; received covers SRV lines dated in it (INV-11); lead time covers POs dated in it. Overdue lots, DCs without an invoice and open flags are as of today.
- Alternatives: Apply the range to everything.
- Why: The legacy dashboard's queries.
- Reversible: yes.

### D-0243 — Dashboard activity

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: The five POs, DCs and invoices that entered the system last, newest first. A PO's time is its first `po.ingest` or `po.create` audit row; SRVs are not listed (`zActivity`).
- Alternatives: A `created_at` column on `po` (a schema change).
- Why: Legacy sorted by `created_at` and showed five; `po` has no creation column and the audit row records when the PO entered.
- Reversible: yes.

### D-0244 — Search matching and ranking

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: Numbers match from their start; item code and drawing number from their start and description anywhere; DC consignee and invoice buyer anywhere; an SRV also by its PO number (from the start for digits). Digits alone skip party names, one digit skips items, `*` is no text, and no text with no filter finds nothing. Five per type, then a stable merge by exact number, number prefix, other. `match` is the matched value as stored.
- Alternatives: The legacy six-level ranking over display strings; labelled match text such as `Code: X`.
- Why: The same visible results without building display strings in the API (C7).
- Reversible: yes.

### D-0245 — Search values and flags

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: PO: stored PO value and ordered total. DC: Σ line qty × rate and dispatched qty. Invoice: stored total and invoiced qty. SRV: accepted value and qty from `srvTotals`. The value range applies to PO, invoice and SRV, not DC, as legacy. `hasFlags`: an open flag on the PO, or on one of the document's lines. `party` is null for PO and SRV (the supplier is always ours).
- Alternatives: Flags through SRV links as well.
- Why: Legacy fields; flags are scoped to lines in this schema (§6.9).
- Reversible: yes.

### D-0246 — Shared paging helpers

- Date: 2026-10-15 · Spec/PR: SPEC-10 PR 6 (#53) · Status: decided
- Decision: `apps/api/src/services/paging.ts` holds the comparator and page helpers that the SRV lists and the tracker use.
- Alternatives: A copy per service.
- Why: One implementation of the list convention for lists sorted in memory.
- Reversible: yes.

### D-0569 — Dashboard period "This FY", by document date

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: The dashboard gains `fy` ("This FY"), the first button and the default; every period filters documents by their own date (INV-113). Received counts only SRV rows linked to a PO item (INV-40), and Pending Dispatch is clamped per active item (INV-114).
- Alternatives: Keep "This month" as the default; filter by creation timestamp.
- Why: Owner-approved 2026-10-15: the E2E dashboard was empty for a month with no new POs; document dates are what users reconcile against.
- Reversible: yes — one enum value and its default.

### D-0571 — A manual PO's value comes from its lines unless it has a stored page

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: On create and edit, a PO with a stored BHEL page (`source_document` kind `po`) keeps the page's PO-VALUE; any other PO gets `manualPoValue` of its lines (INV-115). GEMC is the field or, when blank, the number in the remarks (`gemcNumberOf`).
- Alternatives: A new `po.origin` column.
- Why: FIX-2 adds no migration; the stored page already records the origin. A null manual value also broke the `valueMax` filter.
- Reversible: yes — a column can replace the lookup later.

### D-0574 — The search speed guard is a query-plan test

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: `search-plans.test.ts` fails when a read of the SRV list or global search scans `srv_item`, `reconciliation_issue` or `po_item` inside a correlated subquery (PERF-01); the indexes are migration 0004's.
- Alternatives: A timing test against a large synthetic dataset.
- Why: Plans are deterministic in CI; timings flake. Verified red with the three indexes dropped.
- Reversible: yes — test only.

### D-0610 — SRV detail returns RECVD as printed

- Date: 2026-10-16 · Spec/PR: SPEC-10 E2E round 2 R2-A (#96) · Status: decided
- Decision: Each SRV detail item carries `rawRcdQty`, the RECVD QTY as printed (null when the cell was empty), beside `rcdQty`, the received it counts as (`COALESCE(NULLIF(rcd, 0), accepted)`, INV-11).
- Alternatives: A nullable `rcdQty`.
- Why: N-SRV-RCD: the screens show the printed value; `rcdQty` keeps one meaning for totals and every reader. Agreed with R2-B.
- Reversible: yes.

### D-0617 — Tracker reads only tracked items' lots

- Date: 2026-10-16 · Spec/PR: SPEC-10 E2E round 2 R2-A (#96) · Status: decided
- Decision: The tracker query keeps lots of items whose status is in the domain's `TRACKED_STATUSES` (Pending, Delivered); `deliveryDue` uses the same constant, so the domain still decides.
- Alternatives: Read every scheduled lot and filter in the service.
- Why: N-PERF: about 90 % of the scheduled lots on full data belong to closed items. Measured on a local copy: dashboard summary 490 → 32 ms, tracker list 550 → 27 ms.
- Reversible: yes.
