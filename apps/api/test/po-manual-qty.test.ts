// SPEC-10 PR 3: the item-level manual dispatched quantity (A-15, INV-08), over HTTP on the full app. Expected values
// are worked by hand from ARCHITECTURE §6.2 and §6.8. Synthetic values only (C1).
import { poItem, reconciliationIssue } from "@senstosales/db";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { apiRoutes } from "../src/routes/index.ts";
import { closeApiApps, onboardedApp } from "./api-app.ts";
import { json, testApp } from "./helpers.ts";
import { NOW } from "./service-deps.ts";

type App = Awaited<ReturnType<typeof onboardedApp>>;
let app: App;
beforeEach(async () => {
  app = await onboardedApp();
});
afterEach(closeApiApps);

const LINE = {
  poItemNo: 10,
  materialCode: "M-10",
  description: "Example part",
  drawingNo: null,
  unit: "NOS",
  ordQty: "10",
  rateSource: "100",
  lots: [{ lotNo: 1, delyQty: "10", delyDate: "2025-05-15", destCode: "D1" }],
};

const PO = {
  poNumber: "4500001",
  poDate: "2025-04-10",
  enquiry: "ENQ-1",
  quotation: null,
  orderType: "SUPPLY",
  gemcNumber: null,
  remarks: null,
  rawHeader: {},
  items: [LINE],
};

type Json = Record<string, unknown>;

/** The JSON fields these tests read; each test asserts the values. */
interface Wire extends Json {
  id: string;
  code: string;
  po: Json;
  items: (Json & { id: string })[];
}

const send = async (path: string, init?: RequestInit) => {
  const res = await app.send(path, init);
  return { status: res.status, body: (await res.json()) as Wire };
};

/** A stored PO with one item of ord 10, and that item's id. */
async function stored(): Promise<{ poId: string; itemId: string }> {
  const created = await send("/api/po", json("POST", PO));
  const poId = created.body.id;
  const { body } = await send(`/api/po/${poId}`);
  return { poId, itemId: body.items[0]!.id };
}

const setManual = (poId: string, itemId: string, body: unknown) =>
  send(`/api/po/${poId}/items/${itemId}/manual-dispatched`, json("PUT", body));

const auditRows = async () => (await app.audit()).filter((row) => row.action === "po_item.manual_dispatched");
const items = () => app.db.query(app.db.build.select().from(poItem));
const flags = () => app.db.query(app.db.build.select().from(reconciliationIssue));

describe("PUT /api/po/:id/items/:itemId/manual-dispatched", () => {
  test("(ord 10, manual 4) -> dsp 4, balance 6; the PO is recomputed; audit before/after (INV-08)", async () => {
    const { poId, itemId } = await stored();
    const res = await setManual(poId, itemId, { qty: "4", note: "Sent by hand" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: itemId,
      ordQty: "10",
      manualDispatchedQty: "4",
      manualNote: "Sent by hand",
      manualSetAt: NOW,
      dspQty: "4",
      balanceQty: "6",
      status: "Pending",
    });
    const { body } = await send(`/api/po/${poId}`);
    expect(body.po).toMatchObject({ ordQty: "10", dspQty: "4", balanceQty: "6", version: 2 });
    expect(body.items[0]).toMatchObject({ manualDispatchedQty: "4", dspQty: "4", balanceQty: "6" });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: "po_item",
      entityId: itemId,
      before: { manualDispatchedQty: 0, manualNote: null },
      after: { manualDispatchedQty: 4000, manualNote: "Sent by hand" },
    });
  });

  test("a second change audits the first as before; no note clears it; 0 restores dsp 0", async () => {
    const { poId, itemId } = await stored();
    await setManual(poId, itemId, { qty: "4", note: "Sent by hand" });
    const res = await setManual(poId, itemId, { qty: "0" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ manualDispatchedQty: "0", manualNote: null, dspQty: "0", balanceQty: "10" });
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      before: { manualDispatchedQty: 4000, manualNote: "Sent by hand" },
      after: { manualDispatchedQty: 0, manualNote: null },
    });
  });

  test("past the ordered quantity it is accepted and OVER_DISPATCH is raised (C6, INV-51)", async () => {
    const { poId, itemId } = await stored();
    const res = await setManual(poId, itemId, { qty: "12" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dspQty: "12", balanceQty: "0" }); // INV-04: never below 0
    expect((await flags()).map((f) => [f.type, f.scopeId, f.status, f.details])).toEqual([
      ["OVER_DISPATCH", itemId, "open", { field: "dsp_qty", expected: "10", actual: "12", docIds: [] }],
    ]);
  });

  test("a cancelled item takes it: dsp 2, balance 0, and the PO totals leave the item out (EC-34, INV-07)", async () => {
    const item20 = { ...LINE, poItemNo: 20, materialCode: "M-20" };
    const created = await send("/api/po", json("POST", { ...PO, items: [LINE, item20] }));
    const poId = created.body.id;
    // INV-48: an item left out of the edit is cancelled.
    expect((await send(`/api/po/${poId}`, json("PUT", { ...PO, version: 1 }))).status).toBe(200);
    const cancelled = (await send(`/api/po/${poId}`)).body.items[1]!;
    const res = await setManual(poId, cancelled.id, { qty: "2" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      poItemNo: 20,
      manualDispatchedQty: "2",
      dspQty: "2",
      balanceQty: "0",
      status: "Cancelled",
    });
    expect((await send(`/api/po/${poId}`)).body.po).toMatchObject({ ordQty: "10", dspQty: "0", balanceQty: "10" });
  });

  test("-1 -> 400 on the qty field and nothing changes", async () => {
    const { poId, itemId } = await stored();
    const before = { items: await items(), audit: await app.audit() };
    const res = await setManual(poId, itemId, { qty: "-1" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "negative-qty" });
    expect({ items: await items(), audit: await app.audit() }).toEqual(before);
  });

  test("bumps the PO version, so an edit opened before it is stale (INV-95)", async () => {
    const { poId, itemId } = await stored();
    await setManual(poId, itemId, { qty: "4" });
    const res = await send(`/api/po/${poId}`, json("PUT", { ...PO, version: 1 }));
    expect(res.status).toBe(409);
  });

  test("unknown PO -> 404; an item of another PO -> 404", async () => {
    const { itemId } = await stored();
    const other = await send("/api/po", json("POST", { ...PO, poNumber: "4500002" }));
    const unknownPo = await setManual("01J9Z8Q4S5T6V7W8X9Y0Z1A2ZZ", itemId, { qty: "1" });
    expect([unknownPo.status, unknownPo.body.code]).toEqual([404, "po-not-found"]);
    const wrongPo = await setManual(other.body.id, itemId, { qty: "1" });
    expect([wrongPo.status, wrongPo.body.code]).toEqual([404, "po-item-not-found"]);
    expect(await auditRows()).toEqual([]);
  });

  test("signed out -> 401 and nothing changes", async () => {
    const { poId, itemId } = await stored();
    const before = await items();
    const { send: signedOut } = testApp(apiRoutes(app.services), () => Promise.resolve(false));
    const res = await signedOut(`/api/po/${poId}/items/${itemId}/manual-dispatched`, json("PUT", { qty: "4" }));
    expect(res.status).toBe(401);
    expect(await items()).toEqual(before);
  });
});
