// GST invoices and their lines (ARCHITECTURE §8.2). Header fields are the ones the legacy invoice form and edit dialog
// show (SPEC-11 §9). Tax amounts are computed by the domain at creation (INV-41) and only carried here.
import { z } from "zod";

import { zInvoiceKind } from "../enums.ts";
import { zFy, zGstPct, zId, zInstant, zIsoDate, zMoney, zPackets, zQty } from "../primitives.ts";
import { zSupplierSnapshot } from "./supplier.ts";

const text = z.string().nullable();

/** Editable invoice header fields: the buyer snapshot and the legacy document fields. */
export const zInvoiceHeader = z.object({
  buyerName: text,
  buyerGstin: text,
  buyerAddress: text,
  buyerState: text,
  buyerStateCode: text,
  placeOfSupply: text,
  buyersOrderDate: zIsoDate.nullable(),
  gemcNumber: text,
  gemcDate: zIsoDate.nullable(),
  paymentTerms: text,
  despatchDocNo: text,
  srvNo: text,
  srvDate: zIsoDate.nullable(),
  vehicleNo: text,
  lrNo: text,
  transporter: text,
  destination: text,
  termsOfDelivery: text,
  remarks: text,
  ...zSupplierSnapshot.shape,
});

/** Tax amounts of a line, or their sums on the invoice header (INV-41). */
const zTaxAmounts = z.object({ taxable: zMoney, cgst: zMoney, sgst: zMoney, igst: zMoney, total: zMoney });

export const zInvoiceBase = z.object({
  id: zId,
  /** One PO per invoice (INV-30). */
  poId: zId,
  /** Unique per FY (INV-22). */
  number: z.string().min(1),
  invoiceDate: zIsoDate,
  financialYear: zFy,
  ...zInvoiceHeader.shape,
  /** Copied from settings at creation (A2-4). */
  cgstPct: zGstPct,
  sgstPct: zGstPct,
  ...zTaxAmounts.shape,
  version: z.int().positive(),
  createdAt: zInstant,
});

/** A DC-sourced invoice has exactly one DC (INV-28); a PO-direct invoice has none. */
export const zInvoice = z.discriminatedUnion("kind", [
  zInvoiceBase.extend({ kind: z.literal(zInvoiceKind.enum.dc), dcId: zId }),
  zInvoiceBase.extend({ kind: z.literal(zInvoiceKind.enum.direct), dcId: z.null() }),
]);

/** An invoice line; qty and rate never change after save (INV-33). */
export const zInvoiceItem = z.object({
  id: zId,
  invoiceId: zId,
  poItemId: zId,
  /** Set on DC-sourced invoices only. */
  dcItemId: zId.nullable(),
  qty: zQty,
  rate: zMoney,
  ...zTaxAmounts.shape,
  /** The line's HSN/SAC code: the settings' default unless the user changed it. */
  hsn: text,
  packets: zPackets,
});
