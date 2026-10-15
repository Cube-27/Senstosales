// D1's 100-parameter limit (C4): runs of a list, and how many rows of a table one insert carries.
import { describe, expect, test } from "vite-plus/test";

import { chunk, MAX_BOUND_PARAMS, rowsPerInsert } from "../src/index.ts";
import { dcItem, srvItem, supplier } from "../src/schema/index.ts";

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
    ["dc_item (6 columns)", dcItem, 16],
    ["srv_item (18 columns)", srvItem, 5],
    ["supplier (11 columns)", supplier, 9],
  ])("%s: %i rows", (_, table, rows) => {
    expect(rowsPerInsert(table)).toBe(rows);
  });

  test("the limit is D1's", () => {
    expect(MAX_BOUND_PARAMS).toBe(100);
  });
});
