// Synthetic DC and invoice payloads on the wire (quantities and money as decimal strings), for the DC and invoice
// screen tests. Numbers and names are made up (C1).
import { ITEM_A, ITEM_B, PO_ID } from "./po-fixtures.ts";

export { detail as poDetail, ITEM_A, ITEM_B, PO_ID } from "./po-fixtures.ts";
export const DC_ID = "01J00000000000000000000030";
export const DC_ITEM_A = "01J00000000000000000000031";
export const DC_ITEM_B = "01J00000000000000000000032";
export const INVOICE_ID = "01J00000000000000000000040";
export const SRV_ID = "01J00000000000000000000050";
const CREATED = "2025-05-02T05:30:00.000Z";

export const PO_REF = { id: PO_ID, poNumber: "4100000101", isGemc: false };

const SUPPLIER = {
  supplierName: "Example Supplier",
  supplierAddress: "1 Example Road",
  supplierGstin: "TESTGSTIN0001",
  supplierContact: "Example Contact",
};

const DC_HEADER = {
  ourRef: "REF-1",
  departmentNo: "21",
  consigneeName: "Example Consignee",
  consigneeGstin: null,
  consigneeAddress: "2 Example Street",
  inspectionCompany: null,
  ewayBillNo: null,
  vehicleNo: "TEST-VEH-1",
  lrNo: null,
  transporter: null,
  modeOfTransport: null,
  remarks: "First note\n\nSecond note",
  ...SUPPLIER,
};

export const dc = (over: Record<string, unknown> = {}) => ({
  id: DC_ID,
  poId: PO_ID,
  number: "17",
  dcDate: "2025-05-02",
  financialYear: "2025-26",
  gcNumber: "17",
  gcDate: "2025-05-02",
  ...DC_HEADER,
  version: 3,
  createdAt: CREATED,
  ...over,
});

const itemInfo = (no: number, rate: string) => ({
  poItemNo: no,
  materialCode: `SYN1000${no}`,
  description: `Synthetic part ${no}`,
  drawingNo: null,
  unit: "NOS",
  rate,
});

export const dcLine = (over: Record<string, unknown> = {}) => ({
  id: DC_ITEM_A,
  dcId: DC_ID,
  poItemId: ITEM_A,
  dspQty: "4",
  createdAt: CREATED,
  ...itemInfo(10, "100"),
  ...over,
});

export const FY_REF = { id: INVOICE_ID, number: "INV-17", date: "2025-05-03", financialYear: "2025-26" };
export const SRV_REF = { id: SRV_ID, number: "5000101", date: "2025-05-10" };

export const dcDetail = (over: Record<string, unknown> = {}) => ({
  dc: dc(),
  po: PO_REF,
  items: [dcLine(), dcLine({ id: DC_ITEM_B, poItemId: ITEM_B, dspQty: "2", ...itemInfo(20, "40") })],
  invoice: null,
  srvs: [],
  flags: [],
  ...over,
});

export const dcRow = (over: Record<string, unknown> = {}) => ({
  id: DC_ID,
  number: "17",
  dcDate: "2025-05-02",
  financialYear: "2025-26",
  poId: PO_ID,
  poNumber: "4100000101",
  ordQty: "15",
  dspQty: "6.5",
  rcdQty: "3",
  value: "500",
  invoice: null,
  openFlagCount: 0,
  ...over,
});

const INVOICE_HEADER = {
  buyerName: "Example Buyer Unit",
  buyerGstin: "TESTGSTIN0002",
  buyerAddress: "3 Example Avenue",
  buyerState: "Example State",
  buyerStateCode: "99",
  placeOfSupply: "Example City",
  buyersOrderDate: "2025-04-05",
  gemcNumber: null,
  gemcDate: null,
  paymentTerms: "Net 30",
  despatchDocNo: null,
  srvNo: null,
  srvDate: null,
  vehicleNo: "TEST-VEH-1",
  lrNo: null,
  transporter: "Example Transport",
  destination: "Example City",
  termsOfDelivery: null,
  remarks: null,
  ...SUPPLIER,
};

/** A DC-sourced invoice of DC 17: 4 × 100 and 2 × 40 at 9 % + 9 %. */
export const invoice = (over: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  poId: PO_ID,
  number: "INV-17",
  invoiceDate: "2025-05-03",
  financialYear: "2025-26",
  ...INVOICE_HEADER,
  cgstPct: "9",
  sgstPct: "9",
  taxable: "480",
  cgst: "43.2",
  sgst: "43.2",
  igst: "0",
  total: "566.4",
  version: 2,
  createdAt: CREATED,
  kind: "dc",
  dcId: DC_ID,
  ...over,
});

export const invoiceLine = (over: Record<string, unknown> = {}) => ({
  id: "01J00000000000000000000041",
  invoiceId: INVOICE_ID,
  poItemId: ITEM_A,
  dcItemId: DC_ITEM_A,
  qty: "4",
  taxable: "400",
  cgst: "36",
  sgst: "36",
  igst: "0",
  total: "472",
  ...itemInfo(10, "100"),
  ...over,
});

export const DC_REF = { id: DC_ID, number: "17", date: "2025-05-02", financialYear: "2025-26" };

export const invoiceDetail = (over: Record<string, unknown> = {}) => ({
  invoice: invoice(),
  po: PO_REF,
  dc: DC_REF,
  items: [
    invoiceLine(),
    invoiceLine({
      id: "01J00000000000000000000042",
      poItemId: ITEM_B,
      dcItemId: DC_ITEM_B,
      qty: "2",
      taxable: "80",
      cgst: "7.2",
      sgst: "7.2",
      total: "94.4",
      ...itemInfo(20, "40"),
    }),
  ],
  srvs: [],
  flags: [],
  ...over,
});

export const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  number: "INV-17",
  invoiceDate: "2025-05-03",
  financialYear: "2025-26",
  poId: PO_ID,
  taxable: "480",
  total: "566.4",
  kind: "dc",
  poNumber: "4100000101",
  dc: DC_REF,
  itemCount: 2,
  qty: "6",
  ...over,
});
