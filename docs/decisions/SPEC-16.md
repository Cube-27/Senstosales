# SPEC-16 decisions

Decisions for [SPEC-16 — Web: PO and SRV screens, uploads and folder import](../specs/SPEC-16-web-po-srv-import.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0450 — Supply ring percentage rounds half up from the larger of dispatched and received

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 1 (#84) · Status: decided
- Decision: `supplyProgressPct = floor((max(dsp, rcd, 0) × 200 + ord) / (2 × ord))`, 0 when nothing is ordered, in `packages/domain` (INV-73).
- Alternatives: Dispatched only; floating-point percentages.
- Why: C2/C3; the ring shows supply progress whichever side is ahead, without floats.
- Reversible: yes.

### D-0451 — Row extras open in popovers, never as expanded rows

- Date: 2026-10-15 · Spec/PR: SPEC-16 PRs 1, 2, 4 (#84) · Status: decided
- Decision: Linked documents, lots, the manual qty editor, a PO's SRVs (by-PO view) and row actions open in popovers over the row.
- Alternatives: Legacy expandable rows.
- Why: C8; an expanded row reflows the rows below it.
- Reversible: yes.

### D-0452 — The manual PO form uses react-hook-form with the legacy checks in one function

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 3 (#84) · Status: decided
- Decision: `useForm` + `useFieldArray` (MIT); the legacy checks run in `formError` before saving, with no schema resolver.
- Alternatives: Hand-rolled state; a zod resolver.
- Why: The legacy messages are positional ("Item 20 has missing…"); one plain function keeps them literal.
- Reversible: yes.

### D-0453 — Header fields without columns are read and written by label

- Date: 2026-10-15 · Spec/PR: SPEC-16 PRs 2–4 (#84) · Status: decided
- Decision: A `RAW_FIELDS` table (field → the labels the page may print) drives the PO page and the form; the form writes the first label, so a manual PO reads back like a parsed one. The SRV page uses the same normalised lookup (`lib/raw-header.ts`).
- Alternatives: New columns (a shared schema change).
- Why: SPEC-06 §4.2 keeps the page's labels in `rawHeader`.
- Reversible: yes.

### D-0454 — SRV detail reads PO item material and rate from `po.detail`

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 4 (#84) · Status: decided
- Decision: A second query, enabled only when the SRV's PO is in the system.
- Alternatives: Extend `srv.detail` with PO item fields (changes a SPEC-10 API shape).
- Why: Stays within the spec's APIs.
- Reversible: yes — join on the server later.

### D-0455 — Folder import sits in the PO list's More menu and runs one job at a time

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 5 (#84) · Status: decided
- Decision: One dialog, a PO step then an SRV step; each is disabled while the other runs (INV-98), and POs go first so SRV lines find their POs (§7.4). Staging leaves room in the 10 MB cap for `kind` and `stagingId`.
- Alternatives: Separate buttons on each list.
- Why: SPEC-16 §9 puts it where the legacy sync-folder control was.
- Reversible: yes.

### D-0456 — The job summary is parsed at the web boundary

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 5 (#84) · Status: decided
- Decision: `lib/jobs.ts` reads `job.summary` with a zod schema of what the job worker writes; a summary that doesn't match shows none.
- Alternatives: Move the schema to `packages/schemas` (changes the shared `zJob` entity).
- Why: Boundary validation without touching the shared entity.
- Reversible: yes.

### D-0457 — A PO edit leaves cancelled items out and numbers new items above every stored one

- Date: 2026-10-15 · Spec/PR: SPEC-16 PR 3 (#84) · Status: decided
- Decision: The edit form omits items with `cancelledAt` set, and a new item gets ten past the largest item number the PO ever stored or the form holds.
- Alternatives: Send every item back; number from the form's items only.
- Why: `po.update` matches items by number: a cancelled item sent back is restored (INV-48, INV-63), and a reused number takes over the old item's id and documents (#84 review).
- Reversible: yes.

### D-0634 — The SRV Received column is as printed

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: The SRV detail's Received column shows `rawRcdQty`, empty when RECVD was empty; totals and every computed received keep `srvLineShown`/`srvTotals`. Quantity cells carry their value as the title.
- Alternatives: Show the computed received.
- Why: N-SRV-RCD; shape agreed with R2-A (D-0610).
- Reversible: yes.
