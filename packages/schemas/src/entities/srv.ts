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
  materialCode: z.string().nullable(),
  poItemNo: z.int().nonnegative(),
  lotNo: z.int().nonnegative(),
  srvItemNo: z.int().nonnegative(),
  ordQty: zQty,
  rcdQty: zQty,
  acceptedQty: zQty,
  rejQty: zQty,
  challanNo: z.string().nullable(),
  challanDate: zIsoDate.nullable(),
  invoiceNo: z.string().nullable(),
  invoiceDate: zIsoDate.nullable(),
  resolvedDcId: zId.nullable(),
  resolvedInvoiceId: zId.nullable(),
});
