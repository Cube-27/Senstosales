// The invoice API tests' synthetic POs, header and helpers (C1), over HTTP on the full app, on top of the DC tests'.
import { dcItem, invoice, invoiceItem } from "@senstosales/db";
import { expect } from "vite-plus/test";

import type { AppOverrides } from "./api-app.ts";
import type { Json } from "./dc-fixtures.ts";
import { line, PO as DC_PO, ready as dcReady } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";

const rated = (poItemNo: number, ordQty: string, rateSource: string) => ({ ...line(poItemNo, ordQty), rateSource });

/** PO 4500001: item 10 of ord 10 at 100 and item 20 of ord 5 at 33.333. */
export const PO = { ...DC_PO, items: [rated(10, "10", "100"), rated(20, "5", "33.333")] };

/** A GEMC PO: the GST-inclusive 848.75 is stored as the net 719.27966 (INV-16). */
export const GEMC_PO = {
  ...PO,
  poNumber: "4500002",
  gemcNumber: "GEMC-77",
  items: [rated(10, "10", "848.75"), rated(20, "5", "118")],
};

/** Every invoice header field: a synthetic buyer snapshot, the rest blank. */
export const HEADER = {
  buyerName: "Example Unit",
  buyerGstin: "TESTGSTIN0002",
  buyerAddress: "2 Example Road",
  buyerState: "Example State",
  buyerStateCode: "99",
  placeOfSupply: "Example City",
  buyersOrderDate: null,
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: null,
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  destination: null,
  termsOfDelivery: null,
  remarks: null,
  supplierName: "Example Supplier",
  supplierAddress: "1 Example Road",
  supplierGstin: "TESTGSTIN0001",
  supplierContact: "Example Contact",
};

/** The DC tests' app with this file's PO, and the invoice reads and writes. */
export async function ready(overrides?: AppOverrides) {
  const r = await dcReady(overrides);
  const { app, send, createDc, items, auditOf } = r;
  const storedPo = (po: Json = PO) => r.storedPo(po);
  /** A stored DC with its line ids in the order given. */
  async function storedDc(poId: string, number: string, dcDate: string, lines: { poItemId: string; dspQty: string }[]) {
    const created = await createDc({ poId, number, dcDate, items: lines });
    expect(created.status).toBe(200);
    const rows = await app.db.query(app.db.build.select().from(dcItem).orderBy(dcItem.id));
    return { dcId: created.body.id, lineIds: rows.filter((row) => row.dcId === created.body.id).map((row) => row.id) };
  }
  const createInvoice = (body: Json) => send("/api/invoice", json("POST", { kind: "dc", ...HEADER, ...body }));
  const createDirect = (body: Json) => send("/api/invoice", json("POST", { kind: "direct", ...HEADER, ...body }));
  const invoices = () => app.db.query(app.db.build.select().from(invoice).orderBy(invoice.id));
  const invoiceLines = () => app.db.query(app.db.build.select().from(invoiceItem).orderBy(invoiceItem.id));
  const invoiceAudit = () => auditOf("invoice.create");
  /** Everything an invoice create writes; a refused create leaves it as it was. */
  const written = async () => [await invoices(), await invoiceLines(), await invoiceAudit(), await items()];
  return { ...r, storedPo, storedDc, createInvoice, createDirect, invoices, invoiceLines, invoiceAudit, written };
}

/** PO 4500001 with DC 7 of 4 on item 10 and 2 on item 20, in FY 2025-26. */
export async function withDc(overrides?: AppOverrides) {
  const r = await ready(overrides);
  const { poId, item10, item20 } = await r.storedPo();
  const { dcId, lineIds } = await r.storedDc(poId, "7", "2025-04-02", [
    { poItemId: item10, dspQty: "4" },
    { poItemId: item20, dspQty: "2" },
  ]);
  const [dcItem10 = "", dcItem20 = ""] = lineIds;
  /** The lines of DC 7 as the form sends them: DC qty, PO rate. */
  const lines = [
    { dcItemId: dcItem10, qty: "4", rate: "100" },
    { dcItemId: dcItem20, qty: "2", rate: "33.333" },
  ];
  return { ...r, poId, item10, item20, dcId, dcItem10, dcItem20, lines };
}
