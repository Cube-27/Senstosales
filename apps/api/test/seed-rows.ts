// Synthetic rows for the read-API tests (C1): insert builders with neutral defaults, `recompute` to write the derived
// columns as every write batch does, and an app with every service over the test DB.
import type { Instant } from "@senstosales/db";
import {
  auditLog,
  dc,
  dcItem,
  invoice,
  invoiceItem,
  po,
  poItem,
  poLot,
  reconciliationIssue,
  srv,
  srvItem,
  WriteBatch,
} from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";

import { apiRoutes } from "../src/routes/index.ts";
import { createServices } from "../src/services/index.ts";
import { recomputePo } from "../src/services/recompute.ts";
import { testApp } from "./helpers.ts";
import { fixedClock, memoryStorage, SUPPLIER } from "./service-deps.ts";

export const q = (n: number) => n as Qty;
export const m = (n: number) => n as Money;
export const d = (s: string) => s as IsoDate;
export const at = (s: string) => s as Instant;
const S = { supplierId: SUPPLIER };
const FY = "2025-26" as Fy;

/** A ULID whose last two characters name the row. */
export const id = (tag: string) => `01J9Z8Q4S5T6V7W8X9Y0Z1A2${tag}`;

/** Every route over `db`, signed in, with today 2025-06-01: `send` answers the raw response. */
export function routesOver(db: NodeDb, signedIn = true) {
  const services = createServices({
    db,
    clock: fixedClock,
    jobs: { enqueue: () => {}, holds: () => false },
    storage: memoryStorage(),
  });
  return testApp(apiRoutes(services), () => Promise.resolve(signedIn)).send;
}

/** {@link routesOver}, answering the status and JSON body. */
export function readApp(db: NodeDb, signedIn = true) {
  const send = routesOver(db, signedIn);
  return async (path: string) => {
    const res = await send(path);
    return { status: res.status, body: (await res.json()) as unknown };
  };
}

export async function recompute(db: NodeDb, ...poIds: string[]) {
  const batch = new WriteBatch(db);
  for (const poId of poIds) for (const s of await recomputePo({ db, clock: fixedClock }, poId)) batch.add(s);
  await batch.commit();
}

const zeros = { dspQty: q(0), rcdQty: q(0), rejQty: q(0), balanceQty: q(0) };

/** Builders for one `db`; each returns an insert statement for `db.batch`. */
export function rows(db: NodeDb) {
  const b = db.build;
  return {
    po: (row: { id: string; poNumber: string; poDate: string | null; poValue?: number; gemcNumber?: string }) =>
      b.insert(po).values({
        ...S,
        ...zeros,
        id: row.id,
        poNumber: row.poNumber,
        poDate: row.poDate === null ? null : d(row.poDate),
        poValue: row.poValue === undefined ? null : m(row.poValue),
        amendNo: 0,
        isGemc: row.gemcNumber !== undefined,
        gemcNumber: row.gemcNumber ?? null,
        rawHeader: {},
        status: "Pending",
        ordQty: q(0),
      }),

    item: (
      row: Omit<Partial<typeof poItem.$inferInsert>, "ordQty"> & {
        id: string;
        poId: string;
        poItemNo: number;
        ordQty: number;
      },
    ) =>
      b.insert(poItem).values({
        ...S,
        ...zeros,
        materialCode: `M-${row.poItemNo}`,
        rateSource: m(100_00000),
        rate: m(100_00000),
        poRcdQty: q(0),
        poRejQty: null,
        uninvoicedQty: q(0),
        status: "Pending",
        ...row,
        ordQty: q(row.ordQty),
      }),

    lot: (
      row: Omit<Partial<typeof poLot.$inferInsert>, "delyQty"> & {
        id: string;
        poItemId: string;
        lotNo: number;
        delyQty: number;
      },
    ) => b.insert(poLot).values({ ...S, ...row, delyQty: q(row.delyQty) }),

    dc: (row: {
      id: string;
      poId: string;
      number: string;
      dcDate: string;
      createdAt: string;
      consignee?: string;
      departmentNo?: string;
      invoiceNumber?: string;
    }) =>
      b.insert(dc).values({
        ...S,
        id: row.id,
        poId: row.poId,
        number: row.number,
        dcDate: d(row.dcDate),
        financialYear: FY,
        gcNumber: row.number,
        gcDate: d(row.dcDate),
        consigneeName: row.consignee ?? null,
        departmentNo: row.departmentNo ?? null,
        invoiceNumber: row.invoiceNumber ?? null,
        createdAt: at(row.createdAt),
      }),

    dcItem: (row: { id: string; dcId: string; poItemId: string; dspQty: number; packets?: number }) =>
      b.insert(dcItem).values({ ...S, ...row, dspQty: q(row.dspQty), createdAt: at("2025-04-20T00:00:00.000Z") }),

    invoice: (row: {
      id: string;
      poId: string;
      dcId?: string;
      number: string;
      invoiceDate: string;
      total: number;
      createdAt: string;
      buyer?: string;
      gemcNumber?: string;
    }) =>
      b.insert(invoice).values({
        ...S,
        id: row.id,
        poId: row.poId,
        dcId: row.dcId ?? null,
        kind: row.dcId === undefined ? "direct" : "dc",
        number: row.number,
        invoiceDate: d(row.invoiceDate),
        financialYear: FY,
        buyerName: row.buyer ?? null,
        gemcNumber: row.gemcNumber ?? null,
        cgstPct: 900000 as GstPct,
        sgstPct: 900000 as GstPct,
        taxable: m(row.total),
        cgst: m(0),
        sgst: m(0),
        igst: m(0),
        total: m(row.total),
        createdAt: at(row.createdAt),
      }),

    invoiceItem: (row: {
      id: string;
      invoiceId: string;
      poItemId: string;
      dcItemId?: string;
      qty: number;
      packets?: number;
    }) =>
      b.insert(invoiceItem).values({
        ...S,
        ...row,
        dcItemId: row.dcItemId ?? null,
        qty: q(row.qty),
        rate: m(100_00000),
        taxable: m(0),
        cgst: m(0),
        sgst: m(0),
        igst: m(0),
        total: m(0),
      }),

    srv: (row: { id: string; poNumber: string; poId: string | null; srvNumber: string; srvDate: string }) =>
      b.insert(srv).values({ ...S, ...row, srvDate: d(row.srvDate), financialYear: FY, rawHeader: {} }),

    srvItem: (
      row: Omit<Partial<typeof srvItem.$inferInsert>, "rcdQty"> & {
        id: string;
        srvId: string;
        poItemId: string | null;
        rcdQty: number;
      },
    ) =>
      b.insert(srvItem).values({
        ...S,
        poItemNo: 10,
        lotNo: 1,
        rowNo: 1,
        srvItemNo: 1,
        ordQty: q(0),
        ...row,
        rcdQty: q(row.rcdQty),
        acceptedQty: q(row.rcdQty),
        rejQty: q(0),
      }),

    flag: (row: {
      id: string;
      poId: string;
      scopeType: "po_item" | "dc_item" | "invoice_item" | "srv_item";
      scopeId: string;
      status: "open" | "acknowledged";
    }) =>
      b.insert(reconciliationIssue).values({
        ...S,
        ...row,
        type: "QTY_MISMATCH",
        fingerprint: `fp-${row.id}`,
        details: { field: "rcd", expected: "4", actual: "3", docIds: [] },
        note: null,
        openedAt: at("2025-05-02T05:30:00.000Z"),
        acknowledgedAt: row.status === "open" ? null : at("2025-05-03T05:30:00.000Z"),
      }),

    /** The audit row a PO ingest or manual create writes; its time is when the PO entered the system. */
    poAudit: (row: { id: string; poId: string; at: string; action?: string }) =>
      b.insert(auditLog).values({
        id: row.id,
        at: at(row.at),
        actor: "admin",
        action: row.action ?? "po.ingest",
        entityType: "po",
        entityId: row.poId,
      }),
  };
}
