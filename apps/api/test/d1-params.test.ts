// D1 binds at most 100 parameters to one statement (C4, #43 review): every write and id-list read stays under it when
// a document has more than 100 lines. Each step runs as a user would, over HTTP on the full app. Synthetic values
// only (C1).
import { zQty } from "@senstosales/schemas";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps, onboardedApp } from "./api-app.ts";
import { line, PO } from "./dc-fixtures.ts";
import { json, mostBoundParams } from "./helpers.ts";
import { d as day } from "./seed-rows.ts";
import { srvPage } from "./srv-pages.ts";

type App = Awaited<ReturnType<typeof onboardedApp>>;

const LINES = 120;
const NOS = Array.from({ length: LINES }, (_, i) => 10 * (i + 1));
const BIG_PO = { ...PO, items: NOS.map((no) => line(no, "10")) };

let app: App;
beforeEach(async () => {
  app = await onboardedApp();
});
afterEach(closeApiApps);

/** The most parameters one statement bound during `run`, which must also succeed. */
const most = (run: () => Promise<unknown>) => mostBoundParams(app.db, run);

/** The PO, sent as the wire JSON of the manual PO form. */
async function bigPo() {
  const created = (await (await app.send("/api/po", json("POST", BIG_PO))).json()) as { id: string; version: number };
  const detail = await app.client.request("po.detail", { params: { id: created.id } });
  return { poId: created.id, version: created.version, itemIds: detail.items.map((item) => item.id) };
}

/** A DC dispatching 11 of each 10 ordered, so every line opens an OVER_DISPATCH flag. */
async function bigDc(poId: string, itemIds: readonly string[]) {
  const form = await app.client.request("dc.dispatchable", { params: { poId } });
  const items = itemIds.map((poItemId) => ({ poItemId, dspQty: zQty.decode("11"), packets: null }));
  const body = { ...form.defaults, poId, number: "1", dcDate: day("2025-04-05"), gcNumber: null, gcDate: null, items };
  return app.client.request("dc.create", { body });
}

describe(`a document with ${LINES} lines binds at most 100 parameters per statement`, () => {
  test("SRVs stored before their PO, then the PO created and matched to them", async () => {
    const rows = NOS.map((no, i) => ({ srv: String(9_000_001 + i), date: "10/04/2025", item: no, rcd: "1.000" }));
    expect(
      await most(async () => {
        const res = await app.client.request("srv.upload", {
          body: { files: [{ name: "srv.html", html: srvPage(PO.poNumber, rows) }] },
        });
        expect(res.results.map((r) => r.status)).toEqual(["accepted"]);
        await bigPo();
      }),
    ).toBeLessThanOrEqual(100);
    const srvs = await app.client.request("srv.list", { query: { pageSize: 10 } });
    expect(srvs.total).toBe(LINES);
  });

  test("one SRV with every line", async () => {
    await bigPo();
    const rows = NOS.map((no) => ({ srv: "9000001", date: "10/04/2025", item: no, rcd: "1.000" }));
    const html = srvPage(PO.poNumber, rows);
    expect(
      await most(async () => {
        await app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
        // Uploaded again, it replaces its own lines.
        await app.client.request("srv.upload", { body: { files: [{ name: "srv.html", html }] } });
      }),
    ).toBeLessThanOrEqual(100);
    const [srv] = (await app.client.request("srv.list", {})).items;
    const detail = await app.client.request("srv.detail", { params: { id: srv!.id } });
    expect(detail.items).toHaveLength(LINES);
  });

  test("a DC and its invoice, each opening a flag on every line", async () => {
    const { poId, itemIds } = await bigPo();
    let dcId = "";
    expect(
      await most(async () => {
        dcId = (await bigDc(poId, itemIds)).id;
        const preview = await app.client.request("invoice.previewDc", { params: { dcId } });
        const lines = preview.lines.map((l) => ({
          dcItemId: l.dcItemId!,
          qty: l.qty!,
          rate: l.rate,
          hsn: l.hsn,
          packets: l.packets,
        }));
        const header = { ...preview.header, kind: "dc" as const, dcId, number: "1", invoiceDate: day("2025-04-06") };
        await app.client.request("invoice.create", { body: { ...header, lines } });
      }),
    ).toBeLessThanOrEqual(100);
    const dc = await app.client.request("dc.detail", { params: { id: dcId } });
    expect(dc.items).toHaveLength(LINES);
    const flags = await app.client.request("flags.list", { query: { pageSize: 10 } });
    // OVER_DISPATCH from the DC and OVER_INVOICE from the invoice, on each item.
    expect(flags.total).toBe(2 * LINES);
  });

  test("a PO edit that cancels every item but one", async () => {
    const { poId, version } = await bigPo();
    expect(
      await most(async () => {
        const res = await app.send(`/api/po/${poId}`, json("PUT", { ...PO, items: [line(10, "10")], version }));
        expect(res.status).toBe(200);
      }),
    ).toBeLessThanOrEqual(100);
    const detail = await app.client.request("po.detail", { params: { id: poId } });
    expect(detail.items.filter((item) => item.cancelledAt !== null)).toHaveLength(LINES - 1);
  });

  test("the DC list at 100 a page", async () => {
    const { poId, itemIds } = await bigPo();
    const form = await app.client.request("dc.dispatchable", { params: { poId } });
    for (let n = 1; n <= 100; n += 1) {
      const items = [{ poItemId: itemIds[0]!, dspQty: zQty.decode("1"), packets: null }];
      const body = {
        ...form.defaults,
        poId,
        number: String(n),
        dcDate: day("2025-04-05"),
        gcNumber: null,
        gcDate: null,
      };
      await app.client.request("dc.create", { body: { ...body, items } });
    }
    let total = 0;
    expect(
      await most(async () => {
        total = (await app.client.request("dc.list", { query: { pageSize: 100 } })).items.length;
      }),
    ).toBeLessThanOrEqual(100);
    expect(total).toBe(100);
  });
});
