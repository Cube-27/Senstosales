// The DC API tests' synthetic PO, header and helpers (C1), over HTTP on the full app.
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, poItem, reconciliationIssue } from "@senstosales/db";
import type { Fy, GstPct, IsoDate, Money } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import type { NodeDb } from "@senstosales/db/node";

import type { AppOverrides } from "./api-app.ts";
import { onboardedApp } from "./api-app.ts";
import { json } from "./helpers.ts";
import { NOW } from "./service-deps.ts";

export type App = Awaited<ReturnType<typeof onboardedApp>>;
export type Json = Record<string, unknown>;

/** The JSON fields these tests read; each test asserts the values. */
export interface Wire extends Json {
  id: string;
  code: string;
  version: number;
  items: (Json & { id: string })[];
}

export const line = (poItemNo: number, ordQty: string) => ({
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
export const PO = {
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
export const HEADER = {
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
  invoiceNumber: null,
  invoiceDate: null,
  lotNo: null,
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
  const auditOf = async (action: string) => (await app.audit()).filter((row) => row.action === action);
  const dcAudit = () => auditOf("dc.create");

  /** An invoice on DC `dcId` in FY 2025-26, stored directly: these tests read only its link to the DC. */
  async function invoiceOnDc(row: { id: string; dcId: string; number: string; invoiceDate: string }) {
    const [stored] = await app.db.query(app.db.build.select().from(dc).where(eq(dc.id, row.dcId)));
    const zero = 0 as Money;
    await app.db.batch([
      app.db.build.insert(invoice).values({
        ...row,
        supplierId: stored!.supplierId,
        poId: stored!.poId,
        kind: "dc",
        invoiceDate: row.invoiceDate as IsoDate,
        financialYear: "2025-26" as Fy,
        cgstPct: 9_00000 as GstPct,
        sgstPct: 9_00000 as GstPct,
        taxable: zero,
        cgst: zero,
        sgst: zero,
        igst: zero,
        total: zero,
        createdAt: NOW,
      }),
    ]);
  }
  return { send, storedPo, createDc, items, dcs, dcLines, flags, auditOf, dcAudit, invoiceOnDc };
}

export async function ready(overrides?: AppOverrides) {
  const app = await onboardedApp(overrides);
  return { app, ...setup(app) };
}

/** A `Db` whose next `count` batches wait until all of them are built, then run in turn; later batches run at once. */
export function heldBatches() {
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
  const hold = (n: number): void => {
    count = n;
  };
  return { wrap, hold };
}

/** A `Db` whose batch after `close()` waits until `open()`; every other batch runs at once. */
export function gatedBatch() {
  let held: { reached: () => void; gate: Promise<void> } | undefined;
  const wrap = (db: Db): Db => ({
    build: db.build,
    query: (statement) => db.query(statement),
    batch: async (statements) => {
      const h = held;
      held = undefined;
      if (h) {
        h.reached();
        await h.gate;
      }
      return db.batch(statements);
    },
  });
  function close() {
    const reached = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    held = { reached: reached.resolve, gate: gate.promise };
    return { reached: reached.promise, open: gate.resolve };
  }
  return { wrap, close };
}
