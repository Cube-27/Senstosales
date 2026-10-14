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
import type { Instant } from "../../src/types.ts";

const AT = "2025-04-01T05:30:00.000Z" as Instant;

function open(): NodeDb {
  const db = openNodeDb(":memory:");
  onTestFinished(() => db.close());
  return db;
}

const totalChanges = async (db: Db) => (await db.query(db.build.values<[number]>(sql`SELECT total_changes()`)))[0]?.[0];

const objects = (db: Db, type: string) =>
  db.query(db.build.values<[string]>(sql`SELECT name FROM sqlite_master WHERE type = ${type} ORDER BY name`));

async function migrated(): Promise<NodeDb> {
  const db = open();
  await applyMigrations(db, planMigrations(await readSchemaVersion(db)), { appVersion: "0.1.0", appliedAt: AT });
  return db;
}

describe("MIGRATIONS", () => {
  test("0001 is the only migration and the latest version", () => {
    expect(MIGRATIONS.map((m) => [m.version, m.name])).toEqual([[1, "init"]]);
    expect(LATEST_VERSION).toBe(1);
  });

  test("no migration statement is a transaction, PRAGMA, trigger or view (D1, INV-84)", () => {
    const statements = MIGRATIONS.flatMap((m) => m.statements);
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) expect(s).not.toMatch(/\b(BEGIN|COMMIT|PRAGMA|TRIGGER|VIEW)\b/i);
  });
});

describe("planMigrations", () => {
  test("an empty DB plans every migration", () => {
    expect(planMigrations(0).map((m) => m.version)).toEqual([1]);
  });

  test("an up-to-date DB plans nothing", () => {
    expect(planMigrations(1)).toEqual([]);
  });

  test("a DB newer than the app is refused in plain words", () => {
    expect(() => planMigrations(2)).toThrow(NewerDatabaseError);
    expect(() => planMigrations(2)).toThrow("This data was saved by a newer version of SenstoSales.");
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
    expect(await readSchemaVersion(db)).toBe(1);
    const rows = await db.query(db.build.select().from(schema.schemaMigration));
    expect(rows).toEqual([{ version: 1, name: "init", appliedAt: AT, appVersion: "0.1.0" }]);
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
    expect(await db.query(db.build.select().from(schema.schemaMigration))).toHaveLength(1);
  });

  test("a DB carrying a newer version is refused", async () => {
    const db = await migrated();
    await db.batch([db.build.run(sql`INSERT INTO schema_migration VALUES (2, 'future', ${AT}, '9.0.0')`)]);
    const version = await readSchemaVersion(db);
    expect(version).toBe(2);
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
