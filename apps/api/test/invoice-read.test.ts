// SPEC-11 PR 5: invoice list, stats and detail, over HTTP on the full app. The list columns are the legacy invoice
// list's: item count and Σ line qty per invoice, its stored taxable value and total; the KPI cards sum the total, the
// taxable value and the tax. Expected values are worked by hand. Synthetic values only (C1).
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import { line } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";
import { PO, withDc } from "./invoice-fixtures.ts";
import { id } from "./seed-rows.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

/**
 * PO 4500001 (item 10 rate 100, item 20 rate 33.333) with DC 7 (4 and 2), and at 6 % + 6 %:
 * invoice 31 (2025-04-03) of DC 7: taxable 466.67, tax 56, total 522.67, cited by an SRV;
 * invoice 32 (2025-05-01, buyer Other Unit) PO-direct, 1 of item 10: taxable 100, tax 12, total 112.
 */
async function twoInvoices() {
  const r = await withDc();
  const inv31 = await r.createInvoice({ dcId: r.dcId, number: "31", invoiceDate: "2025-04-03", lines: r.lines });
  const inv32 = await r.createDirect({
    poId: r.poId,
    number: "32",
    invoiceDate: "2025-05-01",
    buyerName: "Other Unit",
    lines: [{ poItemId: r.item10, qty: "1" }],
  });
  const html = srvPage("4500001", [{ srv: "S-1", date: "25/04/2025", item: 10, code: "M-10", invoice: "31", rcd: "3" }]);
  await r.app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
  return { ...r, inv31: inv31.body.id, inv32: inv32.body.id };
}

describe("GET /api/invoice", () => {
  test("one row per invoice, newest first, with its kind, DC, item count, quantity and amounts", async () => {
    const r = await twoInvoices();
    const res = await r.send("/api/invoice");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          id: r.inv32,
          number: "32",
          invoiceDate: "2025-05-01",
          financialYear: "2025-26",
          poId: r.poId,
          poNumber: "4500001",
          kind: "direct",
          dc: null,
          itemCount: 1,
          qty: "1",
          taxable: "100",
          total: "112",
        },
        {
          id: r.inv31,
          number: "31",
          invoiceDate: "2025-04-03",
          financialYear: "2025-26",
          poId: r.poId,
          poNumber: "4500001",
          kind: "dc",
          dc: { id: r.dcId, number: "7", date: "2025-04-02", financialYear: "2025-26" },
          itemCount: 2,
          qty: "6",
          taxable: "466.67",
          total: "522.67",
        },
      ],
      total: 2,
    });
  });

  test.each([
    ["q in the buyer", "q=other", ["32"]],
    ["q in the DC number", "q=7", ["31"]],
    ["q in the invoice number", "q=32", ["32"]],
    ["q in the PO number", "q=45000", ["32", "31"]],
    ["date range", "from=2025-04-01&to=2025-04-30", ["31"]],
    ["value range", "valueMin=200", ["31"]],
    ["value range, upper", "valueMax=112", ["32"]],
    ["sort by total", "sort=total&dir=asc", ["32", "31"]],
    ["sort by number", "sort=number&dir=asc", ["31", "32"]],
    ["sort by item count", "sort=itemCount&dir=desc", ["31", "32"]],
    ["sort by quantity", "sort=qty&dir=asc", ["32", "31"]],
  ])("%s", async (_name, query, numbers) => {
    const r = await twoInvoices();
    const res = await r.send(`/api/invoice?${query}`);
    expect(res.body.items.map((row) => row["number"])).toEqual(numbers);
  });

  test("pages keep the total; a page past the end is empty", async () => {
    const r = await twoInvoices();
    const res = await r.send("/api/invoice?page=2&pageSize=10");
    expect(res.body).toEqual({ items: [], total: 2 });
  });

  test("an unknown sort column is a 400", async () => {
    const r = await withDc();
    const res = await r.send("/api/invoice?sort=buyer");
    expect([res.status, res.body.code]).toEqual([400, "invalid-input"]);
  });
});

describe("GET /api/invoice/stats", () => {
  test("count, total, taxable value and tax over the invoices the filters keep", async () => {
    const r = await twoInvoices();
    expect((await r.send("/api/invoice/stats")).body).toEqual({
      count: 2,
      total: "634.67",
      taxable: "566.67",
      tax: "68",
    });
    expect((await r.send("/api/invoice/stats?valueMin=200")).body).toEqual({
      count: 1,
      total: "522.67",
      taxable: "466.67",
      tax: "56",
    });
  });
});

describe("GET /api/invoice/:id", () => {
  test("the invoice, its PO, its DC, its lines with item details and the linked SRVs", async () => {
    const r = await twoInvoices();
    const res = await r.send(`/api/invoice/${r.inv31}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      invoice: expect.objectContaining({ id: r.inv31, kind: "dc", dcId: r.dcId, number: "31", version: 1 }),
      po: { id: r.poId, poNumber: "4500001", isGemc: false },
      dc: { id: r.dcId, number: "7", date: "2025-04-02", financialYear: "2025-26" },
      items: [
        expect.objectContaining({ poItemId: r.item10, dcItemId: r.dcItem10, qty: "4", rate: "100", poItemNo: 10 }),
        expect.objectContaining({ poItemId: r.item20, dcItemId: r.dcItem20, qty: "2", rate: "33.333", poItemNo: 20 }),
      ],
      srvs: [{ id: expect.any(String), number: "S-1", date: "2025-04-25" }],
      flags: [],
    });
    const inv32 = await r.send(`/api/invoice/${r.inv32}`);
    expect([inv32.body["dc"], inv32.body["srvs"]]).toEqual([null, []]);
  });

  test("open flags on the invoice's lines (DOC_ON_CANCELLED_ITEM)", async () => {
    const r = await withDc();
    // Item 20 leaves the PO: it is cancelled (INV-62).
    await r.send(`/api/po/${r.poId}`, json("PUT", { ...PO, items: [line(10, "10")], version: 2 }));
    const created = await r.createDirect({
      poId: r.poId,
      number: "33",
      invoiceDate: "2025-04-05",
      lines: [{ poItemId: r.item20, qty: "1" }],
    });
    const res = await r.send(`/api/invoice/${created.body.id}`);
    expect((res.body["flags"] as { type: string }[]).map((f) => f.type)).toEqual(["DOC_ON_CANCELLED_ITEM"]);
  });

  test("an unknown invoice is a 404", async () => {
    const r = await withDc();
    const res = await r.send(`/api/invoice/${id("ZZ")}`);
    expect([res.status, res.body.code]).toEqual([404, "invoice-not-found"]);
  });
});
