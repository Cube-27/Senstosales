// SPEC-10 PR 2: manual PO create and edit (the legacy `/po/create` form) and PO delete, over HTTP on the full app.
// Expected values are worked by hand from ARCHITECTURE §6.2, §6.4 and §6.7. Synthetic values only (C1).
import type { Instant } from "@senstosales/db";
import { dc, invoice, poItem, poLot, reconciliationIssue, srv, srvItem, supplier } from "@senstosales/db";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps, onboardedApp } from "./api-app.ts";
import { json } from "./helpers.ts";

type App = Awaited<ReturnType<typeof onboardedApp>>;
let app: App;
beforeEach(async () => {
  app = await onboardedApp();
});
afterEach(closeApiApps);

const at = (s: string) => s as Instant;
const FY = "2025-26" as Fy;

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

const BODY = {
  poNumber: "4500001",
  poDate: "2025-04-10",
  enquiry: "ENQ-1",
  quotation: null,
  orderType: "SUPPLY",
  gemcNumber: null,
  remarks: null,
  rawHeader: { "ORD-TYPE": "SUPPLY" },
  items: [LINE],
};

/** A GEMC PO: the form takes the GST-inclusive rate (INV-20). */
const GEMC_BODY = { ...BODY, gemcNumber: "GEMC-77", items: [{ ...LINE, rateSource: "848.75" }] };

type Json = Record<string, unknown>;

/** The JSON fields these tests read; each test asserts the values. */
interface Wire extends Json {
  id: string;
  code: string;
  total: number;
  version: number;
  po: Json;
  items: (Json & { id: string; lots: unknown })[];
  linked: Json;
}

const send = async (path: string, init?: RequestInit) => {
  const res = await app.send(path, init);
  return { status: res.status, body: (await res.json()) as Wire };
};
const create = (body: unknown = BODY) => send("/api/po", json("POST", body));
const update = (id: string, body: unknown) => send(`/api/po/${id}`, json("PUT", body));
const remove = (id: string) => send(`/api/po/${id}`, json("DELETE", {}));
const detail = (id: string) => send(`/api/po/${id}`);

async function created(body: unknown = BODY): Promise<string> {
  const res = await create(body);
  expect(res.status).toBe(200);
  return res.body.id;
}

const supplierId = async () => (await app.db.query(app.db.build.select({ id: supplier.id }).from(supplier)))[0]!.id;
const auditOf = async (action: string) => (await app.audit()).filter((row) => row.action === action);

describe("POST /api/po (manual create)", () => {
  test("stores the header and items; derived columns come from recompute; one audit row", async () => {
    const res = await create();
    expect(res.status).toBe(200);
    const { id } = res.body;
    expect(res.body).toEqual({
      id,
      poNumber: "4500001",
      poDate: "2025-04-10",
      buyerId: null,
      enquiry: "ENQ-1",
      quotation: null,
      orderType: "SUPPLY",
      bhelStatusCode: null,
      amendNo: 0,
      poValue: null,
      netPoValue: null,
      isGemc: false,
      gemcNumber: null,
      remarks: null,
      rawHeader: { "ORD-TYPE": "SUPPLY" },
      status: "Pending",
      ordQty: "10",
      dspQty: "0",
      rcdQty: "0",
      rejQty: "0",
      balanceQty: "10",
      version: 1,
    });
    const { body } = await detail(id);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      poItemNo: 10,
      materialCode: "M-10",
      description: "Example part",
      unit: "NOS",
      ordQty: "10",
      rateSource: "100",
      rate: "100",
      poRcdQty: "0",
      poRejQty: null,
      manualDispatchedQty: "0",
      balanceQty: "10",
      uninvoicedQty: "10",
      status: "Pending",
    });
    expect(body.items[0]!.lots).toMatchObject([
      { lotNo: 1, delyQty: "10", delyDate: "2025-05-15", entryAllowDate: null, destCode: "D1" },
    ]);
    const rows = await auditOf("po.create");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "po", entityId: id, before: null, actor: "admin" });
  });

  test("GEMC: the GST-inclusive 848.75 is kept as the source and the net 719.27966 stored (INV-20)", async () => {
    const id = await created(GEMC_BODY);
    const { body } = await detail(id);
    expect(body.po).toMatchObject({ isGemc: true, gemcNumber: "GEMC-77" });
    expect(body.items[0]).toMatchObject({ rateSource: "848.75", rate: "719.27966" });
  });

  test("an item without lots gets the legacy default lot: lot 1 of the ordered quantity on the PO date", async () => {
    const id = await created({ ...BODY, items: [{ ...LINE, lots: [] }] });
    const { body } = await detail(id);
    expect(body.items[0]!.lots).toMatchObject([
      { lotNo: 1, delyQty: "10", delyDate: "2025-04-10", entryAllowDate: null, destCode: null },
    ]);
  });

  test("a PO number already stored -> 409 and nothing changes", async () => {
    await created();
    const before = await app.audit();
    const res = await create({ ...BODY, items: [{ ...LINE, ordQty: "99" }] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "po-exists", message: "PO 4500001 is already stored." });
    expect(await app.audit()).toEqual(before);
  });

  test.each([
    ["no items", { ...BODY, items: [] }, "no-items"],
    ["no PO date", { ...BODY, poDate: null }, "no-po-date"],
    ["ordered quantity 0", { ...BODY, items: [{ ...LINE, ordQty: "0" }] }, "qty-not-positive"],
    ["rate 0", { ...BODY, items: [{ ...LINE, rateSource: "0" }] }, "rate-not-positive"],
    ["an item number twice", { ...BODY, items: [LINE, LINE] }, "duplicate-item"],
  ])("%s -> 400 and nothing is stored", async (_, body, code) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    expect((await send("/api/po")).body.total).toBe(0);
  });

  test("SRVs stored while the PO was not found are attached and received (INV-40, A2-9)", async () => {
    const s = await supplierId();
    await app.db.batch([
      app.db.build.insert(srv).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RA",
        supplierId: s,
        poNumber: "4500001",
        poId: null,
        srvNumber: "SRV-1",
        srvDate: "2025-05-01" as IsoDate,
        financialYear: FY,
        rawHeader: {},
      }),
      app.db.build.insert(srvItem).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RL",
        supplierId: s,
        srvId: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RA",
        poItemId: null,
        materialCode: "M-10",
        poItemNo: 10,
        lotNo: 1,
        rowNo: 1,
        srvItemNo: 1,
        ordQty: 10_000 as Qty,
        rcdQty: 3_000 as Qty,
        acceptedQty: 3_000 as Qty,
        rejQty: 0 as Qty,
      }),
    ]);
    const id = await created();
    const { body } = await detail(id);
    expect(body.items[0]).toMatchObject({ rcdQty: "3", rejQty: "0" });
    expect(body.linked).toMatchObject({
      srvs: [{ id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RA", number: "SRV-1", date: "2025-05-01" }],
    });
  });
});

describe("PUT /api/po/:id (manual edit)", () => {
  test("re-saving an unchanged GEMC PO keeps 848.75 and 719.27966 and bumps the version (INV-17, INV-20)", async () => {
    const id = await created(GEMC_BODY);
    const first = await update(id, { ...GEMC_BODY, version: 1 });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);
    const second = await update(id, { ...GEMC_BODY, version: 2 });
    expect(second.body.version).toBe(3);
    const { body } = await detail(id);
    expect(body.items[0]).toMatchObject({ rateSource: "848.75", rate: "719.27966" });
  });

  test("changes header and item values, recomputes, and audits before and after", async () => {
    const id = await created();
    const res = await update(id, {
      ...BODY,
      remarks: "Revised",
      items: [{ ...LINE, ordQty: "12", rateSource: "110" }],
      version: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ remarks: "Revised", ordQty: "12", balanceQty: "12", version: 2 });
    const { body } = await detail(id);
    expect(body.items[0]).toMatchObject({ ordQty: "12", rateSource: "110", rate: "110", balanceQty: "12" });
    const rows = await auditOf("po.update");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "po", entityId: id });
    expect(rows[0]!.before).toMatchObject({ remarks: null, version: 1 });
    expect(rows[0]!.after).toMatchObject({ remarks: "Revised" });
  });

  test("an item left out is cancelled and keeps its row; sending it again restores it (INV-48)", async () => {
    const LINE_20 = { ...LINE, poItemNo: 20, materialCode: "M-20", ordQty: "5", lots: [] };
    const id = await created({ ...BODY, items: [LINE, LINE_20] });
    await update(id, { ...BODY, items: [LINE], version: 1 });
    let { items } = (await detail(id)).body;
    expect(items.map((i) => [i["poItemNo"], i["cancelledAt"] !== null])).toEqual([
      [10, false],
      [20, true],
    ]);
    expect((await detail(id)).body.po).toMatchObject({ ordQty: "10" });
    await update(id, { ...BODY, items: [LINE, LINE_20], version: 2 });
    items = (await detail(id)).body.items;
    expect(items.map((i) => i["cancelledAt"])).toEqual([null, null]);
  });

  test("keeps what the form does not carry: amendment, BHEL status, value, document rcd/rej, manual qty, entry-allow", async () => {
    const id = await created();
    await app.db.batch([
      // A PO first stored by upload carries these; the form has no fields for them.
      app.db.build.run(sql`UPDATE po SET amend_no = 2, bhel_status_code = 'O', po_value_u5 = 100000000`),
      app.db.build.run(
        sql`UPDATE po_item SET po_rcd_qty_m = 4000, po_rej_qty_m = 1000, manual_dispatched_qty_m = 3000`,
      ),
      app.db.build.run(sql`UPDATE po_lot SET entry_allow_note = 'On request'`),
    ]);
    const res = await update(id, { ...BODY, version: 1 });
    expect(res.body).toMatchObject({ amendNo: 2, bhelStatusCode: "O", poValue: "1000", dspQty: "3", rcdQty: "4" });
    const { body } = await detail(id);
    // balance = ord 10 - max(rcd 4, dsp 3) = 6 (ARCHITECTURE §6.2).
    expect(body.items[0]).toMatchObject({ poRcdQty: "4", poRejQty: "1", manualDispatchedQty: "3", balanceQty: "6" });
    expect(body.items[0]!.lots).toMatchObject([{ lotNo: 1, entryAllowNote: "On request" }]);
  });

  test("a stale version -> 409 and nothing changes (INV-95)", async () => {
    const id = await created();
    await update(id, { ...BODY, remarks: "First", version: 1 });
    const before = await detail(id);
    const res = await update(id, { ...BODY, remarks: "Second", version: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("stale-version");
    expect(await detail(id)).toEqual(before);
    expect(await auditOf("po.update")).toHaveLength(1);
  });

  test("a different PO number -> 400; unknown PO -> 404", async () => {
    const id = await created();
    const renamed = await update(id, { ...BODY, poNumber: "4500002", version: 1 });
    expect(renamed.status).toBe(400);
    expect(renamed.body.code).toBe("po-number-changed");
    const missing = await update("01J9Z8Q4S5T6V7W8X9Y0Z1A2ZZ", { ...BODY, version: 1 });
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /api/po/:id", () => {
  async function addDc(poId: string) {
    await app.db.batch([
      app.db.build.insert(dc).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2DA",
        supplierId: await supplierId(),
        poId,
        number: "DC-1",
        dcDate: "2025-04-20" as IsoDate,
        financialYear: FY,
        gcNumber: "DC-1",
        gcDate: "2025-04-20" as IsoDate,
        createdAt: at("2025-04-20T00:00:00.000Z"),
      }),
    ]);
  }

  async function addDirectInvoice(poId: string) {
    const zero = 0 as Money;
    await app.db.batch([
      app.db.build.insert(invoice).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2NA",
        supplierId: await supplierId(),
        poId,
        dcId: null,
        kind: "direct",
        number: "INV-1",
        invoiceDate: "2025-04-21" as IsoDate,
        financialYear: FY,
        cgstPct: 900000 as GstPct,
        sgstPct: 900000 as GstPct,
        taxable: zero,
        cgst: zero,
        sgst: zero,
        igst: zero,
        total: zero,
        createdAt: at("2025-04-21T00:00:00.000Z"),
      }),
    ]);
  }

  test.each([
    ["a DC", addDc, "po-has-dc", "This PO has delivery challans. Delete them first."],
    ["an invoice", addDirectInvoice, "po-has-invoice", "This PO has invoices. Delete them first."],
  ])("a PO with %s -> 409 with the reason, and nothing changes (INV-35)", async (_, add, reason, message) => {
    const id = await created();
    await add(id);
    const before = await app.audit();
    const res = await remove(id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "delete-blocked", message, details: { reason } });
    expect((await detail(id)).status).toBe(200);
    expect(await app.audit()).toEqual(before);
  });

  test("removes the PO, its items, lots and flags; its SRVs become PO not found; one audit row", async () => {
    const id = await created();
    const s = await supplierId();
    const itemId = (await detail(id)).body.items[0]!.id;
    await app.db.batch([
      app.db.build.insert(srv).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RA",
        supplierId: s,
        poNumber: "4500001",
        poId: id,
        srvNumber: "SRV-1",
        srvDate: "2025-05-01" as IsoDate,
        financialYear: FY,
        rawHeader: {},
      }),
      app.db.build.insert(srvItem).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RL",
        supplierId: s,
        srvId: "01J9Z8Q4S5T6V7W8X9Y0Z1A2RA",
        poItemId: itemId,
        materialCode: "M-10",
        poItemNo: 10,
        lotNo: 1,
        rowNo: 1,
        srvItemNo: 1,
        ordQty: 10_000 as Qty,
        rcdQty: 3_000 as Qty,
        acceptedQty: 3_000 as Qty,
        rejQty: 0 as Qty,
      }),
      app.db.build.insert(reconciliationIssue).values({
        id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2FA",
        supplierId: s,
        type: "QTY_MISMATCH",
        scopeType: "po_item",
        scopeId: itemId,
        poId: id,
        fingerprint: "fp-FA",
        details: { field: "rcd", expected: "4", actual: "3", docIds: [] },
        status: "open",
        note: null,
        openedAt: at("2025-05-02T05:30:00.000Z"),
        acknowledgedAt: null,
      }),
    ]);

    const res = await remove(id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await detail(id)).status).toBe(404);
    const b = app.db.build;
    expect(await app.db.query(b.select().from(poItem))).toEqual([]);
    expect(await app.db.query(b.select().from(poLot))).toEqual([]);
    expect(await app.db.query(b.select().from(reconciliationIssue))).toEqual([]);
    expect(await app.db.query(b.select({ poId: srv.poId, poNumber: srv.poNumber }).from(srv))).toEqual([
      { poId: null, poNumber: "4500001" },
    ]);
    expect(await app.db.query(b.select({ poItemId: srvItem.poItemId }).from(srvItem))).toEqual([{ poItemId: null }]);
    const rows = await auditOf("po.delete");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "po", entityId: id, after: null });
    expect(rows[0]!.before).toMatchObject({ poNumber: "4500001", poDate: "2025-04-10" });
  });

  test("the PO number can be created again after a delete", async () => {
    const id = await created();
    await remove(id);
    expect((await create()).status).toBe(200);
  });

  test("unknown PO -> 404", async () => {
    const res = await remove("01J9Z8Q4S5T6V7W8X9Y0Z1A2ZZ");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("po-not-found");
  });
});
