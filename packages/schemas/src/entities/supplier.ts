// The install's supplier, its settings and the BHEL units it sells to (ARCHITECTURE §8.2). The BHEL password lives in
// the `secret` table and has no entity here: no read shape can carry it (INV-81).
import { z } from "zod";

import { zId, zTextMap } from "../primitives.ts";

/** The one supplier of the install (A2-12), created by onboarding (INV-78). */
export const zSupplier = z.object({
  id: zId,
  name: z.string(),
  gstin: z.string().nullable(),
  address: z.string().nullable(),
  state: z.string().nullable(),
  stateCode: z.string().nullable(),
  contact: z.string().nullable(),
  email: z.string().nullable(),
  bhelSupplierCode: z.string().nullable(),
  bankDetails: zTextMap,
  /**
   * Keyed `description` and `jurisdiction` (the letterhead's description line and the invoice's jurisdiction city,
   * D-0298), and `placeOfSupply` and `hsn` (what new invoices start from, owner 2026-10-15).
   */
  invoiceDefaults: zTextMap,
});

/** The supplier details a DC or invoice carries, editable per document as in legacy. */
export const zSupplierSnapshot = z.object({
  supplierName: z.string().nullable(),
  supplierAddress: z.string().nullable(),
  supplierGstin: z.string().nullable(),
  supplierContact: z.string().nullable(),
});

/** One `settings` row: GST percentages and preferences, never auth state. */
export const zSetting = z.object({ key: z.string().min(1), value: z.string() });

/** A BHEL unit (A-5), public unit data. */
export const zBuyer = z.object({
  id: zId,
  unitName: z.string(),
  state: z.string().nullable(),
  stateCode: z.string().nullable(),
  gstin: z.string().nullable(),
});
