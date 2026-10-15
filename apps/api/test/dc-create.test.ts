// SPEC-11 PR 1: the DC create form's dispatchable items and DC create, over HTTP on the full app. No quantity blocks a
// save (C6, INV-32, INV-51); each create is one batch with recompute, flags, SRV link re-resolution and an audit row
// (C4). Expected values are worked by hand from ARCHITECTURE §6.2, §6.6, §6.9 and §6.10. Synthetic values only (C1).
import type { Db, Instant } from "@senstosales/db";
import { dc, dcItem, poItem, reconciliationIssue, srvItem } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { IsoDate } from "@senstosales/domain";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { AppOverrides } from "./api-app.ts";
import { closeApiApps, onboardedApp } from "./api-app.ts";
import { json } from "./helpers.ts";
import { NOW } from "./service-deps.ts";
import { srvPage } from "./srv-pages.ts";

afterEach(closeApiApps);

type App = Awaited<ReturnType<typeof onboardedApp>>;
type Json = Record<string, unknown>;

/** The JSON fields these tests read; each test asserts the values. */
interface Wire extends Json {
  id: string;
  code: string;
  version: number;
  items: (Json & { id: string })[];
}

const line = (poItemNo: number, ordQty: string) => ({
  poItemNo,
  materialCode: `M-${poItemNo}`,
  description: "Example part",
  drawingNo: null,
  unit: "NOS",
  ordQty,
  rateSource: "100",
  lots: [{ lotNo: 1, delyQty: ordQty, delyDate: "2025-05-15", destCode: "D1" }],
});

/** PO 4500001: item 10 of ord 10 and item 20 of ord 5. */
const PO = {
  poNumber: "4500001",
  poDate: "2025-03-10",
  enquiry: null,
  quotation: null,
  orderType: "SUPPLY",
  gemcNumber: null,
  remarks: null,
  rawHeader: {},
  items: [line(10, "10"), line(20, "5")],
};

/** Every DC header field, blank; the supplier snapshot is what onboarding stored. */
const HEADER = {
  ourRef: null,
  departmentNo: null,
  consigneeName: null,
  consigneeGstin: null,
  consigneeAddress: null,
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  modeOfTransport: null,
  remarks: null,
  supplierName: "Example Supplier",
  supplierAddress: "1 Example Road",
  supplierGstin: "TESTGSTIN0001",
  supplierContact: "Example Contact",
};

function setup(app: App) {
  const send = async (path: string, init?: RequestInit) => {
    const res = await app.send(path, init);
    return { status: res.status, body: (await res.json()) as Wire };
  };
  /** The stored PO's id and its item ids by item number. */
  async function storedPo(po: Json = PO) {
    const created = await send("/api/po", json("POST", po));
    const { body } = await send(`/api/po/${created.body.id}`);
    const itemId = (no: number) => body.items.find((i) => i["poItemNo"] === no)!.id;
    return { poId: created.body.id, item10: itemId(10), item20: itemId(20) };
  }

  const createDc = (body: Json) => send("/api/dc", json("POST", { gcNumber: null, gcDate: null, ...HEADER, ...body }));
  const items = () => app.db.query(app.db.build.select().from(poItem).orderBy(poItem.poItemNo));
  const dcs = () => app.db.query(app.db.build.select().from(dc).orderBy(dc.id));
  const dcLines = () => app.db.query(app.db.build.select().from(dcItem).orderBy(dcItem.id));
  const flags = () => app.db.query(app.db.build.select().from(reconciliationIssue).orderBy(reconciliationIssue.id));
  const dcAudit = async () => (await app.audit()).filter((row) => row.action === "dc.create");
  return { send, storedPo, createDc, items, dcs, dcLines, flags, dcAudit };
}

async function ready(overrides?: AppOverrides) {
  const app = await onboardedApp(overrides);
  return { app, ...setup(app) };
}

describe("GET /api/dc/dispatchable/:poId", () => {
  test("the PO, header defaults from the supplier, and each item with its balance", async () => {
    const { send, storedPo, createDc } = await ready();
    const { poId, item10, item20 } = await storedPo();
    await createDc({ poId, number: "1", dcDate: "2025-04-05", items: [{ poItemId: item10, dspQty: "4" }] });

    const res = await send(`/api/dc/dispatchable/${poId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      po: { id: poId, poNumber: "4500001", isGemc: false },
      defaults: HEADER,
      items: [
        expect.objectContaining({ id: item10, poItemNo: 10, ordQty: "10", dspQty: "4", balanceQty: "6", rate: "100" }),
        expect.objectContaining({ id: item20, poItemNo: 20, ordQty: "5", dspQty: "0", balanceQty: "5" }),
      ],
    });
  });

  test("an unknown PO is a 404", async () => {
    const { send } = await ready();
    const res = await send("/api/dc/dispatchable/01J9Z8Q4S5T6V7W8X9Y0Z1A2B3");
    expect([res.status, res.body.code]).toEqual([404, "po-not-found"]);
  });
});

describe("POST /api/dc", () => {
  test("stores the DC in its FY with GC defaults, recomputes the PO and writes one audit row", async () => {
    const { send, storedPo, createDc, items, dcLines, dcAudit } = await ready();
    const { poId, item10, item20 } = await storedPo();
    const res = await createDc({
      poId,
      number: "7",
      dcDate: "2025-04-02",
      vehicleNo: "VEH-1",
      items: [
        { poItemId: item10, dspQty: "4" },
        { poItemId: item20, dspQty: "5" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...HEADER,
      id: expect.any(String),
      poId,
      number: "7",
      dcDate: "2025-04-02",
      financialYear: "2025-26",
      gcNumber: "7",
      gcDate: "2025-04-02",
      vehicleNo: "VEH-1",
      version: 1,
      createdAt: NOW,
    });
    expect((await dcLines()).map((l) => [l.dcId, l.poItemId, l.dspQty])).toEqual([
      [res.body.id, item10, 4000],
      [res.body.id, item20, 5000],
    ]);
    expect((await items()).map((i) => [i.dspQty, i.balanceQty, i.status])).toEqual([
      [4000, 6000, "Pending"],
      [5000, 0, "Delivered"],
    ]);
    const po = await send(`/api/po/${poId}`);
    expect(po.body["po"]).toMatchObject({ dspQty: "9", balanceQty: "6" });
    expect(await dcAudit()).toEqual([
      expect.objectContaining({
        entityType: "dc",
        entityId: res.body.id,
        before: null,
        after: {
          poId,
          number: "7",
          dcDate: "2025-04-02",
          financialYear: "2025-26",
          gcNumber: "7",
          gcDate: "2025-04-02",
          items: [
            { poItemId: item10, dspQty: 4000 },
            { poItemId: item20, dspQty: 5000 },
          ],
        },
      }),
    ]);
  });

  test("a quantity over pending saves and raises OVER_DISPATCH (C6, INV-32, INV-54)", async () => {
    const { storedPo, createDc, items, flags } = await ready();
    const { poId, item10 } = await storedPo();
    await createDc({ poId, number: "1", dcDate: "2025-04-05", items: [{ poItemId: item10, dspQty: "8" }] });
    const res = await createDc({ poId, number: "2", dcDate: "2025-04-06", items: [{ poItemId: item10, dspQty: "4" }] });
    expect(res.status).toBe(200);
    expect((await items())[0]).toMatchObject({ dspQty: 12000, balanceQty: 0 });
    expect((await flags()).map((f) => [f.type, f.scopeId, f.status, f.details])).toEqual([
      ["OVER_DISPATCH", item10, "open", { field: "dsp_qty", expected: "10", actual: "12", docIds: [] }],
    ]);
  });

  test("a DC line on a cancelled item saves and raises DOC_ON_CANCELLED_ITEM (INV-56)", async () => {
    const { send, storedPo, createDc, dcLines, flags } = await ready();
    const { poId, item20 } = await storedPo();
    // Leaving item 20 out of a manual edit cancels it (D-0213).
    const edited = await send(`/api/po/${poId}`, json("PUT", { ...PO, items: [line(10, "10")], version: 1 }));
    expect(edited.status).toBe(200);

    const res = await createDc({ poId, number: "3", dcDate: "2025-04-05", items: [{ poItemId: item20, dspQty: "1" }] });
    expect(res.status).toBe(200);
    const [dcLine] = await dcLines();
    expect((await flags()).map((f) => [f.type, f.scopeType, f.scopeId, f.details])).toEqual([
      [
        "DOC_ON_CANCELLED_ITEM",
        "dc_item",
        dcLine!.id,
        { field: "status", expected: null, actual: "Cancelled", docIds: [res.body.id] },
      ],
    ]);
  });

  test("a DC after a manual dispatched quantity raises MANUAL_ADJUSTMENT_OVERLAP (INV-57)", async () => {
    let now = "2025-06-01T05:30:00.000Z" as Instant;
    const clock = { today: () => "2025-06-01" as IsoDate, now: () => now };
    const { send, storedPo, createDc, items, flags } = await ready({ clock });
    const { poId, item10 } = await storedPo();
    await send(`/api/po/${poId}/items/${item10}/manual-dispatched`, json("PUT", { qty: "2" }));
    now = "2025-06-01T06:00:00.000Z" as Instant;

    const res = await createDc({ poId, number: "4", dcDate: "2025-04-05", items: [{ poItemId: item10, dspQty: "3" }] });
    expect(res.status).toBe(200);
    expect((await items())[0]).toMatchObject({ dspQty: 5000, balanceQty: 5000 });
    expect((await flags()).map((f) => [f.type, f.scopeId, f.details])).toEqual([
      [
        "MANUAL_ADJUSTMENT_OVERLAP",
        item10,
        { field: "manual_dispatched_qty", expected: null, actual: "2", docIds: [res.body.id] },
      ],
    ]);
  });

  describe("malformed input is a 400 and writes nothing (C6)", () => {
    test.each([
      ["qty 0", (ids: Ids) => [{ poItemId: ids.item10, dspQty: "0" }], "qty-not-positive", "body.items.0.dspQty"],
      ["no lines", () => [], "no-lines", "body.items"],
      [
        "an item of another PO",
        (ids: Ids) => [{ poItemId: ids.other, dspQty: "1" }],
        "line-not-on-po",
        "body.items.0.poItemId",
      ],
    ])("%s", async (_name, lines, code, path) => {
      const { storedPo, createDc, dcs, flags, dcAudit, items } = await ready();
      const { poId, item10 } = await storedPo();
      const other = await storedPo({ ...PO, poNumber: "4500002" });
      const before = await items();

      const res = await createDc({
        poId,
        number: "5",
        dcDate: "2025-04-05",
        items: lines({ item10, other: other.item10 }),
      });
      expect([res.status, res.body.code]).toEqual([400, code]);
      expect(res.body["details"]).toMatchObject({ fields: [{ path }] });
      expect([await dcs(), await flags(), await dcAudit()]).toEqual([[], [], []]);
      expect(await items()).toEqual(before);
    });

    test("a number that is only spaces", async () => {
      const { storedPo, createDc, dcs } = await ready();
      const { poId, item10 } = await storedPo();
      const res = await createDc({
        poId,
        number: "  ",
        dcDate: "2025-04-05",
        items: [{ poItemId: item10, dspQty: "1" }],
      });
      expect([res.status, res.body.code]).toEqual([400, "number-blank"]);
      expect(await dcs()).toEqual([]);
    });

    test("an unknown PO is a 404", async () => {
      const { createDc, dcs } = await ready();
      const res = await createDc({
        poId: "01J9Z8Q4S5T6V7W8X9Y0Z1A2B3",
        number: "5",
        dcDate: "2025-04-05",
        items: [{ poItemId: "01J9Z8Q4S5T6V7W8X9Y0Z1A2B4", dspQty: "1" }],
      });
      expect([res.status, res.body.code]).toEqual([404, "po-not-found"]);
      expect(await dcs()).toEqual([]);
    });
  });

  describe("numbers restart each FY (INV-22, INV-26)", () => {
    test("DC 100 in 2024-25 and in 2025-26 both save; a second DC 100 in 2025-26 is a 409 and writes nothing", async () => {
      const { storedPo, createDc, dcs, items, dcAudit } = await ready();
      const { poId, item10 } = await storedPo();
      const dc100 = (dcDate: string) =>
        createDc({ poId, number: "100", dcDate, items: [{ poItemId: item10, dspQty: "1" }] });

      expect((await dc100("2025-03-31")).body).toMatchObject({ financialYear: "2024-25" });
      expect((await dc100("2025-04-01")).body).toMatchObject({ financialYear: "2025-26" });
      const before = await items();
      const res = await dc100("2026-03-31");
      expect([res.status, res.body.code, res.body["message"]]).toEqual([
        409,
        "dc-number-taken",
        "DC 100 already exists in FY 2025-26.",
      ]);
      expect(await dcs()).toHaveLength(2);
      expect(await dcAudit()).toHaveLength(2);
      expect(await items()).toEqual(before);
    });

    test("surrounding spaces are trimmed, so ' 100 ' collides with 100", async () => {
      const { storedPo, createDc, dcs } = await ready();
      const { poId, item10 } = await storedPo();
      const lines = [{ poItemId: item10, dspQty: "1" }];
      await createDc({ poId, number: "100", dcDate: "2025-04-01", items: lines });
      const res = await createDc({ poId, number: " 100 ", dcDate: "2025-04-02", items: lines });
      expect([res.status, res.body.code]).toEqual([409, "dc-number-taken"]);
      expect((await dcs()).map((row) => row.number)).toEqual(["100"]);
    });

    test("a given GC number is kept; a GC number taken in the FY is a 409", async () => {
      const { storedPo, createDc, dcs } = await ready();
      const { poId, item10 } = await storedPo();
      const lines = [{ poItemId: item10, dspQty: "1" }];
      const first = await createDc({
        poId,
        number: "8",
        dcDate: "2025-04-05",
        gcNumber: "G-1",
        gcDate: "2025-04-06",
        items: lines,
      });
      expect(first.body).toMatchObject({ number: "8", gcNumber: "G-1", gcDate: "2025-04-06" });
      // DC 9's own number is free, but GC G-1 is taken in 2025-26.
      const res = await createDc({ poId, number: "9", dcDate: "2025-05-01", gcNumber: "G-1", items: lines });
      expect([res.status, res.body.code, res.body["message"]]).toEqual([
        409,
        "gc-number-taken",
        "GC G-1 already exists in FY 2025-26.",
      ]);
      // A blank GC number defaults to the DC number (INV-26), here G-1, which DC 8's GC already holds.
      const third = await createDc({ poId, number: "G-1", dcDate: "2025-05-02", items: lines });
      expect([third.status, third.body.code]).toEqual([409, "gc-number-taken"]);
      expect(await dcs()).toHaveLength(1);
    });
  });

  test("SRV items that cited the DC number in its FY are linked; others stay unlinked (INV-37)", async () => {
    const { app, storedPo, createDc } = await ready();
    const { poId, item10 } = await storedPo();
    const upload = (po: string, date: string) =>
      app.client.request("srv.upload", {
        body: {
          files: [
            { name: "srv.html", html: srvPage(po, [{ srv: `S-${date}`, date, item: 10, code: "M-10", challan: "7" }]) },
          ],
        },
      });
    await upload("4500001", "25/04/2025"); // FY 2025-26, same PO
    await upload("4500099", "02/05/2025"); // FY 2025-26, a PO not in the system
    await upload("4500001", "28/03/2025"); // FY 2024-25: a different DC 7

    const res = await createDc({ poId, number: "7", dcDate: "2025-04-02", items: [{ poItemId: item10, dspQty: "4" }] });
    expect(res.status).toBe(200);
    const lines = await app.db.query(
      app.db.build
        .select({ challanNo: srvItem.challanNo, resolvedDcId: srvItem.resolvedDcId })
        .from(srvItem)
        .orderBy(srvItem.id),
    );
    expect(lines).toEqual([
      { challanNo: "7", resolvedDcId: res.body.id },
      { challanNo: "7", resolvedDcId: res.body.id },
      { challanNo: "7", resolvedDcId: null },
    ]);
  });
});

type Ids = { item10: string; other: string };

/** A `Db` whose next `count` batches wait until all of them are built, then run in turn; later batches run at once. */
function heldBatches() {
  let count = 0;
  const waiting: (() => void)[] = [];
  const wrap = (db: NodeDb): Db => ({
    build: db.build,
    query: (statement) => db.query(statement),
    batch: async (statements) => {
      if (count > 0) {
        await new Promise<void>((release) => {
          waiting.push(release);
          if (waiting.length === count) {
            count = 0;
            for (const r of waiting.splice(0)) r();
          }
        });
      }
      return db.batch(statements);
    },
  });
  return { wrap, hold: (n: number) => void (count = n) };
}

describe("two creates built from the same read before either commits", () => {
  test("the same number: one saves, the other is a 409 and writes nothing", async () => {
    const held = heldBatches();
    const { storedPo, createDc, dcs, dcAudit, items } = await ready({ db: held.wrap });
    const { poId, item10 } = await storedPo();
    held.hold(2);
    const create = () =>
      createDc({ poId, number: "7", dcDate: "2025-04-02", items: [{ poItemId: item10, dspQty: "4" }] });
    const results = await Promise.all([create(), create()]);
    expect(results.map((r) => [r.status, r.body.code]).sort()).toEqual([
      [200, undefined],
      [409, "dc-number-taken"],
    ]);
    expect(await dcs()).toHaveLength(1);
    expect(await dcAudit()).toHaveLength(1);
    expect((await items())[0]).toMatchObject({ dspQty: 4000, balanceQty: 6000 });
  });

  test("different numbers on one item: both save and the item counts both (no stale recompute)", async () => {
    const held = heldBatches();
    const { send, storedPo, createDc, dcs, dcAudit, items } = await ready({ db: held.wrap });
    const { poId, item10 } = await storedPo();
    held.hold(2);
    const create = (number: string) =>
      createDc({ poId, number, dcDate: "2025-04-02", items: [{ poItemId: item10, dspQty: "4" }] });
    const results = await Promise.all([create("7"), create("8")]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await dcs()).toHaveLength(2);
    expect(await dcAudit()).toHaveLength(2);
    expect((await items())[0]).toMatchObject({ dspQty: 8000, balanceQty: 2000 });
    expect((await send(`/api/po/${poId}`)).body["po"]).toMatchObject({ dspQty: "8", balanceQty: "7" });
  });
});
