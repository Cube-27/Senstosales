// SPEC-05 PR 5: the seed holds GST defaults only (INV-78): 9 % CGST and 9 % SGST, written as the supplier's
// settings rows by onboarding's batch. Nothing else is written. Real in-memory node:sqlite.
import type { GstPct } from "@senstosales/domain";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { applyMigrations, GST_DEFAULTS, MIGRATIONS, seedStatements } from "../src/index.ts";
import { openNodeDb, type NodeDb } from "../src/platform/node/sqlite.ts";
import type { Instant } from "../src/types.ts";

let db: NodeDb;
beforeEach(async () => {
  db = openNodeDb(":memory:");
  await applyMigrations(db, MIGRATIONS, { appVersion: "0.1.0", appliedAt: "2025-04-01T05:30:00.000Z" as Instant });
  await db.batch([
    db.build.run(
      sql`INSERT INTO supplier (id, name, bank_details_json, invoice_defaults_json) VALUES ('S1', 'Example Supplier', '{}', '{}')`,
    ),
  ]);
});
afterEach(() => db.close());

const changes = async () => (await db.query(db.build.values<[number]>(sql`SELECT total_changes()`)))[0]?.[0];

test("GST defaults are 9 % CGST and 9 % SGST, in 1e-5 units", () => {
  expect(GST_DEFAULTS).toEqual({ cgstPct: 900000, sgstPct: 900000 });
});

test("the seed writes the two GST settings rows and nothing else", async () => {
  const before = await changes();
  await db.batch(seedStatements(db, "S1"));
  expect(await changes()).toBe((before ?? 0) + 2);
  expect(await db.query(db.build.values(sql`SELECT supplier_id, key, value FROM settings ORDER BY key`))).toEqual([
    ["S1", "cgst_pct", "9"],
    ["S1", "sgst_pct", "9"],
  ]);
});

test("the seed writes the rates it is given", async () => {
  await db.batch(seedStatements(db, "S1", { cgstPct: 625000 as GstPct, sgstPct: 250000 as GstPct }));
  expect(await db.query(db.build.values(sql`SELECT key, value FROM settings ORDER BY key`))).toEqual([
    ["cgst_pct", "6.25"],
    ["sgst_pct", "2.5"],
  ]);
});
