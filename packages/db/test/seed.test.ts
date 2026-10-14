// SPEC-05 PR 5: the seed holds GST defaults only (INV-78): 9 % CGST and 9 % SGST, written as the supplier's
// settings rows by onboarding's batch. Nothing else is written. Real in-memory node:sqlite.
import type { GstPct } from "@senstosales/domain";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { GST_DEFAULTS, seedStatements } from "../src/index.ts";
import type { NodeDb } from "../src/platform/node/sqlite.ts";
import { migratedDb, totalChanges } from "./fixtures.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await migratedDb();
});
afterEach(() => db.close());

const settingsRows = () => db.query(db.build.values(sql`SELECT supplier_id, key, value FROM settings ORDER BY key`));

test("GST defaults are 9 % CGST and 9 % SGST, in 1e-5 units", () => {
  expect(GST_DEFAULTS).toEqual({ cgstPct: 900000, sgstPct: 900000 });
});

test("the seed writes the two GST settings rows and nothing else", async () => {
  const before = await totalChanges(db);
  await db.batch(seedStatements(db, "S1"));
  expect(await totalChanges(db)).toBe(before + 2);
  expect(await settingsRows()).toEqual([
    ["S1", "cgst_pct", "9"],
    ["S1", "sgst_pct", "9"],
  ]);
});

test("the seed writes the rates it is given", async () => {
  await db.batch(seedStatements(db, "S1", { cgstPct: 625000 as GstPct, sgstPct: 250000 as GstPct }));
  expect(await settingsRows()).toEqual([
    ["S1", "cgst_pct", "6.25"],
    ["S1", "sgst_pct", "2.5"],
  ]);
});
