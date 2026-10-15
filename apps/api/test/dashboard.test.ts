// SPEC-10 PR 6: dashboard summary and recent activity over HTTP, today 2025-06-01 (month from 2025-06-01, 30 days
// from 2025-05-02). Synthetic rows; expected values worked by hand from the legacy dashboard's rules (SPEC-10 §2).
import { auditLog } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { d, id, m, readApp, recompute, rows } from "./seed-rows.ts";
import { supplierDb } from "./service-deps.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

const [PA, PB, PC] = [id("PA"), id("PB"), id("PC")];

/**
 * - PA 4500001, 2025-04-10, value 1000: item ord 10 @ 100, lot due 2025-05-15 (overdue); DC-1 2025-04-20 dispatches
 *   4 and INV-1 2025-04-21 (total 472) invoices it; SRV-1 2025-05-01 receives 3 -> dsp 4, balance 6. Lead 21 days.
 * - PB 4500002, 2025-05-20, value 300: ord 3 @ 100, lot due 2025-06-10; DC-2 2025-05-25 dispatches 1, no invoice;
 *   SRV-2 2025-05-30 receives 1 -> balance 2. Lead 10 days.
 * - PC 4500003, 2025-06-01, value 200: ord 2 @ 50; PO-direct INV-2 2025-06-01 (total 100) invoices 1 -> balance 1.
 * - One open and one acknowledged flag.
 */
async function seed() {
  const r = rows(db);
  await db.batch([
    r.po({ id: PA, poNumber: "4500001", poDate: "2025-04-10", poValue: 1000_00000 }),
    r.po({ id: PB, poNumber: "4500002", poDate: "2025-05-20", poValue: 300_00000 }),
    r.po({ id: PC, poNumber: "4500003", poDate: "2025-06-01", poValue: 200_00000 }),
    r.item({ id: id("A1"), poId: PA, poItemNo: 10, ordQty: 10_000 }),
    r.item({ id: id("B1"), poId: PB, poItemNo: 10, ordQty: 3_000 }),
    r.item({ id: id("C1"), poId: PC, poItemNo: 10, ordQty: 2_000, rateSource: m(50_00000), rate: m(50_00000) }),
    r.lot({ id: id("TA"), poItemId: id("A1"), lotNo: 1, delyQty: 10_000, delyDate: d("2025-05-15") }),
    r.lot({ id: id("TB"), poItemId: id("B1"), lotNo: 1, delyQty: 3_000, delyDate: d("2025-06-10") }),
    r.dc({ id: id("DA"), poId: PA, number: "DC-1", dcDate: "2025-04-20", createdAt: "2025-04-20T00:00:00.000Z" }),
    r.dcItem({ id: id("DX"), dcId: id("DA"), poItemId: id("A1"), dspQty: 4_000 }),
    r.dc({ id: id("DB"), poId: PB, number: "DC-2", dcDate: "2025-05-25", createdAt: "2025-05-25T00:00:00.000Z" }),
    r.dcItem({ id: id("DY"), dcId: id("DB"), poItemId: id("B1"), dspQty: 1_000 }),
    r.invoice({
      id: id("NA"),
      poId: PA,
      dcId: id("DA"),
      number: "INV-1",
      invoiceDate: "2025-04-21",
      total: 472_00000,
      createdAt: "2025-04-21T00:00:00.000Z",
    }),
    r.invoiceItem({ id: id("NX"), invoiceId: id("NA"), poItemId: id("A1"), dcItemId: id("DX"), qty: 4_000 }),
    r.invoice({
      id: id("NB"),
      poId: PC,
      number: "INV-2",
      invoiceDate: "2025-06-01",
      total: 100_00000,
      createdAt: "2025-06-01T03:00:00.000Z",
    }),
    r.invoiceItem({ id: id("NY"), invoiceId: id("NB"), poItemId: id("C1"), qty: 1_000 }),
    r.srv({ id: id("RA"), poNumber: "4500001", poId: PA, srvNumber: "SRV-1", srvDate: "2025-05-01" }),
    r.srvItem({ id: id("RX"), srvId: id("RA"), poItemId: id("A1"), rcdQty: 3_000 }),
    r.srv({ id: id("RB"), poNumber: "4500002", poId: PB, srvNumber: "SRV-2", srvDate: "2025-05-30" }),
    r.srvItem({ id: id("RY"), srvId: id("RB"), poItemId: id("B1"), rcdQty: 1_000 }),
    r.flag({ id: id("FA"), poId: PA, scopeType: "po_item", scopeId: id("A1"), status: "open" }),
    r.flag({ id: id("FB"), poId: PB, scopeType: "po_item", scopeId: id("B1"), status: "acknowledged" }),
    // When each PO entered the system: its first ingest or manual create, not a later re-ingest or edit.
    r.poAudit({ id: id("GA"), poId: PA, at: "2025-04-10T06:00:00.000Z" }),
    r.poAudit({ id: id("GB"), poId: PA, at: "2025-05-28T06:00:00.000Z" }),
    r.poAudit({ id: id("GC"), poId: PA, at: "2025-06-01T09:00:00.000Z", action: "po.update" }),
    r.poAudit({ id: id("GD"), poId: PB, at: "2025-05-20T06:00:00.000Z", action: "po.create" }),
    r.poAudit({ id: id("GE"), poId: PC, at: "2025-06-01T02:00:00.000Z" }),
  ]);
  await recompute(db, PA, PB, PC);
}

const get = async (path: string, signedIn = true) => readApp(db, signedIn)(path);

/** As of today, whatever the range. */
const today = { overdueCount: 1, uninvoicedDcCount: 1, openFlagCount: 1 };

describe("GET /api/dashboard/summary", () => {
  beforeEach(seed);

  test.each([
    [
      "all",
      {
        poValue: "1500",
        invoicedValue: "572",
        avgLeadTimeDays: 16,
        pendingDispatchValue: "850",
        funnel: { ordQty: "15", dspQty: "6", invoicedQty: "5", rcdQty: "4" },
      },
    ],
    [
      "30d",
      {
        poValue: "500",
        invoicedValue: "100",
        avgLeadTimeDays: 10,
        pendingDispatchValue: "250",
        funnel: { ordQty: "5", dspQty: "2", invoicedQty: "1", rcdQty: "1" },
      },
    ],
    [
      "month",
      {
        poValue: "200",
        invoicedValue: "100",
        avgLeadTimeDays: null,
        pendingDispatchValue: "50",
        funnel: { ordQty: "2", dspQty: "1", invoicedQty: "1", rcdQty: "0" },
      },
    ],
  ])("range=%s", async (range, expected) => {
    const { status, body } = await get(`/api/dashboard/summary?range=${range}`);
    expect(status).toBe(200);
    expect(body).toEqual({ ...expected, ...today });
  });

  test("the range defaults to this month", async () => {
    const { body } = await get("/api/dashboard/summary");
    expect(body).toMatchObject({ poValue: "200", avgLeadTimeDays: null });
  });

  test("no data -> zeros and no lead time", async () => {
    await db.close();
    db = await supplierDb();
    const { body } = await get("/api/dashboard/summary?range=all");
    expect(body).toEqual({
      poValue: "0",
      invoicedValue: "0",
      avgLeadTimeDays: null,
      overdueCount: 0,
      uninvoicedDcCount: 0,
      openFlagCount: 0,
      pendingDispatchValue: "0",
      funnel: { ordQty: "0", dspQty: "0", invoicedQty: "0", rcdQty: "0" },
    });
  });

  test("range=year -> 400; signed out -> 401", async () => {
    expect((await get("/api/dashboard/summary?range=year")).status).toBe(400);
    expect((await get("/api/dashboard/summary", false)).status).toBe(401);
  });

  test("reads write nothing", async () => {
    const before = await db.query(db.build.select().from(auditLog));
    await get("/api/dashboard/summary?range=all");
    await get("/api/dashboard/activity");
    const after = await db.query(db.build.select().from(auditLog));
    expect(after).toEqual(before);
  });
});

describe("GET /api/dashboard/activity", () => {
  beforeEach(seed);

  test("the five documents that entered the system last, newest first", async () => {
    const { status, body } = await get("/api/dashboard/activity");
    expect(status).toBe(200);
    expect(body).toEqual([
      { type: "invoice", id: id("NB"), number: "INV-2", date: "2025-06-01", createdAt: "2025-06-01T03:00:00.000Z" },
      { type: "po", id: PC, number: "4500003", date: "2025-06-01", createdAt: "2025-06-01T02:00:00.000Z" },
      { type: "dc", id: id("DB"), number: "DC-2", date: "2025-05-25", createdAt: "2025-05-25T00:00:00.000Z" },
      { type: "po", id: PB, number: "4500002", date: "2025-05-20", createdAt: "2025-05-20T06:00:00.000Z" },
      { type: "invoice", id: id("NA"), number: "INV-1", date: "2025-04-21", createdAt: "2025-04-21T00:00:00.000Z" },
    ]);
  });

  test("signed out -> 401", async () => {
    expect((await get("/api/dashboard/activity", false)).status).toBe(401);
  });
});
