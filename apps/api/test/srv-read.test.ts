// SPEC-10 PR 4: SRV list, by-PO list, stats, detail and delete over seeded synthetic rows. Expected values worked by
// hand from ARCHITECTURE §6.3 (INV-11..INV-13) and the legacy SRV list columns. Synthetic values only (C1).
import type { Instant } from "@senstosales/db";
import { insertRows, po, poItem, reconciliationIssue, srv, srvItem, supplier } from "@senstosales/db";
import type { Fy, IsoDate, Money, Qty } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { apiRoutes } from "../src/routes/index.ts";
import { closeApiApps, onboardedApp } from "./api-app.ts";
import { ID, json, testApp } from "./helpers.ts";

afterEach(closeApiApps);

const q = (n: number) => n as Qty;
const zero = q(0);

const P1 = "01J9Z8Q4S5T6V7W8X9Y0P10000";
const I1 = "01J9Z8Q4S5T6V7W8X9Y0M10000";
const I2 = "01J9Z8Q4S5T6V7W8X9Y0M20000";
const S1 = "01J9Z8Q4S5T6V7W8X9Y0S10000";
const S2 = "01J9Z8Q4S5T6V7W8X9Y0S20000";
const S3 = "01J9Z8Q4S5T6V7W8X9Y0S30000";
const L1 = "01J9Z8Q4S5T6V7W8X9Y0N10000";
const L2 = "01J9Z8Q4S5T6V7W8X9Y0N20000";
const L3 = "01J9Z8Q4S5T6V7W8X9Y0N30000";
const L4 = "01J9Z8Q4S5T6V7W8X9Y0N40000";

type App = Awaited<ReturnType<typeof onboardedApp>>;

async function supplierId({ db }: App): Promise<string> {
  const [row] = await db.query(db.build.select({ id: supplier.id }).from(supplier));
  if (row === undefined) throw new Error("not onboarded");
  return row.id;
}

const srvRow = (
  supplierId: string,
  id: string,
  poNumber: string,
  poId: string | null,
  srvNumber: string,
  date: string,
) => ({
  supplierId,
  id,
  poNumber,
  poId,
  srvNumber,
  srvDate: date as IsoDate,
  financialYear: "2025-26" as Fy,
  rawHeader: { "SRV NO": srvNumber },
});

const line = (
  supplierId: string,
  id: string,
  srvId: string,
  poItemId: string | null,
  [rcd, accepted, rej]: [number | null, number | null, number | null],
) => ({
  supplierId,
  id,
  srvId,
  poItemId,
  materialCode: "M-1",
  poItemNo: poItemId === I2 ? 20 : 10,
  lotNo: 1,
  srvItemNo: 1,
  ordQty: q(10_000),
  rcdQty: rcd === null ? null : q(rcd),
  acceptedQty: accepted === null ? null : q(accepted),
  rejQty: rej === null ? null : q(rej),
  challanNo: null,
  challanDate: null,
  invoiceNo: null,
  invoiceDate: null,
  resolvedDcId: null,
  resolvedInvoiceId: null,
});

/**
 * PO 4500001 (P1, dated 2025-04-10): I1 ord 10 at 100 (PO document rcd 6, rej 1), I2 ord 5 at 20 (PO rcd 0).
 * - S1 9000001, 2025-05-01: I1 rcd 0 accepted 4 rej 1; I2 rcd 2. Totals ord 15, rcd 6, rej 1, value 440.
 * - S2 9000002, 2025-05-10: I1 rcd 3, cites invoice INV-77. Totals ord 10, rcd 3, rej 0, value 300.
 * - S3 9000003, 2025-04-20, PO 4500999 not in the system (INV-40): one unmatched line rcd 7. Totals rcd 7, value 0.
 * The stored derived columns are those recompute left with S1 and S2 (SRV wins): I1 rcd 7 rej 1, I2 rcd 2.
 */
async function seed(app: App) {
  const s = await supplierId(app);
  const { db } = app;
  const b = db.build;
  const item = (
    id: string,
    no: number,
    ord: number,
    rate: number,
    poRcd: number,
    poRej: number | null,
    rcd: number,
    rej: number,
  ) => ({
    supplierId: s,
    id,
    poId: P1,
    poItemNo: no,
    materialCode: `M-${no}`,
    ordQty: q(ord),
    rateSource: rate as Money,
    rate: rate as Money,
    poRcdQty: q(poRcd),
    poRejQty: poRej === null ? null : q(poRej),
    status: "Pending" as const,
    dspQty: zero,
    rcdQty: q(rcd),
    rejQty: q(rej),
    balanceQty: q(ord),
    uninvoicedQty: zero,
  });
  await db.batch([
    b.insert(po).values({
      supplierId: s,
      id: P1,
      poNumber: "4500001",
      poDate: "2025-04-10" as IsoDate,
      amendNo: 0,
      isGemc: false,
      rawHeader: {},
      status: "Pending",
      ordQty: q(15_000),
      dspQty: zero,
      rcdQty: q(9_000),
      rejQty: q(1_000),
      balanceQty: q(15_000),
    }),
    b
      .insert(poItem)
      .values([
        item(I1, 10, 10_000, 100_00000, 6_000, 1_000, 7_000, 1_000),
        item(I2, 20, 5_000, 20_00000, 0, null, 2_000, 0),
      ]),
    b
      .insert(srv)
      .values([
        srvRow(s, S1, "4500001", P1, "9000001", "2025-05-01"),
        srvRow(s, S2, "4500001", P1, "9000002", "2025-05-10"),
        srvRow(s, S3, "4500999", null, "9000003", "2025-04-20"),
      ]),
    b
      .insert(srvItem)
      .values([
        line(s, L1, S1, I1, [0, 4_000, 1_000]),
        { ...line(s, L2, S1, I2, [2_000, null, 0]), srvItemNo: 2, ordQty: q(5_000) },
        { ...line(s, L3, S2, I1, [3_000, null, null]), invoiceNo: "INV-77", invoiceDate: "2025-05-09" as IsoDate },
        line(s, L4, S3, null, [7_000, null, null]),
      ]),
  ]);
  return s;
}

const ROW_S1 = {
  id: S1,
  srvNumber: "9000001",
  srvDate: "2025-05-01",
  poNumber: "4500001",
  poId: P1,
  ordQty: "15",
  rcdQty: "6",
  acceptedQty: "6",
  rejQty: "1",
  value: "440",
};
const ROW_S2 = {
  id: S2,
  srvNumber: "9000002",
  srvDate: "2025-05-10",
  poNumber: "4500001",
  poId: P1,
  ordQty: "10",
  rcdQty: "3",
  acceptedQty: "3",
  rejQty: "0",
  value: "300",
};
// "PO not found": no PO id, no ordered quantity or value (INV-40).
const ROW_S3 = {
  id: S3,
  srvNumber: "9000003",
  srvDate: "2025-04-20",
  poNumber: "4500999",
  poId: null,
  ordQty: "0",
  rcdQty: "7",
  acceptedQty: "7",
  rejQty: "0",
  value: "0",
};

async function seeded() {
  const app = await onboardedApp();
  await seed(app);
  return app;
}

const get = async (app: App, path: string) => {
  const res = await app.send(path);
  return { status: res.status, body: (await res.json()) as unknown };
};

describe("GET /api/srv", () => {
  it("lists every SRV newest first, a PO not in the system as such (INV-40)", async () => {
    const app = await seeded();
    expect(await get(app, "/api/srv")).toEqual({
      status: 200,
      body: { items: [ROW_S2, ROW_S1, ROW_S3], total: 3 },
    });
  });

  it.each([
    ["sort=value", [S3, S2, S1]],
    ["sort=value&dir=desc", [S1, S2, S3]],
    ["sort=rcdQty", [S2, S1, S3]],
    ["sort=ordQty", [S3, S2, S1]],
    ["sort=srvNumber&dir=desc", [S3, S2, S1]],
    ["sort=poNumber", [S2, S1, S3]],
    ["q=INV-77", [S2]],
    ["q=4500999", [S3]],
    ["q=90000", [S2, S1, S3]],
    ["from=2025-04-21&to=2025-05-09", [S1]],
    ["poNumber=4500001", [S2, S1]],
    ["valueMin=300&valueMax=300", [S2]],
    ["valueMin=301", [S1]],
  ])("%s -> %j", async (query, ids) => {
    const app = await seeded();
    const { body } = await get(app, `/api/srv?${query}`);
    expect(body).toMatchObject({ total: ids.length });
    expect((body as { items: { id: string }[] }).items.map((r) => r.id)).toEqual(ids);
  });

  it("pages with a stable order and the total across pages", async () => {
    const app = await seeded();
    const s = await supplierId(app);
    const { db } = app;
    // 12 more SRVs of PO 4500999, one a day from 2025-06-01, so 15 in all.
    const extra = Array.from({ length: 12 }, (_, i) => {
      const id = `01J9Z8Q4S5T6V7W8X9Y0X${String(i).padStart(5, "0")}`;
      const date = `2025-06-${String(i + 1).padStart(2, "0")}`;
      return {
        srv: srvRow(s, id, "4500999", null, `91${String(i).padStart(5, "0")}`, date),
        item: line(s, `01J9Z8Q4S5T6V7W8X9Y0N${String(i).padStart(5, "0")}`, id, null, [1_000, null, null]),
      };
    });
    await db.batch([
      ...insertRows(
        db,
        srv,
        extra.map((e) => e.srv),
      ),
      ...insertRows(
        db,
        srvItem,
        extra.map((e) => e.item),
      ),
    ]);

    const first = await get(app, "/api/srv?page=1&pageSize=10");
    const second = await get(app, "/api/srv?page=2&pageSize=10");
    const third = await get(app, "/api/srv?page=3&pageSize=10");
    const ids = (r: { body: unknown }) => (r.body as { items: { id: string }[] }).items.map((i) => i.id);
    expect(ids(first)).toEqual(
      extra
        .map((e) => e.srv.id)
        .reverse()
        .slice(0, 10),
    );
    expect(ids(second)).toEqual([
      ...extra
        .map((e) => e.srv.id)
        .reverse()
        .slice(10),
      S2,
      S1,
      S3,
    ]);
    expect(third.body).toEqual({ items: [], total: 15 });
  });

  it.each([
    ["sort=createdAt", "query.sort"],
    ["pageSize=7", "query.pageSize"],
    ["page=0", "query.page"],
    ["from=2025-13-01", "query.from"],
  ])("rejects %s with 400", async (query, path) => {
    const app = await seeded();
    const { status, body } = await get(app, `/api/srv?${query}`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "invalid-input", details: { fields: [expect.objectContaining({ path })] } });
  });
});

describe("GET /api/srv/by-po", () => {
  const PO_4500001 = {
    poNumber: "4500001",
    poId: P1,
    latestSrvDate: "2025-05-10",
    srvCount: 2,
    // The PO's stored ordered total.
    ordQty: "15",
    rcdQty: "9",
    acceptedQty: "9",
    rejQty: "1",
    value: "740",
  };
  const PO_4500999 = {
    poNumber: "4500999",
    poId: null,
    latestSrvDate: "2025-04-20",
    srvCount: 1,
    ordQty: "0",
    rcdQty: "7",
    acceptedQty: "7",
    rejQty: "0",
    value: "0",
  };

  it("groups the SRVs by PO, latest SRV first", async () => {
    const app = await seeded();
    expect(await get(app, "/api/srv/by-po")).toEqual({
      status: 200,
      body: { items: [PO_4500001, PO_4500999], total: 2 },
    });
  });

  it.each([
    ["sort=srvCount", ["4500999", "4500001"]],
    ["sort=rcdQty&dir=desc", ["4500001", "4500999"]],
    ["sort=poNumber&dir=desc", ["4500999", "4500001"]],
    // The value range applies to the PO's total: 740 passes, though neither SRV alone reaches 500.
    ["valueMin=500", ["4500001"]],
    ["from=2025-05-02", ["4500001"]],
  ])("%s -> %j", async (query, numbers) => {
    const app = await seeded();
    const { body } = await get(app, `/api/srv/by-po?${query}`);
    expect(body).toMatchObject({ total: numbers.length });
    expect((body as { items: { poNumber: string }[] }).items.map((r) => r.poNumber)).toEqual(numbers);
  });

  it("totals only the SRVs the filters keep", async () => {
    const app = await seeded();
    const { body } = await get(app, "/api/srv/by-po?from=2025-05-02");
    expect(body).toEqual({
      items: [{ ...PO_4500001, srvCount: 1, rcdQty: "3", acceptedQty: "3", rejQty: "0", value: "300" }],
      total: 1,
    });
  });

  it("rejects a sort key of the flat list with 400", async () => {
    const app = await seeded();
    expect((await get(app, "/api/srv/by-po?sort=srvDate")).status).toBe(400);
  });
});

describe("GET /api/srv/stats", () => {
  it.each([
    ["", { srvCount: 3, poCount: 2, rcdQty: "16", acceptedQty: "16", rejQty: "1" }],
    ["?poNumber=4500001", { srvCount: 2, poCount: 1, rcdQty: "9", acceptedQty: "9", rejQty: "1" }],
    ["?valueMax=0", { srvCount: 1, poCount: 1, rcdQty: "7", acceptedQty: "7", rejQty: "0" }],
    ["?q=nothing", { srvCount: 0, poCount: 0, rcdQty: "0", acceptedQty: "0", rejQty: "0" }],
  ])("%s -> %j", async (query, expected) => {
    const app = await seeded();
    expect(await get(app, `/api/srv/stats${query}`)).toEqual({ status: 200, body: expected });
  });
});

describe("GET /api/srv/:id", () => {
  it("returns the SRV, its items with raw numbers and links (INV-38), and its open flags", async () => {
    const app = await seeded();
    const s = await supplierId(app);
    const flag = (id: string, status: "open" | "acknowledged") => ({
      supplierId: s,
      id,
      type: "QTY_MISMATCH" as const,
      scopeType: "srv_item" as const,
      scopeId: L1,
      poId: P1,
      fingerprint: id,
      details: { field: "ord_qty", expected: "10", actual: "9", docIds: [] },
      status,
      note: null,
      openedAt: "2025-05-02T00:00:00.000Z" as Instant,
      acknowledgedAt: status === "open" ? null : ("2025-05-03T00:00:00.000Z" as Instant),
    });
    await app.db.batch([
      app.db.build
        .insert(reconciliationIssue)
        .values([flag("01J9Z8Q4S5T6V7W8X9Y0F10000", "open"), flag("01J9Z8Q4S5T6V7W8X9Y0F20000", "acknowledged")]),
      app.db.build
        .update(srvItem)
        .set({ challanNo: " 12 ", challanDate: "2025-04-28" as IsoDate, resolvedDcId: ID })
        .where(eq(srvItem.id, L1)),
    ]);

    const base = {
      srvId: S1,
      materialCode: "M-1",
      lotNo: 1,
      ordQty: "10",
      invoiceNo: null,
      invoiceDate: null,
      resolvedInvoiceId: null,
    };
    expect(await get(app, `/api/srv/${S1}`)).toEqual({
      status: 200,
      body: {
        srv: {
          id: S1,
          poNumber: "4500001",
          poId: P1,
          srvNumber: "9000001",
          srvDate: "2025-05-01",
          financialYear: "2025-26",
          rawHeader: { "SRV NO": "9000001" },
        },
        items: [
          {
            ...base,
            id: L1,
            poItemId: I1,
            poItemNo: 10,
            srvItemNo: 1,
            // rcd 0 falls back to accepted 4 (INV-11); Accepted shows received (INV-09).
            rcdQty: "4",
            acceptedQty: "4",
            rejQty: "1",
            challanNo: " 12 ",
            challanDate: "2025-04-28",
            resolvedDcId: ID,
          },
          {
            ...base,
            id: L2,
            poItemId: I2,
            poItemNo: 20,
            srvItemNo: 2,
            ordQty: "5",
            rcdQty: "2",
            acceptedQty: "2",
            rejQty: "0",
            challanNo: null,
            challanDate: null,
            resolvedDcId: null,
          },
        ],
        flags: [
          {
            id: "01J9Z8Q4S5T6V7W8X9Y0F10000",
            type: "QTY_MISMATCH",
            scopeType: "srv_item",
            scopeId: L1,
            poId: P1,
            details: { field: "ord_qty", expected: "10", actual: "9", docIds: [] },
            status: "open",
            note: null,
            openedAt: "2025-05-02T00:00:00.000Z",
            acknowledgedAt: null,
          },
        ],
      },
    });
  });

  it("answers 404 for an unknown SRV and 400 for a malformed id", async () => {
    const app = await seeded();
    expect(await get(app, `/api/srv/${ID}`)).toEqual({
      status: 404,
      body: { code: "srv-not-found", message: "This SRV was not found." },
    });
    expect((await get(app, "/api/srv/123")).status).toBe(400);
  });
});

describe("DELETE /api/srv/:id", () => {
  const items = (app: App) =>
    app.db.query(
      app.db.build
        .select({ id: poItem.id, rcdQty: poItem.rcdQty, rejQty: poItem.rejQty })
        .from(poItem)
        .orderBy(poItem.poItemNo),
    );
  const header = async (app: App) => {
    const [row] = await app.db.query(app.db.build.select({ rcdQty: po.rcdQty, rejQty: po.rejQty }).from(po));
    return row;
  };
  const del = (app: App, id: string) => app.send(`/api/srv/${id}`, json("DELETE", {}));

  it("recomputes the PO in the same batch: the remaining SRV still wins", async () => {
    const app = await seeded();
    const res = await del(app, S2);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // I1: S1 alone, rcd 0 -> accepted 4, rej 1; I2: rcd 2 (INV-11, INV-12).
    expect(await items(app)).toEqual([
      { id: I1, rcdQty: 4_000, rejQty: 1_000 },
      { id: I2, rcdQty: 2_000, rejQty: 0 },
    ]);
    expect(await header(app)).toEqual({ rcdQty: 6_000, rejQty: 1_000 });
    expect((await get(app, "/api/srv")).body).toMatchObject({ total: 2 });
  });

  it("restores the PO document's values when the last SRV of the PO goes (INV-13)", async () => {
    const app = await seeded();
    await del(app, S2);
    await del(app, S1);
    expect(await items(app)).toEqual([
      { id: I1, rcdQty: 6_000, rejQty: 1_000 },
      { id: I2, rcdQty: 0, rejQty: 0 },
    ]);
    expect(await header(app)).toEqual({ rcdQty: 6_000, rejQty: 1_000 });
    expect(await app.db.query(app.db.build.select({ id: srvItem.id }).from(srvItem))).toEqual([{ id: L4 }]);
  });

  it("writes one audit row with what was deleted", async () => {
    const app = await seeded();
    await del(app, S1);
    const rows = await app.audit();
    expect(rows.at(-1)).toMatchObject({
      action: "srv.delete",
      entityType: "srv",
      entityId: S1,
      before: { poNumber: "4500001", srvNumber: "9000001", srvDate: "2025-05-01", items: 2 },
    });
  });

  it("deletes an SRV whose PO is not in the system without touching any PO (INV-40)", async () => {
    const app = await seeded();
    const before = await items(app);
    expect((await del(app, S3)).status).toBe(200);
    expect(await items(app)).toEqual(before);
    expect((await get(app, "/api/srv")).body).toMatchObject({ total: 2 });
  });

  it("is never blocked, and keeps the flags on its items until acknowledged (INV-35, INV-59)", async () => {
    const app = await seeded();
    const s = await supplierId(app);
    await app.db.batch([
      app.db.build.insert(reconciliationIssue).values({
        supplierId: s,
        id: "01J9Z8Q4S5T6V7W8X9Y0F10000",
        type: "DOC_NUMBER_CONFLICT",
        scopeType: "srv_item",
        scopeId: L3,
        poId: P1,
        fingerprint: "f1",
        details: { field: "invoice_no", expected: null, actual: "INV-77", docIds: [] },
        status: "open",
        note: null,
        openedAt: "2025-05-11T00:00:00.000Z" as Instant,
        acknowledgedAt: null,
      }),
    ]);
    expect((await del(app, S2)).status).toBe(200);
    const flags = await app.db.query(app.db.build.select({ id: reconciliationIssue.id }).from(reconciliationIssue));
    expect(flags).toEqual([{ id: "01J9Z8Q4S5T6V7W8X9Y0F10000" }]);
  });

  it("answers 404 for an unknown SRV and changes nothing", async () => {
    const app = await seeded();
    const res = await del(app, ID);
    expect(res.status).toBe(404);
    expect((await get(app, "/api/srv")).body).toMatchObject({ total: 3 });
  });
});

describe("session", () => {
  it.each(["/api/srv", "/api/srv/by-po", "/api/srv/stats", `/api/srv/${S1}`])(
    "GET %s needs a session (401)",
    async (path) => {
      const app = await seeded();
      const { send } = testApp(apiRoutes(app.services), () => Promise.resolve(false));
      expect((await send(path)).status).toBe(401);
    },
  );

  it("DELETE needs a session (401) and deletes nothing", async () => {
    const app = await seeded();
    const { send } = testApp(apiRoutes(app.services), () => Promise.resolve(false));
    expect((await send(`/api/srv/${S1}`, json("DELETE", {}))).status).toBe(401);
    expect((await get(app, "/api/srv")).body).toMatchObject({ total: 3 });
  });
});
