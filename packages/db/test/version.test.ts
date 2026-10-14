// SPEC-05 PR 5: optimistic concurrency (INV-95). An update at the current version applies and bumps it; a stale
// version fails the whole batch with ConflictError and nothing changes. Real in-memory node:sqlite throughout.
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { applyMigrations, ConflictError, dc, invoice, MIGRATIONS, po, updateWithVersion } from "../src/index.ts";
import { openNodeDb, type NodeDb } from "../src/platform/node/sqlite.ts";
import type { Instant } from "../src/types.ts";

const AT = "2025-04-01T05:30:00.000Z";

let db: NodeDb;
beforeEach(async () => {
  db = openNodeDb(":memory:");
  await applyMigrations(db, MIGRATIONS, { appVersion: "0.1.0", appliedAt: AT as Instant });
  await db.batch(
    [
      sql`INSERT INTO supplier (id, name, bank_details_json, invoice_defaults_json) VALUES ('S1', 'Example Supplier', '{}', '{}')`,
      sql`INSERT INTO po (id, supplier_id, po_number, amend_no, is_gemc, raw_header_json, status, ord_qty_m, dsp_qty_m,
          rcd_qty_m, rej_qty_m, balance_qty_m) VALUES ('P1', 'S1', '1000000001', 0, 0, '{}', 'open', 0, 0, 0, 0, 0)`,
      sql`INSERT INTO dc (id, supplier_id, po_id, number, dc_date, financial_year, gc_number, gc_date, created_at)
          VALUES ('D1', 'S1', 'P1', '1', '2025-04-02', '2025-26', 'GC-1', '2025-04-02', ${AT})`,
      sql`INSERT INTO invoice (id, supplier_id, po_id, dc_id, kind, number, invoice_date, financial_year, cgst_pct_u5,
          sgst_pct_u5, taxable_u5, cgst_u5, sgst_u5, igst_u5, total_u5, created_at)
          VALUES ('V1', 'S1', 'P1', NULL, 'direct', '1', '2025-04-03', '2025-26', 900000, 900000, 0, 0, 0, 0, 0, ${AT})`,
    ].map((s) => db.build.run(s)),
  );
});
afterEach(() => db.close());

const remarksOf = async (table: typeof po | typeof dc | typeof invoice, id: string) =>
  db.query(db.build.select({ remarks: table.remarks, version: table.version }).from(table).where(eq(table.id, id)));

const poCount = async () => (await db.query(db.build.values<[number]>(sql`SELECT count(*) FROM po`)))[0]?.[0];

describe("updateWithVersion", () => {
  test.each([
    ["po", po, "P1"],
    ["dc", dc, "D1"],
    ["invoice", invoice, "V1"],
  ] as const)("%s at the current version applies and bumps the version to 2", async (_name, table, id) => {
    await db.batch([updateWithVersion(db, table, id, 1, { remarks: "Revised" })]);
    expect(await remarksOf(table, id)).toEqual([{ remarks: "Revised", version: 2 }]);
  });

  test("two updates in turn take the version to 3", async () => {
    await db.batch([updateWithVersion(db, po, "P1", 1, { remarks: "First" })]);
    await db.batch([updateWithVersion(db, po, "P1", 2, { remarks: "Second" })]);
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: "Second", version: 3 }]);
  });

  test.each([
    ["po", po, "P1"],
    ["dc", dc, "D1"],
    ["invoice", invoice, "V1"],
  ] as const)("%s at a stale version is a ConflictError naming the table", async (name, table, id) => {
    await db.batch([updateWithVersion(db, table, id, 1, { remarks: "First" })]);
    const err = await db.batch([updateWithVersion(db, table, id, 1, { remarks: "Second" })]).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.table).toBe(name);
    expect(await remarksOf(table, id)).toEqual([{ remarks: "First", version: 2 }]);
  });

  test("a stale version rolls back the rest of its batch", async () => {
    await db.batch([updateWithVersion(db, po, "P1", 1, { remarks: "First" })]);
    const batch = db.batch([
      db.build.run(sql`INSERT INTO po (id, supplier_id, po_number, amend_no, is_gemc, raw_header_json, status,
          ord_qty_m, dsp_qty_m, rcd_qty_m, rej_qty_m, balance_qty_m)
          VALUES ('P2', 'S1', '1000000002', 0, 0, '{}', 'open', 0, 0, 0, 0, 0)`),
      updateWithVersion(db, po, "P1", 1, { remarks: "Second" }),
    ]);
    await expect(batch).rejects.toBeInstanceOf(ConflictError);
    expect(await poCount()).toBe(1);
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: "First", version: 2 }]);
  });

  test("a version ahead of the row is also stale", async () => {
    await expect(db.batch([updateWithVersion(db, po, "P1", 2, { remarks: "X" })])).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await remarksOf(po, "P1")).toEqual([{ remarks: null, version: 1 }]);
  });
});
