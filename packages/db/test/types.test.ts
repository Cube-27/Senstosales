// SPEC-05 PR 2: the customTypes carry the domain's exact units through real node:sqlite unchanged (C3), and refuse a
// value that is not an integer unit on the way in or out.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { sql } from "drizzle-orm";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { afterAll, describe, expect, expectTypeOf, test } from "vite-plus/test";

import { fy, instant, isoDate, moneyU5, pctU5, qtyM, ulid, type Instant } from "../src/types.ts";
import { openNodeDb, type NodeDb } from "../src/platform/node/sqlite.ts";

const units = sqliteTable("units", {
  id: ulid("id").primaryKey(),
  qty: qtyM("qty_m"),
  money: moneyU5("money_u5"),
  pct: pctU5("pct_u5"),
  date: isoDate("some_date"),
  at: instant("some_at"),
  year: fy("financial_year"),
});

const dir = mkdtempSync(join(tmpdir(), "senstosales-types-"));
const opened: NodeDb[] = [];
afterAll(() => {
  for (const db of opened) db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function open(name: string): Promise<NodeDb> {
  const db = openNodeDb(join(dir, `${name}.db`));
  opened.push(db);
  await db.batch([
    db.build.run(
      sql`CREATE TABLE units (id TEXT PRIMARY KEY, qty_m INTEGER, money_u5 INTEGER, pct_u5 INTEGER, some_date TEXT, some_at TEXT, financial_year TEXT)`,
    ),
  ]);
  return db;
}

const row = {
  id: "01J9Z3Y7K8M2N4P6Q8R0S2T4V6",
  qty: 2500 as Qty,
  money: 84875000 as Money,
  pct: 900000 as GstPct,
  date: "2024-02-29" as IsoDate,
  at: "2025-04-01T05:30:00.000Z" as Instant,
  year: "2024-25" as Fy,
};

describe("customTypes round-trip", () => {
  test("literals come back unchanged, as integers and strings", async () => {
    const db = await open("round-trip");
    await db.batch([db.build.insert(units).values(row)]);
    expect(await db.query(db.build.select().from(units))).toEqual([row]);
    const stored = await db.query(
      db.build.values(
        sql`SELECT typeof(qty_m), typeof(money_u5), typeof(pct_u5), typeof(some_date), typeof(some_at) FROM units`,
      ),
    );
    expect(stored).toEqual([["integer", "integer", "integer", "text", "text"]]);
  });

  test("negative and zero units round-trip", async () => {
    const db = await open("signed");
    const signed = { ...row, qty: -1 as Qty, money: 0 as Money };
    await db.batch([db.build.insert(units).values(signed)]);
    expect(await db.query(db.build.select().from(units))).toEqual([signed]);
  });

  test("columns are typed with the domain's brands", () => {
    type Row = typeof units.$inferSelect;
    expectTypeOf<Row["qty"]>().toEqualTypeOf<Qty | null>();
    expectTypeOf<Row["money"]>().toEqualTypeOf<Money | null>();
    expectTypeOf<Row["pct"]>().toEqualTypeOf<GstPct | null>();
    expectTypeOf<Row["date"]>().toEqualTypeOf<IsoDate | null>();
    expectTypeOf<Row["at"]>().toEqualTypeOf<Instant | null>();
    expectTypeOf<Row["year"]>().toEqualTypeOf<Fy | null>();
    expectTypeOf<Row["id"]>().toEqualTypeOf<string>();
  });
});

describe("integer units only (C3)", () => {
  test("a fractional quantity is refused on write and nothing is stored", async () => {
    const db = await open("float-write");
    const write = db.batch([db.build.insert(units).values({ ...row, qty: 2.5 as Qty })]);
    await expect(write).rejects.toThrow("Not an integer unit: 2.5");
    expect(await db.query(db.build.values(sql`SELECT count(*) FROM units`))).toEqual([[0]]);
  });

  test("an unsafe integer is refused on write", async () => {
    const db = await open("unsafe-write");
    const write = db.batch([db.build.insert(units).values({ ...row, money: (2 ** 53) as Money })]);
    await expect(write).rejects.toThrow("Not an integer unit: 9007199254740992");
  });

  test("a REAL value already in a column is refused on read", async () => {
    const db = await open("float-read");
    await db.batch([db.build.run(sql`INSERT INTO units (id, money_u5) VALUES ('X', 1.5)`)]);
    await expect(db.query(db.build.select().from(units))).rejects.toMatchObject({
      name: "DbError",
      message: "Not an integer unit: 1.5",
    });
  });
});
