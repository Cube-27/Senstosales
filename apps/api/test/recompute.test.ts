// SPEC-08 PR 2: `recomputePo` turns a seeded synthetic PO into derived item columns, PO totals and status, and new
// flags (INV-14, INV-59, INV-84). Real node:sqlite; expected values worked by hand from ARCHITECTURE §6.2, §6.3, §6.9.
import type { Instant } from "@senstosales/db";
import {
  dc,
  dcItem,
  invoice,
  invoiceItem,
  po,
  poItem,
  reconciliationIssue,
  srv,
  srvItem,
  WriteBatch,
} from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { NotFoundError } from "../src/errors.ts";
import { recomputePo } from "../src/services/recompute.ts";
import { fixedClock, supplierDb, NOW, SUPPLIER } from "./service-deps.ts";

const q = (n: number) => n as Qty;
const d = (s: string) => s as IsoDate;
const at = (s: string) => s as Instant;
const zero = q(0);
const S = { supplierId: SUPPLIER };

let db: NodeDb;
beforeEach(async () => {
  db = await supplierDb();
});
afterEach(() => db.close());

// Derived columns start wrong (zeros, status "Pending") so the test sees recompute write them.
const derivedZero = { dspQty: zero, rcdQty: zero, rejQty: zero, balanceQty: zero, uninvoicedQty: zero };
const item = (id: string, no: number, ordQty: number, extra: Partial<typeof poItem.$inferInsert> = {}) => ({
  ...S,
  id,
  poId: "P1",
  poItemNo: no,
  materialCode: `M-${no}`,
  ordQty: q(ordQty),
  rateSource: 100_00000 as Money,
  rate: 100_00000 as Money,
  poRcdQty: zero,
  poRejQty: null,
  status: "Pending" as const,
  ...derivedZero,
  ...extra,
});

/**
 * P1, dated 2025-04-10:
 * - I1 ord 10: DC D1 dispatches 4 (invoiced by DC-sourced N1), PO-direct N2 invoices 3, manual dispatched 0.5 set
 *   before D1 was created; SRV 2025-05-01 (on/after the PO date, so SRV wins) rcd 0, accepted 5, rejected 1.
 * - I2 ord 5, cancelled; D1 also dispatches 1 on it.
 * - I3 ord 2: D1 dispatches 2.5; PO document rcd 0, rej 0.5; SRV 2025-04-01 (before the PO date, so PO wins) with
 *   ord 1.5 and an invoice number no invoice has.
 */
async function seed(): Promise<void> {
  const b = db.build;
  await db.batch([
    b.insert(po).values({
      ...S,
      id: "P1",
      poNumber: "4500001",
      poDate: d("2025-04-10"),
      amendNo: 0,
      isGemc: false,
      rawHeader: {},
      status: "Closed",
      ordQty: zero,
      dspQty: zero,
      rcdQty: zero,
      rejQty: zero,
      balanceQty: zero,
    }),
    b
      .insert(poItem)
      .values([
        item("I1", 10, 10_000, { manualDispatchedQty: q(500), manualSetAt: at("2025-04-01T00:00:00.000Z") }),
        item("I2", 20, 5_000, { cancelledAt: at("2025-04-15T00:00:00.000Z") }),
        item("I3", 30, 2_000, { poRejQty: q(500) }),
      ]),
    b.insert(dc).values({
      ...S,
      id: "D1",
      poId: "P1",
      number: "DC-1",
      dcDate: d("2025-04-20"),
      financialYear: "2025-26" as Fy,
      gcNumber: "DC-1",
      gcDate: d("2025-04-20"),
      createdAt: at("2025-04-20T00:00:00.000Z"),
    }),
    b.insert(dcItem).values([
      { ...S, id: "DL1", dcId: "D1", poItemId: "I1", dspQty: q(4_000), createdAt: at("2025-04-20T00:00:00.000Z") },
      { ...S, id: "DL2", dcId: "D1", poItemId: "I2", dspQty: q(1_000), createdAt: at("2025-04-20T00:00:00.000Z") },
      { ...S, id: "DL3", dcId: "D1", poItemId: "I3", dspQty: q(2_500), createdAt: at("2025-04-20T00:00:00.000Z") },
    ]),
    ...[
      { id: "N1", dcId: "D1", kind: "dc" as const, number: "INV-1" },
      { id: "N2", dcId: null, kind: "direct" as const, number: "INV-2" },
    ].map((n) =>
      b.insert(invoice).values({
        ...S,
        ...n,
        poId: "P1",
        invoiceDate: d("2025-04-21"),
        financialYear: "2025-26" as Fy,
        cgstPct: 900000 as GstPct,
        sgstPct: 900000 as GstPct,
        taxable: 0 as Money,
        cgst: 0 as Money,
        sgst: 0 as Money,
        igst: 0 as Money,
        total: 0 as Money,
        createdAt: at("2025-04-21T00:00:00.000Z"),
      }),
    ),
    b.insert(invoiceItem).values(
      [
        { id: "NL1", invoiceId: "N1", dcItemId: "DL1", qty: q(4_000) },
        { id: "NL2", invoiceId: "N2", dcItemId: null, qty: q(3_000) },
      ].map((l) => ({
        ...S,
        ...l,
        poItemId: "I1",
        rate: 100_00000 as Money,
        taxable: 0 as Money,
        cgst: 0 as Money,
        sgst: 0 as Money,
        igst: 0 as Money,
        total: 0 as Money,
      })),
    ),
    b.insert(srv).values(
      [
        { ...S, id: "R1", poNumber: "4500001", poId: "P1", srvNumber: "SRV-1", srvDate: d("2025-05-01") },
        { ...S, id: "R2", poNumber: "4500001", poId: "P1", srvNumber: "SRV-2", srvDate: d("2025-04-01") },
      ].map((r) => ({ ...r, financialYear: "2025-26" as Fy, rawHeader: {} })),
    ),
    b.insert(srvItem).values([
      {
        ...S,
        id: "RL1",
        srvId: "R1",
        poItemId: "I1",
        materialCode: "M-10",
        poItemNo: 10,
        lotNo: 1,
        rowNo: 1,
        srvItemNo: 1,
        ordQty: q(10_000),
        rcdQty: zero,
        acceptedQty: q(5_000),
        rejQty: q(1_000),
        challanNo: "DC-1",
        resolvedDcId: "D1",
      },
      {
        ...S,
        id: "RL2",
        srvId: "R2",
        poItemId: "I3",
        materialCode: "M-30",
        poItemNo: 30,
        lotNo: 1,
        rowNo: 1,
        srvItemNo: 1,
        ordQty: q(1_500),
        rcdQty: q(1_500),
        acceptedQty: q(1_500),
        rejQty: zero,
        invoiceNo: "INV-9",
      },
    ]),
  ]);
}

async function recomputeAndCommit(poId = "P1"): Promise<void> {
  const batch = new WriteBatch(db);
  for (const statement of await recomputePo({ db, clock: fixedClock }, poId)) batch.add(statement);
  await batch.commit();
}

const items = () =>
  db.query(
    db.build
      .select({
        id: poItem.id,
        dspQty: poItem.dspQty,
        rcdQty: poItem.rcdQty,
        rejQty: poItem.rejQty,
        balanceQty: poItem.balanceQty,
        uninvoicedQty: poItem.uninvoicedQty,
        status: poItem.status,
      })
      .from(poItem)
      .orderBy(poItem.poItemNo),
  );
const header = async () =>
  (
    await db.query(
      db.build
        .select({
          status: po.status,
          ordQty: po.ordQty,
          dspQty: po.dspQty,
          rcdQty: po.rcdQty,
          rejQty: po.rejQty,
          balanceQty: po.balanceQty,
          version: po.version,
        })
        .from(po),
    )
  )[0];
const flags = () =>
  db.query(
    db.build
      .select({
        type: reconciliationIssue.type,
        scopeType: reconciliationIssue.scopeType,
        scopeId: reconciliationIssue.scopeId,
        poId: reconciliationIssue.poId,
        details: reconciliationIssue.details,
        status: reconciliationIssue.status,
        openedAt: reconciliationIssue.openedAt,
      })
      .from(reconciliationIssue)
      .orderBy(reconciliationIssue.type, reconciliationIssue.scopeId),
  );

const EXPECTED_ITEMS = [
  // dsp 4 + 3 + 0.5; SRV wins: rcd = accepted 5 (rcd 0), rej 1; balance 10 − max(5, 7.5); uninvoiced 10 − 4 − 3.
  { id: "I1", dspQty: 7_500, rcdQty: 5_000, rejQty: 1_000, balanceQty: 2_500, uninvoicedQty: 3_000, status: "Pending" },
  // Cancelled: balance 0, dsp and uninvoiced by the normal formulas (D-0025).
  { id: "I2", dspQty: 1_000, rcdQty: 0, rejQty: 0, balanceQty: 0, uninvoicedQty: 5_000, status: "Cancelled" },
  // PO wins: rcd 0, rej 0.5; dsp 2.5 >= ord 2 → Delivered; balance max(0, 2 − 2.5).
  { id: "I3", dspQty: 2_500, rcdQty: 0, rejQty: 500, balanceQty: 0, uninvoicedQty: 2_000, status: "Delivered" },
];

const EXPECTED_FLAGS = [
  {
    type: "DOC_NUMBER_CONFLICT",
    scopeType: "srv_item",
    scopeId: "RL2",
    details: { field: "invoice_no", expected: null, actual: "INV-9", docIds: [] },
  },
  {
    type: "DOC_ON_CANCELLED_ITEM",
    scopeType: "dc_item",
    scopeId: "DL2",
    details: { field: "status", expected: null, actual: "Cancelled", docIds: ["D1"] },
  },
  {
    type: "MANUAL_ADJUSTMENT_OVERLAP",
    scopeType: "po_item",
    scopeId: "I1",
    details: { field: "manual_dispatched_qty", expected: null, actual: "0.5", docIds: ["D1"] },
  },
  {
    type: "OVER_DISPATCH",
    scopeType: "po_item",
    scopeId: "I3",
    details: { field: "dsp_qty", expected: "2", actual: "2.5", docIds: [] },
  },
  {
    type: "QTY_MISMATCH",
    scopeType: "srv_item",
    scopeId: "RL2",
    details: { field: "ord_qty", expected: "2", actual: "1.5", docIds: [] },
  },
].map((f) => ({ ...f, poId: "P1", status: "open", openedAt: NOW }));

describe("recomputePo", () => {
  test("writes each item's derived quantities and status", async () => {
    await seed();
    await recomputeAndCommit();
    expect(await items()).toEqual(EXPECTED_ITEMS);
  });

  test("writes the PO totals over active items and the PO status, leaving its version alone", async () => {
    await seed();
    await recomputeAndCommit();
    // I1 + I3 (I2 is cancelled): ord 12, dsp 10, rcd 5, rej 1.5, balance 2.5; I1 Pending → PO Pending.
    expect(await header()).toEqual({
      status: "Pending",
      ordQty: 12_000,
      dspQty: 10_000,
      rcdQty: 5_000,
      rejQty: 1_500,
      balanceQty: 2_500,
      version: 1,
    });
  });

  test("inserts the flags the PO calls for", async () => {
    await seed();
    await recomputeAndCommit();
    expect(await flags()).toEqual(EXPECTED_FLAGS);
  });

  test("is idempotent: a second run changes nothing and never duplicates a flag, open or acknowledged (INV-59)", async () => {
    await seed();
    await recomputeAndCommit();
    await db.batch([
      db.build
        .update(reconciliationIssue)
        .set({ status: "acknowledged", acknowledgedAt: NOW })
        .where(eq(reconciliationIssue.type, "OVER_DISPATCH")),
    ]);

    await recomputeAndCommit();

    expect(await items()).toEqual(EXPECTED_ITEMS);
    expect((await header())?.dspQty).toBe(10_000);
    expect((await flags()).map((f) => [f.type, f.status])).toEqual([
      ["DOC_NUMBER_CONFLICT", "open"],
      ["DOC_ON_CANCELLED_ITEM", "open"],
      ["MANUAL_ADJUSTMENT_OVERLAP", "open"],
      ["OVER_DISPATCH", "acknowledged"],
      ["QTY_MISMATCH", "open"],
    ]);
  });

  test("a PO with no items, documents or SRVs is Closed with zero totals", async () => {
    await seed();
    await db.batch([
      db.build.insert(po).values({
        ...S,
        id: "P2",
        poNumber: "4500002",
        poDate: d("2025-04-10"),
        amendNo: 0,
        isGemc: false,
        rawHeader: {},
        status: "Pending",
        ordQty: q(9),
        dspQty: q(9),
        rcdQty: q(9),
        rejQty: q(9),
        balanceQty: q(9),
      }),
    ]);
    await recomputeAndCommit("P2");
    const rows = await db.query(
      db.build
        .select({ status: po.status, ordQty: po.ordQty, balanceQty: po.balanceQty })
        .from(po)
        .where(eq(po.id, "P2")),
    );
    expect(rows).toEqual([{ status: "Closed", ordQty: 0, balanceQty: 0 }]);
    expect((await flags()).filter((f) => f.poId === "P2")).toEqual([]);
  });

  test("two recomputes built before either commits both commit, and each flag is stored once (INV-59)", async () => {
    await seed();
    // Both batches diff against the same stored flags (none), so both carry the same five inserts.
    const [first, second] = [new WriteBatch(db), new WriteBatch(db)];
    for (const batch of [first, second]) {
      for (const statement of await recomputePo({ db, clock: fixedClock }, "P1")) batch.add(statement);
    }
    await first.commit();
    await second.commit();

    expect(await flags()).toEqual(EXPECTED_FLAGS);
    expect(await items()).toEqual(EXPECTED_ITEMS);
  });

  test("an unknown PO id is a NotFoundError", async () => {
    await expect(recomputePo({ db, clock: fixedClock }, "NOPE")).rejects.toThrow(NotFoundError);
  });
});
