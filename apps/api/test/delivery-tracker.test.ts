// SPEC-10 PR 6: delivery tracker list and stats over HTTP, today 2025-06-01. Synthetic rows; `recompute` writes the
// derived item columns. Expected values are worked by hand from the legacy tracker's rules (SPEC-10 §2).
import type { NodeDb } from "@senstosales/db/node";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { d, id, m, q, readApp, recompute, rows } from "./seed-rows.ts";
import { supplierDb } from "./service-deps.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

const PA = id("PA");
const PB = id("PB");

/**
 * - PA 4500001: item 10 (M-10 "Hex bolt", ord 10 @ 100, nothing dispatched -> Pending, balance 10): lot 1 6 due
 *   2025-05-30 (entry 2025-05-25), lot 2 4 due 2025-06-05. Item 20 (M-20 "Nut", ord 5 @ 10, manual 5 -> Delivered,
 *   balance 0): lot 1 3 due 2025-05-20, lot 2 2 due 2025-07-10. Item 30 (ord 2, received 2 -> Closed): lot due
 *   2025-06-03. Item 40 (ord 3): lot without a date.
 * - PB 4500002: item 10 (X-1 "Washer", ord 3 @ 50 -> Pending, balance 3): lot 1 3 due 2025-06-20 (entry 2025-06-25).
 */
async function seed() {
  const r = rows(db);
  await db.batch([
    r.po({ id: PA, poNumber: "4500001", poDate: "2025-04-01" }),
    r.po({ id: PB, poNumber: "4500002", poDate: "2025-04-15" }),
    r.item({ id: id("A1"), poId: PA, poItemNo: 10, ordQty: 10_000, description: "Hex bolt" }),
    r.item({
      id: id("A2"),
      poId: PA,
      poItemNo: 20,
      ordQty: 5_000,
      description: "Nut",
      rateSource: m(10_00000),
      rate: m(10_00000),
      manualDispatchedQty: q(5_000),
    }),
    r.item({ id: id("A3"), poId: PA, poItemNo: 30, ordQty: 2_000, poRcdQty: q(2_000) }),
    r.item({ id: id("A4"), poId: PA, poItemNo: 40, ordQty: 3_000 }),
    r.item({
      id: id("B1"),
      poId: PB,
      poItemNo: 10,
      ordQty: 3_000,
      materialCode: "X-1",
      description: "Washer",
      rateSource: m(50_00000),
      rate: m(50_00000),
    }),
    r.lot({
      id: id("T1"),
      poItemId: id("A1"),
      lotNo: 1,
      delyQty: 6_000,
      delyDate: d("2025-05-30"),
      entryAllowDate: d("2025-05-25"),
    }),
    r.lot({ id: id("T2"), poItemId: id("A1"), lotNo: 2, delyQty: 4_000, delyDate: d("2025-06-05") }),
    r.lot({ id: id("T3"), poItemId: id("A2"), lotNo: 1, delyQty: 3_000, delyDate: d("2025-05-20") }),
    r.lot({ id: id("T4"), poItemId: id("A2"), lotNo: 2, delyQty: 2_000, delyDate: d("2025-07-10") }),
    r.lot({ id: id("T5"), poItemId: id("A3"), lotNo: 1, delyQty: 2_000, delyDate: d("2025-06-03") }),
    r.lot({ id: id("T6"), poItemId: id("A4"), lotNo: 1, delyQty: 3_000, entryAllowNote: "On request" }),
    r.lot({
      id: id("T7"),
      poItemId: id("B1"),
      lotNo: 1,
      delyQty: 3_000,
      delyDate: d("2025-06-20"),
      entryAllowDate: d("2025-06-25"),
    }),
  ]);
  await recompute(db, PA, PB);
}

interface Page {
  items: { lotId: string }[];
  total: number;
}

const get = async (path: string, signedIn = true) => readApp(db, signedIn)(path);
const lots = async (query = "") => {
  const { status, body } = await get(`/api/delivery-tracker${query}`);
  expect(status).toBe(200);
  return (body as Page).items.map((row) => row.lotId);
};

describe("GET /api/delivery-tracker", () => {
  beforeEach(seed);

  test("a row is the lot's schedule with its item's stored quantities, pending value and days to due", async () => {
    const { body } = await get("/api/delivery-tracker?q=hex&dueTo=2025-05-31");
    expect(body).toEqual({
      items: [
        {
          lotId: id("T1"),
          lotNo: 1,
          delyDate: "2025-05-30",
          entryAllowDate: "2025-05-25",
          entryAllowNote: null,
          poId: PA,
          poNumber: "4500001",
          poItemId: id("A1"),
          poItemNo: 10,
          materialCode: "M-10",
          description: "Hex bolt",
          drawingNo: null,
          rate: "100",
          ordQty: "10",
          dspQty: "0",
          rcdQty: "0",
          balanceQty: "10",
          pendingValue: "1000",
          daysToDue: -2,
        },
      ],
      total: 1,
    });
  });

  test("lists the dated lots of items not received in full, latest delivery date first", async () => {
    expect(await lots()).toEqual([id("T4"), id("T7"), id("T2"), id("T1"), id("T3")]);
  });

  test.each([
    ["status=overdue", [id("T1")]],
    ["status=due-soon", [id("T2")]],
    ["status=due-this-month", [id("T7"), id("T2")]],
    ["q=4500002", [id("T7")]],
    ["q=m-2", [id("T4"), id("T3")]],
    ["q=%25", []],
    ["dueFrom=2025-06-01&dueTo=2025-06-30", [id("T7"), id("T2")]],
    ["entryFrom=2025-05-01&entryTo=2025-05-31", [id("T1")]],
    // The lot's scheduled value: T1 600, T2 400, T3 30, T4 20, T7 150.
    ["valueMin=150", [id("T7"), id("T2"), id("T1")]],
    ["valueMax=150", [id("T4"), id("T7"), id("T3")]],
    ["status=overdue&q=4500002", []],
  ])("filter %s", async (query, expected) => {
    const { body } = await get(`/api/delivery-tracker?${query}`);
    expect((body as Page).items.map((row) => row.lotId)).toEqual(expected);
    expect((body as Page).total).toBe(expected.length);
  });

  test.each([
    ["delyDate", "asc", [id("T3"), id("T1"), id("T2"), id("T7"), id("T4")]],
    ["poNumber", "desc", [id("T7"), id("T4"), id("T2"), id("T1"), id("T3")]],
    ["entryAllowDate", "asc", [id("T4"), id("T2"), id("T3"), id("T1"), id("T7")]],
    ["materialCode", "desc", [id("T7"), id("T4"), id("T3"), id("T2"), id("T1")]],
    ["ordQty", "asc", [id("T7"), id("T4"), id("T3"), id("T2"), id("T1")]],
    ["dspQty", "desc", [id("T4"), id("T3"), id("T7"), id("T2"), id("T1")]],
    ["pendingValue", "desc", [id("T2"), id("T1"), id("T7"), id("T4"), id("T3")]],
  ])("sort=%s dir=%s", async (sort, dir, expected) => {
    expect(await lots(`?sort=${sort}&dir=${dir}`)).toEqual(expected);
  });

  test("pages keep the order and the total", async () => {
    const { body } = await get("/api/delivery-tracker?pageSize=10&page=2");
    expect(body).toEqual({ items: [], total: 5 });
  });

  test.each([
    ["sort=value", "query.sort"],
    ["status=pending", "query.status"],
    ["dueFrom=2025-02-30", "query.dueFrom"],
    ["pageSize=20", "query.pageSize"],
  ])("%s -> 400 naming %s", async (query, path) => {
    const { status, body } = await get(`/api/delivery-tracker?${query}`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "invalid-input", details: { fields: [{ path }] } });
  });

  test("signed out -> 401", async () => {
    expect((await get("/api/delivery-tracker", false)).status).toBe(401);
  });
});

describe("GET /api/delivery-tracker/stats", () => {
  beforeEach(seed);

  test("counts every bucket; the pending value counts each item once", async () => {
    const { status, body } = await get("/api/delivery-tracker/stats");
    expect(status).toBe(200);
    // Items 10 of PA (1000), 20 of PA (0) and 10 of PB (150).
    expect(body).toEqual({ overdueCount: 1, dueSoonCount: 1, dueThisMonthCount: 2, pendingValue: "1150" });
  });

  test("the status toggle narrows the pending value but not the counts", async () => {
    const { body } = await get("/api/delivery-tracker/stats?status=due-this-month");
    expect(body).toEqual({ overdueCount: 1, dueSoonCount: 1, dueThisMonthCount: 2, pendingValue: "1150" });
    const overdue = await get("/api/delivery-tracker/stats?status=overdue");
    expect(overdue.body).toEqual({ overdueCount: 1, dueSoonCount: 1, dueThisMonthCount: 2, pendingValue: "1000" });
  });

  test("the other filters narrow everything", async () => {
    const { body } = await get("/api/delivery-tracker/stats?q=4500002");
    expect(body).toEqual({ overdueCount: 0, dueSoonCount: 0, dueThisMonthCount: 1, pendingValue: "150" });
  });

  test("no data -> zeros", async () => {
    const { body } = await get("/api/delivery-tracker/stats?q=nothing");
    expect(body).toEqual({ overdueCount: 0, dueSoonCount: 0, dueThisMonthCount: 0, pendingValue: "0" });
  });
});
