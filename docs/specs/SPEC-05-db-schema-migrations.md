# SPEC-05 — Database: schema, migrations, Db port, seed

Layer: L2. Architecture refs: §4.1 (`Db` port), §8 (all), C3, C4, C9, §14.1 (migrations).

## 1. Summary

`packages/db`: the Drizzle schema for every §8.2 table with unit-suffixed integer columns, migration `0001`, a
migrator that plans and applies pending migrations as one batch, the `Db` port (`query`, `batch`, no
`transaction()`), its node:sqlite executor (now) and D1 executor (compiled, used only by the dialect check), the
D1 dialect CI step, and the seed. It writes no business values: derived columns are written only by service batches
(SPEC-08, -10, -11; INV-84).

## 2. Scope

Core:

- `Db` port and `WriteBatch` builder (C4); node:sqlite executor via `drizzle-orm/sqlite-proxy` with
  `BEGIN IMMEDIATE … COMMIT` and the §8.3 PRAGMAs; online backup helper for the node platform.
- Drizzle schema: all §8.2 tables, `supplier_id` on every business table, customTypes mapping `*_qty_m`,
  `*_u5`, `*_date`, `*_at` to branded types, ULID text ids, `version` on `po`, `dc`, `invoice`.
- Unique indexes: `po(supplier_id, po_number)`; `po_item(po_id, po_item_no)`; `dc(supplier_id, number,
  financial_year)`; `dc(supplier_id, gc_number, financial_year)`; `invoice(supplier_id, number, financial_year)`;
  `invoice(dc_id)` unique; `srv(supplier_id, po_number, srv_number)`; `reconciliation_issue(fingerprint)`; partial
  unique index on `job(status) WHERE status = 'running'`.
- Migration `0001_init.sql` (drizzle-kit generated, reviewed); migrator with `schema_migration` and
  `PRAGMA user_version`; refusal when the DB is newer than the app.
- D1 executor (`db.batch`) and a CI step applying every migration on a local D1; a static check that migration SQL
  uses only `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ADD COLUMN` and the table-rebuild pattern, and no
  `TRIGGER` or `VIEW` (§8.3, INV-84).
- Optimistic concurrency helper: `UPDATE … WHERE id = ? AND version = ?` with a changes check (INV-95).
- Seed: default GST rates offered to onboarding; BHEL buyer units per Open issues.

Out of scope:

- Running migrations at startup and the pre-upgrade backup: SPEC-07 PR 3. Backup rotation and restore: SPEC-21.
- Repositories and services: SPEC-07 onward.
- The legacy database: never read (A-6, INV-49).

## 3. Dependencies

- SPEC-02, SPEC-03 (branded types), SPEC-04 (enums).
- SPEC-01 PR 3 (executor decision). If the spike changed the executor, this spec follows the recorded ADR.
- Decisions: A-3, A-4, A-6, A-10, A-13, A-15, A-26 (audit kept forever).

## 4. Design

### 4.1 Modules (`packages/db/`)

| Path                          | Responsibility                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/port.ts`                 | `Db` (`query`, `batch(statements)`), `WriteBatch` (append statements, `commit()` once), `ConflictError` on version mismatch                              |
| `src/schema/*.ts`             | one file per table group (supplier/settings/secret/buyer, auth, po, dc, invoice, srv, flags, audit, jobs, migration)                                     |
| `src/types.ts`                | Drizzle `customType`s: `qtyM`, `moneyU5`, `isoDate`, `instant`, `ulid`                                                                                   |
| `src/migrations.generated.ts` | migration SQL embedded as strings (generated from `migrations/*.sql`, freshness-checked) so the migrator needs no filesystem (C12)                       |
| `src/migrator.ts`             | `planMigrations(userVersion)`, `applyMigrations(db, plan)` (one batch, stamps `schema_migration` and `user_version`), `checkVersion` (newer DB → refuse) |
| `src/platform/node/sqlite.ts` | node:sqlite executor, PRAGMAs, `backupTo(path)` (online backup API)                                                                                      |
| `src/platform/d1/executor.ts` | D1 executor (`db.batch`)                                                                                                                                 |
| `src/seed.ts`                 | seed statements (no supplier identity; INV-78)                                                                                                           |
| `migrations/0001_init.sql`    | initial schema                                                                                                                                           |
| `test/migrations/`            | migration tests; a synthetic previous-version snapshot harness (first used by `0002`)                                                                    |

Every write in a batch carries the audit row written by the service (one per batch; §8.2 `audit_log`).

### 4.2 Columns that encode rules

- `po_item.rate_source_u5` (GST-inclusive for GEMC) and `rate_u5` (net), so the net is always re-derived from the
  source (INV-17).
- `po_item.po_rcd_qty_m`, `po_rej_qty_m` hold the PO document's values apart from derived `rcd/rej` (INV-13).
- `po_item.cancelled_at` (A-13); `manual_dispatched_qty_m` default 0, `CHECK (>= 0)`, `manual_note`,
  `manual_set_at` (A-15).
- `po_lot.entry_allow_note` for non-date entry-allow text (INV-46).
- `srv_item.challan_no`, `invoice_no` raw text plus `resolved_dc_id`, `resolved_invoice_id` (INV-38).
- `srv.po_id` nullable ("PO not found", INV-40).
- `dc`, `invoice`: no cancel column (INV-34).
- `audit_log`: no API or job deletes from it (INV-83).

### 4.3 Error handling

Executor errors surface as typed `DbError`s; a unique-index violation maps to `UniqueViolation(index)` so services
can return 409 with a plain message; a version mismatch is `ConflictError` (409).

## 5. Invariants

INV-13 (columns), INV-22, INV-23, INV-26, INV-28 (unique indexes), INV-34 (no cancel state), INV-38, INV-84 (no
triggers or views; batch-only port; dialect step), INV-95 (new: optimistic concurrency), INV-78 (seed has no
supplier identity).

## 6. Testing strategy

- Executor: a batch whose third statement fails leaves no row from the first two; PRAGMAs read back as set.
- Migrator: empty DB migrates to the expected `user_version`; a second run is a no-op with no writes; a DB with a
  higher `user_version` is refused.
- Unique indexes: literal cases (DC 100 in FY 2024-25 and 2025-26 both insert; a second DC 100 in 2025-26 fails;
  DC 344 and invoice 344 in one FY both insert).
- customTypes: round-trip of `Qty`/`Money`/`IsoDate` literals.
- Dialect: all migrations apply on local D1 in CI; the SQL lint rejects a planted `CREATE TRIGGER`.
- All against in-memory node:sqlite; no mocks of our own code.

## 7. Acceptance criteria

- [ ] Every §8.2 table and column exists with its unit suffix and type; no `REAL` column.
- [ ] Empty DB migrates on node:sqlite and on local D1 (L2 exit).
- [ ] `Db` has no `transaction()`; `WriteBatch.commit()` is all-or-nothing.
- [ ] Seed contains no supplier identity and no GSTIN-shaped string (real-data scan).
- [ ] `pnpm verify` and every CI job green.

## 8. PR plan

| #   | Title                                  | Scope / files                                                                                                                 | Checks                    | Done when                                                                                                              |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Db port and node:sqlite executor       | `src/port.ts`, `src/platform/node/sqlite.ts`, tests                                                                           | `check`                   | A failing statement rolls the whole batch back; PRAGMAs set; `backupTo` writes a readable copy.                        |
| 2   | Drizzle schema and custom types        | `src/schema/*.ts`, `src/types.ts`, tests                                                                                      | `check`                   | All §8.2 tables typed; customType round-trips pass; boundary lint passes (no `node:*` outside `platform/`).            |
| 3   | Migration 0001 and migrator            | `migrations/0001_init.sql`, `src/migrations.generated.ts` + generator in `tools/gen/`, `src/migrator.ts`, `test/migrations/*` | `check`                   | Empty DB migrates and stamps `user_version`; re-run writes nothing; newer DB refused; unique-index literal cases pass. |
| 4   | D1 executor, dialect step and SQL lint | `src/platform/d1/executor.ts`, `tools/checks/src/d1-dialect.ts`, `tools/checks/src/migration-sql-lint.ts`, `ci.yml` step      | `check`                   | Migrations apply on local D1 in CI; a planted trigger or view fails the lint.                                          |
| 5   | Version helper and seed                | `src/version.ts` (`updateWithVersion`), `src/seed.ts`, tests                                                                  | `check`, `real-data-scan` | A stale `version` yields `ConflictError`; seed inserts GST defaults only (see Open issues) and no identity.            |

## 9. Open issues

- **BHEL buyer seed.** §4 says the seed holds BHEL units and §8.2 gives `buyer.gstin` as public unit data, but C1
  forbids GSTINs in the repo and seeding only the units one supplier deals with would identify it. Conservative
  reading: seed no buyer rows; the user adds BHEL units through the existing buyers settings (legacy UI, A-2).
  Owner to confirm whether a full public list of BHEL units (with GSTINs allowlisted in the scan) should be seeded.
- **GST defaults.** Seeded as defaults that onboarding pre-fills (legacy defaults 9 % CGST, 9 % SGST, IGST shown
  but unused per A2-4); the supplier confirms them at onboarding (§10.3). Implementation detail.
- **Embedded migrations** (`migrations.generated.ts`) keep the migrator free of `node:fs` (C12) and make the SEA
  self-contained; implementation detail.
