# SenstoSales — Architecture

Status: design, rev 1.3, 2026-10-14.

**Role of this document.** This is the single design reference. Related documents:

- `INVARIANTS.md`: every business rule below as a testable `INV-NN` row; never extends this document.
- `EDGE_CASES.md`: edge cases deliberately deferred past v1, each with its v1 behaviour (C18).
- `OPEN_QUESTIONS.md`: owner questions still open. Empty for v1: every v1 question is decided in Appendix A.
- `specs/`: implementation specs derived from this document.
- `DECISIONS.md`: decisions agents make during implementation.
- `plans/ACTIVE.md`: current implementation state.
- `DESIGN.md`: the design system (tokens, `role-*` classes); its flows and elements are frozen (D-0016).
- `../CLAUDE.md`, `ENGINEERING.md`, `../.claude/skills/`: rules and procedures for coding agents.

If a spec or an implementation decision changes anything decided here, this file is updated in the same change,
with owner approval and a revision-log row.

**Source of business rules.** The legacy business specification (cited as "spec §n") is the source of truth for
business rules. Its rules are ported, in its wording where possible, unless an owner decision (cited `A-n`,
Appendix A) changes them. Appendix B traces every spec section to the rules here. Where neither the spec nor an
owner decision covers a case, the legacy application's observable behaviour applies (the UI/UX and formats are
frozen, A-2); such closures are listed in Appendix A, table A2. Nothing else is invented.

**Core and candidates.** This document designs only **core** (v1). Every other mechanism is a **candidate** (§17),
listed with the failure it would address and the evidence that would admit it, and gets no design until then.

---

## 1. Goals and non-goals

SenstoSales is a supplier-side ERP for suppliers of BHEL (the buyer). The supplier receives purchase orders (PO)
from BHEL units, dispatches goods on delivery challans (DC), bills them on GST invoices, and receives stores
receipt vouchers (SRV) from BHEL confirming what was received, accepted and rejected.

Core flow (spec §1): **PO -> DC -> Invoice -> SRV**, with PO-direct invoices as a second path (PO -> Invoice).

### Goals

1. A full TypeScript greenfield rebuild (A-1) that ports the spec's business rules: every rule implemented once, in
   a framework-free domain package, with literal-value tests.
2. The UI/UX flows, the set of on-screen elements and the CSV/Excel export formats are **frozen** (A-2). Minor
   visual changes are allowed where they reduce maintenance, improve performance or increase consistency (D-0016).
3. A local Windows desktop install first (A-4), behind ports, so the same API and UI can later be self-hosted on
   Cloudflare (Workers, D1, R2, Browser Rendering) by swapping adapters (A-3).
4. PO and SRV **documents** (BHEL HTML) are the source of truth (A-6). Import means re-ingesting HTML.
5. Document creation is never blocked by quantities (A-7). Mismatches are flagged and highlighted; the user decides.
6. A supplier starts by entering its profile at first run; no supplier identity lives in code or seed data (A-6).
7. Development runs autonomously from specs (A-20).

### Non-goals (v1)

- UI redesign, new screens beyond first-run onboarding, new report columns, new export formats.
- Buyers other than BHEL units (A-5).
- The Cloudflare deployment itself (§17). MCP, Telegram, finance (A-21). Code signing (A-25).
- Dropped features (A-16): the procurement intel page and its analytics endpoints, multi-PO invoices (the
  daily-dispatch report is back, rev 1.12). Also not carried: dashboard insights/forecast endpoints, empty master tables (materials, HSN,
  consignee), dead numbering sequences, the lot-level manual override (replaced, A-15).
- Reading the legacy database (A-6).

---

## 2. Contract

Hard rules. `CLAUDE.md` §2 copies them; a PR that breaks one is not merged.

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Why                                                           | Enforced by                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| C1  | No real data in the repo: no supplier name, GSTIN, address, person's name, real PO/SRV/DC/invoice number, identifying record counts, business plans, DB files, real HTML pages or local data paths. Fixtures are anonymised or synthetic (§14.3). Private inputs are read only from env-var paths (`SENSTO_CORPUS_DIR`).                                                                                                                                                                            | Public repo (A-19).                                           | `real-data-scan` CI job and hook; review.                           |
| C2  | Business rules come from the spec or Appendix A, never from invention. Each is implemented once in `packages/domain`, cites its `INV-NN`, and has a table-driven test with literal expected values. Nothing else computes quantities, status, FY, GEMC rates, tax or flags.                                                                                                                                                                                                                         | One implementation per rule; the spec is the source of truth. | Review; Oxlint import boundaries; `INVARIANTS.md` (INV-01..INV-65). |
| C3  | Quantities are integer milli-units and money integer 1e-5 units end to end; dates are `YYYY-MM-DD` strings (IST calendar dates). No floats or `Date` objects in domain code, columns or arithmetic.                                                                                                                                                                                                                                                                                                 | Exact sums and tolerance; no time-zone drift.                 | Branded types; Oxlint bans in `packages/domain`.                    |
| C4  | Every write use case builds one `WriteBatch` and commits it once. Ids (ULID) are generated in the service. No triggers, views, interactive transactions or SQL that D1 cannot run.                                                                                                                                                                                                                                                                                                                  | A-3; one writer per derived value.                            | `Db` port has no `transaction()`; D1 dialect CI step (INV-84).      |
| C5  | PO and SRV data enter only through `packages/parsers` from BHEL HTML. The legacy DB is never an input. Derived columns are written only by service batches.                                                                                                                                                                                                                                                                                                                                         | A-6.                                                          | Boundaries; review (INV-49).                                        |
| C6  | No hard caps on DC or invoice creation. The only creation-time rejections are malformed input (qty <= 0, unknown ids, `(number, FY)` collision) and the DC-sourced invoice rule (qty = DC qty, rate = PO rate).                                                                                                                                                                                                                                                                                     | A-7, A-8.                                                     | API tests.                                                          |
| C7  | User flows and the set of on-screen elements are frozen: no flow changes and no added or removed elements, routes, labels or columns. Minor visual changes are allowed when they reduce maintenance, improve performance or increase consistency. CSV/Excel layouts are frozen cell for cell. `globals.css` tokens change only through an ADR; standard roles use `role-*` classes; no `!important`, no ad-hoc `dark:` colour fixes, no local formatters; shared UI comes from the single registry. | A-2; D-0016.                                                  | Ported design validators; export golden tests; review.              |
| C8  | No interaction moves or resizes anything around it: fixed table layout with explicit widths, reserved page height with padded rows, a pager that never moves, and loading/empty/error states in the same footprint.                                                                                                                                                                                                                                                                                 | A-23.                                                         | DataTable e2e bounding-box test.                                    |
| C9  | Startup is read-only for DB schema and content. The only sanctioned mutation is the version-gated upgrade step, always after a backup. No runtime endpoint resets the database, deletes or prunes the audit log.                                                                                                                                                                                                                                                                                    | A-4, A-26.                                                    | Startup test asserts no writes; route-table review.                 |
| C10 | The API binds to `127.0.0.1` and rejects any non-loopback `Host`. Never weakened or made configurable for the local build.                                                                                                                                                                                                                                                                                                                                                                          | A-17.                                                         | API test (non-loopback Host -> 400).                                |
| C11 | No user-facing security friction: no forced password change, login backoff, complexity rules or CLI-only recovery. Plain language and fewest steps in every flow.                                                                                                                                                                                                                                                                                                                                   | A-17.                                                         | Review (INV-80).                                                    |
| C12 | Core packages depend on ports only. `node:*`, Playwright, Tauri and filesystem modules are imported only in `platform/*` adapters and `apps/desktop`.                                                                                                                                                                                                                                                                                                                                               | A-3.                                                          | Oxlint `no-restricted-imports` (INV-85).                            |
| C13 | Dependencies under AGPL, GPL, SSPL, Commons Clause or non-commercial licences are refused; LGPL is avoided. SPDX expressions matched by whole identifier.                                                                                                                                                                                                                                                                                                                                           | A-19.                                                         | `licenses` CI job with CycloneDX SBOM (INV-77).                     |
| C14 | Nothing in the Candidates register (§17) or `EDGE_CASES.md` is built without owner approval recorded in Appendix A.                                                                                                                                                                                                                                                                                                                                                                                 | A-21, A-27.                                                   | Review (INV-88).                                                    |
| C15 | Hard guardrails: no source file over 800 lines (Oxlint `max-lines`) and no function over complexity 15 (Oxlint `complexity`); generated files and lockfiles excluded; the fix is a split, never a suppression. A bug or review finding that recurs becomes a check or a regression test in the PR that fixes it. No coverage gates.                                                                                                                                                                 | Readability; lessons encoded in structure (owner).            | Oxlint (`vp lint`) in `check`; RECURRING.md; review.                |
| C16 | Legacy code may be read for business rules and visible output (UI/UX, export formats), never copied verbatim and never as a model for implementation: match the output, build it the simplest efficient way.                                                                                                                                                                                                                                                                                        | A-22.                                                         | Review (INV-91).                                                    |
| C17 | BHEL page content is data, never executed. The portal origin is a constant; PO ids are validated `^\d{1,10}$`; file locations come from the Storage port, never from a request.                                                                                                                                                                                                                                                                                                                     | Untrusted input.                                              | Scraper unit tests; review.                                         |
| C18 | When an agent finds, while coding, an edge case the spec does not cover, it records the case as a new `EC-NN` row in `EDGE_CASES.md` (case, example, why deferred, found in) and implements the spec's behaviour (or, where the spec is silent, the frozen legacy behaviour). It never invents handling for the case.                                                                                                                                                                               | A-27.                                                         | Review; PR template checkbox (INV-92).                              |

---

## 3. System context

```
                 +---------------------- user's Windows PC ----------------------+
  user  ------>  |  Tauri 2 shell (WebView2 window, tray, dialogs, updater)       |
                 |        |  HTTP 127.0.0.1:<random port>  (never Tauri IPC)      |
                 |        v                                                       |
                 |  Node 26 SEA sidecar: Hono API + static SPA                    |
                 |        |            |                 |                        |
                 |   node:sqlite    local FS         playwright-core              |
                 |   (%LOCALAPPDATA%\SenstoSales)    -> system Edge (headless)    |
                 +--------------------------------------------|-------------------+
                                                              | HTTPS (captcha, OTP)
                                                              v
                                                   BHEL supplier portal
```

- **Users**: one supplier per install, one login (`admin`), staff with limited technical skills (A-17).
- **External systems**: the BHEL supplier portal (supplier code, password, captcha, e-mailed OTP; PO and SRV pages)
  and the updater manifest. Nothing else; no CDN fonts or scripts. Everything except sync and updates works offline.
- **Trust boundaries**: WebView/browser -> API (loopback, Host check, session cookie); API -> BHEL portal (untrusted
  HTML, C17); user-supplied files (size caps, parser validation).

---

## 4. Components

pnpm workspace, TypeScript strict, ESM, `tsc -b` project references.

| Module    | Path                 | Responsibility                                                                                                                                                                                                          | Depends on         |
| --------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| domain    | `packages/domain`    | Pure rules (§6): units, FY, quantities, date winner, status, GEMC, tax, flag detection, delete guards. No I/O, no runtime deps.                                                                                         | —                  |
| schemas   | `packages/schemas`   | Zod entities, API shapes, the route table, formatters shared by screen and exports.                                                                                                                                     | domain             |
| db        | `packages/db`        | Drizzle schema, SQL migrations, migrator, `Db` port executors (node:sqlite now, D1 later), seed (BHEL units, GST defaults).                                                                                             | domain, schemas    |
| parsers   | `packages/parsers`   | BHEL PO/SRV HTML -> typed `PoDocument`/`SrvDocument` or a typed `ParseError`. Pure; anonymised fixtures.                                                                                                                | domain, schemas    |
| documents | `packages/documents` | DC, invoice and GC Excel from de-branded templates; streaming report writers (xlsx, CSV) with the frozen layouts.                                                                                                       | domain, schemas    |
| scraper   | `packages/scraper`   | `Scraper` port, the Playwright adapter (system Edge), the BHEL login/listing/fetch flow, an in-memory fake.                                                                                                             | schemas            |
| api       | `apps/api`           | `createApp(deps)` Hono app: routes -> services -> repositories; `platform/node` entry (now), `platform/workers` (candidate). Serves the SPA.                                                                            | packages via ports |
| web       | `apps/web`           | Vite + React SPA, TanStack Router/Query, the carried-over design tokens, shadcn/ui primitives, one shared-component registry, `Platform` adapter.                                                                       | schemas            |
| desktop   | `apps/desktop`       | Tauri 2 shell, sidecar packaging, NSIS installer, updater config.                                                                                                                                                       | built api and web  |
| tools     | `tools/`             | `checks/` (licence scan, real-data scan, design validators, token parity, fixture anonymiser), `corpus/` (local-only corpus test), `release/` (SEA build, version stamping), `orchestrator/` (agent and merge scripts). | as needed          |

Layering in `apps/api` (Oxlint import boundaries): `routes/*` validate with Zod, call one service, map errors, no SQL;
`services/*` load -> call domain -> build one `WriteBatch` (writes, derived columns, flag changes, audit row) ->
commit, never import Hono; `repositories/*` return plain rows and compute no business values. One `AppError`
hierarchy (400, 401, 403, 404, 409) mapped by one `onError`; bodies `{ code, message, details? }`. Services are
callable without HTTP (`createServices(deps)`): the seam for later MCP/Telegram adapters.

### 4.1 Ports

| Port             | Contract (summary)                                                                                                                                                             | Adapter now                                                                       | Adapter later (candidate)                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Db`             | `query(sql)`; `batch(statements)` all-or-nothing in one call; no `transaction()`                                                                                               | node:sqlite via `drizzle-orm/sqlite-proxy`; batch = `BEGIN IMMEDIATE … COMMIT`    | D1 (`db.batch`)                                                 |
| `Storage`        | `put/get/delete/list` by key (`html/po/<po>.html`, `html/srv/<po>.html`, `exports/<ulid>.<ext>`, `backups/<ts>.db`)                                                            | local FS under the data dir; keys cannot escape it                                | R2                                                              |
| `Scraper`        | `openSession()` -> `prepareLogin()` (captcha PNG), `submitCaptcha(code, password, captcha)`, `submitOtp(otp)`, `listPoIds()`, `fetchPoHtml(id)`, `fetchSrvHtml(id)`, `close()` | playwright-core + system Edge; detail pages over the authenticated cookie session | Browser Rendering (CDP) + Durable Object                        |
| `Jobs`           | enqueue, claim, progress, cancel flag, single active job                                                                                                                       | in-process worker over the `job` table                                            | Durable Object                                                  |
| `Secrets`        | `get/set` for the BHEL portal password                                                                                                                                         | local DB row (A-17)                                                               | Workers secret                                                  |
| `Clock`          | `today()` IST `YYYY-MM-DD`; `now()` ISO instant                                                                                                                                | system clock                                                                      | Workers clock                                                   |
| `Logger`         | structured levels                                                                                                                                                              | pino, rotating files                                                              | Workers logs                                                    |
| `Platform` (web) | pickers, Save-as, notifications, tray status                                                                                                                                   | `platform/tauri.ts`                                                               | `platform/web.ts` (browser download, `<input webkitdirectory>`) |

---

## 5. Domain model

### 5.1 Glossary

| Term                  | Meaning                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supplier              | The business using the install; profile (name, GSTIN, address, state, BHEL supplier code, bank and invoice defaults) entered at onboarding.                    |
| BHEL unit             | A buyer unit (name, state code). The only buyer type (A-5).                                                                                                    |
| PO                    | Purchase order from a BHEL unit, parsed from HTML; keyed by PO number.                                                                                         |
| PO item               | One PO line: material code, `ord_qty`, rate, unit. **Cancelled** when an amendment removes it (A-13).                                                          |
| Lot                   | A delivery schedule row of a PO item (`dely_qty`, date, entry-allow date or note). Planning only (spec §3).                                                    |
| DC                    | Delivery challan created by the supplier: dispatch quantities per PO item. Numbered `(number, FY)`.                                                            |
| GC                    | Guarantee certificate of a DC (`gc_number`, `gc_date`; spec §9).                                                                                               |
| Invoice               | GST invoice against one PO: **DC-sourced** (1:1 with a DC) or **PO-direct** (no DC).                                                                           |
| SRV                   | Stores receipt voucher from BHEL: received, accepted, rejected per PO item, with raw challan and invoice numbers. One SRV HTML file holds every SRV of one PO. |
| GEMC                  | A PO whose remarks carry a GEMC number; its source rates are GST-inclusive (spec §4).                                                                          |
| FY                    | Indian financial year, April to March.                                                                                                                         |
| Date winner           | Whether the PO document or its SRVs own `rcd_qty`/`rej_qty` (spec §3).                                                                                         |
| Flag                  | A reconciliation issue: a detected mismatch, highlighted on screen and listed on the deviations screen (spec §8 "deviation").                                  |
| Manual dispatched qty | An item-level quantity the user enters for material sent outside the system (A-15).                                                                            |
| Job                   | A background task (scrape, folder import, recompute, backup).                                                                                                  |

### 5.2 Relationships (spec §1)

- PO -> DC 1:many; DC -> DC-sourced invoice 1:1 (strict); PO -> invoice 1:many; one invoice belongs to exactly one
  PO (A-16); SRV -> PO many:1.
- DC items and invoice items reference PO items (`po_item_id`). SRV items reference PO items when matched (§6.10).
- SRV raw document numbers are stored as text; the resolved DC/invoice link is a separate nullable column.

### 5.3 State

- **PO item / PO status**: Pending, Delivered, Closed (spec §6), plus Cancelled for amended-out items (A-13).
- **DC, invoice**: no lifecycle state; they exist or are deleted (A-14).
- **Flag**: `open -> acknowledged` (spec §8).
- **Job**: `queued -> running -> done | failed | cancelled`.

---

## 6. Domain rules

All rules live in `packages/domain` (C2). Each cites its spec section or owner decision and its `INV-NN`.

### 6.1 Units and tolerance

- `Qty` = integer milli-units (`2.5` -> `2500`); `Money` = integer 1e-5 units (`848.75` -> `84875000`); conversion by
  exact string scaling. (INV-01)
- **Tolerance 0.001** for quantity comparisons (spec §6): `gte(a, b) := a >= b - 0.001`, `gtTol(a, b) := a > b +
  0.001` are the only tolerance helpers. (INV-02)

### 6.2 Quantities (per PO item; spec §3)

```
delivered_qty (dsp_qty) = sum(DC dispatch_qty by po_item_id)
                        + sum(PO-direct invoice qty for the PO item)
                        + manual_dispatched_qty                         // A-15, default 0
balance_qty             = max(0, ord_qty - max(rcd_qty, dsp_qty))       // spec §3; A-11
uninvoiced_qty          = ord_qty - sum(all invoice qty applied to the PO item)   // DC-sourced + PO-direct
rcd_qty, rej_qty        = date-winner rule (6.3)
```

- DC-sourced invoices are excluded from the second term of `dsp_qty` to avoid double counting: their movement is
  already in DC dispatch (spec §3). `DC 4 + its invoice 4 + a PO-direct invoice 3 -> dsp 7`. (INV-03)
- `balance`: `(ord 10, dsp 4, rcd 6) -> 4`; `(10, 12, 0) -> 0`. Rejected qty never reopens the balance (A-11). (INV-04)
- `uninvoiced` is displayed, never enforced (A-7), and may be negative. (INV-05)
- Dispatched and received are tracked at item level only; nothing is distributed to lots (spec §3). (INV-06)
- Cancelled PO items are excluded from balance and PO header totals (A-13). (INV-07)
- Accepted on an SRV line, and in SRV totals, is the SRV's own ACCEPTED QTY as printed (A2-8, revised 2026-10-15). A PO
  item's Accepted column still shows its received quantity `rcd_qty`: a PO page carries no accepted value (EC row,
  owner question). (INV-09)

### 6.3 Received and rejected: the date-winner rule (spec §3)

```
MAX(srv_date) IS NULL      -> PO wins           (no SRVs)
MAX(srv_date) >= po_date   -> SRV wins          (tie: SRV wins)
otherwise                  -> PO wins
SRV wins: rcd_qty = sum(COALESCE(NULLIF(srv_items.rcd_qty, 0), srv_items.accepted_qty, 0))
          rej_qty = sum(srv_items.rej_qty)
PO wins:  rcd_qty = the PO document's rcd_qty
          rej_qty = the PO document's rejected qty if present, otherwise 0
```

- Examples: `po 2025-01-10, no SRV -> PO`; `srv 2025-01-10 -> SRV`; `srv 2025-01-09 -> PO`. (INV-10)
- When SRVs win, sums are cumulative across all SRV records of the item, not filtered by individual SRV dates:
  `SRV1 (rcd 0, accepted 5) + SRV2 (rcd 3) -> rcd 8`. (INV-11, INV-12)
- The PO document's own values are stored separately (`po_rcd_qty`, `po_rej_qty`), so a PO win, including after the
  last SRV is deleted, always has them (legacy bug fix). (INV-13)
- Recomputed in the same batch on every PO accept and SRV insert, update or delete, and whenever the winner flips
  (spec §3, §4). (INV-14) Upload date is never used (spec §3). (INV-15)

### 6.4 GEMC (spec §4, A-12)

- A PO is GEMC when a GEMC number is found in its REMARKS (`/\bGEMC\s*[-:/]?\s*([A-Z0-9][A-Z0-9-]*)/i`), as the legacy
  parser does (A2-3). (INV-19)
- GEMC item rates are GST-inclusive input; stored `po_rate = round5(rate / 1.18)`: `848.75 -> 719.27966`,
  `118 -> 100`. (INV-16)
- Re-saving an unchanged GEMC rate must not divide it again (spec §4): the GST-inclusive source rate is stored and the
  net is always derived from it (legacy bug fix). (INV-17)
- A manual PO edit of a GEMC item takes the GST-inclusive rate (spec §4, A-26). (INV-20)
- GEMC invoice amounts are kept at 5 dp (A-12). (INV-18)

### 6.5 Tax (spec §5)

- Invoice tax uses the GST rates from settings, copied onto the invoice at creation. As in legacy (A2-4): per line
  `taxable = round(qty * rate)`, `cgst = round(taxable * cgst% / 100)`, `sgst = round(taxable * sgst% / 100)`, IGST 0;
  rounding to 5 dp for GEMC POs and 2 dp otherwise; header totals are sums of the lines. (INV-41)

### 6.6 Financial year and numbering (spec §2, §8, §9; A-10)

- FY is April-March: `2025-03-31 -> 2024-25`, `2025-04-01 -> 2025-26`. (INV-21)
- DC and invoice numbers are typed by the user (no suggestion, as legacy: A2-6), unique per `(number, FY)`, and
  restart every FY: DC 100 may exist in FY 24-25 and FY 25-26. (INV-22, INV-27)
- DC and invoice are independent: DC 344 and invoice 344 may coexist in one FY (spec §8). (INV-23)
- Every lookup and link by document number is FY-qualified (A-10). (INV-24)
- FY derives from the document date and is recomputed when the date is edited; a resulting `(number, FY)` collision
  is a 409, and SRV links are re-resolved (A-10, A-14; legacy bug fix). (INV-25)
- GC (spec §9): if blank, `gc_number` defaults to `dc_number` and `gc_date` to `dc_date`; GC numbers are unique within
  the DC's FY, as legacy (A2-5). (INV-26)

### 6.7 Documents: creation, editing, deletion

- DC -> DC-sourced invoice is strictly 1:1 (spec §1, §5). (INV-28)
- DC-sourced invoice: each line's qty equals the DC qty and its rate the PO item rate; otherwise 400 (A-8). (INV-29)
- An invoice belongs to exactly one PO (A-16). (INV-30)
- PO-direct invoice: at least one selected line, each `qty > 0` (spec §5); the spec's cap `qty <= uninvoiced + 0.001`
  is removed (A-7). (INV-31)
- DC: dispatch quantities per PO item, any `qty > 0`; the spec's guardrail `dispatch_qty <= pending_qty` is removed
  (A-7). (INV-32)
- Invoice qty and rate, and DC quantities, are immutable after save; DC and invoice header fields are editable; to
  change qty or rate, delete and recreate (legacy invariant; A-14). (INV-33)
- No cancel state for DCs or invoices; delete only (A-14). (INV-34)
- Delete is disabled while backward links exist (A-14): 409 from the API, a disabled button with a plain reason in
  the UI. (INV-35)

| Document | Delete blocked while                              |
| -------- | ------------------------------------------------- |
| DC       | it has an invoice, or an SRV item is linked to it |
| Invoice  | an SRV item is linked to it                       |
| PO       | any DC or invoice exists on it                    |
| SRV      | never (the date winner recomputes)                |

- DC Excel footer carries the read-only line `Guarantee Certificate No. {gc_number} Dt. {gc_date}`; GC has its own
  download (spec §9). (INV-36)

### 6.8 Manual dispatched quantity (A-15)

- One item-level `manual_dispatched_qty` (default 0, `>= 0`) with an optional note. Never `ord_qty`; no invoiced or
  received adjustment. It replaces the spec's lot-level `manual_override_qty`, which is not carried over.
- It is added into `dsp_qty` (§6.2), and so into balance and status. Every change writes an audit row. (INV-08)
- It is edited inline in the PO detail item row, where the legacy override was edited. No new screen.
- When a real DC is later created on that item, the item is highlighted (`MANUAL_ADJUSTMENT_OVERLAP`, §6.9).

### 6.9 Flags (reconciliation issues; spec §8, A-7, A-24)

Principle (spec §8): **accept data, flag deviation, don't reject.** (INV-51) Owner extension (A-7): supplier
documents are never blocked either; conditions are flagged and the user decides.

The v1 flag set is exactly these nine (A-24, revised 2026-10-15). (INV-58)

| Type                        | Source        | Scope                  | Detected when                                                                                                                                                           | INV    |
| --------------------------- | ------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `QTY_MISMATCH`              | spec §8       | srv_item               | SRV `ord_qty` differs from the PO item's `ord_qty` (beyond 0.001)                                                                                                       | INV-52 |
| `DOC_NUMBER_CONFLICT`       | spec §8, A-10 | srv_item               | the challan / invoice number the SRV cites resolved, in the FY of the SRV date, to a DC / invoice of another PO; a number with no document in the app is not a conflict | INV-53 |
| `OVER_DISPATCH`             | A-7           | po_item                | `dsp_qty > ord_qty + 0.001` (`10.002` vs `10` flags; `10.001` does not)                                                                                                 | INV-54 |
| `OVER_INVOICE`              | A-7           | po_item                | `sum(all invoice qty) > ord_qty + 0.001`                                                                                                                                | INV-55 |
| `DOC_ON_CANCELLED_ITEM`     | A-13          | dc_item / invoice_item | a DC or invoice line exists on a cancelled PO item                                                                                                                      | INV-56 |
| `MANUAL_ADJUSTMENT_OVERLAP` | A-15          | po_item                | `manual_dispatched_qty > 0` and a DC line on the item was created after the adjustment was last set                                                                     | INV-57 |
| `SRV_PO_ITEM_ZERO`          | A-24          | srv_item               | the SRV row's PO ITM is 0, as BHEL printed it                                                                                                                           | INV-58 |
| `SRV_DUPLICATE_ITEM`        | A-24          | srv_item               | another row of the same SRV has the same (PO ITM, SRV ITM)                                                                                                              | INV-58 |
| `SRV_UNKNOWN_PO_ITEM`       | A-24          | srv_item               | the SRV row's PO ITM (not 0) is on no item of its PO                                                                                                                    | INV-58 |

- The spec's `FY_COLLISION` is "prevented at link time" (§6.10), so it is never stored.
- `STALE_DOCUMENT_SKIPPED` is not a flag: the spec records no deviation for skipped older uploads (A-24, §7.2).
- Flags remain until manually resolved; resolution does not change stored data, it marks the flag acknowledged
  (spec §8). A flag whose condition later disappears still waits for the user (EDGE_CASES). (INV-59)
- Detection runs in every batch that touches a PO and is idempotent: a fingerprint (type, scope, quantities and
  document ids) prevents duplicates. The spec's `deviations` table becomes `reconciliation_issue` (storage only).
- Display: on screen only (badge in a reserved-width column, highlighted rows, the deviations screen, the dashboard
  count). Exports never gain a flag column (A-2). (INV-60) Reports show data as it stands, clamping nothing except
  `balance >= 0` (A-7). (INV-61)

### 6.10 SRV references and matching (spec §3, §7, §8)

- DC and invoice numbers on SRVs are stored as text and never create DC or invoice records (spec §7). The raw number
  is kept even when it is not linked (storage only: the spec's `challan_no = NULL` becomes `resolved_dc_id = NULL`).
  (INV-38)
- FY-aware linking (spec §8): `challan_no` links to a DC only if a DC with that number exists in the same FY as the
  SRV date; otherwise it is not linked. Same for `invoice_no`. This includes a March DC received on an April SRV
  (A-26; EDGE_CASES). Links are re-resolved when DCs/invoices are created, deleted, renumbered or re-dated. (INV-37)
- SRV items are matched to the PO item with the same PO item number, as legacy (A2-7, revised 2026-10-15): real SRV
  pages carry no material code, and lots are reference only. A row on no item is stored unmatched and flagged. (INV-39)
- An SRV whose PO is not in the system is stored and listed with "PO not found", as legacy (A2-9); it counts in no
  received total, the dashboard's included. (INV-40)

### 6.11 Status (spec §6, A-9, A-13)

| Status    | Condition (per active item, tolerance 0.001)   |
| --------- | ---------------------------------------------- |
| Pending   | `dsp_qty < ord_qty` (zero or partial dispatch) |
| Delivered | `dsp_qty >= ord_qty`                           |
| Closed    | `rcd_qty >= ord_qty`                           |
| Cancelled | the item was amended out (A-13)                |

- Closed takes precedence over Delivered. `(ord 10, dsp 0, rcd 0) -> Pending`; `(10, 9.999, 0) -> Delivered`;
  `(10, 10, 10) -> Closed`. (INV-62, INV-63)
- PO status, one implementation derived from item states, never from summed quantities (A-9): Closed when every
  active item is Closed; Delivered when every active item is Delivered or Closed; otherwise Pending. (INV-64)
- The UI leads with quantity columns (Pending, Dispatched, Received, Accepted, Rejected); status is a badge and a
  filter (A-9). (INV-65)

---

## 7. Ingestion and the job model

### 7.1 Parsers (`packages/parsers`)

- Input: an HTML string decoded as UTF-8 with replacement. Output: a Zod-validated `PoDocument`/`SrvDocument` or a
  typed `ParseError`. Pure; parsed documents carry no derived values. PO input is HTML only (A2-2). (INV-49)
- **Verbatim (owner, 2026-10-15)**: PO and SRV pages are BHEL's documents and the source of truth. Every cell is
  imported as printed; an odd row (PO ITM 0, LOT NO 0, a repeated key or lot) is stored and flagged, never fixed,
  merged or refused. Each stored row keeps its raw cells by header text. (INV-111)
- **PO**: header fields located by label text (PO number and date, enquiry, supplier code, order type, division,
  quotation, PO status code, amendment no, PO value, RC no, inspection, currency, net value, remarks); a label whose
  right-hand neighbour is also a label reads the cell below (REMARKS, TOTAL VALUE and SUPP NAME M/S share one label
  row); `INSPECTION BY :` with its colon; labels printed with their value in one cell (`TIN NO.`, `ECC NO.`,
  `MPCT NO.`, `PHONE:`, `FAX:`) go to the raw header. The item table by its header row, with MTRL CAT and ITEM VALUE;
  an item printed once per lot keeps its first row's values and gains each row's lot; every lot row is kept,
  repeated lot numbers too; description continuation rows keyed by item number; `&nbsp;` stripped; dates in
  `DD/MM/YYYY` and `DD-MON-YY`; a non-date "Entry Allow" cell (for example "PO Short Closed") is kept as the lot note
  and shown instead of a date (spec §4) (INV-46); GEMC number from the remarks cell only (§6.4, A2-3); a full stop
  that ends a sentence is not part of a drawing number.
- **SRV**: HTML comments skipped (pages embed an older commented-out table); the table whose header contains `SRV NO`;
  columns mapped by header text; every column is read (DIV, PO ITM, SUB ITM, PMIR NO, SRV ITM, REV NO, challan,
  TAX INV, FINANCE DT, CNOTE, UNIT, ORDER/CHALLAN/RECVD/ACCEPTED/REJ QTY); LOT NO and MATERIAL CODE are read when a
  page has them (current pages have neither; lots are reference only); an empty cell is null; rows grouped by
  `(po_number, srv_number)` and numbered in file order within their SRV, which is the stored row's identity, since
  the page's own key may repeat (A2-10); a row that cannot be read fails its SRV only; challan dates `DD/MM/YY` and
  `DD-MON-YY`. (INV-112)

### 7.2 Ingestion guards (spec §4)

- **PO upload** (key: PO number, as legacy, A2-1): UPSERT only when the incoming `po_date` is not older than the
  stored one; an older upload is skipped and no PO, header, item or delivery data changes. To load older data, the
  user deletes the existing PO first. (INV-42)
- **SRV upload** (key `(po_number, srv_number)`): the same rule on `srv_date`. (INV-43)
- A skipped upload records no deviation (spec §4); it appears only as a job event. (INV-44)
- After a PO is accepted, the date winner is re-evaluated; if SRV wins, the uploaded PO's received/rejected are
  ignored (spec §4). (INV-45)
- A PO re-ingest never writes DCs, invoices, `manual_dispatched_qty` or derived quantities directly (spec §3; legacy
  bug fix). (INV-47)
- Items absent from a re-ingested (amended) PO are marked cancelled; items that reappear are restored (A-13). (INV-48)

### 7.3 Jobs

- Table-backed; exactly one running job (partial unique index plus an in-process lock); a second start is a 409
  with a plain message. Types: `po.scrape`, `srv.scrape`, `po.import-folder`, `srv.import-folder`, `recompute-all`,
  `backup`.
- Progress (`total, done, skipped, failed, current`) is written per document; the UI polls every 2 s; the tray
  shows the current job. Cancel is honoured between documents.
- **One batch per document** (A-3): parse outside any batch; one `WriteBatch` per PO file or per SRV file. A failing
  file becomes a `job_event` with the reason, its previous data is kept, and the job continues. An SRV of the file
  that cannot be read is reported in the file's result and the file's other SRVs are stored; repeated item keys are
  stored as printed (A2-10). (INV-50)
- Raw HTML is stored through `Storage` before parsing and recorded in `source_document`, so a parser fix can
  re-parse without re-scraping.
- **PO batch**: guard -> upsert header/items/lots -> recompute items (§6.2, §6.3) -> flag detection -> audit row.
- **SRV file batch**: for each `(po, srv_number)` whose stored date is not newer: replace `srv`/`srv_item` rows ->
  resolve references (§6.10) -> recompute the PO's items -> flag detection -> audit row. All or nothing.
- `recompute-all` rebuilds derived columns and flags from stored rows; never run at startup.

### 7.4 Import (A-6)

- Import is ingestion: the user picks a folder of PO HTML, then a folder of SRV HTML; folder-import jobs run them
  through the same services, POs first. Guards apply as for live syncs. The job summary lists counts, skipped and
  failed files with reasons, and flags by type; it stays in the job row.
- Supplier profile and GST rates come from onboarding (§10.3). (INV-78)
- Developers run `pnpm test:corpus` locally against `SENSTO_CORPUS_DIR`; skipped when unset, never in CI. (INV-76)

### 7.5 BHEL scraper (A-5)

- `playwright-core` with `channel: 'msedge'`, headless; no bundled browser, no `--disable-web-security`, no flags
  beyond a fixed user agent. If Edge cannot be launched, a plain message says so (EDGE_CASES). (INV-86)
- Login wizard: open the portal, dismiss pop-ups, show the captcha, submit supplier code + stored password + captcha,
  detect the OTP step, take the OTP the user types, confirm by landing on the supplier PO page. Then reuse the cookies
  in a plain HTTP session to list PO ids and fetch PO/SRV pages.
- Sessions live in a map keyed by job id and close on job end, app exit or 15 minutes idle. Selectors live in one
  module with fixture tests.

---

## 8. Data model

SQLite now, D1 later; one set of SQL migrations runs on both. Every business table has `supplier_id`.

### 8.1 Conventions

- Surrogate ids: ULID text, generated in services. Business keys are unique indexes.
- Units in names: quantities `*_qty_m` (INTEGER milli-units), money `*_u5` (INTEGER 1e-5 units), dates `*_date`
  (TEXT `YYYY-MM-DD`), instants `*_at` (TEXT ISO-8601 UTC). Drizzle `customType`s map to branded types.
- Optimistic concurrency: `version` on `po`, `dc`, `invoice`; the `UPDATE` itself checks the version and, when it is stale, fails its batch so nothing is written -> 409 (D-0124).
- Derived columns are stored for list performance and written only by service batches (spec §12 triggers replaced).

### 8.2 Tables

| Table                  | Key columns and notes                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supplier`             | id, name, gstin, address, state, state_code, contact, email, bhel_supplier_code, bank_details_json, invoice_defaults_json. Created by onboarding. One per install (A2-12).                                                                                                                        |
| `settings`             | (supplier_id, key) -> value: GST percentages, preferences. Never holds auth state.                                                                                                                                                                                                                |
| `secret`               | (supplier_id, name) -> value: the BHEL portal password. Never returned by any read API.                                                                                                                                                                                                           |
| `buyer`                | id, unit_name, state, state_code, gstin (public unit data). Seeded with BHEL units only.                                                                                                                                                                                                          |
| `app_user`, `session`  | One `admin` user; password hash; sessions by token hash.                                                                                                                                                                                                                                          |
| `source_document`      | id, kind (`po`/`srv`), key, storage_key, sha256, doc_date, ingested_at, job_id.                                                                                                                                                                                                                   |
| `po`                   | id, po_number (unique per supplier), po_date, buyer_id, enquiry, quotation, order_type, bhel_status_code, amend_no, po_value_u5, net_po_value_u5, is_gemc, gemc_number, remarks, raw_header_json, status and totals (derived), version.                                                           |
| `po_item`              | id, po_id, po_item_no, material_code, description, drawing_no, unit, mtrl_cat, ord_qty_m, rate_source_u5, rate_u5, item_value_u5, po_rcd/rej_qty_m, cancelled_at, manual_dispatched_qty_m (default 0), manual_note, manual_set_at; derived quantities and status. UNIQUE(po_id, po_item_no).      |
| `po_lot`               | id, po_item_id, lot_no, dely_qty_m, dely_date, entry_allow_date, entry_allow_note, dest_code, raw_row_json (the page row). No unique key: a repeated lot row is kept (A2-10).                                                                                                                     |
| `dc`                   | id, po_id, number, dc_date, financial_year, gc_number, gc_date, header fields, version, created_at, invoice_number, invoice_date. UNIQUE(supplier_id, number, financial_year); UNIQUE(supplier_id, gc_number, financial_year).                                                                    |
| `dc_item`              | id, dc_id, po_item_id, dsp_qty_m, created_at, packets.                                                                                                                                                                                                                                            |
| `invoice`              | id, po_id, dc_id (nullable, UNIQUE), kind (`dc`/`direct`), number, invoice_date, financial_year, buyer snapshot, GST percentages, totals_u5, header fields, version, created_at. UNIQUE(supplier_id, number, financial_year).                                                                     |
| `invoice_item`         | id, invoice_id, po_item_id, dc_item_id (nullable), qty_m, rate_u5, taxable_u5, cgst_u5, sgst_u5, igst_u5, total_u5, hsn, packets.                                                                                                                                                                 |
| `srv`                  | id, po_number, po_id (nullable: PO not found), srv_number, srv_date, financial_year, raw_header_json. UNIQUE(supplier_id, po_number, srv_number).                                                                                                                                                 |
| `srv_item`             | id, srv_id, po_item_id (nullable), row_no, material_code, po_item_no, sub_item_no, lot_no, srv_item_no, rev_no, division, pmir_no, unit, ord/challan/rcd/accepted/rej `_qty_m`, challan_no/date, invoice_no/date, finance_date, cnote_no/date, raw_row_json, resolved_dc_id, resolved_invoice_id. |
| `reconciliation_issue` | id, type, scope_type, scope_id, po_id, fingerprint, details_json (field, expected, actual), status (`open`/`acknowledged`), note, opened_at, acknowledged_at.                                                                                                                                     |
| `audit_log`            | id, at, actor, action, entity_type, entity_id, before_json, after_json, job_id. One row per write batch, in that batch. Kept forever (A-26).                                                                                                                                                      |
| `job`, `job_event`     | job: type, status, timestamps, cancel_requested, progress_json, error, summary_json; partial unique index on running. job_event: job_id, at, level, document_key, message.                                                                                                                        |
| `schema_migration`     | version, name, applied_at, app_version; the schema version is `max(version)` (no `PRAGMA user_version`, which D1 refuses).                                                                                                                                                                        |

Not carried from legacy: numbering sequences, alerts, master tables, download preferences, lot
`manual_override_qty`, `manual_delivered_qty`, multi-PO columns, the ledger view, triggers. The legacy ledger becomes
`audit_log` and deviations become `reconciliation_issue`.

### 8.3 Migrations and retention

- `packages/db/migrations/NNNN_name.sql`, forward-only, generated by `drizzle-kit` and reviewed; only `CREATE`,
  `ALTER TABLE ADD COLUMN`, `CREATE INDEX` and the table-rebuild pattern. CI applies each to an empty DB and to a
  synthetic snapshot of the previous version.
- Applied only by the upgrade step (§13.3), after a backup, as one batch.
- PRAGMAs (local): `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=30000`,
  `cache_size=-32000`, `temp_store=MEMORY`.
- Retention: nothing is pruned. The audit log has no delete and no pruning (A-26) (INV-83); job events, flags and
  stored HTML are kept.

---

## 9. API

- Hono with `@hono/zod-validator`; JSON only; body caps (HTML upload 10 MB per file).
- One route table in `packages/schemas` generates the typed web client and an OpenAPI file; CI checks freshness.
- Lists take `page`, `pageSize`, `sort`, `dir` and typed filters and return `total`; exports use keyset paging.
- Resources: auth, onboarding, supplier, settings, buyers, po (list, detail, upload, manual create/edit, delete,
  manual dispatched qty), srv (list, detail, upload, delete), dc, invoice (DC-sourced, PO-direct, preview),
  documents (DC/invoice/GC Excel), reports and exports, delivery tracker, flags, audit (read-only), jobs, search,
  dashboard, health.
- Dropped legacy endpoints: procurement/analytics, dashboard insights and forecast, HTTP
  "reconcile all" (now the `recompute-all` job), audit-log delete, health aliases, download-folder preferences.
  (INV-87)
- The SPA is served by the same app: one process, one port.

---

## 10. Security and auth

Simplicity beats security for UX (A-17); every guard below is invisible to the user.

### 10.1 Access

- Bind `127.0.0.1` on a random free port; reject any `Host` other than `127.0.0.1:<port>`/`localhost:<port>`.
  (INV-79) Mutating requests must be JSON; `SameSite=Strict`, `HttpOnly` cookie.
- Simple login (A-17, A-26): fixed username `admin`, password only, hashed with PBKDF2-SHA256 via WebCrypto. Session
  and "remember me" behave as legacy. Settings: change password and the existing reset-to-defaults (confirmation
  phrase only, also on the login screen, so a forgotten password is recovered there; data is untouched); both end
  other sessions. No forced change, backoff, complexity rules or CLI recovery. (INV-80)
- Public routes: login, reset-defaults, session, health.

### 10.2 BHEL password

- Stored simply (A-17) in the local `secret` table so a sync needs only captcha and OTP. The API never returns it
  (the UI shows "saved" with Change and Clear); it is kept out of logs, audit values, exports and error bodies.
  (INV-81)

### 10.3 Onboarding and supplier identity

- First run (no supplier row) opens `/onboarding`: supplier profile and GST rates in the existing settings layout,
  then the login. Nothing identifying is seeded. (INV-78)

### 10.4 Input handling and observability

- Zod at every boundary; NaN, duplicate and unknown ids are 400s. Excel/CSV cells are written as strings; CSV cells
  starting with `=`, `+`, `-` or `@` get a leading `'`.
- pino JSON logs, 14-day rotation, no secrets or document bodies. `/api/health` reports version, schema version and
  job state.

---

## 11. Documents and exports

All layouts are frozen (A-2): the output matches the legacy output cell for cell and column for column. Only the output is frozen; the generation code is new and may differ from legacy in any way. (INV-68, INV-69)

### 11.1 DC, invoice, GC Excel

- Templates are the legacy templates with supplier identity cells (name, GSTIN, address, bank details) turned into
  placeholders filled from the supplier profile. Only de-branded copies are committed.
- The frozen thing is the output, not the legacy mechanism (A-26): a document with any number of items must look
  like the legacy file (same cells, merges, styles, number formats, print area and page breaks), but how it is built
  is free. `packages/documents` picks the simplest efficient way (for example, generating the item rows directly
  rather than inserting rows into a template). Golden tests compare 1, 20, 21 and 60-item documents against legacy
  output by rendered content and layout, not by byte equality.
- The DC footer carries the GC line (§6.7); GC has its own template. Amounts are rendered with the legacy formats.
- Where the owner's printed documents differ from legacy output, the owner's win (rev 1.12): the DC and GC layout
  (INV-116), and HSN and packets per invoice line (INV-117). Amount in words prints paise only when non-zero.
- Files go through `Storage` and are returned as a download; the desktop shell offers Save-as.

### 11.2 Reports and exports

- Kept: PO register, DC register, invoice register, pending items, reconciliation report, guarantee-certificate
  report, export-selected, delivery tracker (screen and export), and the daily dispatch summary (rev 1.12): the DC
  lines dated in a range in the owner's summary layout, a third `/reports` tab. (INV-120)
- Quantities are written exact to 3 dp; GEMC amounts in the registers at 5 dp (A-12); a list workbook with no rows
  still has its header row (rev 1.12). (INV-118, INV-119)
- Each export keeps its legacy column set, order, headers, number/date formats and file type; golden tests compare
  output with synthetic expected files. No flag column (A-2).
- Exports stream: keyset-paged queries feed an exceljs `WorkbookWriter` or CSV writer via `hono/streaming`; no row
  cap; a synthetic 10k-row fixture is tested. Formatters exist once so screen and export agree.

---

## 12. Frontend

### 12.1 Stack (A-2)

- Vite + React; TanStack Router (file routes, Zod `validateSearch` for URL-synced page/size/sort/filters) and
  TanStack Query (keys `[resource, params]`, `placeholderData: keepPreviousData`, one invalidation per mutation).
  No global page stores.
- Forms: react-hook-form with `useFieldArray` and the shared Zod schemas; totals via `useMemo`, never stored.
- Route-level code splitting; a shell bundle budget (250 kB gzip) checked in CI.

### 12.2 Frozen flows and elements, carried over (INV-66, INV-67)

- Frozen means the user flows and the set of on-screen elements: no flow changes, and no added or removed elements,
  routes, labels or columns. Minor visual differences are allowed where they reduce maintenance, improve performance
  or increase consistency, e.g. shadcn/ui defaults where the difference is cosmetic, unified spacing and states
  (D-0016).
- `globals.css` copied verbatim (`@theme`, `:root`, `.dark`, `role-*`, `typo-*`). Only token-parity and definition
  fixes, recorded in one ADR: dark badge text tokens, tokens that existing classes reference but nobody defines,
  tertiary/placeholder contrast to 4.5:1, one focus-ring token, light warning-contrast, dead blocks.
- Fonts self-hosted (`@fontsource`): Public Sans, Bricolage Grotesque, JetBrains Mono, with the same CSS variables
  and the weights the `role-*` classes use.
- Routes and labels unchanged: `/`, `/po`, `/po/:id`, `/po/create`, `/po/ingest-bhel`, `/dc`, `/dc/:id`, `/dc/create`,
  `/invoice`, `/invoice/:id`, `/invoice/create`, `/srv`, `/srv/:id`, `/delivery-tracker`, `/reports`, `/deviations`,
  `/system/ledger`, `/settings`, `/auth/login`. Added: `/onboarding` (A-6). Removed: `/procurement` (A-16).
- Shell, sidebar, page header, stat cards, detail tabs, list toolbars, linked-document counts and popovers, and the
  supply progress ring (spec §3) keep their legacy elements and behaviour. (INV-73)
- Owner-approved changes (2026-10-15, E2E real-data test): the dashboard's period buttons gain "This FY", the
  default; without a range, the dashboard, the reconciliation tab and Operations Insights show the current FY to today.

### 12.3 Consistency and usability fixes

- **One registry** (`src/components/common/index.ts`); deep imports and local copies fail `validate-imports`.
- **Primitives** are shadcn/ui components generated with the shadcn CLI into the repo (owned MIT source; runtime
  dependencies Radix UI, cva, clsx, tailwind-merge) and restyled to the `globals.css` tokens (D-0015).
- **DataTable** is custom on TanStack Table (not the shadcn data-table) and implements C8 (INV-70, INV-71): `table-layout: fixed` with a required width per column; single-line
  truncated cells with `title`; body height reserved as `pageSize x rowHeight` with `aria-hidden` filler rows;
  loading/empty/error inside the reserved body with header and pager mounted; the pager always mounted, page and
  range text in fixed-width `tabular-nums` slots; sort via a `<button>` in `<th>` with `aria-sort`. Count pills,
  Clear/Reset and badges keep their slot (`invisible`, never unmounted).
- **Forms**: `FormField` associates label, help and error; icon-only buttons need `aria-label`.
- **Settings** keeps the existing Save button (A-18), with better accessibility and usability: dirty tracking,
  inline validation, a disabled state with a reason, an unsaved-changes prompt. (INV-72)
- **Flags** show as badges in a reserved column and highlighted rows; delete buttons blocked by links show why.
- A Vitest test asserts every `:root` colour token has a `.dark` value; light and dark screenshots of touched shared
  components are review artefacts.

### 12.4 Platform adapter

`src/platform/{tauri,web}.ts`, chosen at runtime: pickers, Save-as, notifications, tray status. Every flow also
works in a plain browser.

---

## 13. Distribution

### 13.1 What ships (A-4)

- **Tauri 2 shell** (WebView2) starts the sidecar, waits for `/api/health`, then loads `http://127.0.0.1:<port>/`;
  data never goes over Tauri IPC. Plugins: single-instance, dialog, notification, tray, updater, log, shell.
- **Sidecar**: `apps/api` bundled with esbuild into a Node 26 SEA; it picks a free loopback port, reports it to the
  shell, serves the embedded SPA and exits with the shell. Fallback if SEA proves fragile: `node.exe` plus the bundle.
- **End-user requirements**: Windows 10/11 x64 (WebView2 and Edge are already present). Nothing else.

### 13.2 Installer and data

- Per-user NSIS installer (no admin) into `%LOCALAPPDATA%\Programs\SenstoSales`; the uninstaller leaves data.
- Data directory `%LOCALAPPDATA%\SenstoSales\{db,logs,backups,exports,html}` plus `config.json`. (INV-82)
- **Unsigned in v1** (A-25): `docs/OPERATIONS.md` shows the one-time SmartScreen step (More info -> Run anyway) with
  screenshots. The updater manifest is still signed with the Tauri updater key (free, no vendor). (INV-93)

### 13.3 Upgrade, backup, restore

- **Upgrade**: the schema version is `max(version)` in `schema_migration` (0 when the table is missing). On the
  first start of a new version, if it is below the expected version: back up (`backups/pre-upgrade-<version>-<ts>.db`,
  SQLite online backup API), apply pending migrations and their `schema_migration` rows as one batch, serve. On
  failure the old DB is untouched and a plain dialog explains. If it is above the expected version the app refuses
  to start and says so. (INV-82)
- **Backups**: online backup API, on the first launch each day and before every migration; rotation keeps 14 daily
  and 12 monthly. Settings offers Backup now and Restore; Backup now writes its own `manual-<ts>.db`, never rotated,
  so it never replaces the day's daily copy.
- **Versioning**: one `VERSION` file stamped into `tauri.conf.json`, the SEA, every `package.json` and `/api/health`.

---

## 14. Quality

### 14.1 Tests

- **Domain**: one `describe` per INV row, table-driven, literal values (examples in §6).
- **Parsers**: golden tests on anonymised fixtures in CI; the local corpus test asserts no throw, every PO has items,
  `ord_qty > 0`, all dates parse.
- **API**: `app.request()` against in-memory node:sqlite; per endpoint happy path, 400, 401, 404, 409; flows: a DC
  over pending creates `OVER_DISPATCH`; a DC-sourced invoice with another qty is 400; manual dispatched qty then a
  real DC raises `MANUAL_ADJUSTMENT_OVERLAP`; delete blocked by links; older PO skipped with no flag; a failing SRV
  file keeps previous data; `(number, FY)` reuse across FYs; cross-FY SRV reference not linked. DCs and invoices in
  tests are synthetic (A-19).
- **Exports**: golden files for every report and document (values, formats, merges, item-count boundaries).
- **Migrations**: empty DB and a synthetic previous-version snapshot.
- **E2E** (Playwright): onboarding, login, PO paging with equal pager/header bounding boxes, create DC and invoice,
  download Excel, folder import, acknowledge a flag.
- **Desktop smoke**: installed app starts, `/api/health` answers, closing the window stops the sidecar.

### 14.2 CI and repo

- GitHub Actions pinned to commit SHAs; `permissions: contents: read`; concurrency with cancel-in-progress; frozen
  lockfile; pnpm `trustPolicy: no-downgrade`.
- Jobs: `check` (lint incl. design validators and complexity, `tsc -b`, Vitest), `build`, `licenses`,
  `real-data-scan`, `audit`, `e2e` (Windows), `desktop` (Tauri build).
- Rulesets on `main`: PR required, required checks, linear history, no force-push, no bypass; secret scanning and
  push protection on; a `vp staged` pre-commit hook under 10 s. Agents never merge directly (INV-89).

### 14.3 Fixtures and the real-data scan (A-19, A-26)

- Parser fixtures (about 40 PO, 30 SRV) are made by a local one-time script (`tools/checks/anonymise-fixture`) that
  replaces all names, numbers and IDs (PO/SRV/challan/invoice numbers, supplier and issuer identity, GSTIN, phone,
  e-mail, codes, descriptions) and keeps the layout and the quantities. Output is reviewed before commit. (INV-75)
- Fixtures cover both page eras, GEMC, multi-item, multi-lot, short-closed and amended POs, both SRV layouts,
  repeated challan numbers across FYs, and files the legacy parser failed on.
- `real-data-scan` fails on GSTIN-shaped strings outside documented test literals, local data paths, Indian
  mobile numbers, DB files and HTML or binary documents outside the fixture folders, reporting `path:line` only.
  Locally (hook and `pnpm verify`) it also matches the values in a gitignored company-details file. Excel contents
  are not scanned; templates and goldens need realistic sample data. Other real data is kept out by review. (INV-74)

---

## 15. Build order

| Layer | Content                                                                                                                                                                     | Done when                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| L0    | Repo bootstrap: workspace, CI, hooks, checks, root docs, orchestration                                                                                                      | A trivial PR is green on every job and cannot merge without checks.         |
| L0.5  | Spikes: sidecar lifecycle; Edge login with captcha/OTP; node:sqlite + Drizzle batch + D1 dialect; exceljs output fidelity for 1/20/21/60-item documents; parser feasibility | Results in DECISIONS.md / ADRs.                                             |
| L1    | Domain (§6)                                                                                                                                                                 | Every rule has an INV row and literal tests.                                |
| L2    | DB: schema, migration 0001, Db port, seed                                                                                                                                   | Empty DB migrates on SQLite and D1 local.                                   |
| L3    | Parsers and fixtures                                                                                                                                                        | Golden tests green; corpus test passes locally.                             |
| L4    | API core and ingest jobs                                                                                                                                                    | A full local corpus imports through jobs.                                   |
| L5    | Web shell, DataTable, read screens, settings                                                                                                                                | No-layout-shift e2e passes; light/dark review signed off.                   |
| L6    | DC/invoice/GC, documents, reports and exports                                                                                                                               | Synthetic documents match golden files.                                     |
| L7    | BHEL scraper and sync UI                                                                                                                                                    | A live sync on the owner's machine ingests new documents.                   |
| L8    | Desktop packaging and operations                                                                                                                                            | Clean install on a fresh VM; upgrade with backup and migration.             |
| L9    | Cutover                                                                                                                                                                     | The owner works in the new app after a fresh corpus import; legacy retired. |

## 16. Tech stack

TypeScript (pnpm monorepo, Node 26 LTS), Hono, Drizzle over node:sqlite (D1 later), Zod, cheerio, exceljs,
playwright-core, Vite + React, TanStack Router/Query/Table, react-hook-form, Tailwind v4, shadcn/ui (generated source; Radix UI, cva, clsx,
tailwind-merge), Lucide, Vitest,
Playwright, Vite+ (`vp`: Oxlint, Oxfmt, Vitest; no ESLint or Prettier), Tauri 2, Node SEA. Versions fixed when lockfiles are created; every
dependency passes the deny-list (C13). All production code is TypeScript (A-1; INV-90).

## 17. Candidates register

| #   | Candidate                                                                            | Failure it addresses                | Evidence that admits it                                      |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| K1  | Cloudflare entry point (Workers, D1, R2, Browser Rendering, Durable Objects)         | The app is usable on one PC only    | Owner wants hosted access; ports pass a D1/R2 adapter suite. |
| K2  | Hosted multi-user auth                                                               | No remote or multi-user access      | K1 admitted.                                                 |
| K3  | MCP server over services                                                             | Bots cannot query or act on data    | Core cut over; owner request.                                |
| K4  | Telegram bot                                                                         | No mobile notifications             | Same as K3.                                                  |
| K5  | Finance extension                                                                    | No financial statements             | Core cut over; owner request.                                |
| K6  | Code signing (OV certificate or a cloud signing service; India eligibility to check) | SmartScreen warning on install      | The app is distributed to other suppliers (A-25).            |
| K7  | Supplier switcher (several suppliers per install)                                    | One install per supplier            | A real shared-PC need.                                       |
| K8  | Scraping fallback when Edge cannot launch (Chrome, on-demand Chromium)               | Sync impossible on locked-down PCs  | A reported machine (EDGE_CASES).                             |
| K9  | BHEL password encrypted at rest                                                      | Password readable from the data dir | A user or audit asks, at no UX cost.                         |

---

## Appendix A. Owner decisions

All dated 2026-10-14. A1 lists the owner's decisions; A2 lists questions the owner closed by rule (A-26 "closed by
spec or format freeze, not by new design"), each with its source.

### A1. Decisions

| #   | Topic                           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Rebuild approach                | Full TypeScript greenfield rebuild; spec rules ported.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | Frontend                        | Vite + React with TanStack Router/Query. UI/UX flows, on-screen elements and CSV/Excel export formats frozen; minor visual changes allowed where they reduce maintenance, improve performance or increase consistency (D-0016). Existing routes and labels kept; no flag column in exports.                                                                                                                                                                                                                |
| 3   | Backend and hosting             | Hono with Drizzle over node:sqlite, behind ports for later Cloudflare self-hosting (Workers, D1, R2, Browser Rendering). All writes batch-shaped. Local install first.                                                                                                                                                                                                                                                                                                                                     |
| 4   | Desktop                         | Tauri 2 shell with a Node 26 SEA sidecar over HTTP on 127.0.0.1; per-user NSIS installer; data in `%LOCALAPPDATA%`; a backup before every migration.                                                                                                                                                                                                                                                                                                                                                       |
| 5   | Buyers and scraping             | BHEL units only; scraping uses the system Edge via playwright-core.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Source of truth                 | PO/SRV HTML documents, not the DB. Import = re-ingesting the HTML; the legacy DB is not an input. Supplier profile and GST rates are entered at onboarding.                                                                                                                                                                                                                                                                                                                                                |
| 7   | Document creation               | No hard caps. Mismatches become flags that are highlighted; the user decides. Reports reflect data as it stands.                                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | DC-sourced invoices             | Qty must equal the DC qty; rate equals the PO rate.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Status                          | The UI leads with quantity columns; the spec's status table stays the reference, with one item-derived implementation.                                                                                                                                                                                                                                                                                                                                                                                     |
| 10  | Numbering                       | `(number, FY)` keys; numbering restarts every FY; every lookup and link FY-qualified.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 11  | Rejections                      | Rejected qty does not reopen the balance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12  | GEMC                            | Amounts kept at 5 dp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 13  | Amended-out PO items            | Cancelled flag; excluded from totals and balance; any document against them is flagged.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | Editing and deletion            | DC/invoice header fields editable; qty/rate changes need delete and recreate. No cancel state; delete disabled while backward links exist.                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | Manual quantity adjustment      | As simple as Excel: one item-level `manual_dispatched_qty` (default 0) plus an optional note, replacing the lot `manual_override_qty`; added into dispatched and so into balance; edited inline in the PO detail item row where the legacy override was; no invoiced or received adjustment; when a real DC is later created for the item, the item is highlighted (`MANUAL_ADJUSTMENT_OVERLAP`); no new screen.                                                                                           |
| 16  | Dropped features                | Procurement intel page, multi-PO invoices. The daily-dispatch report is back (owner, 2026-10-15, rev 1.12).                                                                                                                                                                                                                                                                                                                                                                                                |
| 17  | Users and security              | Limited technical skills; UX simplicity beats security. Loopback binding, a Host check, a simple login and the existing reset. BHEL password stored simply. No forced change, no backoff, no CLI-only recovery.                                                                                                                                                                                                                                                                                            |
| 18  | Settings                        | Keep the existing Save button, with improved accessibility and usability.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 19  | Repo                            | Public, AGPL-3.0. No real data; synthetic or anonymised fixtures only; DCs and invoices in tests are synthetic. Dependency deny-list AGPL/GPL/SSPL.                                                                                                                                                                                                                                                                                                                                                        |
| 20  | Process                         | CrawlerAIv2-style autonomous development.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 21  | Later work                      | MCP, Telegram and finance last, as candidates only.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 22  | Prior art                       | Legacy code and docs may be read for business rules and for what the user sees (UI/UX, export formats), never copied verbatim and never as a model for implementation: match the output, build it the efficient way. The legacy business spec is the business-rule source of truth; port its rules, never re-invent them.                                                                                                                                                                                  |
| 23  | Layout stability                | No interaction shifts layout (owner's global UI rule): fixed table layout and widths, reserved page height, fixed pager, same-footprint states.                                                                                                                                                                                                                                                                                                                                                            |
| 24  | v1 flags                        | Exactly: `QTY_MISMATCH`, `DOC_NUMBER_CONFLICT` (spec), `OVER_DISPATCH`, `OVER_INVOICE`, `DOC_ON_CANCELLED_ITEM`, `MANUAL_ADJUSTMENT_OVERLAP`, and (owner-approved 2026-10-15) `SRV_PO_ITEM_ZERO`, `SRV_DUPLICATE_ITEM`, `SRV_UNKNOWN_PO_ITEM` for BHEL's own SRV row oddities, stored as printed. `RECEIVED_EXCEEDS_DISPATCHED` and `AMENDMENT_BELOW_DISPATCHED` are out of v1. `STALE_DOCUMENT_SKIPPED` is dropped because the spec records no deviation for skipped older documents.                     |
| 25  | Code signing                    | v1 ships unsigned with a documented one-time "More info -> Run anyway" step; signing is a candidate for distribution to other suppliers.                                                                                                                                                                                                                                                                                                                                                                   |
| 26  | Closed by spec or format freeze | Cross-FY SRV linking follows spec §8 (don't link). GEMC edit input is the GST-inclusive rate (spec §4). Documents with more than 20 items must look the same as legacy output; how they are generated is free (same UI/UX and formats, not same implementation). Audit log: keep everything, no delete, no pruning. Fixture anonymisation: replace all names, numbers and IDs; keep layout and quantities. Settings: existing Save with improved accessibility. BHEL password stored simply. Simple login. |
| 27  | Edge cases                      | Edge cases deferred past v1 live in `EDGE_CASES.md`. An agent that finds an uncovered case records it there and implements the spec's behaviour; it never invents handling. `OPEN_QUESTIONS.md` has no open v1 rows.                                                                                                                                                                                                                                                                                       |

### A2. Closures by spec or legacy behaviour (under A-26)

| #     | Question                                                       | Closed as                                                                                                    | Source                                              |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| A2-1  | PO key: `po_number` or `(po_number, FY)` (spec §4 allows both) | `po_number` (per supplier)                                                                                   | Legacy schema (PO number is the key)                |
| A2-2  | PO upload from Excel (spec §2 mentions it)                     | HTML only                                                                                                    | Legacy upload accepts HTML only; A-6                |
| A2-3  | How a PO is recognised as GEMC                                 | A GEMC number in the REMARKS text below its label (legacy regex)                                             | Legacy parser; owner 2026-10-15                     |
| A2-4  | Invoice tax split and rounding                                 | CGST + SGST from settings, IGST 0; per-line rounding to 5 dp for GEMC, 2 dp otherwise; header = sum of lines | Legacy invoice service; spec §5; A-12               |
| A2-5  | Which FY makes a GC number unique                              | The DC's FY                                                                                                  | Legacy DC service                                   |
| A2-6  | Next-number suggestion                                         | None; numbers typed by the user                                                                              | Spec §2 ("Manual"); legacy UI                       |
| A2-7  | SRV item to PO item                                            | By (PO, PO item number); material code and lot play no part (owner-approved 2026-10-15)                      | Legacy matching by item number; real SRV pages      |
| A2-8  | Accepted column value                                          | SRV lines and totals: the SRV's own ACCEPTED QTY (owner-approved 2026-10-15); PO items: `rcd_qty`            | Owner; legacy report service                        |
| A2-9  | SRV for a PO not in the system                                 | Stored; listed with "PO not found"; not a flag; in no received total                                         | Legacy SRV ingestion; owner 2026-10-15              |
| A2-10 | Odd PO or SRV rows; an unreadable SRV in a file                | Stored as printed and flagged; an unreadable SRV fails alone, the file's other SRVs are stored               | Owner 2026-10-15 (E2E real-data test)               |
| A2-11 | Session lifetime                                               | As legacy (session cookie plus "remember me")                                                                | Legacy auth; A-17                                   |
| A2-12 | Suppliers per install                                          | One                                                                                                          | Legacy is single-supplier; switcher is candidate K7 |
| A2-13 | Status of a PO whose items are all cancelled                   | Derived by the item rule over active items: Closed (no active item is pending or delivered)                  | Spec §6 + A-9 + A-13; recorded in EDGE_CASES        |
| A2-14 | Commit the private audits to the public repo                   | No; they stay private                                                                                        | A-19                                                |

---

## Appendix B. Business-rule traceability

Every section of the legacy business spec, mapped to this document and `INVARIANTS.md`. Statuses: **ported as-is**;
**changed by owner decision A-n**; **bug fix** (legacy code diverged from the spec); **storage mechanism only**.

| Spec § | Rule                                                                                                     | ARCHITECTURE   | INV                    | Status                                                           |
| ------ | -------------------------------------------------------------------------------------------------------- | -------------- | ---------------------- | ---------------------------------------------------------------- |
| §1     | Core flow PO -> DC -> Invoice -> SRV; PO->DC 1:many; DC->Invoice 1:1; PO->Invoice 1:many; SRV->PO many:1 | §1, §5.2, §6.7 | INV-28                 | ported as-is                                                     |
| §1     | Invoice may span POs (multi-PO, legacy feature)                                                          | §6.7           | INV-30                 | changed by owner decision A-16                                   |
| §1     | Live chain: linked documents in sync across views                                                        | §12.2          | INV-73                 | ported as-is                                                     |
| §2     | PO and SRV numbered by the buyer; PO uploaded as HTML/Excel                                              | §7.1           | INV-49                 | changed by owner decision A-6 (HTML only; A2-2)                  |
| §2     | DC and invoice numbering manual, FY-wise unique                                                          | §6.6           | INV-22, INV-27         | changed by owner decision A-10 (`(number, FY)` keys)             |
| §3     | `ord_qty`, `dely_qty` per lot, `dispatch_qty` per DC item                                                | §6.2, §8.2     | INV-06                 | ported as-is                                                     |
| §3     | `delivered_qty` = DC dispatch + PO-direct invoice qty; DC-sourced invoices not added                     | §6.2           | INV-03                 | ported as-is                                                     |
| §3     | `pending_qty`/balance = `max(0, ord - max(rcd, delivered))`                                              | §6.2           | INV-04                 | ported as-is (confirmed by A-11)                                 |
| §3     | `uninvoiced_qty` = ord − all invoice qty; used as PO-direct cap                                          | §6.2           | INV-05                 | changed by owner decision A-7 (displayed, not a cap)             |
| §3     | `manual_override_qty` per lot overrides dispatched                                                       | §6.8           | INV-08                 | changed by owner decision A-15                                   |
| §3     | Date-winner rule for `rcd_qty`, tie to SRV, cumulative SRV sums, accepted fallback                       | §6.3           | INV-10, INV-11         | ported as-is                                                     |
| §3     | `rej_qty` from SRV sums or the PO document (else 0)                                                      | §6.3           | INV-12                 | ported as-is                                                     |
| §3     | PO's own rcd/rej kept when PO wins (lost when last SRV deleted in legacy)                                | §6.3           | INV-13                 | bug fix                                                          |
| §3     | Recompute on every SRV insert/update/delete and on winner flip; upload date never used                   | §6.3           | INV-14, INV-15         | ported as-is                                                     |
| §3     | No lot distribution of dispatched or received                                                            | §6.2           | INV-06                 | ported as-is                                                     |
| §3     | SRV quantities recorded against PO items by material code                                                | §6.10          | INV-39                 | changed: by PO item number (A2-7, owner 2026-10-15)              |
| §3     | Document counts, popovers, progress ring = max(dispatched, accepted)                                     | §12.2          | INV-73                 | ported as-is                                                     |
| §4     | PO UPSERT only when not older; older upload skipped; delete to reload older                              | §7.2           | INV-42                 | ported as-is                                                     |
| §4     | PO key `(po_number)` or `(po_number, FY)`                                                                | §7.2           | INV-42                 | ported as-is (A2-1)                                              |
| §4     | Received-quantity guard after PO accept                                                                  | §7.2           | INV-45                 | ported as-is                                                     |
| §4     | GEMC rate `rate / 1.18` to 5 dp                                                                          | §6.4           | INV-16                 | ported as-is                                                     |
| §4     | GEMC re-save never divides twice (legacy guard had a false positive)                                     | §6.4           | INV-17                 | bug fix                                                          |
| §4     | GEMC rates are GST-inclusive input (manual edit)                                                         | §6.4           | INV-20                 | ported as-is (A-26)                                              |
| §4     | Entry-allow non-date text stored as the lot note and shown                                               | §7.1           | INV-46                 | ported as-is                                                     |
| §4     | SRV UPSERT by `(po_number, srv_number)` only when not older                                              | §7.2           | INV-43                 | ported as-is                                                     |
| §4     | No deviation recorded for skipped older SRV data                                                         | §6.9, §7.2     | INV-44                 | ported as-is                                                     |
| §4     | Store deviations for accepted SRV data                                                                   | §6.9           | INV-51, INV-52         | ported as-is                                                     |
| §5     | DC at item level; no lot tracking of dispatches                                                          | §6.7           | INV-06, INV-32         | ported as-is                                                     |
| §5     | DC guardrail `dispatch_qty <= pending_qty`                                                               | §6.7           | INV-32, INV-54         | changed by owner decision A-7                                    |
| §5     | Invoice modes: DC-sourced 1:1, PO-direct                                                                 | §6.7           | INV-28                 | ported as-is                                                     |
| §5     | DC-sourced invoice qty/rate (spec silent; legacy accepted any value)                                     | §6.7           | INV-29                 | changed by owner decision A-8                                    |
| §5     | PO-direct cap `0 < qty <= uninvoiced + 0.001`                                                            | §6.7           | INV-31, INV-55         | changed by owner decision A-7 (`qty > 0` kept)                   |
| §5     | PO-direct needs at least one line                                                                        | §6.7           | INV-31                 | ported as-is                                                     |
| §5     | Tax from settings GST rates                                                                              | §6.5           | INV-41                 | ported as-is (A2-4)                                              |
| §6     | Pending / Delivered / Closed; tolerance 0.001                                                            | §6.1, §6.11    | INV-02, INV-62         | bug fix (legacy never produced Closed)                           |
| §6     | Status derived per item; cancelled items                                                                 | §6.11          | INV-63, INV-64, INV-65 | changed by owner decisions A-9, A-13                             |
| §7     | Historical mode: SRV DC/invoice numbers stored as text, not records                                      | §6.10          | INV-38                 | ported as-is                                                     |
| §7     | Initial setup by uploading POs and SRVs                                                                  | §7.4           | INV-49                 | changed by owner decision A-6 (folder re-ingest)                 |
| §8     | Accept data, flag deviation, don't reject                                                                | §6.9           | INV-51                 | ported as-is                                                     |
| §8     | `QTY_MISMATCH`                                                                                           | §6.9           | INV-52                 | ported as-is                                                     |
| §8     | `DOC_NUMBER_CONFLICT`                                                                                    | §6.9           | INV-53                 | changed: only another PO's document conflicts (owner 2026-10-15) |
| §8     | `FY_COLLISION` prevented at link time; FY-aware linking                                                  | §6.10          | INV-37                 | ported as-is                                                     |
| §8     | DC and invoice numbers independent                                                                       | §6.6           | INV-23                 | ported as-is                                                     |
| §8     | `deviations` table                                                                                       | §6.9, §8.2     | —                      | storage mechanism only                                           |
| §8     | Flags remain until manually resolved; resolution changes no data                                         | §6.9           | INV-59                 | ported as-is                                                     |
| §8     | Added flags `OVER_DISPATCH`, `OVER_INVOICE`, `DOC_ON_CANCELLED_ITEM`, `MANUAL_ADJUSTMENT_OVERLAP`        | §6.9           | INV-54..INV-58         | changed by owner decisions A-7, A-13, A-15, A-24                 |
| §9     | GC defaults to DC number/date; unique in FY                                                              | §6.6           | INV-26                 | ported as-is (A2-5)                                              |
| §9     | GC footer line in DC Excel; separate GC download                                                         | §6.7, §11.1    | INV-36, INV-69         | ported as-is                                                     |
| §10    | API summary (upload, create, list, preview, search)                                                      | §9             | INV-87                 | changed by owner decisions A-1, A-7, A-16                        |
| §11    | No stale overwrite; date-based source priority                                                           | §6.3, §7.2     | INV-10, INV-42, INV-43 | ported as-is                                                     |
| §11    | Internal guardrails on creation                                                                          | §6.7           | INV-32                 | changed by owner decision A-7                                    |
| §11    | "Store data, compute on read"                                                                            | §8.1           | INV-84                 | storage mechanism only (derived columns written by batches)      |
| §12    | PKs, FKs, `foreign_keys=ON`                                                                              | §8             | —                      | storage mechanism only                                           |
| §12    | Triggers/sync routines for rcd/rej                                                                       | §6.3, §8.1     | INV-14, INV-84         | storage mechanism only (service batches)                         |
| §12    | Service check `dispatch_qty <= pending_qty`                                                              | §6.7           | INV-32                 | changed by owner decision A-7                                    |
| §12    | Integer casts; non-negative quantities                                                                   | §6.1, §10.4    | INV-01, INV-31, INV-32 | ported as-is                                                     |
| §12    | API keys match frontend expectations                                                                     | §12.2          | INV-67                 | ported as-is (frozen UI)                                         |

## Revision log

| Rev  | Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2026-10-14 | Initial architecture, with spec traceability (Appendix B) and all v1 questions closed (Appendix A).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.1  | 2026-10-14 | §14.3: hashed denylist and its CI secret dropped from `real-data-scan`; a mobile-number rule and a local gitignored company-details file added; Excel contents not scanned (owner, D-0010).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.2  | 2026-10-14 | §12.3, §16: UI primitives from shadcn/ui, generated and restyled to tokens; DataTable stays custom on TanStack Table (owner, D-0015). §1, §2 C7, §12.2, A-2: the freeze covers flows and on-screen elements; minor visual changes allowed for maintenance, performance or consistency; CSV/Excel unchanged (owner, D-0016).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.3  | 2026-10-14 | §6.11: the tolerance example is `(10, 9.999, 0) -> Delivered`, not `9.9995`, which a three-decimal `Qty` cannot hold; the rule is unchanged. INV-02, INV-62 and SPEC-02 §4.3 likewise (D-0023).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.4  | 2026-10-14 | §2 C15: the ruff C90 mention goes, with all Python tooling; the merge guard and orchestrator tests are TypeScript (owner, D-0018). §3, §13, §16, A-4: Node 26 LTS replaces Node 24, including the SEA sidecar (owner, D-0019).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.5  | 2026-10-15 | §8.2, §13.3: the schema version is `max(version)` in `schema_migration`; `PRAGMA user_version` is no longer written or read, since D1 refuses it (ADR 0002). SPEC-05 and SPEC-07 likewise (owner delegated the decision to the orchestrator; SPEC-05 PR 3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.6  | 2026-10-15 | §8.1: optimistic concurrency checks the version inside the `UPDATE`; a stale version fails the batch (409) instead of a changes check after it, which a void batch cannot do. SPEC-05 §2 likewise (owner delegated the wording fix to the orchestrator, D-0124).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.7  | 2026-10-15 | §3: `tools/orchestrator/` holds the agent and merge scripts; the merge-guard and path-guard PreToolUse hook is removed, and `merge_pr.sh` stays the only merge path (INV-89) (owner).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.8  | 2026-10-15 | §7.1, §7.3, §8.2, A2-3, A2-10: PO and SRV pages verbatim (every SRV column, optional LOT NO and MATERIAL CODE, odd rows kept and flagged, one bad SRV fails alone, REMARKS below its label); HSN, packets and DC invoice columns. INV-50 revised; INV-111, INV-112 (owner-approved 2026-10-15, E2E real-data test).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.11 | 2026-10-15 | Owner-approved 2026-10-15, E2E real-data test. §6.10, A2-7: SRV rows link to PO items by (PO, PO item number). §6.2, A2-8: Accepted on SRV lines is the source ACCEPTED QTY. §6.9, A-24, Appendix B: `DOC_NUMBER_CONFLICT` only for a cited document of another PO; three SRV row flags (nine v1 types). §6.10, A2-9: SRVs of a PO not in the system count in no received total. §12.2 (C7): the dashboard gains a "This FY" period, the default; dashboard and report ranges run by document date and default to the current FY; the PO list search also matches item descriptions; a manual PO's value is the sum of its lines and its GEMC number may come from its remarks. SPEC-02, SPEC-03, SPEC-10, SPEC-13 and SPEC-17 likewise.                                                                                                                                                           |
| 1.12 | 2026-10-15 | §1, §9, §11.1, §11.2, A-16: the documents follow the owner's printed DC, GC and invoice (consignee over three rows, digit-only DC and PO numbers as numbers, the invoice the user fills in on the DC with its date, notes as remarks, `8 NO`, `24 Month`); invoice lines store HSN (default in Settings) and packets; DC lines store packets; Settings gains state, state code, jurisdiction, place of supply and default HSN; the buyer address, GC number and consignee become optional in the edit dialogs; exports write quantities exact to 3 dp, GEMC register amounts at 5 dp and a header row on an empty list; amount in words prints paise only when non-zero; the daily dispatch summary is back as a Reports tab and workbook. INV-87 amended, INV-116..INV-120 added; EC-41 (in part), EC-45, EC-47, EC-49, EC-50 and EC-62 admitted (owner-approved 2026-10-15, E2E real-data test). |
