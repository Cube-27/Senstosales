# SPEC-05 decisions

Decisions for [SPEC-05 — Database: schema, migrations, Db port, seed](../specs/SPEC-05-db-schema-migrations.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0003 — BHEL buyer seed: none

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 5 · Status: decided
- Decision: The seed holds no buyer rows; the user adds BHEL units through the buyers settings (legacy UI).
- Alternatives: Seed a full public list of BHEL units with their GSTINs allowlisted in the real-data scan.
- Why: C1 forbids GSTINs in the repo, and seeding only the units one supplier deals with would identify it (SPEC-05 Open issues).
- Reversible: yes — a later seed migration can add the public list.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0058 — Db wraps a Drizzle async SQLite database

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: `Db` is `build` (Drizzle's builders, `transaction` and `batch` removed from the type), `query(statement)` for one read and `batch(statements)` for Drizzle batch items, all or nothing; both map failures to `DbError`. `wrapDrizzle` in `port.ts` builds it for every executor.
- Alternatives: A Drizzle-free `{ sql, params }` statement port (loses typed row mapping and the PR 2 customTypes); exposing the Drizzle db (its `transaction()` is forbidden by ADR 0002).
- Why: ADR 0002 (D-0017) says the port wraps Drizzle; one wrapper keeps node and D1 semantics identical.
- Reversible: yes.

### D-0059 — UniqueViolation carries the SQLite constraint target

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: `UniqueViolation.target` is the target SQLite reports (`table.column, …`), not an index name.
- Alternatives: Look up the index name in `sqlite_schema` on each violation.
- Why: SQLite and D1 messages name the columns, not the index; the target is still unique per index, so services can map it to a plain 409 (SPEC-05 §4.3).
- Reversible: yes.

### D-0060 — Empty batch is a no-op; second commit throws

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 1 (#22) · Status: decided
- Decision: An empty `batch` or `WriteBatch.commit()` writes nothing and succeeds; a second `commit()`, or `add()` after a commit, throws.
- Alternatives: Reject an empty batch.
- Why: An empty batch has nothing to make atomic; committing twice would split one use case's writes (C4).
- Reversible: yes.

### D-0067 — `supplier_id` on every business table

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `supplier_id` (NOT NULL, FK to `supplier`) is on every business table, child tables included: settings, secret, buyer, source_document, po, po_item, po_lot, dc, dc_item, invoice, invoice_item, srv, srv_item, reconciliation_issue. It is not on supplier, app_user, session, audit_log, job, job_event or schema_migration.
- Alternatives: Only on top-level documents; on every table.
- Why: ARCHITECTURE §8 says "every business table"; the literal reading is the conservative one. Auth, audit, jobs and migrations are install-level.
- Reversible: yes, before 0001 ships.

### D-0068 — Foreign keys only on ownership edges

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Foreign keys only on child → parent document, `session.user_id`, `job_event.job_id` and `supplier_id`. No FKs on matched or resolved links (`srv.po_id`, `srv_item.po_item_id`, `resolved_dc_id`, `resolved_invoice_id`, the flag's `scope_id`/`po_id`, `po.buyer_id`, the `job_id` on audit_log and source_document). No `ON DELETE` actions.
- Alternatives: FKs on every id column; none.
- Why: Links are recomputed by service batches (§6.10), and their delete rules belong to services (`deleteBlock`, INV-35). An FK would turn a PO or buyer delete into a raw DbError.
- Reversible: yes, before 0001 ships.

### D-0069 — Extra customTypes `pctU5` and `fy`

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Besides the five SPEC-05 §4.1 customTypes, `pctU5` maps `cgst_pct_u5`/`sgst_pct_u5` to `GstPct` and `fy` maps `financial_year` to `Fy`. `ulid` stays an unbranded `string`. `Instant` is a brand in `packages/db/src/types.ts`.
- Alternatives: GST percentages in a `moneyU5` column; branded ids.
- Why: GstPct is 1e-5 units but not money, and FY values come only from `fyOf`. Ids arrive from the API as plain strings (`zId`), so branding them would add casts with no check behind them.
- Reversible: yes.

### D-0070 — Integer-unit columns refuse non-integers

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Integer-unit columns throw `DbError("Not an integer unit: …")` for a non-safe-integer, on write and on read. Text brands are not re-validated.
- Alternatives: No check; a SQL `CHECK (typeof(x) = 'integer')`.
- Why: C3 forbids floats in columns, and SQLite INTEGER affinity silently stores 2.5 as REAL. Text values were validated where they entered.
- Reversible: yes.

### D-0071 — Nullable SRV item quantities

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `srv_item.rcd_qty_m`, `accepted_qty_m` and `rej_qty_m` are nullable; `ord_qty_m` is NOT NULL.
- Alternatives: NOT NULL, as `zSrvItem` declares.
- Why: The domain's `SrvLine` reads them as `Qty | null` and falls back from rcd to accepted (INV-11), so storage keeps what the page lacks. SPEC-10's read mapping can normalise.
- Reversible: yes.

### D-0072 — Derived columns have no default

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Derived columns (`status` and the `*_qty_m` totals on po and po_item) are NOT NULL with no default. Only `manual_dispatched_qty_m` (0), `version` (1) and `job.cancel_requested` (false) have defaults.
- Alternatives: Default 0 / `Pending`.
- Why: A default would let an insert skip the recompute, and `balance_qty_m` has no correct default.
- Reversible: yes.

### D-0073 — `app_user` and `session` columns

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: `app_user`: `username` (unique), `password_hash`, `password_changed_at` (nullable). `session`: `user_id`, `token_hash` (unique), `created_at`, `expires_at`.
- Alternatives: Decide in SPEC-07 via migration 0002.
- Why: EC-08's reset rule needs to know whether the password was changed, and remember-me needs an expiry. These are the smallest columns that support both.
- Reversible: yes, before 0001 ships.

### D-0074 — Enum TEXT columns typed in TypeScript only

- Date: 2026-10-14 · Spec/PR: SPEC-05 PR 2 (#25) · Status: decided
- Decision: Enum-valued TEXT columns are typed in TypeScript only (domain `ItemStatus`, `PoStatus`, `FlagType`, `FlagScope`; schemas `zJobType`/`zJobStatus`/`zFlagStatus`/`zInvoiceKind`), with no SQL CHECK.
- Alternatives: A CHECK per enum.
- Why: Adding a value later would need the table-rebuild pattern, and every writer is already typed.
- Reversible: yes.

### D-0084 — Schema version source

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: The schema version is `max(version)` in `schema_migration` on every build; `PRAGMA user_version` is neither written nor read. Supersedes D-0017's `user_version` wording. ARCHITECTURE §8.2/§13.3 (revision 1.5), SPEC-05, SPEC-07 (calls `readSchemaVersion`), INV-82 and ADR 0002 updated. The owner delegated this decision to the orchestrator.
- Alternatives: Mirror the version into `user_version` on the node build, as D-0017 said.
- Why: One version source that works on both executors; D1 refuses `PRAGMA user_version` (ADR 0002).
- Reversible: yes, before SPEC-07 ships.

### D-0085 — `checkVersion` folded into `planMigrations`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `planMigrations` throws `NewerDatabaseError` ("This data was saved by a newer version of SenstoSales."), so no caller can plan without the check.
- Alternatives: A separate `checkVersion`, as the SPEC-05 §4.1 table listed.
- Why: One call; the check cannot be skipped.
- Reversible: yes.

### D-0086 — Migrations numbered from 1

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: drizzle-kit's `0000` is renamed `0001_init.sql` and its journal edited to `idx: 1`, so the next is `0002`; the meta snapshot is committed.
- Alternatives: Keep drizzle-kit's 0-based numbering.
- Why: The spec names `0001_init.sql`, and version 0 means an empty DB.
- Reversible: yes.

### D-0087 — Migration stamp values from the caller

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `applyMigrations` takes `{ appVersion, appliedAt }` from its caller.
- Alternatives: Read the clock and app version inside the migrator.
- Why: The Clock port and the VERSION file belong to SPEC-07.
- Reversible: yes.

### D-0088 — Generated files not formatted

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: `**/*.generated.ts` is in the Oxfmt `ignorePatterns`; the generator's freshness test is its check.
- Alternatives: Format the output in the generator.
- Why: One source of truth for the file's content.
- Reversible: yes.

### D-0089 — Snapshot harness deferred to migration 0002

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 3 (#26) · Status: decided
- Decision: The previous-version snapshot harness waits for `0002` (SPEC-05: "first used by 0002"); `planMigrations` already takes a migration list for it.
- Alternatives: Build it now with nothing to exercise.
- Why: No speculative code.
- Reversible: yes.

### D-0119 — D1 executor builds the batch itself

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: `openD1Db` renders each statement with `SQLiteAsyncDialect.sqlToQuery(statement.getSQL())` and sends one `binding.batch()`; Drizzle's own D1 batch is not used.
- Alternatives: Drizzle's `db.batch`; a pnpm patch to drizzle-orm's `d1/session.js`.
- Why: drizzle-orm 0.45.4's D1 batch throws on a raw `run(sql)` with parameters (it binds a statement it never prepared). The port's batch returns no rows, so nothing is lost; a patch would be carried across upgrades. Covered by `packages/db/test/d1.test.ts`.
- Reversible: yes.

### D-0120 — `wrapDrizzle` takes `runBatch`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: Each executor passes its native batch to `wrapDrizzle(drizzleDb, runBatch)`; the port keeps the empty-batch no-op and the error mapping. `Statement` is `BatchItem<"sqlite"> & SQLWrapper`.
- Alternatives: A `BatchingDatabase` type that assumes Drizzle's batch works on every driver.
- Why: The smallest seam that lets D1 use its own batch (D-0119).
- Reversible: yes.

### D-0121 — Local D1 is miniflare in-memory

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: The D1 tests and dialect step use `miniflare` 4.20260730.0 (MIT), a dev dependency of `tools/checks` and `packages/db`. The override `miniflare>sharp: "-"` removes sharp (loaded lazily, only for the Images binding) and its LGPL libvips packages (C13); workerd's install script is not run.
- Alternatives: `wrangler d1 execute --local` with a config file and a persisted directory, as in the spike (pulls in sharp the same way).
- Why: No account, config file or persisted state, and it runs the real migrator and D1 executor.
- Reversible: yes.

### D-0122 — D1 dialect step inside `check:code`

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: The migration SQL lint and the D1 dialect step run in the `check:code` script (CI `check` job), not a new job.
- Alternatives: A separate `d1-dialect` CI job.
- Why: No new required check for the ruleset (H1), and `pnpm verify` stays the sum of the jobs.
- Reversible: yes.

### D-0123 — Migration SQL lint scope

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 4 (#33) · Status: decided
- Decision: Beyond the §8.3 allowlist the lint refuses every `PRAGMA` (including drizzle-kit's `foreign_keys=OFF/ON` around rebuilds), `DROP TABLE` outside a rebuild, a `RENAME` other than `__new_x` → `x` or before its `DROP`, a rebuild left unrenamed, and more than one statement between breakpoints (a `;` inside a string literal too).
- Alternatives: Allowlist statement prefixes only.
- Why: A prefix-only allowlist lets a trigger hide after an allowed statement and lets an arbitrary `DROP` through. FK handling during a rebuild stays the ADR 0002 open item, settled with the first rebuild migration.
- Reversible: yes.

### D-0124 — Stale version detected inside the statement

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: `updateWithVersion` sets `version = CASE WHEN version = expected THEN version + 1 ELSE NULL END`, so a stale row fails its NOT NULL constraint and the whole batch rolls back. The port maps `NOT NULL constraint failed: (po|dc|invoice).version` to `ConflictError` (409). This supersedes the "changes check" wording of ARCHITECTURE §8.1 and SPEC-05 §2 (owner delegated the wording fix to the orchestrator; revision 1.6).
- Alternatives: A `changes()` check after the batch (`batch()` returns void and the other statements would already be committed); a `RAISE()` guard (triggers only, forbidden by INV-84); a read before the batch (racy; no interactive transaction, C4).
- Why: INV-95 requires that nothing changes on a stale version. This is the only check that runs inside the one all-or-nothing batch, on node:sqlite and D1.
- Reversible: yes.

### D-0125 — Seed is a statement builder run by onboarding

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: `seedStatements(db, supplierId, rates = GST_DEFAULTS)` builds the supplier's GST `settings` rows for onboarding's batch; nothing is seeded into an empty DB. Keys `cgst_pct` and `sgst_pct` (`GST_KEYS`), values decimal strings from `pctToString` (`9`). Defaults 9 % CGST and 9 % SGST; IGST has no setting (A2-4).
- Alternatives: A supplier-less settings row; seeding at migration time.
- Why: `settings` is keyed by `(supplier_id, key)`, and no supplier exists before onboarding (INV-78).
- Reversible: yes.

### D-0126 — Edit of a deleted row (EC-25)

- Date: 2026-10-15 · Spec/PR: SPEC-05 PR 5 (#32) · Status: decided
- Decision: A versioned update of a missing row writes nothing and raises no conflict; services check that the row exists when they read its version. To revisit in SPEC-11.
- Alternatives: Treat it as a conflict (not detectable inside the batch without a trigger or a read).
- Why: INV-95 specifies only the stale-version case (C18).
- Reversible: yes.

### D-0397 — Lookup indexes (migration 0002)

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: Plain indexes `<table>_<column>_idx` on `po_id` of dc, invoice, srv and reconciliation_issue; `dc_item(dc_id)`, `dc_item(po_item_id)`, `invoice_item(invoice_id)`, `srv_item(resolved_dc_id)`, `srv_item(resolved_invoice_id)`.
- Alternatives: Composite indexes with `supplier_id`.
- Why: The counts, deletes and link resolution the #44 and #69 reviews named look up by these columns alone.
- Reversible: yes, a later migration can drop them.
