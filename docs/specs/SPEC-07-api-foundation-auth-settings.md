# SPEC-07 — API foundation, startup, auth, onboarding and settings

Layer: L4. Architecture refs: §3, §4 (`apps/api` layering), §4.1 (`Storage`, `Secrets`, `Clock`, `Logger`), §9,
§10.1–§10.4, §13.2 (data directory), §13.3 (upgrade step), C9, C10, C11, C12, C17.

## 1. Summary

The Hono application skeleton every endpoint plugs into: `createApp(deps)` and `createServices(deps)`, the
`AppError` hierarchy with one `onError`, the loopback Host guard, JSON-only mutations and body caps, the node
platform entry (data directory, random loopback port, SPA serving, health), the version-gated upgrade step with a
backup before any migration, the simple `admin` login, first-run onboarding, and the supplier, settings, buyers and
BHEL-password endpoints. Simplicity beats security for UX (A-17): every guard is invisible to the user.

## 2. Scope

Core:

- `createApp(deps)`, `createServices(deps)`; layering `routes → services → repositories` enforced by Oxlint import
  boundaries (§4).
- Errors: `ValidationError` 400, `AuthError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409;
  body `{ code, message, details? }`; messages in plain language (C11).
- Middleware: Host guard (`127.0.0.1:<port>` / `localhost:<port>` only, else 400; INV-79); mutating requests must
  be `application/json` (INV-102); body caps (10 MB per HTML file; INV-110); session auth on non-public routes.
- Ports and node adapters: `Storage` (local FS under the data dir; keys cannot escape; INV-96), `Clock` (IST
  `today()`), `Logger` (pino; adapter details in SPEC-21), `Secrets` (local `secret` table).
- Node entry: data dir `%LOCALAPPDATA%\SenstoSales\{db,logs,backups,exports,html}` + `config.json` (INV-82); bind
  `127.0.0.1` on a random free port; report the port to the shell; serve the built SPA from the same app (§9);
  `/api/health` (version, schema version, job state; INV-105).
- Startup (C9, INV-82): open DB; schema version (`readSchemaVersion`, SPEC-05) `== expected` → no writes; `<` →
  backup `backups/pre-upgrade-<version>-<ts>.db`, apply pending migrations as one batch, serve; failure leaves the
  DB untouched and exits with a plain message for the shell; `>` → refuse to start with a plain message.
- Auth (A-17, A-26, INV-80): fixed user `admin`, password hashed PBKDF2-SHA256 via WebCrypto; login with "remember
  me" as legacy (A2-11); logout; session; change password; reset-to-defaults with the legacy confirmation phrase
  alone, also from the login screen, so a forgotten password is recovered there (owner answer 19, 2026-10-15; EC-08);
  data is untouched; both end other sessions. Cookie
  `HttpOnly`, `SameSite=Strict`. Initial password: the legacy default (Open issues). No forced change, backoff,
  complexity rules or CLI recovery (C11).
- Onboarding (INV-78): when no supplier row exists, only onboarding and public routes answer; onboarding creates
  the supplier profile and GST rates in one batch.
- Supplier, settings (GST rates and preferences), buyers (legacy CRUD on BHEL units; INV-86), BHEL password
  status/set/clear — the value is never returned and never logged (INV-81). Every write is one batch with its audit
  row.
- Route conformance: every route-table entry is mounted and every mounted route is in the table (INV-101); no audit
  delete route (INV-83); dropped endpoints absent (INV-87).

Out of scope:

- PO/SRV/DC/invoice/flags/jobs endpoints (SPEC-08, -10, -11, -13, -19).
- Backup rotation, daily backups, restore, log rotation details (SPEC-21). Packaging (SPEC-20).
- Hosted auth (K2), encrypted BHEL password (K9).

## 3. Dependencies

- SPEC-04 (route table, shapes), SPEC-05 (Db port, schema, migrator, `backupTo`).
- SPEC-01 PR 1 (port handoff decision).
- Decisions: A-4, A-6, A-17, A-18, A-19, A-26; A2-11, A2-12.

## 4. Design

### 4.1 Modules (`apps/api/src/`)

| Path                                                               | Responsibility                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `app.ts`                                                           | `createApp(deps)`: middleware, mounts routes from the route table, `onError` |
| `services/index.ts`                                                | `createServices(deps)` (the seam for later adapters)                         |
| `errors.ts`                                                        | `AppError` hierarchy and mapping                                             |
| `middleware/{host-guard,json-only,body-limit,auth}.ts`             | guards                                                                       |
| `ports/{storage,secrets,clock,logger}.ts`                          | interfaces only                                                              |
| `routes/{auth,onboarding,supplier,settings,buyers,health}.ts`      | validate with Zod, call one service, no SQL                                  |
| `services/{auth,onboarding,supplier,settings,buyers,secrets}.ts`   | load → domain → one `WriteBatch` (+ audit) → commit                          |
| `repositories/*.ts`                                                | plain rows; no business values                                               |
| `platform/node/{main,data-dir,storage-fs,clock,startup,static}.ts` | node entry and adapters                                                      |

### 4.2 Startup sequence (`platform/node/startup.ts`)

```
resolve data dir → open DB → readSchemaVersion (max version in schema_migration)
  == expected : serve (no writes)
  <  expected : backupTo(backups/pre-upgrade-<version>-<ts>.db) → applyMigrations (one batch) → serve
  >  expected : exit with "This data was saved by a newer version of SenstoSales" (shell shows it)
listen 127.0.0.1:0 → print {"port": n} line → serve
```

The daily first-launch backup (§13.3) is a `backup` job enqueued after start (SPEC-21), not a startup write.

### 4.3 Error handling

Zod failures → 400 with field paths; unknown ids → 404 (list endpoints: 400 for malformed ids); unique violations
→ 409 with a plain message naming the conflicting number and FY; version conflicts → 409 ("changed by someone
else, reload"). No error body contains a secret or document body (INV-81, INV-106).

## 5. Invariants

INV-78, INV-79, INV-80, INV-81, INV-82, INV-83, INV-86 (buyers), INV-87, INV-96 (new), INV-101 (new), INV-102
(new), INV-105 (new), INV-110 (new).

## 6. Testing strategy

`app.request()` against in-memory node:sqlite (§14.1); per endpoint: happy path, 400, 401, 404, 409.
Specific cases: non-loopback `Host` → 400; a `text/plain` POST → 415/400; an 11 MB body → 413; with no supplier,
`GET /api/po` → redirect-signal (409 `onboarding-required`) and onboarding works; login, remember-me cookie,
logout, change password ends other sessions; reset needs the phrase alone, also once the password was changed;
BHEL password set → status "saved", never in any response, log line or audit row (log capture asserts absence);
startup: up-to-date DB has zero writes (file hash and schema version unchanged), older DB gets a backup file before
the first migration statement, newer DB refuses; storage keys `../x` and absolute paths are rejected.

## 7. Acceptance criteria

- [ ] The API binds only to `127.0.0.1` and rejects other `Host` headers (C10).
- [ ] First run opens onboarding; nothing identifying is seeded (INV-78).
- [ ] Startup performs no write on an up-to-date DB; upgrade always backs up first (C9, INV-82).
- [ ] No route deletes audit rows; every mounted route is in the route table.
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                                 | Scope / files                                                                             | Checks  | Done when                                                                                                                                                                         |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App factory, errors and guards                        | `app.ts`, `errors.ts`, `services/index.ts`, `middleware/*`, `ports/*`, tests              | `check` | Non-loopback Host → 400; non-JSON mutation rejected; oversize body → 413; errors use the body shape.                                                                              |
| 2   | Node platform entry and adapters                      | `platform/node/{main,data-dir,storage-fs,clock,static}.ts`, `routes/health.ts`, tests     | `check` | Binds 127.0.0.1 on a random port and prints it; serves a placeholder SPA; storage keys cannot escape; health reports version, schema version, job state.                          |
| 3   | Startup upgrade gate                                  | `platform/node/startup.ts`, tests with temp data dirs                                     | `check` | Up-to-date DB: zero writes; older DB: backup exists before migration and migration is one batch; failed migration leaves the DB untouched; newer DB refused with a plain message. |
| 4   | Simple login                                          | `services/auth.ts`, `routes/auth.ts`, `middleware/auth.ts`, `repositories/auth.ts`, tests | `check` | Login/logout/session/remember-me as legacy; change password and reset end other sessions; no backoff or complexity rule exists.                                                   |
| 5   | Onboarding, supplier, settings, buyers, BHEL password | `services/{onboarding,supplier,settings,buyers,secrets}.ts`, routes, repositories, tests  | `check` | Onboarding gate works; writes carry one audit row; the BHEL password never appears in responses, logs or audit values.                                                            |
| 6   | Route conformance                                     | `test/route-conformance.test.ts`                                                          | `check` | Mounted routes equal the route table; no audit delete; dropped legacy endpoints absent.                                                                                           |

## 9. Open issues

- **Initial password.** Legacy starts with a default password (`admin`) and a "default password" notice without a
  forced change. §10.3 says onboarding is followed by the login but not how the first password is set.
  Conservative reading: legacy behaviour (default password, the legacy notice, change in Settings); owner to
  confirm. Recorded in DECISIONS.
- **Session and remember-me lifetimes** follow the legacy values read from its visible behaviour (A2-11);
  implementation detail.
- **Mutations as JSON** means HTML uploads travel as JSON strings (`{ files: [{ name, html }] }`), within the
  10 MB per-file cap; implementation detail of §9 "JSON only".
- **Legacy download-folder preferences** are dropped (§9); Save-as replaces them (SPEC-14 platform adapter).
