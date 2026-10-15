// Keyset paging over synthetic POs (C1): the same rows in the same order at every page size, fetched lazily.
import { po } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { and, eq, gte, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { KeyPart, KeysetPage } from "../src/repositories/keyset.ts";
import { keysetRows } from "../src/repositories/keyset.ts";
import { d, id, rows } from "./seed-rows.ts";
import { supplierDb } from "./service-deps.ts";

type PoRow = { id: string; poNumber: string; poDate: string | null };

// Newest PO date first (no date last), then PO number as a number, then id: mixed directions, ties on the leading
// part, and a nullable column made NOT NULL with COALESCE.
const KEY: KeyPart<PoRow>[] = [
  { by: sql`COALESCE(${po.poDate}, '')`, dir: "desc", of: (r) => r.poDate ?? "" },
  { by: sql`CAST(${po.poNumber} AS INTEGER)`, dir: "asc", of: (r) => Number(r.poNumber) },
  { by: po.id, dir: "asc", of: (r) => r.id },
];

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

function pages(where?: ReturnType<typeof gte>) {
  const fetched: KeysetPage[] = [];
  const fetch = (page: KeysetPage) => {
    fetched.push(page);
    return db.query(
      db.build
        .select({ id: po.id, poNumber: po.poNumber, poDate: po.poDate })
        .from(po)
        .where(and(where, page.after))
        .orderBy(...page.orderBy)
        .limit(page.limit),
    );
  };
  return { fetch, fetched };
}

/** The PO numbers in order; past 10,000 rows it stops, so a key that repeats rows fails instead of never ending. */
async function numbers(rowsOf: AsyncIterable<PoRow>) {
  const out: string[] = [];
  for await (const row of rowsOf) {
    out.push(row.poNumber);
    if (out.length > 10_000) break;
  }
  return out;
}

async function seed(...pos: [tag: string, poNumber: string, poDate: string | null][]) {
  const r = rows(db);
  await db.batch(
    pos.flatMap(([tag, poNumber, poDate]) => [
      r.po({ id: id(tag), poNumber, poDate: poDate ?? "2025-04-01" }),
      ...(poDate === null
        ? [
            db.build
              .update(po)
              .set({ poDate: null })
              .where(eq(po.id, id(tag))),
          ]
        : []),
    ]),
  );
}

describe("keysetRows", () => {
  beforeEach(() =>
    seed(
      ["01", "4100", "2025-04-10"],
      ["02", "900", "2025-04-10"],
      ["03", "1200", "2025-04-12"],
      ["04", "77", "2025-04-10"],
      ["05", "5000", "2025-04-01"],
      ["06", "300", "2025-04-12"],
      ["07", "20", null],
    ),
  );

  it.each([1, 2, 4, 7, 500])("returns every row once, in key order, at page size %i", async (size) => {
    const all = ["300", "1200", "77", "900", "4100", "5000", "20"];
    expect(await numbers(keysetRows(KEY, pages().fetch, size))).toEqual(all);
  });

  it("keeps the caller's filter on every page", async () => {
    const { fetch } = pages(gte(po.poDate, d("2025-04-10")));
    expect(await numbers(keysetRows(KEY, fetch, 2))).toEqual(["300", "1200", "77", "900", "4100"]);
  });

  it("fetches a page only when the previous one has been read", async () => {
    const { fetch, fetched } = pages();
    const it = keysetRows(KEY, fetch, 2);
    expect((await it.next()).value?.poNumber).toBe("300");
    expect((await it.next()).value?.poNumber).toBe("1200");
    expect(fetched.length).toBe(1);
    expect((await it.next()).value?.poNumber).toBe("77");
    expect(fetched.map((p) => p.limit)).toEqual([2, 2]);
  });

  it("stops after a full last page with one empty fetch", async () => {
    const { fetch, fetched } = pages();
    expect((await numbers(keysetRows(KEY, fetch, 7))).length).toBe(7);
    expect(fetched.length).toBe(2);
  });
});

describe("keysetRows over 10k rows (INV-99)", () => {
  // Seeding 10k rows one statement at a time takes seconds on a busy runner; the default 5 s timeout is too tight.
  it("returns all 10k rows with no row cap, in pages of the given size", async () => {
    const r = rows(db);
    await db.batch(
      Array.from({ length: 10_000 }, (_, i) =>
        r.po({ id: `01J9Z8Q4S5T6V7W8X9${String(i).padStart(8, "0")}`, poNumber: String(i + 1), poDate: "2025-04-01" }),
      ),
    );
    const { fetch, fetched } = pages();
    const all = await numbers(keysetRows(KEY, fetch, 500));
    expect(all.length).toBe(10_000);
    expect([all[0], all[499], all[500], all[9999]]).toEqual(["1", "500", "501", "10000"]);
    expect(fetched.length).toBe(21);
  }, 30_000);

  it("returns nothing from an empty table after one fetch", async () => {
    const { fetch, fetched } = pages();
    expect(await numbers(keysetRows(KEY, fetch))).toEqual([]);
    expect(fetched.length).toBe(1);
  });
});
