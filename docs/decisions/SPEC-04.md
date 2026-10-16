# SPEC-04 decisions

Decisions for [SPEC-04 — Schemas, route table and formatters](../specs/SPEC-04-schemas-routes-formatters.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0050 — Wire codecs via z.codec

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: `zQty`, `zMoney` and `zIsoDate` are Zod 4 codecs over the domain's parse/format functions; the output side checks the value (`Number.isSafeInteger`, or a valid date), so encoding a float or a bad date throws.
- Alternatives: `z.string().transform(...)` (cannot encode responses); `z.custom` on the branded type (no wire string type).
- Why: One schema serves request decoding and response encoding (C3), with no second parser.
- Reversible: yes — internal to `packages/schemas`.

### D-0051 — Ids are plain ULID strings

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: `zId = z.ulid()`, unbranded, matching the domain's `string` ids (D-0033).
- Alternatives: Per-entity branded ids.
- Why: The most conservative reading; the domain has no id brands. SPEC-04 PR 2 can add brands if entities need them.
- Reversible: yes.

### D-0052 — C12 lint rule matches exact names

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 1 (#20) · Status: decided
- Decision: Bare builtins and `playwright`/`playwright-core` go in `no-restricted-imports.paths`; the patterns keep only the prefixes `node:*`, `playwright/*`, `playwright-core/*`, `@playwright/*` and `@tauri-apps/*`.
- Alternatives: Anchored gitignore patterns (not known to behave the same in Oxlint).
- Why: The builtin `domain` as a pattern blocked `@senstosales/domain` in every core package. Regression test in `lint-boundaries.test.ts`.
- Reversible: yes.

### D-0053 — Legacy display formats kept per screen

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: Each distinct legacy display format is one named shared formatter: `fmtDate` (`05/01/2025`, empty `—`), `fmtDateMonthName` (`05 Jan 2025`, empty `-`; PO delivery dates and deviations), `fmtMoney` (full precision, `-₹848.75`), `fmtMoneyCompact` (`₹1.50L`, `₹1.00Cr`; rounded to whole rupees first), `fmtMoneyCompactSpaced` (`- ₹1.50 L`; delivery tracker, rounds the magnitude and only below a lakh), `fmtRate` (no rupee sign; legacy rate cells draw it apart), `fmtFy` (`FY 2024-25`).
- Alternatives: One format per kind of value.
- Why: SPEC-04 §9: where legacy shows two formats for the same kind of value, each screen keeps its own; unifying them needs an ADR (C7).
- Reversible: yes.

### D-0054 — Quantities display in whole units

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: superseded by D-0625
- Decision: `fmtQty` rounds to whole units half toward +infinity, as legacy does for every quantity cell and total (`2.5 -> 3`, `-2.5 -> -2`). Recorded as EC-21.
- Alternatives: Show up to 3 dp.
- Why: SPEC-04 §4.4 asks for legacy-identical output; showing decimals would be new behaviour (C18).
- Reversible: yes.

### D-0055 — No negative zero

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: An amount or quantity that rounds to zero prints unsigned (`0`, `₹0`); legacy printed `-0`, `-₹0` or `- ₹0` for small negatives such as `-0.4`.
- Alternatives: Reproduce the sign.
- Why: The sign is a float artefact of the legacy code, not a format.
- Reversible: yes.

### D-0056 — Exact ties in display rounding

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: `fmtMoney`/`fmtRate` round to 2 dp through the domain `roundMoney`, half away from zero (D-0021): `848.755 -> ₹848.76` (legacy `toFixed` on the binary float shows `₹848.75`). The compact formats round hundredths of a lakh or crore half up on the exact value; whole rupees and whole units round half toward +infinity, as legacy `Math.round` does.
- Alternatives: Emulate the float rounding.
- Why: Stored amounts are exact (C3), so the display must not depend on binary floats; ties arise only for values with more decimals than shown, which the write paths already round.
- Reversible: yes.

### D-0057 — C12 lint: deep subpath globs

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 5 (#21) · Status: decided
- Decision: The C12 prefix globs use `**` (`node:*`, `node:*/**`, `playwright/**`, `playwright-core/**`, `@playwright/**`, `@tauri-apps/**`), so subpaths at any depth are banned. Extends D-0052.
- Alternatives: Keep single-level `*`.
- Why: A gitignore-style `*` does not cross `/`, so `node:fs/promises` and `@tauri-apps/api/core` passed the ban. Regression test in `lint-boundaries.test.ts`.
- Reversible: yes.

### D-0061 — Entity shapes are API read shapes of the §8.2 rows

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: Entities use camelCase column names with the unit suffix dropped (`ord_qty_m` -> `ordQty`; the codec carries the unit). `supplier_id` (one supplier per install, A2-12) and `reconciliation_issue.fingerprint` (storage only) are left out; JSON columns become named fields (`bankDetails`, `rawHeader`, `details`, `before`/`after`, `progress`, `summary`).
- Alternatives: Mirror the columns 1:1.
- Why: The API never needs those two columns, and the domain already uses these field names.
- Reversible: yes.

### D-0062 — DC and invoice header fields come from the legacy forms

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: DC: ourRef, departmentNo, consignee name/GSTIN/address, inspectionCompany, ewayBillNo, vehicleNo, lrNo, transporter, modeOfTransport, remarks, plus the supplier snapshot. Invoice: the buyer snapshot (name, GSTIN, address, state, state code, place of supply, buyer's order date), gemcNumber/gemcDate, paymentTerms, despatchDocNo, srvNo/srvDate, vehicleNo, lrNo, transporter, destination, termsOfDelivery, remarks, plus the supplier snapshot. Dropped: legacy multi-PO `po_numbers` (A-16), `source_type` (now `kind`), `mode_of_payment` (a fallback alias of payment terms) and stored list totals.
- Alternatives: A minimal header set now, with fields added as screens need them.
- Why: ARCHITECTURE §8.2 says only "header fields" and SPEC-11 §9 points to the legacy edit dialogs; these are the fields those forms show (C7 freezes the visible elements).
- Reversible: yes, until SPEC-05 PR 2 creates the columns.

### D-0063 — Per-endpoint bodies are built in PR 3

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: SPEC-04 PR 2 ships the entities, the header shapes and the common list, paged and error shapes; PR 3 builds each route's request and response from them (`pick`/`extend`) next to its table entry.
- Alternatives: Define every request body in PR 2.
- Why: The PR-plan row lists exactly "list query, paged, error body" for `api/*.ts`, and each body sits more naturally beside its route.
- Reversible: yes.

### D-0064 — List query conventions

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `pageSize` must be 10, 25, 50 or 100 (default 10); `page` >= 1 (default 1); `sort` is optional and checked against the list's allowlist; `dir` is `asc|desc` (default `asc`); unknown query keys are stripped.
- Alternatives: Any page size up to a cap; reject unknown keys.
- Why: Legacy behaviour (the pager's options and its default of 10); SPEC-10 §4.2 requires an unknown sort column to be a 400.
- Reversible: yes.

### D-0065 — Error body is strict

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `zErrorBody` is `z.strictObject({ code, message, details?: record })`; `code` is any non-empty string.
- Alternatives: An enum of codes.
- Why: The codes are defined by the API specs (`delete-blocked`, the domain issue codes and so on), so the body shape is fixed here and the codes are set there.
- Reversible: yes.

### D-0066 — Job event level and text codes

- Date: 2026-10-14 · Spec/PR: SPEC-04 PR 2 (#23) · Status: decided
- Decision: `job_event.level` is `info | warn | error`; `departmentNo` and `destCode` are strings (legacy stored integers).
- Alternatives: Free-text level; integer codes.
- Why: The three levels match the pino levels the API logs with; codes are identifiers, not numbers, so text keeps any leading zeros.
- Reversible: yes.

### D-0091 — Route table and API shapes by resource

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: The route table is `src/routes.ts`; request and response shapes are in `src/api/<resource>.ts`, following SPEC-04's module table.
- Alternatives: Shapes beside each table entry (D-0063).
- Why: One file per resource keeps `routes.ts` under 800 lines (C15).
- Reversible: yes.

### D-0092 — Onboarding routes are public

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `onboarding.status` and `onboarding.complete` need no session; the API answers them only while no supplier exists (INV-78).
- Alternatives: Require a session.
- Why: Onboarding runs before the first login (ARCHITECTURE §10.3).
- Reversible: yes.

### D-0093 — Settings body

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Settings are `{ cgstPct, sgstPct, preferences }`.
- Alternatives: Separate routes per setting.
- Why: One body for the one settings form.
- Reversible: yes.

### D-0094 — Login takes no username

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: The login body is `{ password, rememberMe }`.
- Alternatives: Send the username `admin`.
- Why: The username is fixed (A-17, C11).
- Reversible: yes.

### D-0095 — No set-default buyer route

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Buyers have list, create, update and delete only.
- Alternatives: A set-default route.
- Why: The ARCHITECTURE §8.2 buyer has no default column.
- Reversible: yes.

### D-0096 — Stats take the list filters

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: PO, DC, invoice, SRV and tracker stats take the same filters as their lists.
- Alternatives: Unfiltered totals.
- Why: The legacy KPI cards show totals of the filtered list.
- Reversible: yes.

### D-0097 — DC and invoice number checks

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `dc.numberCheck` and `invoice.numberCheck` answer whether a `(number, FY)` is taken.
- Alternatives: Report the collision only on save.
- Why: The legacy form checks live; the flow is frozen (C7).
- Reversible: yes.

### D-0098 — Header edits carry no lines; edit bodies include number and date

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: DC and invoice update bodies hold header fields only, including the number and the date.
- Alternatives: Edit lines in the same body; fix the number and date at creation.
- Why: INV-33 holds by construction; INV-25 and INV-37 allow editing the number and date.
- Reversible: yes.

### D-0099 — Linked documents route

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `po.linked` returns a PO's DCs, invoices and SRVs for popovers and search previews.
- Alternatives: Embed them in every list row.
- Why: Popovers load on demand (INV-73).
- Reversible: yes.

### D-0100 — Reports routes

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Reports are the pending and reconciliation tabs; the PO, DC and invoice registers are export-only. Export-selected takes `poIds`, and exports the selected POs' reconciliation rows (SPEC-13 §2).
- Alternatives: Register list endpoints; export by PO item ids.
- Why: The legacy UI shows the registers only as downloads; SPEC-13 §2 names the selected POs.
- Reversible: yes.

### D-0101 — Delivery tracker returns days to due

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Tracker rows carry `daysToDue`; the UI derives the label.
- Alternatives: A status string from the API.
- Why: The API sends values; the UI formats what it shows.
- Reversible: yes.

### D-0102 — Dashboard lead time in whole days

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: `avgLeadTimeDays` is an integer number of days.
- Alternatives: A fractional day count.
- Why: No floats on the wire (C3).
- Reversible: yes.

### D-0103 — BHEL wizard step union

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: BHEL session responses are a union on `step`: `otp`, `captcha` (with a new image) or `ready`.
- Alternatives: One object with optional fields.
- Why: Each step's required fields are enforced by the schema.
- Reversible: yes.

### D-0104 — Jobs keyed by staging and session ids

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Job bodies name a `stagingId` or `sessionId`, never a file path.
- Alternatives: Pass paths.
- Why: File locations come from the Storage port (C17).
- Reversible: yes.

### D-0105 — Downloads are files

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: Download routes declare `response: "file"`; the client returns `{ fileName, bytes }`, and the name comes from `Content-Disposition`.
- Alternatives: A JSON-wrapped download.
- Why: Excel and CSV names stay as legacy (SPEC-12).
- Reversible: yes.

### D-0106 — Query arrays as repeated keys

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: An array in a query is sent as repeated keys (`types=po&types=dc`).
- Alternatives: Comma-joined values.
- Why: Standard URL encoding; no separator escaping.
- Reversible: yes.

### D-0107 — Fields with no ARCHITECTURE §8.2 column left out of the API shapes

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 3 (#27) · Status: decided
- Decision: These legacy fields are not in any API shape: the supplier description/tagline; the invoice item HSN; the SRV item description, rate, unit, revision and challan qty; the pending report's "no. of packets"; the audit category list. The spec that first needs a field adds its column.
- Alternatives: Add the fields to the shapes now, with no column behind them.
- Why: Shapes follow the schema; there is nothing to store or return yet.
- Reversible: yes.

### D-0115 — OpenAPI freshness checked by a test, not a ci.yml step

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `tools/gen/test/openapi.test.ts` compares the committed `openapi.json` with the generator's output; it runs in `check:code`, so in the CI `check` job.
- Alternatives: A ci.yml step running `regenerate && git diff --exit-code` (SPEC-04 §6 wording).
- Why: A separate step breaks the CI-parity test (one check script per CI job, mirrored by `pnpm verify`); chaining it into `check:code` would rewrite a tracked file and depend on index state; the migrations generator already uses a test.
- Reversible: yes.

### D-0116 — OpenAPI security is a cookie named `session`

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `components.securitySchemes.session` is an `apiKey` in a cookie named `session`; routes are secured globally and public routes set `security: []`.
- Alternatives: An `x-` extension without a cookie name.
- Why: OpenAPI needs a cookie name and no spec gives one; SPEC-07 can rename it and regenerate.
- Reversible: yes.

### D-0117 — Downloads documented as `application/octet-stream`

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `response: "file"` routes declare a 200 response with `application/octet-stream`, named by `Content-Disposition`.
- Alternatives: List the xlsx and csv media types per route.
- Why: The route table does not say which format each download is (D-0105).
- Reversible: yes.

### D-0118 — OpenAPI builder on a subpath export

- Date: 2026-10-15 · Spec/PR: SPEC-04 PR 4 (#31) · Status: decided
- Decision: `buildOpenApi` is imported from `@senstosales/schemas/openapi`, not from the package index.
- Alternatives: Export it from the index.
- Why: Its module-level registry would keep zod's JSON Schema converter in the web bundle.
- Reversible: yes.

### D-0606 — Amounts and rates show at least two decimals

- Date: 2026-10-15 · Spec/PR: E2E FIX-4 (#95) · Status: decided
- Decision: `fmtRate` (and so `fmtMoney`) pads to two decimals; GEMC keeps up to five. Documents and exports are unchanged.
- Alternatives: Trim trailing zeros as before.
- Why: A column's amounts did not line up (UI-MISC); owner-approved rev 1.10.
- Reversible: yes.

### D-0625 — Quantities show exact to 3 dp on screen

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: `fmtQty` writes the quantity's exact decimal, to 3 dp without trailing zeros, with Indian grouping (`12.345`, `1,234`). Supersedes D-0054; EC-21 admitted.
- Alternatives: Whole units, as legacy.
- Why: E2E round 2: quantities show exactly on screen too, as imported and as the exports write them (N-FRAC-UI).
- Reversible: yes.

### D-0626 — GEMC amounts at 5 dp; mixed list columns at 2 dp

- Date: 2026-10-16 · Spec/PR: E2E R2-B (#97) · Status: decided
- Decision: `fmtRate` and `fmtMoney` pad a GEMC amount or rate to 5 dp (`₹719.20000`); the PO list Value column, which holds GEMC and other POs, shows every row at 2 dp. Replaces D-0606's "GEMC keeps up to five".
- Alternatives: 2 to 5 dp trimmed (a column's amounts did not line up); GEMC rows at 5 dp in the PO list (cut, and still misaligned).
- Why: N-INV-DETAIL: inconsistent money dp; legacy shows GEMC at 5 dp.
- Reversible: yes.
