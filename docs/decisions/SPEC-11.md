# SPEC-11 decisions

Decisions for [SPEC-11 — DC and invoice services and APIs](../specs/SPEC-11-dc-invoice-services.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0247 — DC create guards and retries on the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: DC create starts its batch with `updateWithVersion(po, poId, versionRead, {})`, with the version read before the snapshot, as D-0220 does. On a stale PO the service rebuilds and retries the create up to 3 times, then answers 409 `stale-version`.
- Alternatives: Leave the PO version alone (D-0142), which lets two overlapping creates write `dsp_qty` from stale rows; answer 409 on the first stale read, which would reject a valid DC because of an unrelated concurrent write (C6).
- Why: A DC changes the PO's quantities, and the retry keeps C6: concurrency is never a reason to reject.
- Reversible: yes.

### D-0248 — DC and GC numbers stored trimmed

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: DC and GC numbers are stored trimmed, and a number that is blank after trimming is 400 `number-blank`.
- Alternatives: Store the number as typed.
- Why: Lookups and links compare trimmed numbers (INV-24, `docKey`), so " 7 " and "7" must be one number for the `(number, FY)` index to mean what the links mean.
- Reversible: yes.

### D-0249 — A double collision names the DC number

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: When the DC number and the GC number both collide, the 409 names the DC number. After the refused batch, the service reads the stored DCs to choose the message, because SQLite reports only one index.
- Alternatives: Report whichever index SQLite names.
- Why: A blank GC defaults to the DC number, so both collide whenever a DC number is reused, and "GC 100 already exists" would mislead.
- Reversible: yes.

### D-0250 — DC line errors at their body paths

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: The 400 for invalid lines uses the first domain issue's code and lists every issue in `details.fields` at its body path (`lines.N.qty` → `body.items.N.dspQty`).
- Alternatives: One error per request with no field paths.
- Why: The form can show each message on its line, and the codes are the ones SPEC-11 §4.3 lists.
- Reversible: yes.

### D-0251 — Link re-resolution reads a superset, the domain decides

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: `reresolveLinks` prefilters SRV items with `instr(cited, number) > 0`, a superset of every trimmed match, keeps only items whose cited number matches one of the changed numbers through `docKey`, and leaves the link to `resolveDocLink`.
- Alternatives: Match with SQL `trim()` (its whitespace set differs from JS `trim`, a second rule, C2); a normalised indexed column (needs a migration).
- Why: One business rule, in the domain.
- Reversible: yes.

### D-0252 — Dispatchable defaults carry the supplier snapshot

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 1 (#55) · Status: decided
- Decision: Dispatchable `defaults` carry the supplier snapshot from the supplier row, and every other header field is blank (EC-36).
- Alternatives: Legacy's consignee name from a setting, the address from a default buyer, and department no and our ref from PO columns; none of these exist in v1.
- Why: C18: don't invent inputs.
- Reversible: yes.

### D-0264 — DC edit and delete guard the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: DC edit and delete batches include `updateWithVersion(po, poId, versionRead, {})` for the DC's PO, with the version read in the same statement as the DC (`findDcWithPo`); an edit also guards every other PO it recomputes, each version read before its snapshot. A stale PO is retried (3 attempts); a stale DC on edit is 409.
- Alternatives: Guard only the DC version, which leaves an edit racing a delete writing an audit row for a deleted DC (EC-25).
- Why: One guard covers vanished rows and stale snapshots, as D-0220 and D-0247 do.
- Reversible: yes.

### D-0265 — DC delete fails its batch if a link appears before commit

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: The delete batch starts with `stillUnlinked`, which sets `dc.version` to `CASE WHEN <an invoice or a linked SRV item exists> THEN NULL ELSE version END`; the delete retries on a stale `dc`, and the retry answers the blocked-delete 409.
- Alternatives: Rely on the invoice foreign key (there is none on `srv_item.resolved_dc_id`).
- Why: INV-35 must hold when an SRV ingest commits between the delete's read and its commit (D-0124 check).
- Reversible: yes.

### D-0266 — A DC edit recomputes every PO whose SRV items change link

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: Besides the DC's PO, every PO owning an SRV item whose link the edit changes is recomputed in the same batch, so a dropped link raises `DOC_NUMBER_CONFLICT` there. `reresolveLinks` returns those PO ids.
- Alternatives: Recompute only the DC's PO, as create does (enough for create, which only adds links).
- Why: EC-14 and ARCHITECTURE §6.9 flag the SRV item on its own PO.
- Reversible: yes.

### D-0267 — A DC edit keeping the number and FY skips link re-resolution

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: When the trimmed number and the FY of the new date equal the stored ones, the edit re-resolves no SRV links.
- Alternatives: Re-resolve on every edit.
- Why: Links resolve by `(number, FY)` (INV-24), so none can change; this saves the `instr` scan on the common header edit.
- Reversible: yes.

### D-0268 — DC list columns follow the legacy list

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: Per DC: ordered = Σ of each line's PO item `ord_qty`, dispatched = Σ line `dsp_qty`, received = Σ of each line's PO item `rcd_qty` (EC-38), value = Σ `qtyValue(dsp, rate)`. `q` matches the DC number, PO number and consignee; the date range applies to `dc_date` and the value range to the value. Default order date desc, number desc, id; paged in memory with `paging.ts` (D-0246). `openFlagCount` counts open flags on the DC's lines (`dc_item`), as search's `hasFlags` (D-0245); legacy had no flag count.
- Alternatives: Received from the SRV items linked to the DC (a new rule).
- Why: C7 and C18 freeze the legacy output.
- Reversible: yes.

### D-0269 — DC detail flags and SRVs

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: The detail's `flags` are the open flags on the DC's lines; `srvs` are the SRVs with an item whose `resolved_dc_id` is the DC (INV-37).
- Alternatives: Legacy matched `challan_no = dc_number` without the FY, which INV-24 forbids.
- Why: Links are FY-qualified and stored resolved.
- Reversible: yes.

### D-0270 — DC edit GC defaults follow INV-26

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: A blank GC number or date on edit takes the DC's number or date, as on create.
- Alternatives: Legacy's full update set a blank GC date to today.
- Why: INV-26 names the DC date.
- Reversible: yes.

### D-0271 — DC delete-blocked body

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 2 (#59) · Status: decided
- Decision: A blocked DC delete is 409 `delete-blocked` with `details.reason` the domain reason (`dc-has-invoice`, `dc-linked-srv`) and a plain message.
- Alternatives: One code per reason.
- Why: Matches PO delete; the UI shows the reason.
- Reversible: yes.

### D-0272 — DC-sourced invoice lines are built from the DC's lines

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: After INV-29 validation, the stored lines come from the DC's lines (DC order, DC qty, PO rate), not from the request.
- Alternatives: Store the request's lines.
- Why: Validation has proved them equal, and building from the DC removes a lookup per line.
- Reversible: yes.

### D-0273 — Invoice create 409 codes

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: A unique-index refusal maps to `invoice-number-taken` ("Invoice N already exists in FY X.") or `dc-has-invoice` ("DC N already has an invoice."). There is no pre-read check; the indexes decide.
- Alternatives: Pre-check with a read, which would still need the index for concurrent creates.
- Why: SPEC-11 §4.2 says to map the index violations, and one mechanism covers both the single and the concurrent case.
- Reversible: yes.

### D-0274 — Invoice 400 field paths

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: As D-0250, the 400 carries the first issue's code and every issue at `body.lines.N.<field>`. An empty `lines` reports `dc-line-missing` (D-0041), not `no-lines`.
- Alternatives: `no-lines` for an empty invoice.
- Why: `validateDcInvoiceLines` already decides this, and C2 keeps the rule in one place.
- Reversible: yes.

### D-0275 — Invoice create guards and retries on the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: The same rule as D-0247: `updateWithVersion(po)` first in the batch, with the version read before the snapshot, retried up to 3 times through the shared `retrying` helper.
- Alternatives: No guard, which lets two invoices on one PO write `uninvoiced_qty` from stale rows.
- Why: An invoice changes the PO's derived quantities.
- Reversible: yes.

### D-0276 — PO-direct kind is a 400 until PR 4

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: `kind: "direct"` answers 400 `kind-unavailable` and writes nothing. PR 4 replaces this.
- Alternatives: Narrow the shared body schema, which would break the client contract.
- Why: The route body is a union, and a plain refusal is honest until the mode exists.
- Reversible: yes.

### D-0277 — Buyer snapshot as sent

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 3 (#60) · Status: decided
- Decision: Create stores the buyer fields from the body (the form is prefilled by the preview, PR 4) and does not fill blanks from the `buyer` table.
- Alternatives: Default blanks from the PO's buyer.
- Why: C18 says not to invent defaults; the preview is where defaults come from.
- Reversible: yes.

### D-0290 — PO preview lists every item

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The PO preview returns every PO item with `qty: null`, including items whose `uninvoicedQty` is 0 or negative.
- Alternatives: The legacy filter (only items with uninvoiced > 0) with qty prefilled.
- Why: INV-05 and C6: uninvoiced is shown, never enforced, and the shared schema says `qty` is `null` from a PO; hiding items would be a cap.
- Reversible: yes.

### D-0291 — Invoice preview header defaults

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Both previews fill the supplier snapshot from the supplier row, `buyersOrderDate` = PO date and `gemcNumber` from the PO. The PO preview also fills `remarks` from the PO. The DC preview fills the buyer name, GSTIN and address from the DC's consignee, and `vehicleNo`, `lrNo`, `transporter` and `remarks` from the DC. Every other field is blank, including the PO preview's buyer (EC-46).
- Alternatives: Buyer from `po.buyer_id`, which no flow sets.
- Why: C16 and C18: match the visible legacy output where v1 stores the field, without inventing.
- Reversible: yes.

### D-0292 — DC preview of an invoiced DC is a 409

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The DC preview answers 409 `dc-has-invoice` once the DC has an invoice.
- Alternatives: Return the preview anyway.
- Why: Legacy refuses it, and the create would answer 409 (INV-28).
- Reversible: yes.

### D-0293 — DC preview lines in the DC's order

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The DC preview lists the lines in the DC's order, as the create stores them (D-0272).
- Alternatives: PO item order.
- Why: The form shows what will be saved.
- Reversible: yes.

### D-0294 — PO-direct create: 404 for the PO before 400 for the lines

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: The lines are checked against the PO's items, read after the PO version (D-0220), so an unknown PO is a 404 and malformed lines on a known PO are a 400.
- Alternatives: Check line shape before reading the PO.
- Why: Membership needs the items, and one check order is simpler.
- Reversible: yes.

### D-0295 — Invoice audit lines carry both line ids

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Audit `after.lines` carries `poItemId` and `dcItemId` for both invoice kinds.
- Alternatives: A per-kind shape.
- Why: One shape; a PO-direct line has no DC line.
- Reversible: yes.

### D-0296 — EC-13 and SPEC-11 §6 clarified

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 4 (#63) · Status: decided
- Decision: Both now read: dsp 20, `OVER_DISPATCH`; `OVER_INVOICE` only once the DC is invoiced too (invoiced 20 > ord 10, INV-55). No code change; tests cover both cases with literal values.
- Alternatives: Leave the text and test only the invoiced case.
- Why: The old text contradicted INV-55.
- Reversible: yes.

### D-0306 — Invoice edit and delete guard the PO version

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: Invoice edit and delete batches include `updateWithVersion(po, poId, versionRead, {})`, with the version read in the same statement as the invoice (`findInvoiceWithPo`). An edit also guards every other PO it recomputes. A stale PO is retried (3 attempts); a stale invoice on edit is a 409.
- Alternatives: Guard only the invoice version, which lets an edit racing a delete write an audit row for a deleted invoice.
- Why: The same rule as D-0264 for DCs.
- Reversible: yes.

### D-0307 — Invoice delete fails its batch if an SRV link appears before commit

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: The delete batch starts with `invoiceStillUnlinked` (`version = CASE WHEN <linked SRV item> THEN NULL ELSE version END`). The delete retries on a stale `invoice`, and the retry answers 409 `delete-blocked` with `details.reason: "invoice-linked-srv"`.
- Alternatives: No guard (there is no foreign key on `srv_item.resolved_invoice_id`).
- Why: INV-35 must hold when an SRV ingest commits between the read and the commit (D-0124, D-0265).
- Reversible: yes.

### D-0308 — Invoice edit re-links only when the number or FY moves, and recomputes every PO whose links change

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: As D-0266 and D-0267 for DCs: no re-resolution when the trimmed number and the FY are unchanged; otherwise every PO owning an SRV item whose link changes is recomputed in the same batch.
- Alternatives: Re-resolve on every edit, or recompute only the invoice's PO.
- Why: Links resolve by `(number, FY)` (INV-24), and EC-14 flags the SRV item on its own PO.
- Reversible: yes.

### D-0309 — Invoice list columns, filters and order

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision:
  - Row values: `itemCount` = the invoice's line count, `qty` = `sumQty` of the line quantities (legacy `total_items`, `total_ord_qty`); `taxable` and `total` are the stored header amounts.
  - Filters: `q` matches the invoice number, PO number, DC number or buyer name, as the legacy `_build_where_filters` does. The date range applies to `invoice_date`, and the value range to the stored `total` (inclusive, in SQL).
  - Order: newest first by date desc, number desc (numeric), id desc. Sorting is done in memory with `paging.ts`.
- Alternatives: The legacy default `created_at DESC`.
- Why: C7 and C18 freeze the legacy columns and filters; the default order matches the DC list (D-0268) so both lists open the same way.
- Reversible: yes.

### D-0310 — Invoice KPI cards

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `stats` uses the list filters and gives count, Σ total, Σ taxable and Σ(CGST + SGST + IGST) over the stored amounts, summed with the domain's `sumMoney`. No tax is recomputed.
- Alternatives: Unfiltered totals (legacy `get_stats`).
- Why: The legacy list page shows the filtered stats (`get_filtered_stats`); the amounts were computed once by the domain at creation (INV-41).
- Reversible: yes.

### D-0311 — Invoice detail flags and SRVs

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `flags` are the open flags on the invoice's lines (`invoice_item`); `srvs` are the SRVs with an item whose `resolved_invoice_id` is the invoice (INV-37).
- Alternatives: Match `invoice_no` text without the FY.
- Why: The same as D-0269 for DCs: links are FY-qualified and stored resolved.
- Reversible: yes.

### D-0312 — DC and invoice writes share `services/doc-writes.ts`

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 5 (#65) · Status: decided
- Decision: `relink`, `guardedRecompute`, `otherPos`, `loadPo` and `commit` move out of `dc.ts` into one module keyed by the citation kind; invoice create, edit and delete use them.
- Alternatives: Copy them into `invoice.ts`.
- Why: The D-0220 guard and the link remap live in one place (invoice create previously had its own copy).
- Reversible: yes.

### D-0323 — One synthetic dataset for the cross-flow suite

- Date: 2026-10-15 · Spec/PR: SPEC-11 PR 6 (#67) · Status: decided
- Decision: Read "one synthetic dataset" as one dataset definition (`dataset()`), rebuilt fresh for each flow, plus one lifecycle test that chains DC, invoice, SRV and the guarded deletes on one PO.
- Alternatives: One shared mutable dataset that the tests walk through in sequence.
- Why: Each test stays independent of order; the lifecycle test still covers how the flows interact.
- Reversible: yes.
