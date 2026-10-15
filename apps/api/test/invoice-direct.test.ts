// SPEC-11 PR 4: the PO-direct invoice, over HTTP on the full app. One PO (INV-30), at least one line, each qty > 0, no
// cap (INV-31); its quantities count in dsp_qty (INV-03) and lower uninvoiced_qty (INV-05). Lines take the PO item's
// rate. Each create is one batch with recompute, flags, SRV link re-resolution and an audit row (C4). Expected values
// are worked by hand from ARCHITECTURE §6.2, §6.5 and §6.10. Synthetic values only (C1).
import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps } from "./api-app.ts";
import { heldBatches, PO as DC_PO } from "./dc-fixtures.ts";
import { ID, json } from "./helpers.ts";
import { HEADER, ready } from "./invoice-fixtures.ts";
import { NOW } from "./service-deps.ts";

afterEach(closeApiApps);

/** PO 4500001 (item 10 of ord 10 at 100, item 20 of ord 5 at 33.333) and the invoice reads and writes. */
async function withPo(overrides?: Parameters<typeof ready>[0]) {
  const r = await ready(overrides);
  return { ...r, ...(await r.storedPo()) };
}

describe("POST /api/invoice for a PO", () => {
  test("stores the lines at the PO rate with tax, counts them as dispatched and writes one audit row", async () => {
    const { createDirect, poId, item10, item20, items, invoiceLines, invoiceAudit, flags } = await withPo();
    const res = await createDirect({
      poId,
      number: "INV-1",
      invoiceDate: "2025-04-03",
      lines: [
        { poItemId: item10, qty: "3" },
        { poItemId: item20, qty: "1" },
      ],
    });
    expect(res.status).toBe(200);
    // 3 × 100 = 300.00, 6 % = 18.00; 1 × 33.333 -> 33.33, 6 % = 1.9998 -> 2.00 (2 dp, INV-41).
    expect(res.body).toEqual({
      ...HEADER,
      id: expect.any(String),
      kind: "direct",
      poId,
      dcId: null,
      number: "INV-1",
      invoiceDate: "2025-04-03",
      financialYear: "2025-26",
      cgstPct: "6",
      sgstPct: "6",
      taxable: "333.33",
      cgst: "20",
      sgst: "20",
      igst: "0",
      total: "373.33",
      version: 1,
      createdAt: NOW,
    });
    expect(
      (await invoiceLines()).map((l) => [l.poItemId, l.dcItemId, l.qty, l.rate, l.taxable, l.cgst, l.total]),
    ).toEqual([
      [item10, null, 3000, 10000000, 30000000, 1800000, 33600000],
      [item20, null, 1000, 3333300, 3333000, 200000, 3733000],
    ]);
    // A PO-direct invoice counts as dispatched and lowers uninvoiced (INV-03, INV-05).
    expect((await items()).map((i) => [i.dspQty, i.balanceQty, i.uninvoicedQty])).toEqual([
      [3000, 7000, 7000],
      [1000, 4000, 4000],
    ]);
    expect(await flags()).toEqual([]);
    expect(await invoiceAudit()).toEqual([
      expect.objectContaining({
        entityType: "invoice",
        entityId: res.body.id,
        before: null,
        after: {
          poId,
          dcId: null,
          number: "INV-1",
          invoiceDate: "2025-04-03",
          financialYear: "2025-26",
          cgstPct: 600000,
          sgstPct: 600000,
          total: 37333000,
          lines: [
            { poItemId: item10, dcItemId: null, qty: 3000, rate: 10000000 },
            { poItemId: item20, dcItemId: null, qty: 1000, rate: 3333300 },
          ],
        },
      }),
    ]);
  });

  test("a quantity over uninvoiced saves and raises OVER_INVOICE and OVER_DISPATCH (C6, INV-31)", async () => {
    const { createDirect, poId, item10, items, flags } = await withPo();
    const res = await createDirect({
      poId,
      number: "1",
      invoiceDate: "2025-04-03",
      lines: [{ poItemId: item10, qty: "12" }],
    });
    expect(res.status).toBe(200);
    expect((await items())[0]).toMatchObject({ dspQty: 12000, balanceQty: 0, uninvoicedQty: -2000 });
    expect((await flags()).map((f) => [f.type, f.scopeId, f.details])).toEqual([
      ["OVER_DISPATCH", item10, { field: "dsp_qty", expected: "10", actual: "12", docIds: [] }],
      ["OVER_INVOICE", item10, { field: "invoiced_qty", expected: "10", actual: "12", docIds: [] }],
    ]);
  });

  describe("DC 10 and a PO-direct invoice of 10 on ord 10: dsp 20 (EC-13)", () => {
    const direct10 = (c: Awaited<ReturnType<typeof withPo>>) =>
      c.createDirect({
        poId: c.poId,
        number: "2",
        invoiceDate: "2025-04-03",
        lines: [{ poItemId: c.item10, qty: "10" }],
      });

    test("with the DC not invoiced, invoiced 10 is not over ord: OVER_DISPATCH only", async () => {
      const c = await withPo();
      await c.storedDc(c.poId, "1", "2025-04-02", [{ poItemId: c.item10, dspQty: "10" }]);
      expect((await direct10(c)).status).toBe(200);
      expect((await c.items())[0]).toMatchObject({ dspQty: 20000, uninvoicedQty: 0 });
      expect((await c.flags()).map((f) => [f.type, f.scopeId, f.details])).toEqual([
        ["OVER_DISPATCH", c.item10, { field: "dsp_qty", expected: "10", actual: "20", docIds: [] }],
      ]);
    });

    test("with the DC invoiced too, invoiced 20: OVER_DISPATCH and OVER_INVOICE", async () => {
      const c = await withPo();
      const { dcId, lineIds } = await c.storedDc(c.poId, "1", "2025-04-02", [{ poItemId: c.item10, dspQty: "10" }]);
      const lines = [{ dcItemId: lineIds[0], qty: "10", rate: "100" }];
      expect((await c.createInvoice({ dcId, number: "1", invoiceDate: "2025-04-03", lines })).status).toBe(200);
      expect((await direct10(c)).status).toBe(200);
      // A DC-sourced invoice adds nothing to dsp (INV-03); both invoices lower uninvoiced (INV-05).
      expect((await c.items())[0]).toMatchObject({ dspQty: 20000, uninvoicedQty: -10000 });
      expect((await c.flags()).map((f) => [f.type, f.scopeId, f.details])).toEqual([
        ["OVER_DISPATCH", c.item10, { field: "dsp_qty", expected: "10", actual: "20", docIds: [] }],
        ["OVER_INVOICE", c.item10, { field: "invoiced_qty", expected: "10", actual: "20", docIds: [] }],
      ]);
    });
  });

  test("a manual dispatched quantity then a PO-direct invoice: dsp counts both, no overlap flag (EC-10)", async () => {
    let now = "2025-06-01T05:30:00.000Z" as Instant;
    const clock = { today: () => "2025-06-01" as IsoDate, now: () => now };
    const { send, createDirect, poId, item10, items, flags } = await withPo({ clock });
    await send(`/api/po/${poId}/items/${item10}/manual-dispatched`, json("PUT", { qty: "4" }));
    now = "2025-06-01T06:00:00.000Z" as Instant;

    const res = await createDirect({
      poId,
      number: "1",
      invoiceDate: "2025-04-03",
      lines: [{ poItemId: item10, qty: "4" }],
    });
    expect(res.status).toBe(200);
    expect((await items())[0]).toMatchObject({ dspQty: 8000, uninvoicedQty: 6000 });
    expect(await flags()).toEqual([]);
  });

  describe("malformed lines are a 400 and write nothing (INV-30, INV-31)", () => {
    type Ids = { item10: string; other: string };
    test.each([
      ["no lines", () => [], "no-lines", "body.lines"],
      ["qty 0", (ids: Ids) => [{ poItemId: ids.item10, qty: "0" }], "qty-not-positive", "body.lines.0.qty"],
      [
        "an item of another PO",
        (ids: Ids) => [
          { poItemId: ids.item10, qty: "1" },
          { poItemId: ids.other, qty: "1" },
        ],
        "line-not-on-po",
        "body.lines.1.poItemId",
      ],
    ])("%s", async (_name, lines, code, path) => {
      const c = await withPo();
      const other = await c.storedPo({ ...DC_PO, poNumber: "4500009" });
      const before = await c.written();

      const res = await c.createDirect({
        poId: c.poId,
        number: "1",
        invoiceDate: "2025-04-03",
        lines: lines({ item10: c.item10, other: other.item10 }),
      });
      expect([res.status, res.body.code]).toEqual([400, code]);
      expect(res.body["details"]).toMatchObject({ fields: [{ path }] });
      expect(await c.written()).toEqual(before);
    });
  });

  test("an unknown PO is a 404 and writes nothing", async () => {
    const { createDirect, invoices } = await ready();
    const res = await createDirect({
      poId: ID,
      number: "1",
      invoiceDate: "2025-04-03",
      lines: [{ poItemId: ID, qty: "1" }],
    });
    expect([res.status, res.body.code]).toEqual([404, "po-not-found"]);
    expect(await invoices()).toEqual([]);
  });

  test("a number taken in the FY by a DC-sourced invoice is a 409 and writes nothing (INV-22)", async () => {
    const { storedDc, createInvoice, createDirect, poId, item10, written } = await withPo();
    const { dcId, lineIds } = await storedDc(poId, "1", "2025-04-02", [{ poItemId: item10, dspQty: "1" }]);
    const lines = [{ dcItemId: lineIds[0], qty: "1", rate: "100" }];
    expect((await createInvoice({ dcId, number: "5", invoiceDate: "2025-04-03", lines })).status).toBe(200);
    const before = await written();

    const res = await createDirect({
      poId,
      number: "5",
      invoiceDate: "2026-03-31",
      lines: [{ poItemId: item10, qty: "1" }],
    });
    expect([res.status, res.body.code, res.body["message"]]).toEqual([
      409,
      "invoice-number-taken",
      "Invoice 5 already exists in FY 2025-26.",
    ]);
    expect(await written()).toEqual(before);
  });
});

describe("two PO-direct creates built from the same read before either commits", () => {
  test("one PO, two numbers: both save and the items count both (no stale recompute)", async () => {
    const held = heldBatches();
    const { createDirect, poId, item10, invoices, invoiceAudit, items } = await withPo({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all(
      ["1", "2"].map((number) =>
        createDirect({ poId, number, invoiceDate: "2025-04-03", lines: [{ poItemId: item10, qty: "3" }] }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await invoices()).toHaveLength(2);
    expect(await invoiceAudit()).toHaveLength(2);
    expect((await items())[0]).toMatchObject({ dspQty: 6000, uninvoicedQty: 4000 });
  });

  test("one number in one FY: one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const { createDirect, poId, item10, invoices, invoiceAudit, items } = await withPo({ db: held.wrap });
    held.hold(2);
    const results = await Promise.all(
      ["2025-04-03", "2025-04-04"].map((invoiceDate) =>
        createDirect({ poId, number: "1", invoiceDate, lines: [{ poItemId: item10, qty: "3" }] }),
      ),
    );
    expect(results.map((r) => [r.status, r.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "invoice-number-taken"],
    ]);
    expect(await invoices()).toHaveLength(1);
    expect(await invoiceAudit()).toHaveLength(1);
    expect((await items())[0]).toMatchObject({ dspQty: 3000, uninvoicedQty: 7000 });
  });
});
