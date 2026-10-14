// SPEC-05 PR 1: the Db port over the node:sqlite executor. A failing statement rolls the whole batch back, the §8.3
// PRAGMAs are set, and backupTo writes a readable copy. Real node:sqlite throughout; nothing of ours is mocked.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, expectTypeOf, test } from "vite-plus/test";

import { WriteBatch, type Db } from "../src/index.ts";
import { openNodeDb, type NodeDb } from "../src/platform/node/sqlite.ts";

const dir = mkdtempSync(join(tmpdir(), "senstosales-db-"));
const opened: NodeDb[] = [];
// Windows refuses to delete a database file that a connection still holds.
afterAll(() => {
  for (const db of opened) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function open(name: string): NodeDb {
  const db = openNodeDb(join(dir, `${name}.db`));
  opened.push(db);
  return db;
}

async function withTables(name: string): Promise<NodeDb> {
  const db = open(name);
  await db.batch([
    db.build.run(sql`CREATE TABLE parent (id TEXT PRIMARY KEY, k INTEGER NOT NULL UNIQUE)`),
    db.build.run(sql`CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))`),
  ]);
  return db;
}

const insertParent = (db: Db, id: string, k: number) =>
  db.build.run(sql`INSERT INTO parent (id, k) VALUES (${id}, ${k})`);
const parentIds = (db: Db) => db.query(db.build.values<[string]>(sql`SELECT id FROM parent ORDER BY id`));

describe("batch is all-or-nothing", () => {
  test("every statement commits together", async () => {
    const db = await withTables("batch-ok");
    await db.batch([insertParent(db, "P1", 1), insertParent(db, "P2", 2)]);
    expect(await parentIds(db)).toEqual([["P1"], ["P2"]]);
  });

  test("a failing third statement leaves no row from the batch and the connection usable", async () => {
    const db = await withTables("batch-unique");
    await db.batch([insertParent(db, "P0", 0)]);
    const failing = db.batch([
      insertParent(db, "P1", 1),
      insertParent(db, "P2", 2),
      insertParent(db, "P3", 0),
      insertParent(db, "P4", 4),
    ]);
    await expect(failing).rejects.toMatchObject({ name: "UniqueViolation", target: "parent.k" });
    expect(await parentIds(db)).toEqual([["P0"]]);

    await db.batch([insertParent(db, "P5", 5)]);
    expect(await parentIds(db)).toEqual([["P0"], ["P5"]]);
  });

  test("an error after which SQLite already rolled back surfaces as itself", async () => {
    const db = await withTables("batch-auto-rollback");
    // RAISE(ROLLBACK) ends the transaction inside SQLite, as SQLITE_FULL or an I/O error can.
    await db.batch([
      db.build.run(
        sql`CREATE TRIGGER refuse BEFORE INSERT ON parent WHEN NEW.k = 99 BEGIN SELECT RAISE(ROLLBACK, 'refused'); END`,
      ),
    ]);
    const failing = db.batch([insertParent(db, "P1", 1), insertParent(db, "P2", 99)]);
    await expect(failing).rejects.toMatchObject({ name: "DbError", message: "refused" });
    expect(await parentIds(db)).toEqual([]);
    await db.batch([insertParent(db, "P3", 3)]);
    expect(await parentIds(db)).toEqual([["P3"]]);
  });

  test("a foreign-key violation rolls the batch back", async () => {
    const db = await withTables("batch-fk");
    const failing = db.batch([
      insertParent(db, "P1", 1),
      db.build.run(sql`INSERT INTO child (id, parent_id) VALUES ('C1', 'missing')`),
    ]);
    await expect(failing).rejects.toMatchObject({ name: "DbError", message: "FOREIGN KEY constraint failed" });
    expect(await parentIds(db)).toEqual([]);
  });

  test("schema statements in a failing batch are rolled back too", async () => {
    const db = open("batch-ddl");
    const failing = db.batch([
      db.build.run(sql`CREATE TABLE t (id TEXT)`),
      db.build.run(sql`CREATE TABLE t (id TEXT)`),
    ]);
    await expect(failing).rejects.toMatchObject({ name: "DbError", message: "table t already exists" });
    expect(await db.query(db.build.values(sql`SELECT name FROM sqlite_schema`))).toEqual([]);
  });

  test("an empty batch writes nothing", async () => {
    const db = await withTables("batch-empty");
    await db.batch([]);
    expect(await parentIds(db)).toEqual([]);
  });
});

describe("WriteBatch", () => {
  test("commits its statements in one batch", async () => {
    const db = await withTables("write-batch");
    const batch = new WriteBatch(db);
    batch.add(insertParent(db, "P1", 1));
    batch.add(db.build.run(sql`INSERT INTO child (id, parent_id) VALUES ('C1', 'P1')`));
    await batch.commit();
    expect(await parentIds(db)).toEqual([["P1"]]);
    expect(await db.query(db.build.values(sql`SELECT id, parent_id FROM child`))).toEqual([["C1", "P1"]]);
  });

  test("commits once", async () => {
    const db = await withTables("write-batch-once");
    const batch = new WriteBatch(db).add(insertParent(db, "P1", 1));
    await batch.commit();
    await expect(batch.commit()).rejects.toThrow("WriteBatch already committed");
    expect(() => batch.add(insertParent(db, "P2", 2))).toThrow("WriteBatch already committed");
    expect(await parentIds(db)).toEqual([["P1"]]);
  });

  test("a failed commit writes nothing", async () => {
    const db = await withTables("write-batch-fail");
    const batch = new WriteBatch(db).add(insertParent(db, "P1", 1)).add(insertParent(db, "P2", 1));
    await expect(batch.commit()).rejects.toMatchObject({ name: "UniqueViolation", target: "parent.k" });
    expect(await parentIds(db)).toEqual([]);
  });
});

describe("query", () => {
  test("returns the rows of one statement", async () => {
    const db = await withTables("query");
    await db.batch([insertParent(db, "P1", 7)]);
    expect(await db.query(db.build.get<[string, number]>(sql`SELECT id, k FROM parent`))).toEqual(["P1", 7]);
    expect(await db.query(db.build.get(sql`SELECT id FROM parent WHERE k = 8`))).toBeUndefined();
  });

  test("a failing query surfaces as a DbError carrying the SQLite message", async () => {
    const db = open("query-error");
    const failing = db.query(db.build.values(sql`SELECT * FROM missing`));
    await expect(failing).rejects.toMatchObject({ name: "DbError", message: "no such table: missing" });
  });
});

describe("node executor", () => {
  test("sets the §8.3 PRAGMAs", async () => {
    const db = open("pragmas");
    const read = async (name: string) => (await db.query(db.build.get<[unknown]>(sql.raw(`PRAGMA ${name}`))))?.[0];
    expect({
      journal_mode: await read("journal_mode"),
      synchronous: await read("synchronous"),
      foreign_keys: await read("foreign_keys"),
      busy_timeout: await read("busy_timeout"),
      cache_size: await read("cache_size"),
      temp_store: await read("temp_store"),
    }).toEqual({
      // synchronous NORMAL = 1, temp_store MEMORY = 2
      journal_mode: "wal",
      synchronous: 1,
      foreign_keys: 1,
      busy_timeout: 30000,
      cache_size: -32000,
      temp_store: 2,
    });
  });

  test("backupTo writes a readable copy of a live database, rows still in the WAL included", async () => {
    const db = await withTables("backup-source");
    await db.batch([insertParent(db, "P1", 1), insertParent(db, "P2", 2)]);
    await db.backupTo(join(dir, "backup-copy.db"));

    const copy = open("backup-copy");
    expect(await parentIds(copy)).toEqual([["P1"], ["P2"]]);
    expect(await copy.query(copy.build.values(sql`PRAGMA integrity_check`))).toEqual([["ok"]]);
  });
});

test("the port offers no transaction() (C4)", () => {
  expectTypeOf<Db>().not.toHaveProperty("transaction");
  expectTypeOf<Db["build"]>().not.toHaveProperty("transaction");
  expectTypeOf<Db["build"]>().not.toHaveProperty("batch");
});
