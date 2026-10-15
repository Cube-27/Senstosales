import type { FlagDetails, ItemQuantities, LineTax, PoTotals } from "@senstosales/domain";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { z } from "zod";

import {
  zAuditEntry,
  zBuyer,
  zDc,
  zDcItem,
  zFlag,
  zInvoice,
  zInvoiceItem,
  zJob,
  zJobEvent,
  zPo,
  zPoItem,
  zPoLot,
  zSetting,
  zSrv,
  zSrvItem,
  zSupplier,
} from "../src/index.ts";

// Synthetic records (C1): reserved names, made-up numbers. One ULID per role keeps the cases readable.
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PO_ID = "01BX5ZZKBKACTAV9WEVGEMMVRZ";
const ITEM_ID = "01BX5ZZKBKACTAV9WEVGEMMVS0";
const DC_ID = "01BX5ZZKBKACTAV9WEVGEMMVS1";
const AT = "2026-10-14T09:30:00Z";

const DC_HEADER = {
  ourRef: "REF-1",
  departmentNo: "12",
  consigneeName: "Example Unit",
  consigneeGstin: null,
  consigneeAddress: "1 Example Road",
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: "XX00XX0000",
  lrNo: null,
  transporter: "Example Transport",
  modeOfTransport: "Road",
  remarks: null,
  invoiceNumber: null,
  invoiceDate: null,
  supplierName: null,
  supplierAddress: null,
  supplierGstin: null,
  supplierContact: null,
};

const INVOICE_HEADER = {
  buyerName: "Example Unit",
  buyerGstin: null,
  buyerAddress: "1 Example Road",
  buyerState: "Example State",
  buyerStateCode: "99",
  placeOfSupply: "Example City",
  buyersOrderDate: "2025-03-01",
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: "45 Days",
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  vehicleNo: null,
  lrNo: null,
  transporter: null,
  destination: null,
  termsOfDelivery: null,
  remarks: null,
  supplierName: null,
  supplierAddress: null,
  supplierGstin: null,
  supplierContact: null,
};

const INVOICE = {
  id: ID,
  poId: PO_ID,
  kind: "dc",
  dcId: DC_ID,
  number: "344",
  invoiceDate: "2025-04-02",
  financialYear: "2025-26",
  ...INVOICE_HEADER,
  cgstPct: "9",
  sgstPct: "9",
  taxable: "2157.84",
  cgst: "194.21",
  sgst: "194.21",
  igst: "0",
  total: "2546.26",
  version: 1,
  createdAt: AT,
};

// Each entity: a wire record and the decoded values of its unit-bearing fields.
const CASES = [
  {
    name: "supplier",
    schema: zSupplier,
    wire: {
      id: ID,
      name: "Example Supplier",
      gstin: null,
      address: "1 Example Road",
      state: "Example State",
      stateCode: "99",
      contact: null,
      email: "office@example.com",
      bhelSupplierCode: "S0001",
      bankDetails: { bankName: "Example Bank", ifsc: "EXMP0000001" },
      invoiceDefaults: { paymentTerms: "45 Days" },
    },
    decoded: {},
  },
  { name: "setting", schema: zSetting, wire: { key: "gst.cgst", value: "9" }, decoded: {} },
  {
    name: "buyer",
    schema: zBuyer,
    wire: { id: ID, unitName: "Example Unit", state: "Example State", stateCode: "99", gstin: null },
    decoded: {},
  },
  {
    name: "po",
    schema: zPo,
    wire: {
      id: PO_ID,
      poNumber: "1000000001",
      poDate: "2025-03-01",
      buyerId: ID,
      enquiry: "ENQ-1",
      quotation: null,
      orderType: "SUPPLY",
      bhelStatusCode: "1",
      amendNo: 0,
      poValue: "8487.5",
      netPoValue: "7192.7966",
      isGemc: true,
      gemcNumber: "GEMC-000000000001",
      remarks: "GEMC-000000000001",
      rawHeader: { "PO NO": "1000000001" },
      status: "Pending",
      ordQty: "10",
      dspQty: "4",
      rcdQty: "2.5",
      rejQty: "0",
      balanceQty: "6",
      version: 3,
    },
    decoded: { poValue: 848750000, netPoValue: 719279660, ordQty: 10000, rcdQty: 2500, balanceQty: 6000 },
  },
  {
    name: "po item",
    schema: zPoItem,
    wire: {
      id: ITEM_ID,
      poId: PO_ID,
      poItemNo: 10,
      materialCode: "M-0001",
      description: "Example part",
      drawingNo: null,
      unit: "NOS",
      ordQty: "10",
      rateSource: "848.75",
      rate: "719.27966",
      poRcdQty: "2.5",
      poRejQty: null,
      cancelledAt: null,
      manualDispatchedQty: "4",
      manualNote: "sent by hand",
      manualSetAt: AT,
      dspQty: "4",
      rcdQty: "2.5",
      rejQty: "0",
      balanceQty: "6",
      uninvoicedQty: "10",
      status: "Pending",
    },
    decoded: { rateSource: 84875000, rate: 71927966, manualDispatchedQty: 4000, uninvoicedQty: 10000 },
  },
  {
    name: "lot",
    schema: zPoLot,
    wire: {
      id: ID,
      poItemId: ITEM_ID,
      lotNo: 1,
      delyQty: "2.5",
      delyDate: "2025-05-31",
      entryAllowDate: null,
      entryAllowNote: "AS PER SCHEDULE",
      destCode: "01",
    },
    decoded: { delyQty: 2500 },
  },
  {
    name: "dc",
    schema: zDc,
    wire: {
      id: DC_ID,
      poId: PO_ID,
      number: "100",
      dcDate: "2025-04-02",
      financialYear: "2025-26",
      gcNumber: "100",
      gcDate: "2025-04-02",
      ...DC_HEADER,
      version: 1,
      createdAt: AT,
    },
    decoded: {},
  },
  {
    name: "dc item",
    schema: zDcItem,
    wire: { id: ID, dcId: DC_ID, poItemId: ITEM_ID, dspQty: "0.001", packets: 2, createdAt: AT },
    decoded: { dspQty: 1 },
  },
  {
    name: "invoice (DC-sourced)",
    schema: zInvoice,
    wire: INVOICE,
    decoded: { cgstPct: 900000, taxable: 215784000, total: 254626000 },
  },
  {
    name: "invoice (PO-direct)",
    schema: zInvoice,
    wire: { ...INVOICE, kind: "direct", dcId: null },
    decoded: { dcId: null },
  },
  {
    name: "invoice item",
    schema: zInvoiceItem,
    wire: {
      id: ID,
      invoiceId: ID,
      poItemId: ITEM_ID,
      dcItemId: null,
      qty: "3",
      rate: "719.27966",
      taxable: "2157.83898",
      cgst: "194.20551",
      sgst: "194.20551",
      igst: "0",
      total: "2546.25",
      hsn: "0000",
      packets: null,
    },
    decoded: { qty: 3000, taxable: 215783898, cgst: 19420551, total: 254625000 },
  },
  {
    name: "srv (PO not found)",
    schema: zSrv,
    wire: {
      id: ID,
      poNumber: "1000000001",
      poId: null,
      srvNumber: "5000000001",
      srvDate: "2025-04-10",
      financialYear: "2025-26",
      rawHeader: { "SRV NO": "5000000001" },
    },
    decoded: { poId: null },
  },
  {
    name: "srv item",
    schema: zSrvItem,
    wire: {
      id: ID,
      srvId: ID,
      poItemId: ITEM_ID,
      rowNo: 1,
      materialCode: null,
      poItemNo: 10,
      subItemNo: "0",
      lotNo: null,
      srvItemNo: 1,
      revNo: "0",
      division: "D1",
      pmirNo: "P-1",
      unit: "NOS",
      ordQty: "10",
      challanQty: "3",
      rcdQty: "2.5",
      acceptedQty: "2",
      rejQty: "0.5",
      challanNo: "100",
      challanDate: "2025-04-02",
      invoiceNo: null,
      invoiceDate: null,
      financeDate: "2025-04-10",
      cnoteNo: null,
      cnoteDate: null,
      rawRow: { "PO ITM": "10", "SRV ITM": "1" },
      resolvedDcId: DC_ID,
      resolvedInvoiceId: null,
    },
    decoded: { challanQty: 3000, acceptedQty: 2000, rejQty: 500 },
  },
  {
    name: "flag",
    schema: zFlag,
    wire: {
      id: ID,
      type: "OVER_DISPATCH",
      scopeType: "po_item",
      scopeId: ITEM_ID,
      poId: PO_ID,
      details: { field: "dsp_qty", expected: "10", actual: "10.002", docIds: [DC_ID] },
      status: "acknowledged",
      note: "checked with stores",
      openedAt: AT,
      acknowledgedAt: "2026-10-15T09:30:00Z",
    },
    decoded: {},
  },
  {
    name: "audit entry",
    schema: zAuditEntry,
    wire: {
      id: ID,
      at: AT,
      actor: "admin",
      action: "po.manual-dispatched",
      entityType: "po_item",
      entityId: ITEM_ID,
      before: { manualDispatchedQty: "0" },
      after: { manualDispatchedQty: "4" },
      jobId: null,
    },
    decoded: {},
  },
  {
    name: "job",
    schema: zJob,
    wire: {
      id: ID,
      type: "po.import-folder",
      status: "running",
      createdAt: AT,
      startedAt: AT,
      finishedAt: null,
      cancelRequested: false,
      progress: { total: 40, done: 12, skipped: 1, failed: 2, current: "1000000001.html" },
      error: null,
      summary: null,
    },
    decoded: {},
  },
  {
    name: "job event",
    schema: zJobEvent,
    wire: { id: ID, jobId: ID, at: AT, level: "error", documentKey: "1000000001", message: "No item table found." },
    decoded: {},
  },
] as const;

describe("entities: §8.2 rows on the wire", () => {
  it.each(CASES)("$name decodes its units and encodes back to the same wire record", ({ schema, wire, decoded }) => {
    const value = z.decode(schema as z.ZodType, wire);
    expect(value).toMatchObject(decoded);
    expect(z.encode(schema as z.ZodType, value)).toEqual(wire);
  });

  // Every field is required (nullable ones are sent as `null`), so dropping any one of them fails.
  it.each(CASES)("$name rejects each missing field", ({ schema, wire }) => {
    for (const key of Object.keys(wire)) {
      const { [key]: _dropped, ...rest } = wire as Record<string, unknown>;
      expect(schema.safeParse(rest).success, key).toBe(false);
    }
  });

  // No float type appears in any quantity or money schema (SPEC-04 §7): on the wire, the only numbers are integers.
  it.each(CASES)("$name has no float on the wire", ({ schema }) => {
    const json = JSON.stringify(z.toJSONSchema(schema, { io: "input" }));
    expect(json).not.toContain('"type":"number"');
  });

  it("rejects a quantity sent as a JSON number", () => {
    const lot = CASES.find((c) => c.name === "lot");
    expect(zPoLot.safeParse({ ...lot?.wire, delyQty: 2.5 }).success).toBe(false);
  });
});

describe("invoice kind decides the DC link (INV-28, INV-30)", () => {
  it.each([
    ["a DC-sourced invoice without a DC", { ...INVOICE, kind: "dc", dcId: null }],
    ["a PO-direct invoice with a DC", { ...INVOICE, kind: "direct", dcId: DC_ID }],
  ])("rejects %s", (_name, wire) => {
    expect(zInvoice.safeParse(wire).success).toBe(false);
  });
});

// The shapes carry what the domain computes; these fail to compile if either side gains or loses a field.
describe("entities carry the domain's computed types", () => {
  it("PO totals, item quantities, tax amounts and flag details", () => {
    expectTypeOf<
      z.output<
        ReturnType<typeof zPo.pick<{ ordQty: true; dspQty: true; rcdQty: true; rejQty: true; balanceQty: true }>>
      >
    >().toEqualTypeOf<PoTotals>();
    expectTypeOf<
      z.output<ReturnType<typeof zPoItem.pick<{ dspQty: true; balanceQty: true; uninvoicedQty: true }>>>
    >().toEqualTypeOf<ItemQuantities>();
    expectTypeOf<
      z.output<ReturnType<typeof zInvoiceItem.pick<{ taxable: true; cgst: true; sgst: true; igst: true; total: true }>>>
    >().toEqualTypeOf<LineTax>();
    expectTypeOf<z.output<typeof zFlag.shape.details>>().toEqualTypeOf<FlagDetails>();
  });
});
