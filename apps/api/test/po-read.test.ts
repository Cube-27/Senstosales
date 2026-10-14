// SPEC-10 PR 1: PO list, stats, detail and linked documents over HTTP. Synthetic rows are inserted, then `recomputePo`
// writes their derived columns, as every write batch does; expected values are worked by hand from ARCHITECTURE §6.2.
// Real node:sqlite; nothing of ours is mocked.
import type { Instant } from "@senstosales/db";
import {
  dc,
  dcItem,
  invoice,
  invoiceItem,
  po,
  poItem,
  poLot,
  reconciliationIssue,
  srv,
  srvItem,
  WriteBatch,
} from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { poRoutes } from "../src/routes/po.ts";
import { recomputePo } from "../src/services/recompute.ts";
import { poService } from "../src/services/po.ts";
import { testApp } from "./helpers.ts";
import { fixedClock, supplierDb, SUPPLIER } from "./service-deps.ts";

const q = (n: number) => n as Qty;
const m = (n: number) => n as Money;
const d = (s: string) => s as IsoDate;
const at = (s: string) => s as Instant;
const S = { supplierId: SUPPLIER };
const FY = "2025-26" as Fy;

/** A ULID whose last two characters name the row. */
const id = (tag: string) => `01J9Z8Q4S5T6V7W8X9Y0Z1A2${tag}`;
const PA = id("PA");
const PB = id("PB");
const PC = id("PC");
const PD = id("PD");
const MISSING = id("ZZ");

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

const app = (signedIn = true) => testApp(poRoutes(poService({ db })), () => Promise.resolve(signedIn));

/** The JSON fields these tests read; each test asserts the values. */
interface Wire {
  items: (Record<string, unknown> & { poNumber: string; lots: unknown })[];
  total: number;
  po: Record<string, unknown>;
  linked: unknown;
  flags: unknown;
}

async function get(path: string, signedIn = true) {
  const res = await app(signedIn).send(path);
  return { status: res.status, body: (await res.json()) as Wire };
}

const zeros = { dspQty: q(0), rcdQty: q(0), rejQty: q(0), balanceQty: q(0) };

function insertPo(row: { id: string; poNumber: string; poDate: string; poValue: number | null; gemcNumber?: string }) {
  return db.build.insert(po).values({
    ...S,
    ...zeros,
    id: row.id,
    poNumber: row.poNumber,
    poDate: d(row.poDate),
    poValue: row.poValue === null ? null : m(row.poValue),
    amendNo: 0,
    isGemc: row.gemcNumber !== undefined,
    gemcNumber: row.gemcNumber ?? null,
    rawHeader: {},
    status: "Pending",
    ordQty: q(0),
  });
}

function insertItem(
  poId: string,
  itemId: string,
  no: number,
  ordQty: number,
  extra: Partial<typeof poItem.$inferInsert> = {},
) {
  return db.build.insert(poItem).values({
    ...S,
    ...zeros,
    id: itemId,
    poId,
    poItemNo: no,
    materialCode: `M-${no}`,
    ordQty: q(ordQty),
    rateSource: m(100_00000),
    rate: m(100_00000),
    poRcdQty: q(0),
    poRejQty: null,
    uninvoicedQty: q(0),
    status: "Pending",
    ...extra,
  });
}

async function recompute(...poIds: string[]) {
  const batch = new WriteBatch(db);
  for (const poId of poIds) for (const s of await recomputePo({ db, clock: fixedClock }, poId)) batch.add(s);
  await batch.commit();
}

const flag = (tag: string, status: "open" | "acknowledged") => ({
  ...S,
  id: id(tag),
  type: "QTY_MISMATCH" as const,
  scopeType: "po_item" as const,
  scopeId: id("1A"),
  poId: PA,
  fingerprint: `fp-${tag}`,
  details: { field: "rcd", expected: "4", actual: "3", docIds: [id("RA")] },
  status,
  note: null,
  openedAt: at("2025-05-02T05:30:00.000Z"),
  acknowledgedAt: status === "open" ? null : at("2025-05-03T05:30:00.000Z"),
});

/**
 * - PA 4500001, 2025-04-10, value 1000: item 1A ord 10 (DC-1 dispatches 4, DC-sourced INV-1 invoices 4, SRV-1
 *   2025-05-01 receives 3 and rejects 1; lots 1 and 2), item 1B ord 5 cancelled, item 1C ord 2. One open and one
 *   acknowledged flag. -> dsp 4, rcd 3, rej 1, balance 8 (6 + 2), uninvoiced 8 (6 + 2), Pending.
 * - PB 4500002, 2025-05-01, no value, GEMC-77: ord 3, nothing else -> Pending.
 * - PC 990, 2025-04-10, value 500: ord 1 received 1 on the PO page -> Closed.
 * - PD 4500003, 2025-03-01, value 200: ord 2, manual dispatched 2 -> Delivered.
 */
async function seed() {
  const b = db.build;
  await db.batch([
    insertPo({ id: PA, poNumber: "4500001", poDate: "2025-04-10", poValue: 1000_00000 }),
    insertPo({ id: PB, poNumber: "4500002", poDate: "2025-05-01", poValue: null, gemcNumber: "GEMC-77" }),
    insertPo({ id: PC, poNumber: "990", poDate: "2025-04-10", poValue: 500_00000 }),
    insertPo({ id: PD, poNumber: "4500003", poDate: "2025-03-01", poValue: 200_00000 }),
    insertItem(PA, id("1A"), 10, 10_000),
    insertItem(PA, id("1B"), 20, 5_000, { cancelledAt: at("2025-04-15T00:00:00.000Z") }),
    insertItem(PA, id("1C"), 30, 2_000),
    insertItem(PB, id("2A"), 10, 3_000),
    insertItem(PC, id("3A"), 10, 1_000, { poRcdQty: q(1_000) }),
    insertItem(PD, id("4A"), 10, 2_000, { manualDispatchedQty: q(2_000) }),
    b.insert(poLot).values([
      { ...S, id: id("TB"), poItemId: id("1A"), lotNo: 2, delyQty: q(4_000), entryAllowNote: "On request" },
      { ...S, id: id("TA"), poItemId: id("1A"), lotNo: 1, delyQty: q(6_000), delyDate: d("2025-05-15") },
    ]),
    b.insert(dc).values({
      ...S,
      id: id("DA"),
      poId: PA,
      number: "DC-1",
      dcDate: d("2025-04-20"),
      financialYear: FY,
      gcNumber: "DC-1",
      gcDate: d("2025-04-20"),
      createdAt: at("2025-04-20T00:00:00.000Z"),
    }),
    b.insert(dcItem).values({
      ...S,
      id: id("DL"),
      dcId: id("DA"),
      poItemId: id("1A"),
      dspQty: q(4_000),
      createdAt: at("2025-04-20T00:00:00.000Z"),
    }),
    b.insert(invoice).values({
      ...S,
      id: id("NA"),
      poId: PA,
      dcId: id("DA"),
      kind: "dc",
      number: "INV-1",
      invoiceDate: d("2025-04-21"),
      financialYear: FY,
      cgstPct: 900000 as GstPct,
      sgstPct: 900000 as GstPct,
      taxable: m(0),
      cgst: m(0),
      sgst: m(0),
      igst: m(0),
      total: m(0),
      createdAt: at("2025-04-21T00:00:00.000Z"),
    }),
    b.insert(invoiceItem).values({
      ...S,
      id: id("NL"),
      invoiceId: id("NA"),
      dcItemId: id("DL"),
      poItemId: id("1A"),
      qty: q(4_000),
      rate: m(100_00000),
      taxable: m(0),
      cgst: m(0),
      sgst: m(0),
      igst: m(0),
      total: m(0),
    }),
    b.insert(srv).values({
      ...S,
      id: id("RA"),
      poNumber: "4500001",
      poId: PA,
      srvNumber: "SRV-1",
      srvDate: d("2025-05-01"),
      financialYear: FY,
      rawHeader: {},
    }),
    b.insert(srvItem).values({
      ...S,
      id: id("RL"),
      srvId: id("RA"),
      poItemId: id("1A"),
      materialCode: "M-10",
      poItemNo: 10,
      lotNo: 1,
      srvItemNo: 1,
      ordQty: q(10_000),
      rcdQty: q(3_000),
      acceptedQty: q(3_000),
      rejQty: q(1_000),
      challanNo: "DC-1",
      resolvedDcId: id("DA"),
    }),
    b.insert(reconciliationIssue).values([flag("FA", "open"), flag("FB", "acknowledged")]),
  ]);
  await recompute(PA, PB, PC, PD);
}

const LINKED_PA = {
  dcs: [{ id: id("DA"), number: "DC-1", date: "2025-04-20", financialYear: "2025-26" }],
  invoices: [{ id: id("NA"), number: "INV-1", date: "2025-04-21", financialYear: "2025-26" }],
  srvs: [{ id: id("RA"), number: "SRV-1", date: "2025-05-01" }],
};

const numbers = (body: Wire) => body.items.map((r) => r.poNumber);

describe("GET /api/po", () => {
  beforeEach(seed);

  test("a row carries the stored quantities, status, item and linked counts, and the uninvoiced total", async () => {
    const { status, body } = await get("/api/po?q=4500001");
    expect(status).toBe(200);
    expect(body).toEqual({
      items: [
        {
          id: PA,
          poNumber: "4500001",
          poDate: "2025-04-10",
          isGemc: false,
          poValue: "1000",
          status: "Pending",
          ordQty: "12",
          dspQty: "4",
          rcdQty: "3",
          rejQty: "1",
          balanceQty: "8",
          itemCount: 3,
          uninvoicedQty: "8",
          dcCount: 1,
          invoiceCount: 1,
          srvCount: 1,
          openFlagCount: 1,
        },
      ],
      total: 1,
    });
  });

  test("newest PO date first by default, then PO number descending as numbers", async () => {
    expect(numbers((await get("/api/po")).body)).toEqual(["4500002", "4500001", "990", "4500003"]);
  });

  test.each([
    ["poNumber", "asc", ["990", "4500001", "4500002", "4500003"]],
    ["poNumber", "desc", ["4500003", "4500002", "4500001", "990"]],
    ["status", "asc", ["4500002", "4500001", "4500003", "990"]],
    ["status", "desc", ["990", "4500003", "4500002", "4500001"]],
    ["itemCount", "desc", ["4500001", "4500002", "990", "4500003"]],
    ["poValue", "asc", ["4500002", "4500003", "990", "4500001"]],
    ["dspQty", "desc", ["4500001", "4500003", "4500002", "990"]],
    ["rcdQty", "desc", ["4500001", "990", "4500002", "4500003"]],
  ])("sort=%s dir=%s", async (sort, dir, expected) => {
    expect(numbers((await get(`/api/po?sort=${sort}&dir=${dir}`)).body)).toEqual(expected);
  });

  test.each([
    ["status=Pending", ["4500002", "4500001"]],
    ["status=Delivered", ["4500003"]],
    ["flagged=true", ["4500001"]],
    ["flagged=false", ["4500002", "990", "4500003"]],
    ["gemc=true", ["4500002"]],
    ["gemc=false", ["4500001", "990", "4500003"]],
    ["q=4500", ["4500002", "4500001", "4500003"]],
    ["q=gemc-7", ["4500002"]],
    ["q=%25", []],
    ["from=2025-04-10&to=2025-04-10", ["4500001", "990"]],
    ["valueMin=0&valueMax=500", ["4500002", "990", "4500003"]],
    ["valueMin=500.00001", ["4500001"]],
    ["status=Pending&gemc=false", ["4500001"]],
  ])("filter %s", async (filter, expected) => {
    const { body } = await get(`/api/po?${filter}`);
    expect(numbers(body)).toEqual(expected);
    expect(body.total).toBe(expected.length);
  });

  test.each([
    ["sort=supplier", "query.sort"],
    ["pageSize=7", "query.pageSize"],
    ["page=0", "query.page"],
    ["status=Open", "query.status"],
    ["from=2025-02-30", "query.from"],
  ])("%s -> 400 naming %s", async (query, path) => {
    const { status, body } = await get(`/api/po?${query}`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "invalid-input", details: { fields: [{ path }] } });
  });

  test("signed out -> 401", async () => {
    expect((await get("/api/po", false)).status).toBe(401);
  });
});

describe("paging", () => {
  test("total counts every matching PO; a page holds pageSize rows; past the end is empty", async () => {
    await db.batch(
      Array.from({ length: 12 }, (_, i) =>
        insertPo({ id: id(`Q${"ABCDEFGHJKMN"[i]}`), poNumber: String(100 + i), poDate: "2025-04-01", poValue: null }),
      ),
    );
    const page = async (n: number) => (await get(`/api/po?sort=poNumber&page=${n}&pageSize=10`)).body;
    expect(await page(1)).toMatchObject({ total: 12 });
    expect(numbers(await page(1))).toEqual(Array.from({ length: 10 }, (_, i) => String(100 + i)));
    expect(numbers(await page(2))).toEqual(["110", "111"]);
    expect(await page(3)).toEqual({ items: [], total: 12 });
  });
});

describe("GET /api/po/stats", () => {
  beforeEach(seed);

  test.each([
    ["", { count: 4, poValue: "1700", dspQty: "6", rejQty: "1" }],
    ["?status=Pending", { count: 2, poValue: "1000", dspQty: "4", rejQty: "1" }],
    ["?gemc=true", { count: 1, poValue: "0", dspQty: "0", rejQty: "0" }],
    ["?q=none", { count: 0, poValue: "0", dspQty: "0", rejQty: "0" }],
  ])("stats%s are totals of the filtered list (D-0096)", async (query, expected) => {
    expect(await get(`/api/po/stats${query}`)).toEqual({ status: 200, body: expected });
  });
});

describe("GET /api/po/:id", () => {
  beforeEach(seed);

  test("header, items with derived quantities and lots, linked documents, open flags only", async () => {
    const { status, body } = await get(`/api/po/${PA}`);
    expect(status).toBe(200);
    expect(body.po).toEqual({
      id: PA,
      poNumber: "4500001",
      poDate: "2025-04-10",
      buyerId: null,
      enquiry: null,
      quotation: null,
      orderType: null,
      bhelStatusCode: null,
      amendNo: 0,
      poValue: "1000",
      netPoValue: null,
      isGemc: false,
      gemcNumber: null,
      remarks: null,
      rawHeader: {},
      status: "Pending",
      ordQty: "12",
      dspQty: "4",
      rcdQty: "3",
      rejQty: "1",
      balanceQty: "8",
      version: 1,
    });
    const items = body.items;
    expect(items).toMatchObject([
      {
        poItemNo: 10,
        dspQty: "4",
        rcdQty: "3",
        rejQty: "1",
        balanceQty: "6",
        uninvoicedQty: "6",
        status: "Pending",
        cancelledAt: null,
      },
      {
        poItemNo: 20,
        dspQty: "0",
        rcdQty: "0",
        rejQty: "0",
        balanceQty: "0",
        uninvoicedQty: "5",
        status: "Cancelled",
        cancelledAt: "2025-04-15T00:00:00.000Z",
      },
      {
        poItemNo: 30,
        dspQty: "0",
        rcdQty: "0",
        rejQty: "0",
        balanceQty: "2",
        uninvoicedQty: "2",
        status: "Pending",
        cancelledAt: null,
      },
    ]);
    expect(items[0]?.lots).toEqual([
      {
        id: id("TA"),
        poItemId: id("1A"),
        lotNo: 1,
        delyQty: "6",
        delyDate: "2025-05-15",
        entryAllowDate: null,
        entryAllowNote: null,
        destCode: null,
      },
      {
        id: id("TB"),
        poItemId: id("1A"),
        lotNo: 2,
        delyQty: "4",
        delyDate: null,
        entryAllowDate: null,
        entryAllowNote: "On request",
        destCode: null,
      },
    ]);
    expect(items.slice(1).map((item) => item.lots)).toEqual([[], []]);
    expect(body.linked).toEqual(LINKED_PA);
    expect(body.flags).toEqual([
      {
        id: id("FA"),
        type: "QTY_MISMATCH",
        scopeType: "po_item",
        scopeId: id("1A"),
        poId: PA,
        details: { field: "rcd", expected: "4", actual: "3", docIds: [id("RA")] },
        status: "open",
        note: null,
        openedAt: "2025-05-02T05:30:00.000Z",
        acknowledgedAt: null,
      },
    ]);
  });

  test("a PO with no documents has empty linked lists and no flags", async () => {
    const { body } = await get(`/api/po/${PB}`);
    expect(body).toMatchObject({ linked: { dcs: [], invoices: [], srvs: [] }, flags: [] });
    expect(body.po["gemcNumber"]).toBe("GEMC-77");
  });

  test("unknown id -> 404; malformed id -> 400", async () => {
    expect(await get(`/api/po/${MISSING}`)).toEqual({
      status: 404,
      body: { code: "po-not-found", message: "This PO was not found." },
    });
    expect((await get("/api/po/not-an-id")).status).toBe(400);
  });
});

describe("GET /api/po/:id/linked", () => {
  beforeEach(seed);

  test("every DC, invoice and SRV of the PO, unpaged (INV-73)", async () => {
    expect(await get(`/api/po/${PA}/linked`)).toEqual({
      status: 200,
      body: LINKED_PA,
    });
  });

  test("unknown PO -> 404", async () => {
    expect((await get(`/api/po/${MISSING}/linked`)).status).toBe(404);
  });
});

test("reads never write", async () => {
  await seed();
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all([po, poItem, poLot, reconciliationIssue].map((t) => db.query(db.build.select().from(t)))),
    );
  const before = await snapshot();
  for (const path of ["/api/po", "/api/po/stats", `/api/po/${PA}`, `/api/po/${PA}/linked`]) await get(path);
  expect(await snapshot()).toBe(before);
});
