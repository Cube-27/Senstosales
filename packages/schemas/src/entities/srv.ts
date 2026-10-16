// Stores receipt vouchers and their lines (ARCHITECTURE §8.2). Challan and invoice numbers stay raw text; the resolved
// links are separate and nullable (INV-38).
import { z } from "zod";

import { zFy, zId, zIsoDate, zQty, zTextMap } from "../primitives.ts";

export const zSrv = z.object({
  id: zId,
  poNumber: z.string().min(1),
  /** `null`: the PO is not in the system ("PO not found", INV-40). */
  poId: zId.nullable(),
  srvNumber: z.string().min(1),
  srvDate: zIsoDate,
  financialYear: zFy,
  /** Label -> text as on the SRV page (SPEC-06 §4.2). */
  rawHeader: zTextMap,
});

export const zSrvItem = z.object({
  id: zId,
  srvId: zId,
  /** `null` until matched to a PO item (INV-39). */
  poItemId: zId.nullable(),
  /** The row's place in its SRV, from 1 (A2-10). */
  rowNo: z.int().positive(),
  materialCode: z.string().nullable(),
  poItemNo: z.int().nonnegative(),
  subItemNo: z.string().nullable(),
  lotNo: z.int().nonnegative().nullable(),
  srvItemNo: z.int().nonnegative(),
  revNo: z.string().nullable(),
  division: z.string().nullable(),
  pmirNo: z.string().nullable(),
  unit: z.string().nullable(),
  ordQty: zQty,
  challanQty: zQty.nullable(),
  /** Received as the screens and totals count it: RECVD QTY, else ACCEPTED QTY when RECVD is empty or 0 (INV-11). */
  rcdQty: zQty,
  /** RECVD QTY as printed; `null` when the cell was empty. */
  rawRcdQty: zQty.nullable(),
  acceptedQty: zQty,
  rejQty: zQty,
  challanNo: z.string().nullable(),
  challanDate: zIsoDate.nullable(),
  invoiceNo: z.string().nullable(),
  invoiceDate: zIsoDate.nullable(),
  financeDate: zIsoDate.nullable(),
  cnoteNo: z.string().nullable(),
  cnoteDate: zIsoDate.nullable(),
  /** Column header -> cell text of the row as printed; `null` on rows stored before schema version 4. */
  rawRow: zTextMap.nullable(),
  resolvedDcId: zId.nullable(),
  resolvedInvoiceId: zId.nullable(),
});
