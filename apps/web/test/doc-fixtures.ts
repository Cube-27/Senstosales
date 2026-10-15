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
