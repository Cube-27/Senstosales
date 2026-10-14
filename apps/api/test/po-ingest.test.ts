// SPEC-08 PR 3: a PO file is ingested through `POST /api/po/upload` in one batch (INV-50): date guard (INV-42,
// INV-44), header, items and lots, GEMC source and net rates (INV-16, INV-17), cancel and restore (INV-48), the date
// winner after accept (INV-45), and never a write to DCs, invoices or manual quantities (INV-47). Real node:sqlite,
// synthetic pages parsed by `packages/parsers`; expected values worked by hand from ARCHITECTURE §6.2-§6.4, §7.2.
import type { Db, Instant } from "@senstosales/db";
import {
  auditLog,
  dc,
  dcItem,
  po,
  poItem,
  poLot,
  reconciliationIssue,
  sourceDocument,
  srv,
  srvItem,
  supplier,
} from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, IsoDate, Qty } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { poUploadRoutes } from "../src/routes/po-upload.ts";
import { poIngestService } from "../src/services/po-ingest.ts";
import { json, testApp } from "./helpers.ts";
import { poPage, type PageSpec } from "./po-pages.ts";
import { fixedClock, memoryStorage, NOW, supplierDb, SUPPLIER } from "./service-deps.ts";

let db: NodeDb;
let storage: ReturnType<typeof memoryStorage>;
let client: ReturnType<typeof testApp>["client"];

beforeEach(async () => {
  db = await supplierDb();
  storage = memoryStorage();
  client = testApp(poUploadRoutes(poIngestService({ db, storage, clock: fixedClock }))).client;
});
afterEach(() => db.close());

const upload = async (...pages: PageSpec[]) =>
  (
    await client.request("po.upload", {
      body: { files: pages.map((p, i) => ({ name: `po-${i}.html`, html: poPage(p) })) },
    })
  ).results;
const uploadOne = async (page: PageSpec) => (await upload(page))[0];

const poRow = async () => (await db.query(db.build.select().from(po)))[0];
const items = () => db.query(db.build.select().from(poItem).orderBy(poItem.poItemNo));
const itemCols = async () =>
  (await items()).map((i) => ({
    no: i.poItemNo,
    ord: i.ordQty,
    dsp: i.dspQty,
    rcd: i.rcdQty,
    rej: i.rejQty,
    status: i.status,
    cancelled: i.cancelledAt !== null,
  }));
const audits = () => db.query(db.build.select().from(auditLog).where(eq(auditLog.action, "po.ingest")));

const APRIL = { date: "10/04/2025", items: [{ no: 10 }, { no: 20, ord: "5.000" }] } satisfies PageSpec;

describe("a new PO", () => {
  test("is stored with its header, items, lots and derived columns, and reported accepted", async () => {
    expect(await uploadOne(APRIL)).toEqual({ name: "po-0.html", status: "accepted", reason: null });

    expect(await poRow()).toMatchObject({
      supplierId: SUPPLIER,
      poNumber: "4500001",
      poDate: "2025-04-10",
      amendNo: 0,
      isGemc: false,
      gemcNumber: null,
      remarks: "Synthetic order",
      status: "Pending",
      ordQty: 15000,
      dspQty: 0,
      balanceQty: 15000,
      version: 1,
    });
    expect(await itemCols()).toEqual([
      { no: 10, ord: 10000, dsp: 0, rcd: 0, rej: 0, status: "Pending", cancelled: false },
      { no: 20, ord: 5000, dsp: 0, rcd: 0, rej: 0, status: "Pending", cancelled: false },
    ]);
    const [first] = await items();
    expect(first).toMatchObject({ materialCode: "SYN-10", unit: "NOS", rateSource: 100_00000, rate: 100_00000 });
    const lots = await db.query(db.build.select().from(poLot));
    expect(lots.map((l) => [l.lotNo, l.delyQty, l.delyDate, l.entryAllowDate, l.destCode])).toEqual([
      [1, 10000, "2025-06-30", "2025-07-15", "11"],
      [1, 5000, "2025-06-30", "2025-07-15", "11"],
    ]);
  });

  test("keeps the raw page under its PO number with the PO date, and writes one audit row", async () => {
    const html = poPage(APRIL);
    await client.request("po.upload", { body: { files: [{ name: "a.html", html }] } });

    expect(new TextDecoder().decode(storage.files.get("html/po/4500001.html"))).toBe(html);
    const [source] = await db.query(db.build.select().from(sourceDocument));
    expect(source).toMatchObject({ kind: "po", key: "4500001", docDate: "2025-04-10" });
    const [entry] = await audits();
    expect(entry).toMatchObject({
      at: NOW,
      actor: "admin",
      entityType: "po",
      entityId: (await poRow())?.id,
      before: null,
      after: { poNumber: "4500001", poDate: "2025-04-10", amendNo: 0, cancelledItems: [], restoredItems: [] },
      jobId: null,
    });
  });
});

describe("GEMC rates (INV-16, INV-17)", () => {
  const GEMC = { date: "10/04/2025", remarks: "Supply under GEMC- 5116", items: [{ no: 10, rate: "848.75" }] };

  test("stores the GST-inclusive source and its net, and re-ingesting never divides again", async () => {
    await uploadOne(GEMC);
    await uploadOne(GEMC);
    await uploadOne(GEMC);

    expect(await poRow()).toMatchObject({ isGemc: true, gemcNumber: "5116" });
    expect((await items()).map((i) => [i.rateSource, i.rate])).toEqual([[84_875_000, 71_927_966]]);
  });

  test("a non-GEMC rate is stored as on the page", async () => {
    await uploadOne({ date: "10/04/2025", items: [{ no: 10, rate: "848.75" }] });

    expect((await items()).map((i) => [i.rateSource, i.rate])).toEqual([[84_875_000, 84_875_000]]);
  });
});

describe("the date guard (INV-42, INV-44)", () => {
  test("an older page is skipped and changes nothing, with no flag and no audit row", async () => {
    await uploadOne({ date: "01/05/2025", items: [{ no: 10 }] });
    const sources = () => db.query(db.build.select().from(sourceDocument));
    const before = { po: await poRow(), items: await items(), sources: await sources() };
    const page = storage.files.get("html/po/4500001.html");

    const result = await uploadOne({ date: "30/04/2025", amend: 1, items: [{ no: 10, ord: "99.000" }, { no: 30 }] });

    expect(result).toEqual({
      name: "po-0.html",
      status: "skipped",
      reason: "Older than the stored PO 4500001 (dated 2025-05-01). Nothing was changed.",
    });
    expect({ po: await poRow(), items: await items(), sources: await sources() }).toEqual(before);
    // The stored page stays the newer one, so a re-parse never brings the older data back (EC-29).
    expect(storage.files.get("html/po/4500001.html")).toBe(page);
    expect(await db.query(db.build.select().from(poLot))).toHaveLength(1);
    expect(await db.query(db.build.select().from(reconciliationIssue))).toEqual([]);
    expect(await db.query(db.build.select().from(auditLog))).toHaveLength(2);
  });

  test("a page of the same date is accepted and replaces the stored values", async () => {
    await uploadOne({ date: "01/05/2025", items: [{ no: 10 }] });

    expect(await uploadOne({ date: "01/05/2025", amend: 2, items: [{ no: 10, ord: "12.000" }] })).toMatchObject({
      status: "accepted",
    });
    expect(await poRow()).toMatchObject({ amendNo: 2, ordQty: 12000, version: 2 });
    expect((await audits()).map((a) => a.before)).toEqual([null, { poDate: "2025-05-01", amendNo: 0 }]);
  });
});

describe("amendments (INV-48)", () => {
  test("an item missing from an accepted page is cancelled; one that reappears is restored", async () => {
    await uploadOne(APRIL);
    await uploadOne({ date: "11/04/2025", amend: 1, items: [{ no: 10 }] });

    expect(await itemCols()).toEqual([
      { no: 10, ord: 10000, dsp: 0, rcd: 0, rej: 0, status: "Pending", cancelled: false },
      { no: 20, ord: 5000, dsp: 0, rcd: 0, rej: 0, status: "Cancelled", cancelled: true },
    ]);
    expect((await items())[1]?.cancelledAt).toBe(NOW);
    // INV-07: PO totals are over active items only.
    expect(await poRow()).toMatchObject({ ordQty: 10000, balanceQty: 10000 });
    expect((await audits())[1]?.after).toMatchObject({ cancelledItems: [20], restoredItems: [] });

    await uploadOne({ date: "12/04/2025", amend: 2, items: [{ no: 10 }, { no: 20, ord: "6.000" }] });

    expect(await itemCols()).toEqual([
      { no: 10, ord: 10000, dsp: 0, rcd: 0, rej: 0, status: "Pending", cancelled: false },
      { no: 20, ord: 6000, dsp: 0, rcd: 0, rej: 0, status: "Pending", cancelled: false },
    ]);
    expect((await audits())[2]?.after).toMatchObject({ cancelledItems: [], restoredItems: [20] });
  });

  test("a new item in an amended page is added; the earlier items keep their ids", async () => {
    await uploadOne(APRIL);
    const ids = (await items()).map((i) => i.id);

    await uploadOne({ date: "11/04/2025", items: [{ no: 10 }, { no: 20 }, { no: 30, ord: "2.000" }] });

    const after = await items();
    expect(after.map((i) => i.id).slice(0, 2)).toEqual(ids);
    expect(after.map((i) => [i.poItemNo, i.ordQty])).toEqual([
      [10, 10000],
      [20, 10000],
      [30, 2000],
    ]);
  });
});

describe("re-ingest never writes dispatch (INV-47)", () => {
  test("DC lines and the manual quantity stay, and dsp_qty is the same before and after", async () => {
    await uploadOne(APRIL);
    const [i10] = await items();
    const P = (await poRow())?.id ?? "";
    await db.batch([
      db.build.insert(dc).values({
        id: "D1",
        supplierId: SUPPLIER,
        poId: P,
        number: "1",
        dcDate: "2025-04-20" as IsoDate,
        financialYear: "2025-26" as Fy,
        gcNumber: "1",
        gcDate: "2025-04-20" as IsoDate,
        createdAt: NOW,
      }),
      db.build.insert(dcItem).values({
        id: "DI1",
        supplierId: SUPPLIER,
        dcId: "D1",
        poItemId: i10?.id ?? "",
        dspQty: 4000 as Qty,
        createdAt: NOW,
      }),
      db.build
        .update(poItem)
        .set({ manualDispatchedQty: 500 as Qty, manualSetAt: "2025-04-15T00:00:00.000Z" as Instant })
        .where(eq(poItem.id, i10?.id ?? "")),
    ]);
    await uploadOne(APRIL);
    const dspBefore = (await items()).map((i) => i.dspQty);

    await uploadOne(APRIL);

    expect((await items()).map((i) => i.dspQty)).toEqual(dspBefore);
    // INV-03: DC 4 + manual 0.5.
    expect(dspBefore).toEqual([4500, 0]);
    expect(await db.query(db.build.select().from(dcItem))).toHaveLength(1);
    expect((await items())[0]).toMatchObject({ manualDispatchedQty: 500, manualSetAt: "2025-04-15T00:00:00.000Z" });
  });
});

describe("the date winner after accept (INV-45)", () => {
  async function srvOn(poId: string | null, poItemId: string | null, srvDate: string, code = "SYN-10"): Promise<void> {
    await db.batch([
      db.build.insert(srv).values({
        id: "V1",
        supplierId: SUPPLIER,
        poNumber: "4500001",
        poId,
        srvNumber: "9001",
        srvDate: srvDate as IsoDate,
        financialYear: "2025-26" as Fy,
        rawHeader: {},
      }),
      db.build.insert(srvItem).values({
        id: "VI1",
        supplierId: SUPPLIER,
        srvId: "V1",
        poItemId,
        materialCode: code,
        poItemNo: 10,
        lotNo: 1,
        srvItemNo: 1,
        ordQty: 10000 as Qty,
        rcdQty: 3000 as Qty,
        acceptedQty: 3000 as Qty,
        rejQty: 1000 as Qty,
      }),
    ]);
  }
  const page = (date: string) => ({ date, items: [{ no: 10, rcd: "7.000", rej: "2.000" }] });

  test("an SRV on or after the new PO date wins; a later PO date makes the PO's values win", async () => {
    await uploadOne(page("10/04/2025"));
    await srvOn((await poRow())?.id ?? null, (await items())[0]?.id ?? null, "2025-05-01");

    await uploadOne(page("01/05/2025"));
    expect((await items()).map((i) => [i.poRcdQty, i.poRejQty, i.rcdQty, i.rejQty])).toEqual([
      [7000, 2000, 3000, 1000],
    ]);

    await uploadOne(page("02/05/2025"));
    expect((await items()).map((i) => [i.rcdQty, i.rejQty])).toEqual([[7000, 2000]]);
  });

  test("an SRV stored before its PO is attached, matched by material code and counted", async () => {
    await srvOn(null, null, "2025-05-01");

    await uploadOne(page("10/04/2025"));

    const P = (await poRow())?.id;
    const [line] = await db.query(db.build.select().from(srvItem));
    expect((await db.query(db.build.select().from(srv)))[0]?.poId).toBe(P);
    expect(line?.poItemId).toBe((await items())[0]?.id);
    expect((await items()).map((i) => [i.rcdQty, i.rejQty])).toEqual([[3000, 1000]]);
  });

  test("an attached SRV line left unmatched is matched once an amendment adds its material code", async () => {
    await uploadOne(page("10/04/2025"));
    // EC-12: SYN-30 is on no item yet.
    await srvOn((await poRow())?.id ?? null, null, "2025-05-01", "SYN-30");

    await uploadOne({ date: "11/04/2025", items: [{ no: 10 }, { no: 30 }] });

    const [line] = await db.query(db.build.select().from(srvItem));
    expect(line?.poItemId).toBe((await items())[1]?.id);
    // Item 30 now counts the SRV (it wins on date); item 10 has no SRV line, so the PO's 0 stands.
    expect((await items()).map((i) => [i.poItemNo, i.rcdQty, i.rejQty])).toEqual([
      [10, 0, 0],
      [30, 3000, 1000],
    ]);
  });
});

describe("failures (INV-50)", () => {
  test("a page that does not parse fails with the parser's reason and stores nothing", async () => {
    const results = await client.request("po.upload", {
      body: { files: [{ name: "bad.html", html: "<p>not a PO</p>" }] },
    });

    expect(results.results).toEqual([
      {
        name: "bad.html",
        status: "failed",
        reason: expect.stringMatching(/^Could not read this PO page \(missing-field\): .+/),
      },
    ]);
    expect(storage.files.size).toBe(0);
    expect(await db.query(db.build.select().from(po))).toEqual([]);
  });

  test("a refused statement writes nothing from that file, and the other files still ingest", async () => {
    // The second ingest batch (a source-document batch has three statements) also carries a row the supplier's
    // primary key refuses, so SQLite rolls that whole batch back.
    let ingestBatches = 0;
    const poison = db.build.insert(supplier).values({ id: SUPPLIER, name: "x", bankDetails: {}, invoiceDefaults: {} });
    const refusing: Db = {
      build: db.build,
      query: (statement) => db.query(statement),
      batch: (statements) =>
        db.batch(statements.length > 3 && ++ingestBatches === 2 ? [...statements, poison] : statements),
    };
    const { client: refusingClient } = testApp(
      poUploadRoutes(poIngestService({ db: refusing, storage, clock: fixedClock })),
    );
    const files = ["4500001", "4500002", "4500003"].map((number) => ({
      name: `${number}.html`,
      html: poPage({ number, date: "10/04/2025", items: [{ no: 10 }] }),
    }));

    const { results } = await refusingClient.request("po.upload", { body: { files } });

    expect(results.map((r) => r.status)).toEqual(["accepted", "failed", "accepted"]);
    expect(results[1]?.reason).toBe("PO 4500002 could not be saved. Nothing from this file was changed.");
    const stored = await db.query(db.build.select({ n: po.poNumber }).from(po).orderBy(po.poNumber));
    expect(stored.map((r) => r.n)).toEqual(["4500001", "4500003"]);
    expect(await db.query(db.build.select().from(poItem))).toHaveLength(2);
    // The raw page is kept: it was stored before the ingest batch (INV-107).
    expect([...storage.files.keys()]).toContain("html/po/4500002.html");
  });

  test("a refused source-document batch fails that file only (SPEC-08 §4.3)", async () => {
    // The second source-document batch (three statements) also carries a row the supplier's primary key refuses.
    let sourceBatches = 0;
    const poison = db.build.insert(supplier).values({ id: SUPPLIER, name: "x", bankDetails: {}, invoiceDefaults: {} });
    const refusing: Db = {
      build: db.build,
      query: (statement) => db.query(statement),
      batch: (statements) =>
        db.batch(statements.length === 3 && ++sourceBatches === 2 ? [...statements, poison] : statements),
    };
    const { client: refusingClient } = testApp(
      poUploadRoutes(poIngestService({ db: refusing, storage, clock: fixedClock })),
    );
    const files = ["4500001", "4500002", "4500003"].map((number) => ({
      name: `${number}.html`,
      html: poPage({ number, date: "10/04/2025", items: [{ no: 10 }] }),
    }));

    const { results } = await refusingClient.request("po.upload", { body: { files } });

    expect(results.map((r) => r.status)).toEqual(["accepted", "failed", "accepted"]);
    expect(results[1]?.reason).toBe("PO 4500002 could not be saved. Nothing from this file was changed.");
    const stored = await db.query(db.build.select({ n: po.poNumber }).from(po).orderBy(po.poNumber));
    expect(stored.map((r) => r.n)).toEqual(["4500001", "4500003"]);
  });

  test("a PO changed by another upload after the guard read it is not overwritten (INV-42, INV-95)", async () => {
    await uploadOne({ date: "01/05/2025", items: [{ no: 10 }] });
    // Another upload commits a newer page between this file's guard read and its ingest batch.
    let raced = false;
    const racing: Db = {
      build: db.build,
      query: (statement) => db.query(statement),
      batch: async (statements) => {
        if (statements.length > 3 && !raced) {
          raced = true;
          await db.batch([
            db.build
              .update(po)
              .set({ poDate: "2025-05-03" as IsoDate, amendNo: 5, version: 2 })
              .where(eq(po.poNumber, "4500001")),
          ]);
        }
        return db.batch(statements);
      },
    };
    const { client: racingClient } = testApp(
      poUploadRoutes(poIngestService({ db: racing, storage, clock: fixedClock })),
    );
    const html = poPage({ date: "02/05/2025", amend: 1, items: [{ no: 10, ord: "99.000" }] });

    const { results } = await racingClient.request("po.upload", { body: { files: [{ name: "a.html", html }] } });

    expect(results).toEqual([
      {
        name: "a.html",
        status: "failed",
        reason: "PO 4500001 could not be saved. Nothing from this file was changed.",
      },
    ]);
    expect(await poRow()).toMatchObject({ poDate: "2025-05-03", amendNo: 5, version: 2, ordQty: 10000 });
    expect((await items()).map((i) => i.ordQty)).toEqual([10000]);
  });

  test("an upload before onboarding is refused with 409", async () => {
    const empty = await supplierDb();
    await empty.batch([empty.build.delete(supplier)]);
    const { send } = testApp(poUploadRoutes(poIngestService({ db: empty, storage, clock: fixedClock })));

    const res = await send("/api/po/upload", json("POST", { files: [{ name: "a.html", html: poPage(APRIL) }] }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "onboarding-required",
      message: "Set up the supplier details first.",
    });
    empty.close();
  });
});
