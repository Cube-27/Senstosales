# SPEC-03 decisions

Decisions for [SPEC-03 — Domain: FY, GEMC, tax, links, guards, flags](../specs/SPEC-03-domain-fy-gemc-tax-links-flags.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0009 — Money rounding: half-up

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 · Status: decided
- Decision: `round2`/`round5` round exact ties half-up on the exact integer result.
- Alternatives: Half-even (banker's rounding).
- Why: The spec does not state the tie rule; half-up is the conservative reading. SPEC-12 invoice goldens from legacy output are the arbiter; a mismatch is escalated, not silently changed (SPEC-03 Open issues).
- Reversible: yes — one domain function and its table tests.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0029 — Fy and docKey branded strings

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 1 (#12) · Status: decided
- Decision: `Fy` is a branded `"YYYY-YY"` string (`fyOf`); `docKey(number, fy)` returns a branded string `${fy}|${number.trim()}` used as a `Map` key. The FY prefix is fixed-width, so keys are unambiguous; DC, invoice and GC numbers each use their own key space (INV-23).
- Alternatives: Tuple or object keys (not usable as `Map` keys by value); a document-kind parameter in `docKey`.
- Why: SPEC-03 §4.1 fixes `docKey(number, fy)`, and `"2024-25"` is the legacy FY format. Trimming only surrounding whitespace follows legacy SRV linking (SPEC-03 §4.2, EC-16).
- Reversible: yes — a domain-internal representation.

### D-0030 — defaultGc blank GC number

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 1 (#12) · Status: decided
- Decision: `defaultGc` treats a GC number as blank when it is missing, `null`, empty or whitespace-only; a non-blank GC number is returned as typed, not trimmed. Only a missing or `null` GC date is blank (`IsoDate` cannot be whitespace).
- Alternatives: Trim the given GC number.
- Why: The spec is silent on storing the number; legacy GC defaulting checks `strip() == ""` and keeps a given value unchanged. Comparisons go through `docKey`, which trims.
- Reversible: yes.

### D-0033 — matchSrvItem / resolveDocLink signatures

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: superseded (D-0565)
- Decision: `resolveDocLink(raw, srvDate, candidates)` takes candidates `{ id, number, date }` of one document kind and returns the linked id or `null`; a missing or whitespace-only number links nothing. `matchSrvItem({ materialCode, poItemNo }, poItems)` takes `poItemNo: number` and returns the matched PO item id or `null`.
- Alternatives: Return the matched object; a string PO item number; a precomputed `DocKey` index for candidates.
- Why: SPEC-03 §4.1 fixes names and arguments but not element types. `po_item_no` is part of `UNIQUE(po_id, po_item_no)` (ARCHITECTURE §8.2). Ids are what `resolved_dc_id` / `po_item_id` store. Callers can pre-filter candidates by number.
- Reversible: yes — domain-internal.

### D-0034 — Ambiguous material code is unmatched (EC-19)

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: superseded (D-0565)
- Decision: When a material code is on several PO items and the SRV row's PO item number is none of them, the SRV line is stored unmatched (EC-19), as for EC-12.
- Alternatives: Pick the first item with the code.
- Why: A2-7 lets the PO item number decide among the items with that code; picking one would invent a rule (C18). To confirm against legacy ingestion goldens in SPEC-08.
- Reversible: yes.

### D-0035 — Material codes compared exactly

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 4 (#16) · Status: superseded (D-0565)
- Decision: `matchSrvItem` compares material codes exactly: no trimming or case folding.
- Alternatives: Trim or upper-case before comparing.
- Why: Spec §3 matches by material code and states no normalisation; the parsers (SPEC-06) produce the stored values.
- Reversible: yes.

### D-0036 — GST percentage unit

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: GST percentages are a branded integer `GstPct` in 1e-5 units (`9` % -> `900000`), parsed exactly by `parsePct`; a negative rate is malformed input.
- Alternatives: Reuse `Money` for percentages; basis points.
- Why: SPEC-03 §9 names 1e-5 units; a separate brand stops a percentage being passed where an amount is expected.
- Reversible: yes — one type and its parser.

### D-0037 — Single rounding from the exact value

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: Taxable, CGST and SGST are each rounded once, from their exact bigint product, to 5 dp (GEMC) or 2 dp; CGST and SGST are computed from the rounded taxable, as INV-41 reads. No intermediate 5-dp rounding before a 2-dp one.
- Alternatives: Float arithmetic as legacy; round to 5 dp, then to 2 dp.
- Why: C3 forbids floats, and double rounding can move a tie. SPEC-12 invoice goldens arbitrate, as for D-0021.
- Reversible: yes — one function.

### D-0038 — Out-of-range amounts throw

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 3 (#15) · Status: decided
- Decision: `roundToMoney` throws `RangeError` when a result exceeds 2^53 1e-5 units (about 90 billion), instead of returning a lossy number.
- Alternatives: Return a `Result` from every tax function; `bigint` Money.
- Why: Follows D-0022 (never a lossy number). The case is unreachable with valid invoice input, so a `Result` would burden every caller.
- Reversible: yes.

### D-0039 — GEMC source-rate brand constructor

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 2 (#14) · Status: decided
- Decision: `gemcSourceRate(rate: Money)` is an explicit, unchecked brand applied where the GST-inclusive rate is read (BHEL page, manual GEMC entry, stored source column); `gemcNetRate` takes only a `GemcSourceRate` and returns plain `Money`, so its output cannot be divided again without an explicit re-brand (INV-17).
- Alternatives: A string-only `parseGemcSourceRate`.
- Why: The stored source column arrives as integer `Money`, not a string. SPEC-05/06/08 brand at their read boundary.
- Reversible: yes.

### D-0040 — GEMC number as captured

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 2 (#14) · Status: decided
- Decision: `extractGemcNumber` returns the captured group as written (case kept, `gemc-ab12` -> `ab12`), with no normalisation; a word between `GEMC` and the number is captured as the number (EC-18).
- Alternatives: Upper-case or otherwise normalise the number.
- Why: Legacy regex behaviour (A2-3, INV-19); the spec states no normalisation.
- Reversible: yes.

### D-0041 — DC-sourced invoice issue codes

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `validateDcInvoiceLines` reports `line-not-on-dc`, `dc-line-missing` and `duplicate-line` besides SPEC-11 §4.3's `dc-qty-mismatch` and `rate-mismatch`, covering INV-29's "exactly the DC's lines"; qty and rate are compared exactly (integer units, no 0.001 tolerance).
- Alternatives: Reuse `line-not-on-po` for all three.
- Why: An exact copy of the DC has no rounding; a code per cause gives a plain reason. An empty invoice reports `dc-line-missing`; which code the API returns is settled in SPEC-11.
- Reversible: yes.

### D-0042 — A DC with no lines is rejected

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: DC and PO-direct invoice lines share one rule: at least one line (`no-lines`), each `qty > 0` on an item of the PO, no cap.
- Alternatives: Accept an empty DC.
- Why: An empty DC is malformed input (C6); SPEC-11 §4.3 lists `no-lines`. Unknown item ids stay the service's 404 (SPEC-11).
- Reversible: yes.

### D-0043 — deleteBlock shape and reasons

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `deleteBlock(kind, links)` takes per-kind link counts (`dc: { invoices, srvItems }`, `invoice: { srvItems }`, `po: { dcs, invoices }`, `srv: {}`) and returns `dc-has-invoice`, `dc-linked-srv`, `invoice-linked-srv`, `po-has-dc`, `po-has-invoice` or `null`; the first listed reason wins.
- Alternatives: One `po-has-documents` reason.
- Why: A specific reason lets the UI show the plain sentence INV-35 asks for.
- Reversible: yes.

### D-0044 — changedImmutableFields paths

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 5 (#17) · Status: decided
- Decision: `changedImmutableFields` returns `lines.<id>.qty` and `lines.<id>.rate`, and `lines.<id>` for a line added or removed; any entry means the update is rejected (409).
- Alternatives: Compare qty and rate only, ignoring added or removed lines.
- Why: Adding or removing a line changes quantities, which INV-33 freezes.
- Reversible: yes.

### D-0045 — Flag shape and details

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: `DesiredFlag = { type, scopeType, scopeId, poId, details }`; `details = { field, expected, actual, docIds }` is stored as `details_json`, quantities as exact decimal strings. QTY_MISMATCH `ord_qty` (PO → SRV); DOC_NUMBER_CONFLICT `challan_no`/`invoice_no` (trimmed raw number, one flag per unresolved number); OVER_DISPATCH `dsp_qty` and OVER_INVOICE `invoiced_qty` against ord; DOC_ON_CANCELLED_ITEM `status` → `Cancelled`, one per DC/invoice line citing its document; MANUAL_ADJUSTMENT_OVERLAP `manual_dispatched_qty`, citing the later DCs once each, sorted.
- Alternatives: Integer `Qty` values in the JSON; `docIds` outside `details`; one DOC_NUMBER_CONFLICT per SRV line.
- Why: ARCHITECTURE §8.2 stores `details_json (field, expected, actual)`; the cited DC ids are needed to show which DC (SPEC-10/17), so they go in the same JSON.
- Reversible: yes, until SPEC-08 stores rows.

### D-0046 — Fingerprint encoding

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: `fingerprint` = `JSON.stringify([type, scopeType, scopeId, field, expected, actual, docIds])`, not hashed. `diffFlags` treats any stored fingerprint, open or acknowledged, as present and returns inserts with their fingerprint.
- Alternatives: A `|`-joined string (collides when a raw SRV number contains `|`); a SHA hash (crypto import in domain, C12).
- Why: §6.9 names the parts; JSON is unambiguous and readable. INV-59: re-detection never duplicates, whatever the stored flag's status.
- Reversible: yes, until SPEC-08 stores rows.

### D-0047 — Readings of the detection rules

- Date: 2026-10-14 · Spec/PR: SPEC-03 PR 6 (#18) · Status: decided
- Decision: QTY_MISMATCH needs a matched PO item (EC-12 lines are not compared); DOC_NUMBER_CONFLICT applies to unmatched lines too; a blank number cites nothing. MANUAL_ADJUSTMENT_OVERLAP uses a strict "after" over ISO-8601 UTC text (§8.1); manual > 0 with no `manualSetAt` raises nothing. OVER_DISPATCH / OVER_INVOICE apply to cancelled items too.
- Alternatives: Flag on a missing set time; exempt cancelled items.
- Why: The most literal reading of SPEC-03 §4.2 and ARCHITECTURE §6.9; the spec states no exemption (C2, C18).
- Reversible: yes.

### D-0565 — SRV rows match PO items by PO item number alone

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: `matchSrvItem(poItemNo, poItems)` returns the PO item of the SRV's PO with that item number; material code and lot play no part (A2-7 revised, INV-39). Supersedes D-0033, D-0034 and D-0035.
- Alternatives: Keep the material-code match with the item number as a tie-break.
- Why: Owner-approved 2026-10-15 (E2E real-data test): real SRV rows carry the PO item number and often no material code or lot; legacy matched by item number.
- Reversible: yes — domain function and its two callers.

### D-0567 — DOC_NUMBER_CONFLICT means "another PO's document"

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: The flag is raised only when a cited challan or invoice number resolves, in the SRV date's FY, to a DC or invoice that is not one of the PO's own; its details carry `docIds: [resolvedId]` (A-24 revised, INV-53). A number with no document is no flag.
- Alternatives: Compare dates or quantities of the PO's own document; flag unresolved numbers as before.
- Why: The owner's rule is "a document with that number exists in the same FY and its details differ"; the PO is the detail an SRV can contradict without inventing a comparison (C18). Re-dating one's own DC raised false conflicts in the E2E test.
- Reversible: yes — one branch in `detectFlags`.

### D-0568 — Three SRV row flags and their details

- Date: 2026-10-15 · Spec/PR: E2E FIX-2 (#93) · Status: decided
- Decision: `SRV_PO_ITEM_ZERO` (PO ITM 0), `SRV_DUPLICATE_ITEM` (the same SRV, PO item and SRV item more than once; details `poItemNo/srvItemNo`) and `SRV_UNKNOWN_PO_ITEM` (any other row matching no PO item). One flag per row through one helper; nine v1 types (INV-58).
- Alternatives: One generic SRV_ROW_ODD type with a reason field.
- Why: Separate types keep the flag filters and stats readable for low-tech users and match the owner's three cases.
- Reversible: costly — flag types are stored as text in `reconciliation_issue`.
