// SPEC-11 PR 2: DC list, stats and detail, over HTTP on the full app. The list columns are the legacy DC list's: per
// DC line the PO item's ordered and received quantities, the line's dispatched quantity, and value = dispatched × PO
// item rate. Expected values are worked by hand. Synthetic values only (C1).
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import { line, PO, ready } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";
import { id } from "./seed-rows.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

/**
 * PO 4500001 (item 10 ord 10 rate 100, item 20 ord 5 rate 100) with 3 received on item 10 by an SRV citing DC 7;
 * DC 7 (2025-04-02): 4 of item 10 and 5 of item 20; DC 8 (2025-05-01, Example Consignee): 2 of item 10, invoiced.
 */
async function twoDcs() {
  const r = await ready();
  const po = await r.storedPo();
  const dc7 = await r.createDc({
    poId: po.poId,
    number: "7",
    dcDate: "2025-04-02",
    items: [
      { poItemId: po.item10, dspQty: "4" },
      { poItemId: po.item20, dspQty: "5" },
    ],
  });
  const dc8 = await r.createDc({
    poId: po.poId,
    number: "8",
    dcDate: "2025-05-01",
    consigneeName: "Example Consignee",
    items: [{ poItemId: po.item10, dspQty: "2" }],
  });
  const html = srvPage("4500001", [{ srv: "S-1", date: "25/04/2025", item: 10, code: "M-10", challan: "7", rcd: "3" }]);
  await r.app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
  await r.invoiceOnDc({ id: id("A1"), dcId: dc8.body.id, number: "31", invoiceDate: "2025-05-02" });
  return { ...r, ...po, dc7: dc7.body.id, dc8: dc8.body.id };
}

describe("GET /api/dc", () => {
  test("one row per DC, newest first, with the legacy totals, the invoice and the open flag count", async () => {
    const r = await twoDcs();
    const res = await r.send("/api/dc");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: r.dc8,
          number: "8",
          dcDate: "2025-05-01",
          financialYear: "2025-26",
          poId: r.poId,
          poNumber: "4500001",
          ordQty: "10",
          dspQty: "2",
          rcdQty: "3",
          value: "200",
          invoice: { id: id("A1"), number: "31", date: "2025-05-02", financialYear: "2025-26" },
          openFlagCount: 0,
        },
        {
          id: r.dc7,
          number: "7",
          dcDate: "2025-04-02",
          financialYear: "2025-26",
          poId: r.poId,
          poNumber: "4500001",
          ordQty: "15",
          dspQty: "9",
          rcdQty: "3",
          value: "900",
          invoice: null,
          openFlagCount: 0,
        },
      ],
      total: 2,
    });
  });

  test.each([
    ["q in the consignee", "q=consignee", ["8"]],
    ["q in the DC number", "q=7", ["7"]],
    ["q in the PO number", "q=45000", ["8", "7"]],
    ["date range", "from=2025-04-01&to=2025-04-30", ["7"]],
    ["value range", "valueMin=500", ["7"]],
    ["value range, upper", "valueMax=200", ["8"]],
    ["sort by value", "sort=value&dir=asc", ["8", "7"]],
    ["sort by number, descending", "sort=number&dir=desc", ["8", "7"]],
    ["sort by dispatched", "sort=dspQty&dir=desc", ["7", "8"]],
  ])("%s", async (_name, query, numbers) => {
    const r = await twoDcs();
    const res = await r.send(`/api/dc?${query}`);
    expect(res.body.items.map((row) => row["number"])).toEqual(numbers);
  });

  test("pages keep the total; a page past the end is empty", async () => {
    const r = await twoDcs();
    const res = await r.send("/api/dc?page=2&pageSize=10");
    expect(res.body).toEqual({ items: [], total: 2 });
  });

  test("an unknown sort column is a 400", async () => {
    const r = await ready();
    const res = await r.send("/api/dc?sort=consignee");
    expect([res.status, res.body.code]).toEqual([400, "invalid-input"]);
  });

  test("open flags on the DC's lines are counted (DOC_ON_CANCELLED_ITEM)", async () => {
    const r = await ready();
    const po = await r.storedPo();
    await r.send(`/api/po/${po.poId}`, json("PUT", { ...PO, items: [line(10, "10")], version: 1 }));
    const created = await r.createDc({
      poId: po.poId,
      number: "3",
      dcDate: "2025-04-05",
      items: [{ poItemId: po.item20, dspQty: "1" }],
    });
    const res = await r.send("/api/dc");
    expect(res.body.items.map((row) => [row["id"], row["openFlagCount"]])).toEqual([[created.body.id, 1]]);
  });
});

describe("GET /api/dc/stats", () => {
  test("count, dispatched, value and received over the DCs the filters keep", async () => {
    const r = await twoDcs();
    expect((await r.send("/api/dc/stats")).body).toEqual({ count: 2, dspQty: "11", value: "1100", rcdQty: "6" });
    expect((await r.send("/api/dc/stats?valueMin=500")).body).toEqual({
      count: 1,
      dspQty: "9",
      value: "900",
      rcdQty: "3",
    });
  });
});

describe("GET /api/dc/:id", () => {
  test("the DC, its PO, its lines with item details, its invoice, the linked SRVs and its open flags", async () => {
    const r = await twoDcs();
    const res = await r.send(`/api/dc/${r.dc7}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      dc: expect.objectContaining({ id: r.dc7, number: "7", gcNumber: "7", version: 1 }),
      po: { id: r.poId, poNumber: "4500001", isGemc: false },
      items: [
        expect.objectContaining({ poItemId: r.item10, dspQty: "4", poItemNo: 10, materialCode: "M-10", rate: "100" }),
        expect.objectContaining({ poItemId: r.item20, dspQty: "5", poItemNo: 20, materialCode: "M-20", rate: "100" }),
      ],
      invoice: null,
      srvs: [{ id: expect.any(String), number: "S-1", date: "2025-04-25" }],
      flags: [],
    });
    const dc8 = await r.send(`/api/dc/${r.dc8}`);
    expect([dc8.body["invoice"], dc8.body["srvs"]]).toEqual([
      { id: id("A1"), number: "31", date: "2025-05-02", financialYear: "2025-26" },
      [],
    ]);
  });

  test("an unknown DC is a 404", async () => {
    const r = await ready();
    const res = await r.send(`/api/dc/${id("ZZ")}`);
    expect([res.status, res.body.code]).toEqual([404, "dc-not-found"]);
  });
});
