// SPEC-05 PR 5: optimistic concurrency (INV-95). An update at the current version applies and bumps it; a stale
// version fails the whole batch with ConflictError and nothing changes. Real in-memory node:sqlite throughout.
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { ConflictError, dc, invoice, po, updateWithVersion, type Versioned } from "../src/index.ts";
import type { NodeDb } from "../src/platform/node/sqlite.ts";
import * as row from "./fixtures.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await row.migratedDb();
  await row.insert(db, [
    row.po("P1", "1000000001"),
    row.dc("D1", "1", "2025-26"),
    row.invoice("V1", "1", "2025-26", null),
  ]);
});
afterEach(() => db.close());

const VERSIONED = [
  ["po", po, "P1"],
  ["dc", dc, "D1"],
  ["invoice", invoice, "V1"],
] as const;

const remarksOf = (table: Versioned, id: string) =>
  db.query(db.build.select({ remarks: table.remarks, version: table.version }).from(table).where(eq(table.id, id)));

describe("updateWithVersion", () => {
  test.each(VERSIONED)("%s at the current version applies and bumps the version to 2", async (_name, table, id) => {
    await db.batch([updateWithVersion(db, table, id, 1, { remarks: "Revised" })]);
    expect(await remarksOf(table, id)).toEqual([{ remarks: "Revised", version: 2 }]);
  });

  test("two updates in turn take the version to 3", async () => {
    await db.batch([updateWithVersion(db, po, "P1", 1, { remarks: "First" })]);
    await db.batch([updateWithVersion(db, po, "P1", 2, { remarks: "Second" })]);
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: "Second", version: 3 }]);
  });

  test.each(VERSIONED)("%s at a stale version is a ConflictError naming the table", async (name, table, id) => {
    await db.batch([updateWithVersion(db, table, id, 1, { remarks: "First" })]);
    const err = await db.batch([updateWithVersion(db, table, id, 1, { remarks: "Second" })]).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.table).toBe(name);
    expect(await remarksOf(table, id)).toEqual([{ remarks: "First", version: 2 }]);
  });

  test("a stale version rolls back the rest of its batch", async () => {
    await db.batch([updateWithVersion(db, po, "P1", 1, { remarks: "First" })]);
    const batch = db.batch([
      db.build.run(row.po("P2", "1000000002")),
      updateWithVersion(db, po, "P1", 1, { remarks: "Second" }),
    ]);
    await expect(batch).rejects.toBeInstanceOf(ConflictError);
    expect(await db.query(db.build.values(sql`SELECT id FROM po`))).toEqual([["P1"]]);
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: "First", version: 2 }]);
  });

  test("a version ahead of the row is also stale", async () => {
    const batch = db.batch([updateWithVersion(db, po, "P1", 2, { remarks: "X" })]);
    await expect(batch).rejects.toBeInstanceOf(ConflictError);
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: null, version: 1 }]);
  });

  test("a missing row updates nothing and is not a conflict (EC-25)", async () => {
    await expect(db.batch([updateWithVersion(db, po, "P9", 1, { remarks: "X" })])).resolves.toBeUndefined();
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: null, version: 1 }]);
  });
});
