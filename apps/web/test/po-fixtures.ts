// Synthetic PO detail payloads on the wire (quantities and money as decimal strings), for the PO screen tests.
export const PO_ID = "01J00000000000000000000010";
export const ITEM_A = "01J00000000000000000000011";
export const ITEM_B = "01J00000000000000000000012";
const FLAG_ID = "01J00000000000000000000013";

export const lot = (over: Record<string, unknown> = {}) => ({
  id: "01J00000000000000000000020",
  poItemId: ITEM_A,
  lotNo: 1,
  delyQty: "10",
  delyDate: "2025-02-01",
  entryAllowDate: "2025-01-20",
  entryAllowNote: null,
  destCode: "D1",
  ...over,
});

export const item = (over: Record<string, unknown> = {}) => ({
  id: ITEM_A,
  poId: PO_ID,
  poItemNo: 10,
  materialCode: "SYN100010",
  description: "Synthetic valve body",
  drawingNo: null,
  unit: "NOS",
  ordQty: "10",
  rateSource: "100",
  rate: "100",
  poRcdQty: "0",
  poRejQty: null,
  cancelledAt: null,
  manualDispatchedQty: "0",
  manualNote: null,
  manualSetAt: null,
  dspQty: "4",
  rcdQty: "2",
  rejQty: "0",
  balanceQty: "6",
  uninvoicedQty: "10",
  status: "Pending",
  lots: [lot()],
  ...over,
});

export const po = (over: Record<string, unknown> = {}) => ({
  id: PO_ID,
  poNumber: "4100000101",
  poDate: "2025-01-05",
  buyerId: null,
  enquiry: "ENQ-1",
  quotation: null,
  orderType: "NB",
  bhelStatusCode: null,
  amendNo: 0,
  poValue: "2000",
  netPoValue: "2360",
  isGemc: false,
  gemcNumber: null,
  remarks: "Synthetic remarks.",
  rawHeader: { "SUPP CODE": "900101", "SUPP NAME M/S": "Example Engineering Works" },
  status: "Pending",
  ordQty: "15",
  dspQty: "4",
  rcdQty: "2",
  rejQty: "0",
  balanceQty: "6",
  version: 1,
  ...over,
});

export const flag = (over: Record<string, unknown> = {}) => ({
  id: FLAG_ID,
  type: "OVER_DISPATCH",
  scopeType: "po_item",
  scopeId: ITEM_A,
  poId: PO_ID,
  details: { field: "dsp_qty", expected: "10", actual: "12", docIds: [] },
  status: "open",
  note: null,
  openedAt: "2025-02-01T20:00:00.000Z",
  acknowledgedAt: null,
  ...over,
});

export const detail = (over: Record<string, unknown> = {}) => ({
  po: po(),
  items: [
    item(),
    item({
      id: ITEM_B,
      poItemNo: 20,
      materialCode: "SYN100020",
      cancelledAt: "2025-01-10T00:00:00.000Z",
      status: "Cancelled",
      ordQty: "5",
      dspQty: "0",
      rcdQty: "0",
      balanceQty: "0",
      lots: [lot({ poItemId: ITEM_B, entryAllowDate: null, entryAllowNote: "PO Short Closed" })],
    }),
  ],
  linked: { dcs: [], invoices: [], srvs: [] },
  flags: [],
  ...over,
});
