// SPEC-10 PR 6: global search over HTTP. Synthetic rows; expected hits worked by hand from the legacy search's rules
// (SPEC-10 §2): numbers from their start, item codes and drawing numbers from their start, descriptions and party
// names anywhere, five hits per type, the exact number first. FY on DC and invoice hits (INV-24).
import type { NodeDb } from "@senstosales/db/node";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { mostBoundParams } from "./helpers.ts";
import { id, readApp, recompute, rows } from "./seed-rows.ts";
import { supplierDb } from "./service-deps.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

const [PA, PB] = [id("PA"), id("PB")];

/**
 * - PA 4500001, 2025-04-10, value 1000: item 10 BOLT-77 "Hex bolt" drawing DRG-5 ord 10 @ 100, item 20 NUT-1
 *   "Lock nut" ord 2. DC 45 (consignee Example Works) dispatches 4 of item 10; invoice 4501 (buyer Example Buyer,
 *   total 472) invoices that DC; SRV 990001 receives 3 of item 10, linked to both. Open flags on item 10 and on
 *   DC 45's line.
 * - PB 4500012, 2025-05-01, value 300: item 10 WASH-2 "Washer" ord 3. DC 4500 dispatches 1.
 * - SRV 990002, 2025-05-02, for PO 4509999, which is not in the system, receives 2.
 */
async function seed() {
  const r = rows(db);
  await db.batch([
    r.po({ id: PA, poNumber: "4500001", poDate: "2025-04-10", poValue: 1000_00000 }),
    r.po({ id: PB, poNumber: "4500012", poDate: "2025-05-01", poValue: 300_00000 }),
    r.item({
      id: id("A1"),
      poId: PA,
      poItemNo: 10,
      ordQty: 10_000,
      materialCode: "BOLT-77",
      description: "Hex bolt",
      drawingNo: "DRG-5",
    }),
    r.item({ id: id("A2"), poId: PA, poItemNo: 20, ordQty: 2_000, materialCode: "NUT-1", description: "Lock nut" }),
    r.item({ id: id("B1"), poId: PB, poItemNo: 10, ordQty: 3_000, materialCode: "WASH-2", description: "Washer" }),
    r.dc({
      id: id("DA"),
      poId: PA,
      number: "45",
      dcDate: "2025-04-20",
      createdAt: "2025-04-20T00:00:00.000Z",
      consignee: "Example Works",
    }),
    r.dcItem({ id: id("DX"), dcId: id("DA"), poItemId: id("A1"), dspQty: 4_000 }),
    r.dc({
      id: id("DB"),
      poId: PB,
      number: "4500",
      dcDate: "2025-05-05",
      createdAt: "2025-05-05T00:00:00.000Z",
      consignee: "Other Plant",
    }),
    r.dcItem({ id: id("DY"), dcId: id("DB"), poItemId: id("B1"), dspQty: 1_000 }),
    r.invoice({
      id: id("NA"),
      poId: PA,
      dcId: id("DA"),
      number: "4501",
      invoiceDate: "2025-04-21",
      total: 472_00000,
      createdAt: "2025-04-21T00:00:00.000Z",
      buyer: "Example Buyer",
    }),
    r.invoiceItem({ id: id("NX"), invoiceId: id("NA"), poItemId: id("A1"), dcItemId: id("DX"), qty: 4_000 }),
    r.srv({ id: id("RA"), poNumber: "4500001", poId: PA, srvNumber: "990001", srvDate: "2025-05-01" }),
    r.srvItem({
      id: id("RX"),
      srvId: id("RA"),
      poItemId: id("A1"),
      rcdQty: 3_000,
      challanNo: "45",
      resolvedDcId: id("DA"),
      invoiceNo: "4501",
      resolvedInvoiceId: id("NA"),
    }),
    r.srv({ id: id("RB"), poNumber: "4509999", poId: null, srvNumber: "990002", srvDate: "2025-05-02" }),
    r.srvItem({ id: id("RY"), srvId: id("RB"), poItemId: null, rcdQty: 2_000 }),
    r.flag({ id: id("FA"), poId: PA, scopeType: "po_item", scopeId: id("A1"), status: "open" }),
    r.flag({ id: id("FB"), poId: PA, scopeType: "dc_item", scopeId: id("DX"), status: "open" }),
  ]);
  await recompute(db, PA, PB);
}

interface Hit {
  type: string;
  number: string;
  match: string;
}

const get = async (path: string, signedIn = true) => readApp(db, signedIn)(path);
const search = async (query: string) => {
  const { status, body } = await get(`/api/search?${query}`);
  expect(status).toBe(200);
  return body as Hit[];
};
const found = async (query: string) => (await search(query)).map((h) => `${h.type} ${h.number}`);

const PA_REF = { id: PA, number: "4500001", date: "2025-04-10" };
const DC_45 = { id: id("DA"), number: "45", date: "2025-04-20", financialYear: "2025-26" };
const INV_4501 = { id: id("NA"), number: "4501", date: "2025-04-21", financialYear: "2025-26" };
const SRV_1 = { id: id("RA"), number: "990001", date: "2025-05-01" };

describe("GET /api/search", () => {
  beforeEach(seed);

  test("a PO number finds the PO and the SRVs of that PO, with their values and links", async () => {
    expect(await search("q=4500001")).toEqual([
      {
        type: "po",
        id: PA,
        number: "4500001",
        financialYear: null,
        date: "2025-04-10",
        party: null,
        match: "4500001",
        status: "Pending",
        hasFlags: true,
        qty: "12",
        value: "1000",
        links: { dcs: [DC_45], invoices: [INV_4501], srvs: [SRV_1], po: null },
      },
      {
        type: "srv",
        id: id("RA"),
        number: "990001",
        financialYear: null,
        date: "2025-05-01",
        party: null,
        match: "4500001",
        status: null,
        hasFlags: false,
        qty: "3",
        value: "300",
        links: { dcs: [DC_45], invoices: [INV_4501], srvs: [], po: PA_REF },
      },
    ]);
  });

  test("DC and invoice hits carry their FY, party, quantities, value and links", async () => {
    const hits = await search("q=45&types=dc&types=invoice");
    expect(hits).toEqual([
      {
        type: "dc",
        id: id("DA"),
        number: "45",
        financialYear: "2025-26",
        date: "2025-04-20",
        party: "Example Works",
        match: "45",
        status: null,
        hasFlags: true,
        qty: "4",
        value: "400",
        links: { dcs: [], invoices: [INV_4501], srvs: [SRV_1], po: PA_REF },
      },
      expect.objectContaining({ type: "dc", number: "4500", hasFlags: false }),
      {
        type: "invoice",
        id: id("NA"),
        number: "4501",
        financialYear: "2025-26",
        date: "2025-04-21",
        party: "Example Buyer",
        match: "4501",
        status: null,
        hasFlags: false,
        qty: "4",
        value: "472",
        links: { dcs: [DC_45], invoices: [], srvs: [SRV_1], po: PA_REF },
      },
    ]);
  });

  test("an SRV of a PO not in the system has no PO link and no value", async () => {
    expect(await search("q=4509999")).toEqual([
      {
        type: "srv",
        id: id("RB"),
        number: "990002",
        financialYear: null,
        date: "2025-05-02",
        party: null,
        match: "4509999",
        status: null,
        hasFlags: false,
        qty: "2",
        value: "0",
        links: { dcs: [], invoices: [], srvs: [], po: null },
      },
    ]);
  });

  test.each([
    // Exact number first, then number prefixes in type order, then other matches; higher numbers first in a type.
    ["q=45", ["dc 45", "po 4500012", "po 4500001", "dc 4500", "invoice 4501", "srv 990002", "srv 990001"]],
    ["q=bolt", ["po 4500001", "dc 45", "invoice 4501", "srv 990001"]],
    ["q=drg", ["po 4500001", "dc 45", "invoice 4501", "srv 990001"]],
    ["q=lock", ["po 4500001"]],
    ["q=example", ["dc 45", "invoice 4501"]],
    // One digit skips items and party names; digits never search party names.
    ["q=4", ["po 4500012", "po 4500001", "dc 4500", "dc 45", "invoice 4501", "srv 990002", "srv 990001"]],
    ["q=%25", []],
    ["q=45&types=po", ["po 4500012", "po 4500001"]],
    ["q=45&from=2025-05-01", ["po 4500012", "dc 4500", "srv 990002", "srv 990001"]],
    ["q=45&to=2025-04-20", ["dc 45", "po 4500001"]],
    // PO and invoice values and SRV accepted values; DCs take no value range, as legacy.
    ["q=45&valueMin=400", ["dc 45", "po 4500001", "dc 4500", "invoice 4501"]],
    ["q=45&valueMax=300", ["dc 45", "po 4500012", "dc 4500", "srv 990002", "srv 990001"]],
    ["q=", []],
    ["q=%20%20", []],
    ["q=*", []],
    ["q=*&types=po", ["po 4500012", "po 4500001"]],
  ])("%s", async (query, expected) => {
    expect(await found(query)).toEqual(expected);
  });

  test.each([
    ["q=bolt", "BOLT-77"],
    ["q=drg", "DRG-5"],
    ["q=hex", "Hex bolt"],
    // Both items of 4500001 match by description; the lower item number decides.
    ["q=o", "Hex bolt"],
    ["q=example%20w", "Example Works"],
  ])("%s shows what matched: %s", async (query, match) => {
    expect((await search(query))[0]?.match).toBe(match);
  });

  test("five hits of each type at most", async () => {
    const r = rows(db);
    await db.batch(
      ["1", "2", "3", "4", "5", "6"].map((n) => r.po({ id: id(`Q${n}`), poNumber: `77${n}`, poDate: "2025-04-01" })),
    );
    expect(await found("q=77")).toEqual(["po 776", "po 775", "po 774", "po 773", "po 772"]);
  });

  test.each([
    ["q=45&types=gc", "query.types.0"],
    ["q=45&valueMin=abc", "query.valueMin"],
  ])("%s -> 400 naming %s", async (query, path) => {
    const { status, body } = await get(`/api/search?${query}`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "invalid-input", details: { fields: [{ path }] } });
  });

  test("signed out -> 401", async () => {
    expect((await get("/api/search?q=45", false)).status).toBe(401);
  });
});

// C4: D1 binds at most 100 parameters to a statement. A value bound reads every matching SRV to total it, so the
// line read takes the SRVs 100 at a time (CodeAnt on #53).
describe("a value bound over 150 SRVs", () => {
  test("binds at most 100 parameters per statement and keeps five hits", async () => {
    const r = rows(db);
    const tag = (n: number) => String(n).padStart(4, "0");
    await db.batch([
      r.po({ id: PA, poNumber: "4500001", poDate: "2025-04-10" }),
      r.item({ id: id("A1"), poId: PA, poItemNo: 10, ordQty: 1_000_000 }),
      ...Array.from({ length: 150 }, (_, i) => {
        const srvId = `01J9Z8Q4S5T6V7W8X9Y0R0${tag(i)}`;
        return [
          r.srv({ id: srvId, poNumber: "4500001", poId: PA, srvNumber: `77${tag(i)}`, srvDate: "2025-05-01" }),
          r.srvItem({ id: `01J9Z8Q4S5T6V7W8X9Y0S0${tag(i)}`, srvId, poItemId: id("A1"), rcdQty: 1_000 }),
        ];
      }).flat(),
    ]);
    const most = await mostBoundParams(db, async () => {
      const hits = await search("q=77&types=srv&valueMin=0");
      expect(hits.map((h) => h.type)).toEqual(["srv", "srv", "srv", "srv", "srv"]);
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(100);
  });
});
