// A PO, its items and their delivery lots (ARCHITECTURE §8.2). Quantity and status fields named after §6.2 and §6.11
// are derived columns: the domain computes them and services store them; these shapes only carry them (C2).
import { z } from "zod";

import { zItemStatus, zPoStatus } from "../enums.ts";
import { zId, zInstant, zIsoDate, zMoney, zQty } from "../primitives.ts";

export const zPo = z.object({
  id: zId,
  poNumber: z.string().min(1),
  poDate: zIsoDate.nullable(),
  buyerId: zId.nullable(),
  enquiry: z.string().nullable(),
  quotation: z.string().nullable(),
  orderType: z.string().nullable(),
  bhelStatusCode: z.string().nullable(),
  amendNo: z.int().nonnegative(),
  poValue: zMoney.nullable(),
  netPoValue: zMoney.nullable(),
  isGemc: z.boolean(),
  gemcNumber: z.string().nullable(),
  remarks: z.string().nullable(),
  /** Label -> text as on the PO page (SPEC-06 §4.2). */
  rawHeader: z.record(z.string(), z.string()),
  status: zPoStatus,
  /** INV-07: sums over active items. */
  ordQty: zQty,
  dspQty: zQty,
  rcdQty: zQty,
  rejQty: zQty,
  balanceQty: zQty,
  version: z.int().positive(),
});

export const zPoItem = z.object({
  id: zId,
  poId: zId,
  poItemNo: z.int().nonnegative(),
  materialCode: z.string().nullable(),
  description: z.string().nullable(),
  drawingNo: z.string().nullable(),
  unit: z.string().nullable(),
  ordQty: zQty,
  /** GST-inclusive on a GEMC PO; `rate` is the net derived from it (INV-17). */
  rateSource: zMoney,
  rate: zMoney,
  /** The PO document's received and rejected, kept apart from the derived ones (INV-13). */
  poRcdQty: zQty,
  poRejQty: zQty.nullable(),
  /** Set when an amendment removed the item (A-13). */
  cancelledAt: zInstant.nullable(),
  /** A-15: `>= 0`, default 0. */
  manualDispatchedQty: zQty,
  manualNote: z.string().nullable(),
  manualSetAt: zInstant.nullable(),
  dspQty: zQty,
  rcdQty: zQty,
  rejQty: zQty,
  balanceQty: zQty,
  uninvoicedQty: zQty,
  status: zItemStatus,
});

/** A delivery schedule row; planning only (spec §3). */
export const zPoLot = z.object({
  id: zId,
  poItemId: zId,
  lotNo: z.int().nonnegative(),
  delyQty: zQty,
  delyDate: zIsoDate.nullable(),
  entryAllowDate: zIsoDate.nullable(),
  /** Entry-allow text that is not a date (INV-46). */
  entryAllowNote: z.string().nullable(),
  destCode: z.string().nullable(),
});
