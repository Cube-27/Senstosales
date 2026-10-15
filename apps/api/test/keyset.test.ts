// Keyset paging over synthetic POs (C1): the same rows in the same order at every page size, fetched lazily.
import { po } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { SQL } from "drizzle-orm";
import { and, gte, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { Keyset, KeysetPage } from "../src/repositories/keyset.ts";
import { keysetRows } from "../src/repositories/keyset.ts";
import { byPoNumber } from "../src/repositories/sql.ts";
import { d, id, rows } from "./seed-rows.ts";
import { supplierDb } from "./service-deps.ts";

// Newest PO date first (no date last), then PO number as a number, then id: mixed directions, ties on the leading
// part, and a nullable column made NOT NULL with COALESCE.
const dateKey = sql<string>`COALESCE(${po.poDate}, '')`;
const [numberKey] = byPoNumber;

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

function pages(where?: SQL) {
  const fetched: KeysetPage[] = [];
  const fetch = (page: KeysetPage) => {
    fetched.push(page);
    return db.query(
      db.build
        .select({ id: po.id, poNumber: po.poNumber, dateKey, numberKey })
        .from(po)
        .where(and(where, page.after))
        .orderBy(...page.orderBy)
        .limit(page.limit),
    );
  };
  const key: Keyset<Awaited<ReturnType<typeof fetch>>[number]> = {
    parts: [
      { by: dateKey, dir: "desc", field: "dateKey" },
      { by: numberKey, dir: "asc", field: "numberKey" },
    ],
    id: { by: po.id, dir: "asc", field: "id" },
  };
  return { key, fetch, fetched };
}

/** The PO numbers in order; past 10,000 rows it stops, so a key that repeats rows fails instead of never ending. */
async function numbers(rowsOf: AsyncIterable<{ poNumber: string }>) {
  const out: string[] = [];
  for await (const row of rowsOf) {
    out.push(row.poNumber);
    if (out.length > 10_000) break;
  }
  return out;
}

describe("keysetRows", () => {
  beforeEach(async () => {
    const r = rows(db);
    await db.batch(
      (
        [
          ["01", "4100", "2025-04-10"],
          ["02", "900", "2025-04-10"],
          ["03", "1200", "2025-04-12"],
          ["04", "77", "2025-04-10"],
          ["05", "5000", "2025-04-01"],
          ["06", "300", "2025-04-12"],
          ["07", "20", null],
        ] as const
      ).map(([tag, poNumber, poDate]) => r.po({ id: id(tag), poNumber, poDate })),
    );
  });

  it.each([1, 2, 4, 7, 500])("returns every row once, in key order, at page size %i", async (size) => {
    const { key, fetch } = pages();
    expect(await numbers(keysetRows(key, fetch, size))).toEqual(["300", "1200", "77", "900", "4100", "5000", "20"]);
  });

  it("keeps the caller's filter on every page", async () => {
    const { key, fetch } = pages(gte(po.poDate, d("2025-04-10")));
    expect(await numbers(keysetRows(key, fetch, 2))).toEqual(["300", "1200", "77", "900", "4100"]);
  });

  it("fetches a page only when the previous one has been read", async () => {
    const { key, fetch, fetched } = pages();
    const it = keysetRows(key, fetch, 2);
    expect((await it.next()).value?.poNumber).toBe("300");
    expect((await it.next()).value?.poNumber).toBe("1200");
    expect(fetched.length).toBe(1);
    expect((await it.next()).value?.poNumber).toBe("77");
    expect(fetched.map((p) => p.limit)).toEqual([2, 2]);
  });

  it("stops after a full last page with one empty fetch", async () => {
    const { key, fetch, fetched } = pages();
    expect((await numbers(keysetRows(key, fetch, 7))).length).toBe(7);
    expect(fetched.length).toBe(2);
  });

  // #58 review: the tie-break must be unique, so the type admits only a primary-key column there.
  it("takes only a primary-key column as the tie-break", () => {
    const { key } = pages();
    // @ts-expect-error -- po_number is not the primary key.
    const byNumber: typeof key = { ...key, id: { by: po.poNumber, dir: "asc", field: "poNumber" } };
    // @ts-expect-error -- an expression is not a column.
    const byExpression: typeof key = { ...key, id: { by: numberKey, dir: "asc", field: "numberKey" } };
    expect([byNumber.id.field, byExpression.id.field]).toEqual(["poNumber", "numberKey"]);
  });

  it("returns nothing from an empty table after one fetch", async () => {
    await db.batch([db.build.delete(po)]);
    const { key, fetch, fetched } = pages();
    expect(await numbers(keysetRows(key, fetch))).toEqual([]);
    expect(fetched.length).toBe(1);
  });
});

// INV-99: no row cap; the 10k-row export runs in the writer tests (packages/documents).
it("returns 1,000 rows in pages of 50, each page after the one before", async () => {
  const r = rows(db);
  await db.batch(
    Array.from({ length: 1000 }, (_, i) =>
      r.po({ id: `01J9Z8Q4S5T6V7W8X9${String(i).padStart(8, "0")}`, poNumber: String(i + 1), poDate: "2025-04-01" }),
    ),
  );
  const { key, fetch, fetched } = pages();
  const all = await numbers(keysetRows(key, fetch, 50));
  expect(all.length).toBe(1000);
  expect([all[0], all[49], all[50], all[999]]).toEqual(["1", "50", "51", "1000"]);
  expect(fetched.length).toBe(21);
});
