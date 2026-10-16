# SPEC-04 — Schemas, route table and formatters

Layer: L1–L2. Architecture refs: §4 (`packages/schemas`), §9, §11.2 (shared formatters), §12.1, A-2, A-16.

## 1. Summary

`packages/schemas` holds the Zod entities and API shapes, the single route table that the API mounts and the web
client calls, the OpenAPI file generated from it, and the display formatters shared by screens and exports so the
two never disagree (§11.2). It depends only on `packages/domain`. It contains no business rule: it validates and
formats values that the domain computes (C2).

## 2. Scope

Core:

- Zod codecs for `Qty`, `Money`, `IsoDate`, ULID ids; enums (item/PO status, flag type, flag status, job type and
  status, invoice kind).
- Entity and API shapes for every §9 resource; list query (`page`, `pageSize`, `sort`, `dir`, typed filters) and
  paged result (`items`, `total`); error body `{ code, message, details? }`.
- The route table (`method`, `path`, `auth: 'public' | 'session'`, request schemas, response schema) and a typed
  client over it.
- OpenAPI generation with a CI freshness step.
- Formatters (quantities, money 2/5 dp, dates, FY) with legacy-identical output.

Out of scope:

- Route handlers (SPEC-07, -08, -10, -11, -13, -19); report column definitions (SPEC-13).
- Dropped endpoints (INV-87): procurement/analytics, dashboard insights and forecast, HTTP reconcile-all,
  audit delete, health aliases, download-folder preferences.

## 3. Dependencies

- SPEC-02, SPEC-03 (branded types, enums such as `FlagType`).
- Decisions: A-2, A-16, A-24.

## 4. Design

### 4.1 Modules (`packages/schemas/src/`)

| File            | Content                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `primitives.ts` | `zQty`, `zMoney` (decimal strings on the wire ↔ branded integers), `zIsoDate`, `zId` (ULID), `zPoId` (`^\d{1,10}$`, C17) |
| `enums.ts`      | status, flag, job, invoice-kind enums (flag enum = `FlagType`, INV-58)                                                   |
| `entities/*.ts` | supplier, settings, buyer, po, poItem, lot, dc, dcItem, invoice, invoiceItem, srv, srvItem, flag, audit, job, jobEvent   |
| `api/*.ts`      | request/response shapes per resource; `zListQuery`, `zPaged(item)`, `zErrorBody`                                         |
| `routes.ts`     | the route table (`as const`), one entry per endpoint                                                                     |
| `client.ts`     | `createClient(fetchImpl)` typed by the route table (no code generation)                                                  |
| `formatters.ts` | `fmtQty`, `fmtMoney(m, { gemc })`, `fmtRate`, `fmtDate`, `fmtFy`                                                         |
| `openapi.ts`    | `buildOpenApi(routes)`                                                                                                   |

Generated, committed: `packages/schemas/generated/openapi.json` (by `tools/gen/openapi.ts`).

### 4.2 Wire format

Quantities and money cross the wire as decimal strings (`"2.5"`, `"719.27966"`) so no float ever touches them
(C3); dates as `YYYY-MM-DD`; instants as ISO-8601 UTC. Implementation detail, not architecture.

### 4.3 Route table

Resources per §9: auth, onboarding, supplier, settings (incl. BHEL password status/set/clear, never returning the
value; INV-81), buyers, po (list, detail, stats, upload, manual create/edit, delete, manual dispatched qty), srv
(list, by-PO list, detail, stats, upload, delete), dc (list, detail, stats, dispatchable items, create, header
edit, delete, Excel, GC), invoice (list, detail, stats, previews from DC and from PO, create, header edit, delete,
Excel), reports and exports (SPEC-13), delivery tracker (list, stats, export), flags (list, stats, acknowledge),
audit (list, read-only; INV-83), jobs (start, list, detail with events, cancel; staging upload for folder import),
bhel session (start, captcha, otp; SPEC-19), search, dashboard (summary, activity), health. Paths are new
(`/api/<resource>…`); only the UI routes are frozen (A-2). Implementation detail.

### 4.4 Formatters

Behaviour matches the legacy frontend's visible formatting (A-2), rebuilt from scratch (C16): Indian digit
grouping, currency sign, rate and value precision (5 dp for GEMC, 2 dp otherwise; A-12), legacy date display
format. On screen, amounts and rates always show at least two decimals (`₹500.00`, GEMC `₹719.20`), so a column's
amounts line up; legacy dropped trailing zeros (owner-approved E2E fix UI-MISC, 2026-10-15). A GEMC amount shows all five decimals, and a list column that holds GEMC and other amounts shows 2 dp for every row (D-0626). Quantities show exactly, to 3 dp without trailing zeros (`12.345`, `1,234`), not rounded to whole units as legacy did (E2E round 2, D-0625; EC-21). Inputs are branded integers; outputs strings. The same functions feed the screens and the exports.

## 5. Invariants

INV-58 (enum), INV-87 (route table has no dropped endpoint), INV-101 (new: route table is the single source;
OpenAPI fresh), INV-09 (report shapes carry Accepted = `rcd_qty`).

## 6. Testing strategy

- Codec round-trips with literal values (`"848.75" ↔ 84875000`; invalid strings rejected).
- Route-table test: unique `method + path`; every `session` route listed; a literal list of dropped legacy
  endpoints is absent (INV-87).
- Formatter tests: literal tables of input → legacy display string, collected from the legacy UI's visible output
  (for example negative values, zero, 5-dp GEMC values, empty dates).
- OpenAPI freshness: `regenerate && git diff --exit-code` in `check`.

## 7. Acceptance criteria

- [ ] Every §9 resource has its route-table entries with request and response schemas.
- [ ] No float type appears in any quantity or money schema.
- [ ] `generated/openapi.json` is fresh in CI.
- [ ] Formatter outputs equal the legacy display strings in the literal tables.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                            | Scope / files                                                                               | Checks  | Done when                                                                                         |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| 1   | Primitives and enums             | `src/{primitives,enums}.ts`, tests                                                          | `check` | Codec round-trips pass; `FlagType` enum has six members.                                          |
| 2   | Entities and API shapes          | `src/entities/*.ts`, `src/api/*.ts` (list query, paged, error body), tests                  | `check` | Shapes cover every §8.2 entity used by the API; error body shape fixed.                           |
| 3   | Route table and typed client     | `src/routes.ts`, `src/client.ts`, `routes.test.ts`                                          | `check` | All §9 resources present; dropped endpoints absent (INV-87); client calls are typed by the table. |
| 4   | OpenAPI generation and freshness | `src/openapi.ts`, `tools/gen/openapi.ts`, `generated/openapi.json`, `ci.yml` freshness step | `check` | A stale file fails CI; regenerating is deterministic.                                             |
| 5   | Shared formatters                | `src/formatters.ts`, `formatters.test.ts`                                                   | `check` | Literal tables of legacy display strings pass for qty, money (2/5 dp), rate, date, FY.            |

## 9. Open issues

- Decimal strings on the wire and new API paths are implementation details (the frozen thing is the UI and file
  formats, A-2).
- The legacy date display format and money grouping are read from the legacy UI's visible output during PR 5; if
  the legacy UI shows two formats for the same kind of value on different screens, each screen keeps its own and
  the difference is recorded in DECISIONS (consistency fixes need an ADR under C7).
