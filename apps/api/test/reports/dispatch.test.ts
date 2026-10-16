// The daily dispatch summary (A-16 reversed, owner 2026-10-15): the DC lines dated in the range, oldest DC first, in
// the summary layout the owner's summaries use. Synthetic rows (C1).
import { supplier } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { downloadFileName } from "@senstosales/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { id, routesOver, rows } from "../seed-rows.ts";
import { supplierDb } from "../service-deps.ts";
import type { GoldenCell } from "./golden.ts";
import { workbookGolden, workbookGoldenFile } from "./golden.ts";

const values = (row: GoldenCell[]) => row.map((c) => (c !== null && typeof c === "object" ? c.v : c));

describe("the daily dispatch summary", () => {
  let db: NodeDb;
  let send: ReturnType<typeof routesOver>;
  beforeAll(async () => {
    db = await supplierDb();
    send = routesOver(db);
    const r = rows(db);
    await db.batch([
      db.build.update(supplier).set({ invoiceDefaults: { description: "Makers of example parts" } }),
      r.po({ id: id("P1"), poNumber: "4500001", poDate: "2025-04-01", gemcNumber: "GEMC-PO" }),
      r.item({ id: id("I1"), poId: id("P1"), poItemNo: 10, ordQty: 100_000, description: "Hex bolt", unit: "Nos" }),
      r.item({ id: id("I2"), poId: id("P1"), poItemNo: 20, ordQty: 5_000, description: "Gasket kit", unit: "Set" }),
      r.po({ id: id("P2"), poNumber: "4500002", poDate: "2025-04-02" }),
      r.item({ id: id("I3"), poId: id("P2"), poItemNo: 10, ordQty: 9_000, description: "Washer", unit: "Nos" }),
      // A DC with no department takes its item's lot destination codes.
      r.lot({ id: id("L1"), poItemId: id("I3"), lotNo: 1, delyQty: 9_000, destCode: "205" }),
      r.lot({ id: id("L2"), poItemId: id("I1"), lotNo: 1, delyQty: 50_000, destCode: "202" }),
      r.lot({ id: id("L3"), poItemId: id("I1"), lotNo: 2, delyQty: 50_000, destCode: "202" }),
      // Created second, so listed second, though its id sorts first.
      r.dc({
        id: id("D2"),
        poId: id("P2"),
        number: "302",
        dcDate: "2025-05-10",
        createdAt: "2025-05-10T10:00:00.000Z",
        invoiceNumber: "77",
      }),
      r.dcItem({ id: id("E3"), dcId: id("D2"), poItemId: id("I3"), dspQty: 2_500 }),
      r.dc({
        id: id("D3"),
        poId: id("P1"),
        number: "301",
        dcDate: "2025-05-10",
        createdAt: "2025-05-10T09:00:00.000Z",
        departmentNo: "456",
      }),
      r.dcItem({ id: id("E2"), dcId: id("D3"), poItemId: id("I2"), dspQty: 1_000, packets: 1 }),
      r.dcItem({ id: id("E1"), dcId: id("D3"), poItemId: id("I1"), dspQty: 40_000, packets: 2 }),
      r.invoice({
        id: id("V1"),
        poId: id("P1"),
        dcId: id("D3"),
        number: "401",
        invoiceDate: "2025-05-10",
        total: 0,
        createdAt: "2025-05-10T11:00:00.000Z",
        gemcNumber: "GEMC-INV",
      }),
      // Packets come from the invoice line, else the DC line.
      r.invoiceItem({
        id: id("W1"),
        invoiceId: id("V1"),
        poItemId: id("I1"),
        dcItemId: id("E1"),
        qty: 40_000,
        packets: 5,
      }),
      r.invoiceItem({ id: id("W2"), invoiceId: id("V1"), poItemId: id("I2"), dcItemId: id("E2"), qty: 1_000 }),
      // The next day: outside a one-day range.
      r.dc({
        id: id("D4"),
        poId: id("P1"),
        number: "303",
        dcDate: "2025-05-11",
        createdAt: "2025-05-11T09:00:00.000Z",
      }),
      r.dcItem({ id: id("E4"), dcId: id("D4"), poItemId: id("I1"), dspQty: 1_000, packets: 1 }),
    ]);
  });
  afterAll(() => db.close());

  async function exported(path: string) {
    const res = await send(path);
    expect(res.status).toBe(200);
    // The pending summary's layout, so its golden's styles.
    const { styles } = workbookGoldenFile("pending.json");
    return workbookGolden(new Uint8Array(await res.arrayBuffer()), downloadFileName(res), styles);
  }

  it("writes one row per DC line of the day, oldest DC first, totals each unit and the packets, then signs off", async () => {
    const got = await exported("/api/reports/daily-dispatch/export?from=2025-05-10&to=2025-05-10");
    expect(got.fileName).toBe("Daily_Dispatch_2025-05-10.xlsx");
    expect(values(got.rows[3]!)[0]).toBe("Makers of example parts");
    expect(values(got.rows[6]!).slice(1, 3)).toEqual(["Date:", "10-05-2025"]);
    // Digit-only PO, invoice, DC and department print as numbers.
    expect(got.rows.slice(9).map(values)).toEqual([
      [1, "Hex bolt", "40 Nos", 5, 4500001, "GEMC-INV", 401, 301, 456],
      [2, "Gasket kit", "1 Set", 1, 4500001, "GEMC-INV", 401, 301, 456],
      // No packets entered: blank. No invoice made from the DC: the one the user filled in on it (EC-47). No
      // department on the DC: the item's lot destination code.
      [3, "Washer", "2.5 Nos", null, 4500002, null, 77, 302, 205],
      ["TOTAL", null, "42.5 Nos + 1 Set", 6, null, null, null, null, null],
      [null, null, null, null, null, "                 For Example Supplier"],
    ]);
  });

  it("covers a range, named after both ends", async () => {
    const got = await exported("/api/reports/daily-dispatch/export?from=2025-05-10&to=2025-05-11");
    expect(got.fileName).toBe("Daily_Dispatch_2025-05-10_to_2025-05-11.xlsx");
    expect(values(got.rows[6]!).slice(1, 3)).toEqual(["Date:", "10-05-2025 to 11-05-2025"]);
    expect(got.rows.slice(9, -1).map((row) => values(row)[7])).toEqual([301, 301, 302, 303, null]);
    // Two lots with the same destination code give it once.
    expect(values(got.rows[12]!)[8]).toBe(202);
  });

  it("without a range covers today", async () => {
    const got = await exported("/api/reports/daily-dispatch/export");
    expect(got.fileName).toBe("Daily_Dispatch_2025-06-01.xlsx");
    expect(got.rows.slice(9).map(values)).toEqual([
      ["TOTAL", null, 0, 0, null, null, null, null, null],
      [null, null, null, null, null, "                 For Example Supplier"],
    ]);
  });

  it("lists the same rows a page at a time", async () => {
    const res = await send("/api/reports/daily-dispatch?from=2025-05-10&to=2025-05-10&pageSize=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(3);
    expect(
      body.items.map((r) => [
        r["dcNumber"],
        r["poItemNo"],
        r["packets"],
        r["gemcNumber"],
        r["invoiceNumber"],
        r["departmentNo"],
      ]),
    ).toEqual([
      ["301", 10, 5, "GEMC-INV", "401", "456"],
      ["301", 20, 1, "GEMC-INV", "401", "456"],
      ["302", 10, null, null, "77", "205"],
    ]);
  });

  it("narrows the list by PO number or description", async () => {
    const res = await send("/api/reports/daily-dispatch?from=2025-05-10&to=2025-05-11&q=washer");
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items.map((r) => r["dcNumber"])).toEqual(["302"]);
  });

  it("rejects a malformed range", async () => {
    expect((await send("/api/reports/daily-dispatch/export?from=2025-02-30")).status).toBe(400);
  });
});
