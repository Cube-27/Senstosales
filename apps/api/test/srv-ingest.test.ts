// SPEC-08 PR 4: an SRV file is ingested through `POST /api/srv/upload` in one batch (INV-50): per-SRV date guard
// (INV-43), item matching (INV-39), raw numbers kept and links resolved in the SRV date's FY (INV-37, INV-38), SRVs
// of an unknown PO stored without effect (INV-40), recompute of the PO and its new flags (INV-52, INV-53, INV-59).
// Real node:sqlite, synthetic pages parsed by `packages/parsers`; expected values worked by hand from ARCHITECTURE
// §6.2, §6.9, §6.10, §7.2, §7.3.
import type { Db, Instant } from "@senstosales/db";
import {
  auditLog,
  dc,
  dcItem,
  invoice,
  invoiceItem,
  po,
  poItem,
  reconciliationIssue,
  sourceDocument,
  srv,
  srvItem,
  supplier,
} from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { poUploadRoutes } from "../src/routes/po-upload.ts";
import { srvUploadRoutes } from "../src/routes/srv-upload.ts";
import { poIngestService } from "../src/services/po-ingest.ts";
import { srvIngestService } from "../src/services/srv-ingest.ts";
import { json, testApp } from "./helpers.ts";
import { poPage, type PageSpec } from "./po-pages.ts";
import { fixedClock, memoryStorage, NOW, supplierDb, SUPPLIER } from "./service-deps.ts";
import { srvPage, type SrvRow } from "./srv-pages.ts";

const PO = "4500001";

let db: NodeDb;
let storage: ReturnType<typeof memoryStorage>;
let client: ReturnType<typeof testApp>["client"];

beforeEach(async () => {
  db = await supplierDb();
  storage = memoryStorage();
  const deps = { db, storage, clock: fixedClock };
  client = testApp({ ...poUploadRoutes(poIngestService(deps)), ...srvUploadRoutes(srvIngestService(deps)) }).client;
});
afterEach(() => db.close());

/** PO 4500001 dated 2025-04-10: item 10 (SYN-10) ord 10, item 20 (SYN-20) ord 5. */
const APRIL = { date: "10/04/2025", items: [{ no: 10 }, { no: 20, ord: "5.000" }] } satisfies PageSpec;

const uploadPo = async (page: PageSpec) =>
  (await client.request("po.upload", { body: { files: [{ name: "po.html", html: poPage(page) }] } })).results[0];

const upload = async (...files: { po?: string; rows: SrvRow[] }[]) =>
  (
    await client.request("srv.upload", {
      body: { files: files.map((f, i) => ({ name: `srv-${i}.html`, html: srvPage(f.po ?? PO, f.rows) })) },
    })
  ).results;
const uploadOne = async (rows: SrvRow[], po = PO) => (await upload({ po, rows }))[0];

const poId = async () => (await db.query(db.build.select({ id: po.id }).from(po).where(eq(po.poNumber, PO))))[0]?.id;
const itemIds = async () =>
  (await db.query(db.build.select().from(poItem).orderBy(poItem.poItemNo))).map((i) => [i.poItemNo, i.id] as const);
const itemQty = async () =>
  (await db.query(db.build.select().from(poItem).orderBy(poItem.poItemNo))).map((i) => ({
    no: i.poItemNo,
    rcd: i.rcdQty,
    rej: i.rejQty,
    status: i.status,
  }));
const srvs = () => db.query(db.build.select().from(srv).orderBy(srv.srvNumber));
const lines = () => db.query(db.build.select().from(srvItem).orderBy(srvItem.poItemNo, srvItem.srvItemNo));
const flags = async () =>
  (await db.query(db.build.select().from(reconciliationIssue).orderBy(reconciliationIssue.type))).map((f) => ({
    type: f.type,
    scopeId: f.scopeId,
    details: f.details,
  }));

const S1 = { srv: "7000001", date: "01/05/2025", item: 10 } satisfies SrvRow;

describe("an SRV of a stored PO", () => {
  beforeEach(async () => {
    await uploadPo(APRIL);
  });

  test("is stored, matched to its PO item, and the PO is recomputed", async () => {
    expect(await uploadOne([{ ...S1, rcd: "4.000", rej: "1.000" }])).toEqual({
      name: "srv-0.html",
      status: "accepted",
      reason: null,
    });

    const [row] = await srvs();
    expect(row).toMatchObject({
      supplierId: SUPPLIER,
      poNumber: PO,
      poId: await poId(),
      srvNumber: "7000001",
      srvDate: "2025-05-01",
      financialYear: "2025-26",
    });
    expect(row?.rawHeader).toMatchObject({ "SRV NO": "7000001", "SRV DATE": "01/05/2025" });
    const [item10] = await itemIds();
    expect(await lines()).toMatchObject([
      { srvId: row?.id, poItemId: item10?.[1], materialCode: "SYN-10", rcdQty: 4000, acceptedQty: 4000, rejQty: 1000 },
    ]);
    // SRV dated after the PO wins (INV-10): item 10 received 4, rejected 1.
    expect(await itemQty()).toEqual([
      { no: 10, rcd: 4000, rej: 1000, status: "Pending" },
      { no: 20, rcd: 0, rej: 0, status: "Pending" },
    ]);
    expect((await db.query(db.build.select().from(po)))[0]).toMatchObject({ rcdQty: 4000, rejQty: 1000 });
  });

  test("keeps the raw page and writes one audit row per SRV", async () => {
    await uploadOne([S1, { srv: "7000002", date: "02/05/2025", item: 20 }]);

    expect([...storage.files.keys()]).toEqual(["html/po/4500001.html", "html/srv/4500001.html"]);
    const [doc] = await db.query(db.build.select().from(sourceDocument).where(eq(sourceDocument.kind, "srv")));
    // The newest SRV date in the file.
    expect(doc).toMatchObject({ key: PO, storageKey: "html/srv/4500001.html", docDate: "2025-05-02" });
    const audits = await db.query(db.build.select().from(auditLog).where(eq(auditLog.action, "srv.ingest")));
    const ids = (await srvs()).map((r) => r.id);
    expect(audits.map((a) => [a.entityType, a.entityId, a.actor, a.at, a.before])).toEqual(
      ids.map((id) => ["srv", id, "admin", NOW, null]),
    );
    expect(audits[0]?.after).toEqual({ poNumber: PO, srvNumber: "7000001", srvDate: "2025-05-01", items: 1 });
  });

  test("INV-39: a material code on several items is matched by the row's PO item number", async () => {
    await uploadPo({
      date: "11/04/2025",
      items: [
        { no: 10, code: "SYN-X" },
        { no: 30, code: "SYN-X" },
      ],
    });

    await uploadOne([{ ...S1, item: 30, code: "SYN-X" }]);

    const item30 = (await itemIds()).find(([no]) => no === 30)?.[1];
    expect((await lines())[0]?.poItemId).toBe(item30);
  });

  test("EC-12: a PO item number on no item of the PO is stored unmatched, changes no item and is flagged", async () => {
    await uploadOne([{ ...S1, item: 50 }]);

    const [line] = await lines();
    expect(line?.poItemId).toBeNull();
    expect((await itemQty()).map((i) => i.rcd)).toEqual([0, 0]);
    expect(await flags()).toEqual([
      {
        type: "SRV_UNKNOWN_PO_ITEM",
        scopeId: line?.id,
        details: { field: "po_item_no", expected: null, actual: "50", docIds: [] },
      },
    ]);
  });

  test("INV-52: an SRV ord qty differing from the PO item's raises QTY_MISMATCH", async () => {
    await uploadOne([{ ...S1, ord: "9.000" }]);

    const [line] = await lines();
    expect(line?.ordQty).toBe(9000);
    expect(await flags()).toEqual([
      {
        type: "QTY_MISMATCH",
        scopeId: line?.id,
        details: { field: "ord_qty", expected: "10", actual: "9", docIds: [] },
      },
    ]);
  });

  test("EC-31: a page without ORD QTY stores 0 and raises no QTY_MISMATCH", async () => {
    await uploadOne([S1]);

    expect((await lines())[0]?.ordQty).toBe(0);
    expect(await flags()).toEqual([]);
  });

  test("INV-59: uploading the same file again adds no flag and keeps the SRV item ids", async () => {
    await uploadOne([{ ...S1, ord: "9.000" }]);
    const before = await lines();

    expect(await uploadOne([{ ...S1, ord: "9.000" }])).toMatchObject({ status: "accepted" });

    expect((await lines()).map((l) => l.id)).toEqual(before.map((l) => l.id));
    expect(await flags()).toHaveLength(1);
  });
});

describe("references (INV-37, INV-38, INV-53)", () => {
  const at = (s: string) => s as Instant;
  const d = (s: string) => s as IsoDate;
  const zero = 0 as Money;

  /**
   * On this PO: DC 12 dated 2025-03-28 (FY 2024-25), DC 7 dated 2025-04-20 and invoice 9 dated 2025-04-21 (FY
   * 2025-26). On PO 4500002: DC 8 dated 2025-04-22 and invoice 10 dated 2025-04-23.
   */
  beforeEach(async () => {
    await uploadPo(APRIL);
    await uploadPo({ number: "4500002", date: "10/04/2025", items: [{ no: 10 }] });
    const pos = await db.query(db.build.select({ id: po.id, no: po.poNumber }).from(po));
    const items = await db.query(db.build.select({ id: poItem.id, poId: poItem.poId }).from(poItem));
    const poOf = (no: string) => pos.find((p) => p.no === no)?.id ?? "";
    const itemOf = (poId: string) => items.find((i) => i.poId === poId)?.id ?? "";
    const created = (date: string) => at(`${date}T00:00:00.000Z`);
    const dcRows = (dcId: string, poNumber: string, number: string, date: string, fy: string) => {
      const id = poOf(poNumber);
      return [
        db.build.insert(dc).values({
          id: dcId,
          supplierId: SUPPLIER,
          poId: id,
          number,
          dcDate: d(date),
          financialYear: fy as Fy,
          gcNumber: number,
          gcDate: d(date),
          createdAt: created(date),
        }),
        db.build.insert(dcItem).values({
          id: `${dcId}-1`,
          supplierId: SUPPLIER,
          dcId,
          poItemId: itemOf(id),
          dspQty: 0 as Qty,
          createdAt: created(date),
        }),
      ];
    };
    const invoiceRows = (invoiceId: string, poNumber: string, dcId: string, number: string, date: string) => {
      const id = poOf(poNumber);
      const amounts = { taxable: zero, cgst: zero, sgst: zero, igst: zero, total: zero };
      return [
        db.build.insert(invoice).values({
          id: invoiceId,
          supplierId: SUPPLIER,
          poId: id,
          dcId,
          kind: "dc",
          number,
          invoiceDate: d(date),
          financialYear: "2025-26" as Fy,
          cgstPct: 900000 as GstPct,
          sgstPct: 900000 as GstPct,
          ...amounts,
          createdAt: created(date),
        }),
        db.build.insert(invoiceItem).values({
          id: `${invoiceId}-1`,
          supplierId: SUPPLIER,
          invoiceId,
          poItemId: itemOf(id),
          qty: 0 as Qty,
          rate: zero,
          ...amounts,
        }),
      ];
    };
    await db.batch([
      ...dcRows("D12", PO, "12", "2025-03-28", "2024-25"),
      ...dcRows("D7", PO, "7", "2025-04-20", "2025-26"),
      ...dcRows("D8", "4500002", "8", "2025-04-22", "2025-26"),
      ...invoiceRows("N9", PO, "D7", "9", "2025-04-21"),
      ...invoiceRows("N10", "4500002", "D8", "10", "2025-04-23"),
    ]);
  });

  test("numbers in the SRV date's FY are linked; the raw text is kept either way", async () => {
    await uploadOne([{ ...S1, challan: "7", invoice: "9" }]);

    expect(await lines()).toMatchObject([
      { challanNo: "7", invoiceNo: "9", resolvedDcId: "D7", resolvedInvoiceId: "N9" },
    ]);
    expect(await flags()).toEqual([]);
  });

  test("EC-03: a March DC cited by an April SRV is not linked, and a number with no document raises no flag", async () => {
    await uploadOne([{ ...S1, date: "03/04/2025", challan: "12", invoice: "99" }]);

    const [line] = await lines();
    expect(line).toMatchObject({ challanNo: "12", invoiceNo: "99", resolvedDcId: null, resolvedInvoiceId: null });
    expect(await flags()).toEqual([]);
    // An SRV never creates a DC or an invoice.
    expect(await db.query(db.build.select({ id: dc.id }).from(dc))).toHaveLength(3);
    expect(await db.query(db.build.select({ id: invoice.id }).from(invoice))).toHaveLength(2);
  });

  test("INV-53: numbers resolved to another PO's DC and invoice raise DOC_NUMBER_CONFLICT, citing them", async () => {
    await uploadOne([{ ...S1, challan: "8", invoice: "10" }]);

    const [line] = await lines();
    expect(line).toMatchObject({ resolvedDcId: "D8", resolvedInvoiceId: "N10" });
    expect(await flags()).toEqual([
      {
        type: "DOC_NUMBER_CONFLICT",
        scopeId: line?.id,
        details: { field: "challan_no", expected: null, actual: "8", docIds: ["D8"] },
      },
      {
        type: "DOC_NUMBER_CONFLICT",
        scopeId: line?.id,
        details: { field: "invoice_no", expected: null, actual: "10", docIds: ["N10"] },
      },
    ]);
  });
});

describe("INV-40: an SRV whose PO is not in the system", () => {
  test("is stored unattached and unmatched, changes no PO and raises no flag", async () => {
    await uploadPo(APRIL);

    expect(await uploadOne([{ ...S1, ord: "9.000", challan: "55" }], "4500099")).toEqual({
      name: "srv-0.html",
      status: "accepted",
      reason: 'PO 4500099 is not in the system yet; its SRVs are stored and listed as "PO not found".',
    });

    expect(await srvs()).toMatchObject([{ poNumber: "4500099", poId: null, srvNumber: "7000001" }]);
    expect(await lines()).toMatchObject([{ poItemId: null, ordQty: 9000, challanNo: "55", resolvedDcId: null }]);
    expect((await itemQty()).map((i) => i.rcd)).toEqual([0, 0]);
    expect(await flags()).toEqual([]);
  });
});

describe("INV-43: the date guard per (PO, SRV number)", () => {
  beforeEach(async () => {
    await uploadPo(APRIL);
    await uploadOne([{ ...S1, rcd: "4.000" }]);
  });

  test("an older copy of a stored SRV is skipped and changes nothing", async () => {
    const before = { srvs: await srvs(), lines: await lines() };

    expect(await uploadOne([{ ...S1, date: "20/04/2025", rcd: "6.000" }])).toEqual({
      name: "srv-0.html",
      status: "skipped",
      reason: "Older than the stored SRV 7000001 (dated 2025-05-01). Nothing was changed.",
    });

    expect({ srvs: await srvs(), lines: await lines() }).toEqual(before);
    expect((await itemQty())[0]?.rcd).toBe(4000);
  });

  test("a copy with the same date replaces the SRV's items", async () => {
    await uploadOne([
      { ...S1, rcd: "6.000" },
      { ...S1, srvItem: 2, item: 20, rcd: "1.000" },
    ]);

    expect((await lines()).map((l) => [l.poItemNo, l.rcdQty])).toEqual([
      [10, 6000],
      [20, 1000],
    ]);
    expect((await itemQty()).map((i) => i.rcd)).toEqual([6000, 1000]);
  });

  test("a file with an older and a new SRV stores the new one and names the skipped one", async () => {
    expect(
      await uploadOne([
        { ...S1, date: "20/04/2025", rcd: "6.000" },
        { srv: "7000002", date: "02/05/2025", item: 20, rcd: "2.000" },
      ]),
    ).toEqual({
      name: "srv-0.html",
      status: "accepted",
      reason: "Older than the stored SRV 7000001 (dated 2025-05-01), so it was skipped.",
    });

    expect((await srvs()).map((r) => [r.srvNumber, r.srvDate])).toEqual([
      ["7000001", "2025-05-01"],
      ["7000002", "2025-05-02"],
    ]);
    expect((await itemQty()).map((i) => i.rcd)).toEqual([4000, 2000]);
  });
});

describe("failures and odd rows (INV-50, A2-10)", () => {
  beforeEach(async () => {
    await uploadPo(APRIL);
    await uploadOne([{ ...S1, rcd: "4.000" }]);
  });

  test("stores rows whose keys repeat and a PO ITM 0 row as printed, numbered in row order (A2-10)", async () => {
    const [result] = await upload({
      rows: [
        { srv: "7000002", date: "02/05/2025", item: 20, challan: "11" },
        { srv: "7000002", date: "02/05/2025", item: 0, srvItem: 2 },
        { srv: "7000002", date: "02/05/2025", item: 20, challan: "12" },
      ],
    });

    expect(result).toEqual({ name: "srv-0.html", status: "accepted", reason: null });
    const stored = (await lines()).filter((l) => l.poItemNo !== 10 || l.challanNo !== null);
    expect(stored.map((l) => [l.rowNo, l.poItemNo, l.srvItemNo, l.challanNo])).toEqual([
      [2, 0, 2, null],
      [1, 20, 1, "11"],
      [3, 20, 1, "12"],
    ]);
  });

  test("a re-uploaded SRV keeps each repeated row's id, in row order (INV-59)", async () => {
    const rows = [
      { srv: "7000002", date: "02/05/2025", item: 20, challan: "11" },
      { srv: "7000002", date: "02/05/2025", item: 20, challan: "12" },
    ];
    await uploadOne(rows);
    const ids = async () =>
      (await db.query(db.build.select().from(srvItem).where(eq(srvItem.poItemNo, 20)).orderBy(srvItem.rowNo))).map(
        (l) => [l.rowNo, l.id, l.challanNo],
      );
    const first = await ids();
    await uploadOne([{ ...rows[0]!, challan: "13" }, rows[1]!]);
    expect(await ids()).toEqual([
      [1, first[0]?.[1], "13"],
      [2, first[1]?.[1], "12"],
    ]);
  });

  test("an SRV that cannot be read is reported, and the file's other SRVs are stored (A2-10)", async () => {
    const [result] = await upload({
      rows: [
        { srv: "7000002", date: "02/05/2025", item: 20 },
        { srv: "7000003", date: "02/05/2025", item: 20, rcd: "N/A" },
      ],
    });

    expect(result).toEqual({
      name: "srv-0.html",
      status: "accepted",
      reason: 'SRV 7000003 could not be read (bad-quantity): RECVD QTY is not a quantity: "N/A".',
    });
    expect((await srvs()).map((r) => r.srvNumber)).toEqual(["7000001", "7000002"]);
  });

  test("a file none of whose SRVs can be read fails and keeps the previous SRV data", async () => {
    const before = { srvs: await srvs(), lines: await lines() };

    const [result] = await upload({ rows: [{ ...S1, rcd: "N/A" }] });

    expect(result).toEqual({
      name: "srv-0.html",
      status: "failed",
      reason: 'Could not read this SRV page (bad-quantity): RECVD QTY is not a quantity: "N/A"',
    });
    expect({ srvs: await srvs(), lines: await lines() }).toEqual(before);
    expect((await itemQty())[0]?.rcd).toBe(4000);
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
      srvUploadRoutes(srvIngestService({ db: refusing, storage, clock: fixedClock })),
    );
    const files = ["7000002", "7000003", "7000004"].map((number) => ({
      name: `${number}.html`,
      html: srvPage(PO, [{ srv: number, date: "02/05/2025", item: 20, rcd: "1.000" }]),
    }));

    const { results } = await refusingClient.request("srv.upload", { body: { files } });

    expect(results.map((r) => r.status)).toEqual(["accepted", "failed", "accepted"]);
    expect(results[1]?.reason).toBe("The SRVs of PO 4500001 could not be saved. Nothing from this file was changed.");
    expect((await srvs()).map((r) => r.srvNumber)).toEqual(["7000001", "7000002", "7000004"]);
    expect((await itemQty()).map((i) => i.rcd)).toEqual([4000, 2000]);
  });

  test("an upload before onboarding is refused with 409", async () => {
    const empty = await supplierDb();
    await empty.batch([empty.build.delete(supplier)]);
    const { send } = testApp(srvUploadRoutes(srvIngestService({ db: empty, storage, clock: fixedClock })));

    const res = await send("/api/srv/upload", json("POST", { files: [{ name: "a.html", html: srvPage(PO, [S1]) }] }));

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "onboarding-required" });
    empty.close();
  });
});
