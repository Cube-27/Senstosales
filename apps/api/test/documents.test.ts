// SPEC-12 PR 6: the DC, GC and invoice Excel downloads over HTTP on the full app. Each answers the legacy file name and
// the xlsx type, keeps a copy under `exports/`, and holds the workbook the builder makes from the stored document
// (written out below by hand). Synthetic values only (C1).
import type { DcDocument, InvoiceDocument } from "@senstosales/documents";
import { buildDcWorkbook, buildGcWorkbook, buildInvoiceWorkbook } from "@senstosales/documents";
import type { GstPct } from "@senstosales/domain";
import { downloadFileName } from "@senstosales/schemas";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { apiApp, closeApiApps } from "./api-app.ts";
import { withDc } from "./invoice-fixtures.ts";
import { d, id, m, q } from "./seed-rows.ts";

afterEach(closeApiApps);

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The onboarded supplier as the documents print it; DC 7 and its invoice carry the same snapshot. */
const SUPPLIER = {
  name: "Example Supplier",
  address: "1 Example Road",
  gstin: "TESTGSTIN0001",
  contact: "Example Contact",
  state: "Example State",
  stateCode: "99",
  description: null,
  jurisdiction: null,
};

const PO = { poNumber: "4500001", poDate: d("2025-03-10"), isGemc: false };

/** DC 7 (2025-04-02) of 4 on item 10 at 100 and 2 on item 20 at 33.333; its GC takes the DC's number and date. */
const DC_7: DcDocument = {
  supplier: SUPPLIER,
  dc: {
    number: "7",
    dcDate: d("2025-04-02"),
    gcNumber: "7",
    gcDate: d("2025-04-02"),
    ourRef: null,
    departmentNo: null,
    consigneeName: null,
    consigneeAddress: null,
    remarks: null,
    invoiceNumber: null,
    invoiceDate: null,
  },
  po: PO,
  invoice: { number: "INV/31", invoiceDate: d("2025-04-03") },
  items: [
    { poItemNo: 10, description: "Example part", unit: "NOS", dspQty: q(4_000), rate: m(10_000_000) },
    { poItemNo: 20, description: "Example part", unit: "NOS", dspQty: q(2_000), rate: m(3_333_300) },
  ],
};

const BLANK = {
  buyersOrderDate: null,
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: null,
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  destination: null,
};

/** Invoice INV/31 (2025-04-03) of DC 7 at 6 % + 6 %: 400 + 48 tax and 66.67 + 8 tax. */
const INVOICE_31: InvoiceDocument = {
  supplier: SUPPLIER,
  invoice: {
    number: "INV/31",
    invoiceDate: d("2025-04-03"),
    buyerName: "Example Unit",
    buyerAddress: "2 Example Road",
    buyerGstin: "TESTGSTIN0002",
    buyerState: "Example State",
    placeOfSupply: "Example City",
    ...BLANK,
    cgstPct: 600_000 as GstPct,
    sgstPct: 600_000 as GstPct,
  },
  po: PO,
  dc: { number: "7", dcDate: d("2025-04-02") },
  items: [
    {
      poItemNo: 10,
      description: "Example part",
      unit: "NOS",
      qty: q(4_000),
      rate: m(10_000_000),
      taxable: m(40_000_000),
      cgst: m(2_400_000),
      sgst: m(2_400_000),
      igst: m(0),
      total: m(44_800_000),
      hsn: null,
      packets: null,
    },
    {
      poItemNo: 20,
      description: "Example part",
      unit: "NOS",
      qty: q(2_000),
      rate: m(3_333_300),
      taxable: m(6_667_000),
      cgst: m(400_000),
      sgst: m(400_000),
      igst: m(0),
      total: m(7_467_000),
      hsn: null,
      packets: null,
    },
  ],
};

/** Every non-empty cell of the first sheet by address. */
async function cells(bytes: Uint8Array): Promise<Record<string, unknown>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.slice().buffer);
  const out: Record<string, unknown> = {};
  wb.worksheets[0]!.eachRow((row) => row.eachCell((cell) => void (out[cell.address] = cell.value)));
  return out;
}

async function setup() {
  const r = await withDc();
  const invoice = await r.createInvoice({ dcId: r.dcId, number: "INV/31", invoiceDate: "2025-04-03", lines: r.lines });
  expect(invoice.status).toBe(200);
  return { ...r, invoiceId: invoice.body.id };
}

async function download(app: Awaited<ReturnType<typeof withDc>>["app"], path: string) {
  const res = await app.send(path);
  expect(res.status).toBe(200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { fileName: downloadFileName(res), type: res.headers.get("content-type"), bytes };
}

describe("Excel downloads", () => {
  type Ready = Awaited<ReturnType<typeof setup>>;
  it.each([
    ["DC", (r: Ready) => `/api/dc/${r.dcId}/excel`, "DC_7.xlsx", () => buildDcWorkbook(DC_7)],
    ["GC", (r: Ready) => `/api/dc/${r.dcId}/gc-excel`, "GC_7.xlsx", () => buildGcWorkbook(DC_7)],
    [
      "invoice",
      (r: Ready) => `/api/invoice/${r.invoiceId}/excel`,
      "Invoice_INV_31.xlsx",
      () => buildInvoiceWorkbook(INVOICE_31),
    ],
  ])("the %s download: legacy name, xlsx type, a copy under exports/", async (_, path, name, expected) => {
    const r = await setup();
    const file = await download(r.app, path(r));
    expect([file.fileName, file.type]).toEqual([name, XLSX]);
    expect(await cells(file.bytes)).toEqual(await cells(await expected()));
    const keys = [...r.app.storage.files.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^exports\/[0-9A-HJKMNP-TV-Z]{26}\.xlsx$/);
    expect(r.app.storage.files.get(keys[0]!)).toEqual(file.bytes);
  });

  it("INV-36: the DC footer carries its GC line", async () => {
    const r = await setup();
    const file = await download(r.app, `/api/dc/${r.dcId}/excel`);
    expect((await cells(file.bytes))["C32"]).toBe("Guarantee Certificate No. 7   Dt. 02/04/2025");
  });

  it("a PO-direct invoice prints with no DC", async () => {
    const r = await withDc();
    const direct = await r.createDirect({
      poId: r.poId,
      number: "32",
      invoiceDate: "2025-05-01",
      lines: [{ poItemId: r.item10, qty: "1" }],
    });
    const file = await download(r.app, `/api/invoice/${direct.body.id}/excel`);
    const line = { ...INVOICE_31.items[0]!, qty: q(1_000), taxable: m(10_000_000), total: m(11_200_000) };
    const expected: InvoiceDocument = {
      ...INVOICE_31,
      invoice: { ...INVOICE_31.invoice, number: "32", invoiceDate: d("2025-05-01") },
      dc: null,
      items: [{ ...line, cgst: m(600_000), sgst: m(600_000) }],
    };
    expect(file.fileName).toBe("Invoice_32.xlsx");
    expect(await cells(file.bytes)).toEqual(await cells(await buildInvoiceWorkbook(expected)));
  });
});

describe("refusals", () => {
  it.each([
    ["/api/dc/:id/excel", "dc-not-found"],
    ["/api/dc/:id/gc-excel", "dc-not-found"],
    ["/api/invoice/:id/excel", "invoice-not-found"],
  ])("%s: an unknown id is 404 %s and stores nothing", async (route, code) => {
    const r = await withDc();
    const res = await r.app.send(route.replace(":id", id("ZZ")));
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([404, code]);
    expect(r.app.storage.files.size).toBe(0);
  });

  it("before onboarding there is no supplier profile: 409 onboarding-required", async () => {
    const app = await apiApp();
    const res = await app.send(`/api/dc/${id("ZZ")}/excel`);
    expect([res.status, ((await res.json()) as { code: string }).code]).toEqual([409, "onboarding-required"]);
  });

  it("the service alone refuses without a supplier profile", async () => {
    const app = await apiApp();
    await expect(app.services.documents.invoiceExcel(id("ZZ"))).rejects.toMatchObject({
      status: 409,
      code: "onboarding-required",
    });
  });
});
