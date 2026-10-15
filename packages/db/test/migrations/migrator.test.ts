// SPEC-05 PR 3: an empty DB migrates and records its version in `schema_migration`, a re-run writes nothing, a
// newer DB is refused, and a failing migration leaves the DB as it was. Real in-memory node:sqlite throughout.
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, onTestFinished, test } from "vite-plus/test";

import {
  applyMigrations,
  type Db,
  DbError,
  LATEST_VERSION,
  type Migration,
  MIGRATIONS,
  NewerDatabaseError,
  planMigrations,
  readSchemaVersion,
} from "../../src/index.ts";
import * as schema from "../../src/schema/index.ts";
import { openNodeDb, type NodeDb } from "../../src/platform/node/sqlite.ts";
import { totalChanges } from "../fixtures.ts";
import type { Instant } from "../../src/types.ts";

const AT = "2025-04-01T05:30:00.000Z" as Instant;

function open(): NodeDb {
  const db = openNodeDb(":memory:");
  onTestFinished(() => db.close());
  return db;
}

const objects = (db: Db, type: string) =>
  db.query(db.build.values<[string]>(sql`SELECT name FROM sqlite_master WHERE type = ${type} ORDER BY name`));

async function migrated(): Promise<NodeDb> {
  const db = open();
  await applyMigrations(db, planMigrations(await readSchemaVersion(db)), { appVersion: "0.1.0", appliedAt: AT });
  return db;
}

describe("MIGRATIONS", () => {
  test("0004 keeps source rows verbatim and is the latest version", () => {
    expect(MIGRATIONS.map((m) => [m.version, m.name])).toEqual([
      [1, "init"],
      [2, "lookup_indexes"],
      [3, "document_fields"],
      [4, "verbatim_source_rows"],
    ]);
    expect(LATEST_VERSION).toBe(4);
  });
});

describe("planMigrations", () => {
  test("an empty DB plans every migration", () => {
    expect(planMigrations(0).map((m) => m.version)).toEqual([1, 2, 3, 4]);
  });

  test("a version-1 DB plans 0002 onwards", () => {
    expect(planMigrations(1).map((m) => m.version)).toEqual([2, 3, 4]);
  });

  test("an up-to-date DB plans nothing", () => {
    expect(planMigrations(4)).toEqual([]);
  });

  test("a DB newer than the app is refused in plain words", () => {
    expect(() => planMigrations(5)).toThrow(NewerDatabaseError);
    expect(() => planMigrations(5)).toThrow("This data was saved by a newer version of SenstoSales.");
  });

  test("only migrations above the current version are planned", () => {
    const two: Migration[] = [
      { version: 1, name: "a", statements: [] },
      { version: 2, name: "b", statements: [] },
    ];
    expect(planMigrations(1, two).map((m) => m.name)).toEqual(["b"]);
  });
});

describe("applyMigrations", () => {
  test("an empty DB has version 0", async () => {
    expect(await readSchemaVersion(open())).toBe(0);
  });

  test("an empty DB migrates to the latest version and records it", async () => {
    const db = await migrated();
    expect(await readSchemaVersion(db)).toBe(4);
    const rows = await db.query(db.build.select().from(schema.schemaMigration));
    expect(rows).toEqual([
      { version: 1, name: "init", appliedAt: AT, appVersion: "0.1.0" },
      { version: 2, name: "lookup_indexes", appliedAt: AT, appVersion: "0.1.0" },
      { version: 3, name: "document_fields", appliedAt: AT, appVersion: "0.1.0" },
      { version: 4, name: "verbatim_source_rows", appliedAt: AT, appVersion: "0.1.0" },
    ]);
  });

  test("a version-1 DB upgrades to the latest and records only the new versions", async () => {
    const db = open();
    await applyMigrations(db, planMigrations(0).slice(0, 1), { appVersion: "0.1.0", appliedAt: AT });
    await applyMigrations(db, planMigrations(await readSchemaVersion(db)), { appVersion: "0.2.0", appliedAt: AT });
    expect(await readSchemaVersion(db)).toBe(4);
    const rows = await db.query(db.build.select().from(schema.schemaMigration));
    expect(rows.map((r) => [r.version, r.appVersion])).toEqual([
      [1, "0.1.0"],
      [2, "0.2.0"],
      [3, "0.2.0"],
      [4, "0.2.0"],
    ]);
  });

  // The lookups by PO, DC, invoice and PO item that counts, deletes and SRV link resolution run (#44, #69 reviews).
  test.each([
    ["dc", "po_id", "dc_po_id_idx"],
    ["invoice", "po_id", "invoice_po_id_idx"],
    ["srv", "po_id", "srv_po_id_idx"],
    ["reconciliation_issue", "po_id", "reconciliation_issue_po_id_idx"],
    ["dc_item", "dc_id", "dc_item_dc_id_idx"],
    ["dc_item", "po_item_id", "dc_item_po_item_id_idx"],
    ["invoice_item", "invoice_id", "invoice_item_invoice_id_idx"],
    ["srv_item", "srv_id", "srv_item_srv_id_idx"],
    ["srv_item", "po_item_id", "srv_item_po_item_id_idx"],
    ["srv_item", "resolved_dc_id", "srv_item_resolved_dc_id_idx"],
    ["srv_item", "resolved_invoice_id", "srv_item_resolved_invoice_id_idx"],
  ])("a lookup on %s.%s uses %s", async (table, column, index) => {
    const db = await migrated();
    const plan = await db.query(
      db.build.values<[number, number, number, string]>(
        sql`EXPLAIN QUERY PLAN SELECT count(*) FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = 'X'`,
      ),
    );
    expect(plan.map((row) => row[3])).toEqual([`SEARCH ${table} USING COVERING INDEX ${index} (${column}=?)`]);
  });

  test("the migrated DB has every schema table with the schema's columns, and no trigger or view", async () => {
    const db = await migrated();
    const tables = Object.values(schema).map((t) => getTableConfig(t));
    expect(await objects(db, "table")).toEqual(tables.map((t) => [t.name]).sort());
    for (const t of tables) {
      const columns = await db.query(
        db.build.values<[string, string, number]>(
          sql`SELECT name, type, "notnull" FROM pragma_table_info(${t.name}) ORDER BY cid`,
        ),
      );
      expect(columns, t.name).toEqual(
        t.columns.map((c) => [c.name, c.getSQLType().toUpperCase(), c.notNull || c.primary ? 1 : 0]),
      );
    }
    expect(await objects(db, "trigger")).toEqual([]);
    expect(await objects(db, "view")).toEqual([]);
  });

  test("the migrated DB has every schema index", async () => {
    const db = await migrated();
    const names = Object.values(schema).flatMap((t) => getTableConfig(t).indexes.map((i) => i.config.name));
    const indexes = (await objects(db, "index")).map(([n]) => n).filter((n) => !n.startsWith("sqlite_autoindex"));
    expect(indexes).toEqual(expect.arrayContaining(names));
  });

  test("a re-run plans nothing and writes nothing", async () => {
    const db = await migrated();
    const before = await totalChanges(db);
    const plan = planMigrations(await readSchemaVersion(db));
    expect(plan).toEqual([]);
    await applyMigrations(db, plan, { appVersion: "0.2.0", appliedAt: AT });
    expect(await totalChanges(db)).toBe(before);
    expect(await db.query(db.build.select().from(schema.schemaMigration))).toHaveLength(4);
  });

  test("an empty plan sends no batch, so it never takes the write lock", async () => {
    const db = await migrated();
    const batches: number[] = [];
    const recording: Db = {
      build: db.build,
      query: (s) => db.query(s),
      batch: async (s) => void batches.push(s.length),
    };
    await applyMigrations(recording, [], { appVersion: "0.2.0", appliedAt: AT });
    expect(batches).toEqual([]);
  });

  test("a DB carrying a newer version is refused", async () => {
    const db = await migrated();
    await db.batch([db.build.run(sql`INSERT INTO schema_migration VALUES (5, 'future', ${AT}, '9.0.0')`)]);
    const version = await readSchemaVersion(db);
    expect(version).toBe(5);
    expect(() => planMigrations(version)).toThrow(NewerDatabaseError);
  });

  test("a migration whose last statement fails leaves no table and no version", async () => {
    const db = open();
    const [init] = MIGRATIONS;
    const broken: Migration[] = [{ ...init, statements: [...init.statements, "CREATE TABLE supplier (id TEXT)"] }];
    await expect(applyMigrations(db, broken, { appVersion: "0.1.0", appliedAt: AT })).rejects.toThrow(DbError);
    expect(await objects(db, "table")).toEqual([]);
    expect(await readSchemaVersion(db)).toBe(0);
  });
});

describe("0004 verbatim_source_rows", () => {
  test("keeps every stored SRV row, numbering each SRV's rows in id order, with the new columns empty", async () => {
    const db = open();
    await applyMigrations(db, planMigrations(0).slice(0, 3), { appVersion: "0.1.0", appliedAt: AT });
    await db.batch(
      [
        sql`INSERT INTO supplier (id, name, bank_details_json, invoice_defaults_json) VALUES ('S1', 'Example Supplier', '{}', '{}')`,
        sql`INSERT INTO srv (id, supplier_id, po_number, srv_number, srv_date, financial_year, raw_header_json)
            VALUES ('V1', 'S1', '100', '9001', '2025-04-02', '2025-26', '{}'), ('V2', 'S1', '100', '9002', '2025-04-03', '2025-26', '{}')`,
        sql`INSERT INTO srv_item (id, supplier_id, srv_id, po_item_no, lot_no, srv_item_no, ord_qty_m, rcd_qty_m)
            VALUES ('I2', 'S1', 'V1', 1, 1, 2, 5000, 5000), ('I1', 'S1', 'V1', 1, 1, 1, 5000, 4000),
                   ('I3', 'S1', 'V2', 2, 1, 1, 7000, 7000)`,
      ].map((s) => db.build.run(s)),
    );
    await applyMigrations(db, planMigrations(await readSchemaVersion(db)), { appVersion: "0.2.0", appliedAt: AT });
    const rows = await db.query(
      db.build.values(
        sql`SELECT id, srv_id, row_no, po_item_no, lot_no, srv_item_no, rcd_qty_m, rev_no, raw_row_json FROM srv_item ORDER BY id`,
      ),
    );
    expect(rows).toEqual([
      ["I1", "V1", 1, 1, 1, 1, 4000, null, null],
      ["I2", "V1", 2, 1, 1, 2, 5000, null, null],
      ["I3", "V2", 1, 2, 1, 1, 7000, null, null],
    ]);
  });
});
