// Shared test setup: a freshly migrated in-memory DB with supplier S1, and raw row builders for the tables more than
// one test file writes. Synthetic values only (C1).
import { sql, type SQL } from "drizzle-orm";

import { applyMigrations, MIGRATIONS, type Db } from "../src/index.ts";
import { openNodeDb, type NodeDb } from "../src/platform/node/sqlite.ts";
import type { Instant } from "../src/types.ts";

export const AT = "2025-04-01T05:30:00.000Z";

/** A migrated in-memory DB holding supplier `S1`. The caller closes it. */
export async function migratedDb(): Promise<NodeDb> {
  const db = openNodeDb(":memory:");
  await applyMigrations(db, MIGRATIONS, { appVersion: "0.1.0", appliedAt: AT as Instant });
  await insert(db, [
    sql`INSERT INTO supplier (id, name, bank_details_json, invoice_defaults_json) VALUES ('S1', 'Example Supplier', '{}', '{}')`,
  ]);
  return db;
}

/** Runs raw statements as one batch. */
export const insert = (db: Db, statements: SQL[]) => db.batch(statements.map((s) => db.build.run(s)));

export const totalChanges = async (db: Db): Promise<number> =>
  (await db.query(db.build.values<[number]>(sql`SELECT total_changes()`)))[0]![0];

export const po = (id: string, number: string) =>
  sql`INSERT INTO po (id, supplier_id, po_number, amend_no, is_gemc, raw_header_json, status, ord_qty_m, dsp_qty_m,
      rcd_qty_m, rej_qty_m, balance_qty_m) VALUES (${id}, 'S1', ${number}, 0, 0, '{}', 'open', 0, 0, 0, 0, 0)`;

export const dc = (id: string, number: string, fy: string, gc = `GC-${id}`) =>
  sql`INSERT INTO dc (id, supplier_id, po_id, number, dc_date, financial_year, gc_number, gc_date, created_at)
      VALUES (${id}, 'S1', 'P1', ${number}, '2025-04-02', ${fy}, ${gc}, '2025-04-02', ${AT})`;

export const invoice = (id: string, number: string, fy: string, dcId: string | null) =>
  sql`INSERT INTO invoice (id, supplier_id, po_id, dc_id, kind, number, invoice_date, financial_year, cgst_pct_u5,
      sgst_pct_u5, taxable_u5, cgst_u5, sgst_u5, igst_u5, total_u5, created_at)
      VALUES (${id}, 'S1', 'P1', ${dcId}, ${dcId === null ? "direct" : "dc"}, ${number}, '2025-04-03', ${fy},
      900000, 900000, 0, 0, 0, 0, 0, ${AT})`;
