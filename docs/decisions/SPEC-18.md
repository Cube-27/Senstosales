# SPEC-18 decisions

Decisions for [SPEC-18 — Web: DC and invoice screens](../specs/SPEC-18-web-dc-invoice.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0485 — Header edit opens in a dialog

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 1, 3 (#88) · Status: decided
- Decision: The DC and invoice header edits open in `FormDialog` with the legacy fields and labels, not legacy's inline edit.
- Alternatives: Legacy inline edit on the page.
- Why: Spec §2 and C8; the page around the edit never moves.
- Reversible: yes.

### D-0486 — DC detail "Received" reads the PO detail

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 1 (#88) · Status: decided
- Decision: DC detail's Received total comes from a second `po.detail` query through domain `dcListTotals` (EC-38 semantics).
- Alternatives: Add received quantities to `dc.detail` (an API shape change).
- Why: No API change in a web spec; SPEC-16 reads `po.detail` the same way.
- Reversible: yes.

### D-0487 — Linked SRVs and delete reasons are shown as text

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 1, 3 (#88) · Status: decided
- Decision: Linked SRVs show as links in the detail subtitle; a blocked delete shows its reason as text beside the disabled button and as its label.
- Alternatives: A tooltip only.
- Why: INV-35/INV-37 in plain words, with no hover needed (C11).
- Reversible: yes.

### D-0488 — Invoice list checkboxes stay and drive no action

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 3 (#88) · Status: decided
- Decision: The invoice list keeps the legacy per-row and select-all checkboxes over the current page; nothing reads the selection (EC-64).
- Alternatives: Drop the column.
- Why: C7 freezes on-screen elements; C18 takes legacy behaviour where the spec is silent.
- Reversible: yes.

### D-0489 — HSN shows a dash on the invoice screens

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 3, 4 (#88) · Status: decided
- Decision: The HSN column stays on the invoice detail and create screens and shows `—` (EC-62, as EC-50).
- Alternatives: Drop the column.
- Why: v1 stores no HSN; C7 keeps the column.
- Reversible: yes.

### D-0490 — List delete knows only the invoice link

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 1, 3 (#88) · Status: decided
- Decision: The DC list disables Delete for an invoiced DC; the invoice list never disables it; an SRV-linked delete is refused by the API and its message shows as a toast (EC-63).
- Alternatives: Add SRV links to the list rows (a list API other specs read).
- Why: No API change; the API refuses every linked delete (INV-35).
- Reversible: yes.

### D-0491 — The invoice form takes tax from the domain directly

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 4 (#88) · Status: decided
- Decision: Line taxes and totals call `invoiceLineTax`/`invoiceTotals` from `@senstosales/domain`; the form stores nothing.
- Alternatives: A re-export through `@senstosales/schemas` (spec §2).
- Why: The web already depends on the domain; §9 calls the path an implementation detail; C2 holds (one implementation).
- Reversible: yes.

### D-0492 — Buyer is picked from the BHEL units, none preselected

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 4 (#88) · Status: decided
- Decision: The buyer picker lists `buyers.list`, fills name, GSTIN, state and state code, and starts empty; a DC-sourced invoice starts with the DC's consignee as buyer from the preview (EC-46).
- Alternatives: A default buyer.
- Why: v1 has no default-buyer flag or address.
- Reversible: yes.

### D-0493 — Form defaults come only from the API

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 2, 4 (#88) · Status: decided
- Decision: Create-form defaults come from `dc.dispatchable` and the invoice preview; no hard-coded payment terms.
- Alternatives: Legacy's literal "45 Days".
- Why: EC-36, EC-46; supplier settings own the defaults.
- Reversible: yes.

### D-0494 — PO-direct quantity hint reads "Uninvoiced"

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 4 (#88) · Status: decided
- Decision: Each PO-direct line shows "Uninvoiced: X" under its quantity, as information.
- Alternatives: Legacy "Max: X".
- Why: A-7 removed the cap (INV-05, INV-31); "Max" would read as a limit.
- Reversible: yes.

### D-0495 — DC notes are saved as the remarks

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 2 (#88) · Status: decided
- Decision: The user's notes are saved in `remarks` joined by a blank line; the detail page splits them back.
- Alternatives: A notes table.
- Why: Legacy stored them this way; no schema change.
- Reversible: yes.

### D-0496 — The document-flow e2e runs on its own API

- Date: 2026-10-15 · Spec/PR: SPEC-18 PR 5 (#88) · Status: decided
- Decision: `documents.spec.ts` uses a `documents` dataset (onboarded) so Playwright starts an API worker of its own.
- Alternatives: Share the onboarded worker with the PO/SRV specs.
- Why: Its DC and invoice numbers and the synthetic PO meet no other spec's data.
- Reversible: yes.

### D-0497 — The number check debounces inside its query

- Date: 2026-10-15 · Spec/PR: SPEC-18 PRs 2, 4 (#88) · Status: decided
- Decision: `useNumberCheck` waits 500 ms on the query's abort signal before calling the API, and marks a number taken only for the API's own taken-number 409, keyed on number and date.
- Alternatives: A debounced value through an effect.
- Why: No React effects (owner rule); superseded checks are cancelled before reaching the API; another FY frees the number (INV-22).
- Reversible: yes.

### D-0498 — Blank text fields are stored trimmed or null

- Date: 2026-10-15 · Spec/PR: SPEC-18 (#88) · Status: decided
- Decision: Every PO, DC and invoice create or edit form stores a text field trimmed, and `null` when blank (`lib/text.ts`).
- Alternatives: Header edits keep surrounding spaces.
- Why: One rule across forms; spaces around a typed value carry nothing.
- Reversible: yes.

### D-0584 — HSN per invoice line

- Date: 2026-10-15 · Spec/PR: SPEC-18 E2E FIX-3 (#94) · Status: decided
- Decision: `invoice_item.hsn` is stored; the preview fills each line from Settings `invoiceDefaults.hsn` and the server applies the same default to a blank line.
- Alternatives: HSN on the PO item.
- Why: Owner; BHEL pages carry no HSN.
- Reversible: costly (column).

### D-0585 — Packets per DC line and invoice line

- Date: 2026-10-15 · Spec/PR: SPEC-18 E2E FIX-3 (#94) · Status: decided
- Decision: `dc_item.packets` and `invoice_item.packets` are stored, nullable; a DC-sourced invoice line defaults to its DC line's; the invoice workbook prints 1 for a line without, as legacy.
- Alternatives: Packets per document.
- Why: Owner ("entered per item").
- Reversible: costly.

### D-0594 — Optional fields in the edit dialogs

- Date: 2026-10-15 · Spec/PR: SPEC-18 E2E FIX-3 (#94) · Status: decided
- Decision: The DC edit no longer requires GC Number or Consignee (a blank GC number takes the DC number, as on create); the invoice edit no longer requires Buyer Address; DC create and edit bodies take the cited invoice as optional.
- Alternatives: Keep them required.
- Why: Owner; API callers that predate EC-47 send no invoice fields.
- Reversible: yes.
