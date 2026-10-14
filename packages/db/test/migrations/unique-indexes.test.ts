// SPEC-05 PR 3: the unique indexes of migration 0001, literal cases (INV-22, INV-23, INV-26, INV-28). Each case
// inserts into a freshly migrated in-memory DB and expects the row in or a UniqueViolation naming its target.
import { sql, type SQL } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, test } from "vite-plus/test";

import { applyMigrations, MIGRATIONS, UniqueViolation } from "../../src/index.ts";
import { openNodeDb, type NodeDb } from "../../src/platform/node/sqlite.ts";
import type { Instant } from "../../src/types.ts";

const AT = "2025-04-01T05:30:00.000Z";

let db: NodeDb;
beforeEach(async () => {
  db = openNodeDb(":memory:");
  await applyMigrations(db, MIGRATIONS, { appVersion: "0.1.0", appliedAt: AT as Instant });
  await insert([
    sql`INSERT INTO supplier (id, name, bank_details_json, invoice_defaults_json) VALUES ('S1', 'Example Supplier', '{}', '{}')`,
    po("P1", "1000000001"),
    po("P2", "1000000002"),
    poItem("I1", "P1", 10),
    dc("D1", "100", "2025-26"),
    dc("D2", "101", "2025-26"),
  ]);
});
afterEach(() => db.close());

const insert = (statements: SQL[]) => db.batch(statements.map((s) => db.build.run(s)));

const po = (id: string, number: string) =>
  sql`INSERT INTO po (id, supplier_id, po_number, amend_no, is_gemc, raw_header_json, status, ord_qty_m, dsp_qty_m,
      rcd_qty_m, rej_qty_m, balance_qty_m) VALUES (${id}, 'S1', ${number}, 0, 0, '{}', 'open', 0, 0, 0, 0, 0)`;

const poItem = (id: string, poId: string, itemNo: number) =>
  sql`INSERT INTO po_item (id, supplier_id, po_id, po_item_no, ord_qty_m, rate_source_u5, rate_u5, po_rcd_qty_m,
      dsp_qty_m, rcd_qty_m, rej_qty_m, balance_qty_m, uninvoiced_qty_m, status)
      VALUES (${id}, 'S1', ${poId}, ${itemNo}, 1000, 100000, 100000, 0, 0, 0, 0, 1000, 0, 'open')`;

const dc = (id: string, number: string, fy: string, gc = `GC-${id}`) =>
  sql`INSERT INTO dc (id, supplier_id, po_id, number, dc_date, financial_year, gc_number, gc_date, created_at)
      VALUES (${id}, 'S1', 'P1', ${number}, '2025-04-02', ${fy}, ${gc}, '2025-04-02', ${AT})`;

const invoice = (id: string, number: string, fy: string, dcId: string | null) =>
  sql`INSERT INTO invoice (id, supplier_id, po_id, dc_id, kind, number, invoice_date, financial_year, cgst_pct_u5,
      sgst_pct_u5, taxable_u5, cgst_u5, sgst_u5, igst_u5, total_u5, created_at)
      VALUES (${id}, 'S1', 'P1', ${dcId}, ${dcId === null ? "direct" : "dc"}, ${number}, '2025-04-03', ${fy},
      900000, 900000, 0, 0, 0, 0, 0, ${AT})`;

const srv = (id: string, poNumber: string, number: string) =>
  sql`INSERT INTO srv (id, supplier_id, po_number, srv_number, srv_date, financial_year, raw_header_json)
      VALUES (${id}, 'S1', ${poNumber}, ${number}, '2025-04-05', '2025-26', '{}')`;

const issue = (id: string, fingerprint: string) =>
  sql`INSERT INTO reconciliation_issue (id, supplier_id, type, scope_type, scope_id, po_id, fingerprint,
      details_json, status, opened_at) VALUES (${id}, 'S1', 'qty', 'po', 'P1', 'P1', ${fingerprint}, '{}', 'open', ${AT})`;

const job = (id: string, status: string) =>
  sql`INSERT INTO job (id, type, status, created_at, progress_json) VALUES (${id}, 'import', ${status}, ${AT}, '{}')`;

describe("unique indexes accept distinct keys", () => {
  test.each<[string, SQL[]]>([
    ["DC 100 in FY 2024-25 beside DC 100 in 2025-26", [dc("D3", "100", "2024-25")]],
    ["DC 344 and invoice 344 in one FY", [dc("D3", "344", "2025-26"), invoice("V1", "344", "2025-26", null)]],
    ["the same GC number in another FY", [dc("D3", "102", "2024-25", "GC-D1")]],
    ["invoice 1 in two FYs", [invoice("V1", "1", "2024-25", null), invoice("V2", "1", "2025-26", null)]],
    ["two direct invoices (no DC)", [invoice("V1", "1", "2025-26", null), invoice("V2", "2", "2025-26", null)]],
    ["item 10 on two POs", [poItem("I2", "P2", 10)]],
    ["SRV 1 on two POs", [srv("R1", "1000000001", "1"), srv("R2", "1000000002", "1")]],
    ["two finished jobs", [job("J1", "succeeded"), job("J2", "succeeded")]],
    ["one running job beside a queued one", [job("J1", "running"), job("J2", "queued")]],
  ])("%s", async (_name, statements) => {
    await expect(insert(statements)).resolves.toBeUndefined();
  });
});

describe("unique indexes refuse a duplicate key", () => {
  test.each<[string, SQL[], string]>([
    ["a second DC 100 in FY 2025-26", [dc("D3", "100", "2025-26")], "dc.supplier_id, dc.number, dc.financial_year"],
    [
      "a second GC number in one FY",
      [dc("D3", "102", "2025-26", "GC-D1")],
      "dc.supplier_id, dc.gc_number, dc.financial_year",
    ],
    [
      "a second invoice 1 in one FY",
      [invoice("V1", "1", "2025-26", null), invoice("V2", "1", "2025-26", null)],
      "invoice.supplier_id, invoice.number, invoice.financial_year",
    ],
    [
      "a second invoice for one DC",
      [invoice("V1", "1", "2025-26", "D1"), invoice("V2", "2", "2025-26", "D1")],
      "invoice.dc_id",
    ],
    ["a second PO 1000000001", [po("P3", "1000000001")], "po.supplier_id, po.po_number"],
    ["a second item 10 on one PO", [poItem("I2", "P1", 10)], "po_item.po_id, po_item.po_item_no"],
    [
      "a second SRV 1 on one PO",
      [srv("R1", "1000000001", "1"), srv("R2", "1000000001", "1")],
      "srv.supplier_id, srv.po_number, srv.srv_number",
    ],
    ["a second issue with one fingerprint", [issue("F1", "x"), issue("F2", "x")], "reconciliation_issue.fingerprint"],
    ["a second running job", [job("J1", "running"), job("J2", "running")], "job.status"],
  ])("%s", async (_name, statements, target) => {
    const err = await insert(statements).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UniqueViolation);
    expect((err as UniqueViolation).target).toBe(target);
  });
});
