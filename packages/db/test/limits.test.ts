// D1's 100-parameter limit (C4): runs of a list, how many rows of a table one insert carries, and the port refusing a
// statement over the limit on every executor.
import { inArray } from "drizzle-orm";
import { describe, expect, onTestFinished, test } from "vite-plus/test";

import { chunk, DbError, insertRows, rowsPerInsert } from "../src/index.ts";
import { buyer, dcItem, srvItem, supplier } from "../src/schema/index.ts";
import { migratedDb } from "./fixtures.ts";

describe("chunk", () => {
  test.each([
    [[], 2, []],
    [[1], 2, [[1]]],
    [[1, 2], 2, [[1, 2]]],
    [[1, 2, 3, 4, 5], 2, [[1, 2], [3, 4], [5]]],
  ])("%j in runs of %i is %j", (items, size, runs) => {
    expect(chunk(items, size)).toEqual(runs);
  });
});

describe("rowsPerInsert", () => {
  test.each([
    ["dc_item (7 columns)", dcItem, 14],
    ["srv_item (29 columns)", srvItem, 3],
    ["supplier (11 columns)", supplier, 9],
  ])("%s: %i rows", (_, table, rows) => {
    expect(rowsPerInsert(table)).toBe(rows);
  });
});

describe("the port", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `B${String(i).padStart(3, "0")}`);
  const buyers = (n: number) =>
    ids(n).map((id) => ({ id, supplierId: "S1", unitName: `Unit ${id}`, state: "X", stateCode: "99", gstin: "G" }));

  async function db() {
    const opened = await migratedDb();
    onTestFinished(() => opened.close());
    return opened;
  }

  test("reads binding 100 parameters run; 101 are refused before they run", async () => {
    const d = await db();
    const read = (n: number) =>
      d.query(
        d.build
          .select()
          .from(buyer)
          .where(inArray(buyer.id, ids(n))),
      );
    expect(await read(100)).toEqual([]);
    await expect(read(101)).rejects.toThrow(new DbError("A statement binds 101 parameters; D1 binds at most 100."));
  });

  test("a batch with one statement over the limit writes nothing; the same rows through insertRows commit", async () => {
    const d = await db();
    const all = () => d.query(d.build.select({ id: buyer.id }).from(buyer));
    // 17 rows of buyer's 6 columns bind 102 parameters.
    await expect(d.batch([d.build.insert(buyer).values(buyers(17))])).rejects.toThrow(DbError);
    expect(await all()).toEqual([]);
    await d.batch(insertRows(d, buyer, buyers(17)));
    expect(await all()).toHaveLength(17);
  });
});
