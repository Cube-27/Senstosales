// The parsed BHEL documents (SPEC-06 §4.2, ARCHITECTURE §7.1). A document holds what the page says and nothing
// derived from it (INV-49). Quantities, money and dates use the wire codecs, so the expected JSON of a fixture is the
// encoded form and decoding it gives exact units (C3).
import { zIsoDate, zMoney, zPoId, zQty } from "@senstosales/schemas";
import { z } from "zod";

/** Label (as printed) -> cell text. */
const zRawHeader = z.record(z.string(), z.string());
const zText = z.string().nullable();
/** An item, lot or SRV item number as printed; 0 is kept and flagged downstream, never refused (A2-10). */
const zItemNo = z.number().int().nonnegative();

const zPoLot = z.strictObject({
  lotNo: zItemNo,
  delyQty: zQty,
  delyDate: zIsoDate.nullable(),
  entryAllowDate: zIsoDate.nullable(),
  /** A non-date "Entry Allow Date" cell such as "PO Short Closed", shown in place of the date (INV-46). */
  entryAllowNote: zText,
  destCode: zText,
  /** Column header -> cell text of the item-table row the lot was read from. */
  rawRow: zRawHeader,
});

const zPoItem = z.strictObject({
  poItemNo: zItemNo,
  materialCode: z.string().min(1),
  description: z.string(),
  drawingNo: zText,
  unit: z.string(),
  /** MTRL CAT as printed. */
  mtrlCat: zText,
  ordQty: zQty,
  /** As on the page: GST-inclusive on a GEMC PO (INV-17). */
  rate: zMoney,
  rcdQty: zQty,
  /** ITEM VALUE as printed; null when the page has no such column or the cell is empty. */
  itemValue: zMoney.nullable(),
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

/** One SRV row, every column as printed: a column the page lacks, or an empty cell, is null. */
const zSrvItem = z.strictObject({
  /** The row's place in its SRV, from 1: the page's own keys may repeat (A2-10). */
  rowNo: z.number().int().positive(),
  division: zText,
  poItemNo: zItemNo,
  subItemNo: zText,
  pmirNo: zText,
  srvItemNo: zItemNo,
  revNo: zText,
  /** Current pages have no LOT NO column; lots are reference only. */
  lotNo: zItemNo.nullable(),
  /** Current pages have no MATERIAL CODE column. */
  materialCode: zText,
  challanNo: zText,
  challanDate: zIsoDate.nullable(),
  invoiceNo: zText,
  invoiceDate: zIsoDate.nullable(),
  financeDate: zIsoDate.nullable(),
  cnoteNo: zText,
  cnoteDate: zIsoDate.nullable(),
  unit: zText,
  ordQty: zQty.nullable(),
  challanQty: zQty.nullable(),
  rcdQty: zQty.nullable(),
  /** The source ACCEPTED QTY (A2-8). */
  acceptedQty: zQty.nullable(),
  rejQty: zQty.nullable(),
  /** Column header -> cell text of this row. */
  rawRow: zRawHeader,
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
export const zSrvList = z
  .array(zSrvDocument)
  .min(1)
  .refine((srvs) => srvs.every((srv) => srv.poNumber === srvs[0]?.poNumber), "every SRV in a file is of one PO");

/** An SRV of the file that could not be read; the file's other SRVs still are (A2-10). */
export type SrvFailure = { srvNumber: string; error: ParseError };

/** What `parseSrv` reads from one file: its SRVs, at least one, and those it could not read. */
export type SrvFile = { srvs: [SrvDocument, ...SrvDocument[]]; failed: SrvFailure[] };

/** SPEC-06 §4.4: every parse failure, with a stable code and a plain message. */
export type ParseError = {
  code:
    | "no-item-table"
    | "no-srv-table"
    | "bad-date"
    | "bad-quantity"
    | "missing-field"
    | "bad-po-number"
    | "bad-number"
    | "mixed-po-numbers";
  message: string;
  location?: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };
