// The parsed BHEL documents (SPEC-06 §4.2, ARCHITECTURE §7.1). A document holds what the page says and nothing
// derived from it (INV-49). Quantities, money and dates use the wire codecs, so the expected JSON of a fixture is the
// encoded form and decoding it gives exact units (C3).
import { zIsoDate, zMoney, zPoId, zQty } from "@senstosales/schemas";
import { z } from "zod";

/** Label (as printed) -> cell text. */
const zRawHeader = z.record(z.string(), z.string());
const zText = z.string().nullable();
const zItemNo = z.number().int().positive();

const zPoLot = z.strictObject({
  lotNo: zItemNo,
  delyQty: zQty,
  delyDate: zIsoDate.nullable(),
  entryAllowDate: zIsoDate.nullable(),
  /** A non-date "Entry Allow Date" cell such as "PO Short Closed", shown in place of the date (INV-46). */
  entryAllowNote: zText,
  destCode: zText,
});

const zPoItem = z.strictObject({
  poItemNo: zItemNo,
  materialCode: z.string().min(1),
  description: z.string(),
  drawingNo: zText,
  unit: z.string(),
  ordQty: zQty,
  /** As on the page: GST-inclusive on a GEMC PO (INV-17). */
  rate: zMoney,
  rcdQty: zQty,
  /** Null when the page has no REJ QTY column. */
  rejQty: zQty.nullable(),
  lots: z.array(zPoLot),
});

export const zPoDocument = z.strictObject({
  poNumber: zPoId,
  poDate: zIsoDate,
  enquiry: zText,
  supplierCode: zText,
  orderType: zText,
  division: zText,
  quotation: zText,
  poStatusCode: zText,
  amendNo: z.number().int().nonnegative(),
  poValue: zMoney.nullable(),
  rcNo: zText,
  inspection: zText,
  currency: zText,
  netPoValue: zMoney.nullable(),
  remarks: zText,
  /** From the remarks (INV-19). */
  gemcNumber: zText,
  items: z.array(zPoItem).min(1),
  rawHeader: zRawHeader,
});
export type PoDocument = z.output<typeof zPoDocument>;

const zSrvItem = z.strictObject({
  poItemNo: zItemNo,
  lotNo: zItemNo,
  srvItemNo: zItemNo,
  materialCode: zText,
  ordQty: zQty.nullable(),
  rcdQty: zQty,
  /** Null when the layout has no accepted-quantity column. */
  acceptedQty: zQty.nullable(),
  rejQty: zQty,
  challanNo: zText,
  challanDate: zIsoDate.nullable(),
  invoiceNo: zText,
  invoiceDate: zIsoDate.nullable(),
});

/** One SRV of a PO. */
export const zSrvDocument = z.strictObject({
  poNumber: zPoId,
  srvNumber: z.string().min(1),
  srvDate: zIsoDate,
  /** Column header -> cell text of the SRV's first row. */
  rawHeader: zRawHeader,
  items: z.array(zSrvItem).min(1),
});
export type SrvDocument = z.output<typeof zSrvDocument>;

/** One SRV file: every SRV of one PO (SPEC-06 §4.1). */
export const zSrvFile = z.array(zSrvDocument).min(1);

/** SPEC-06 §4.4: every parse failure, with a stable code and a plain message. */
export type ParseError = {
  code: "no-item-table" | "no-srv-table" | "bad-date" | "bad-quantity" | "duplicate-srv-item-key";
  message: string;
  location?: string;
};
