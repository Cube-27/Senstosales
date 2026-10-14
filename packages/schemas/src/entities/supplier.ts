// The install's supplier, its settings and the BHEL units it sells to (ARCHITECTURE §8.2). The BHEL password lives in
// the `secret` table and has no entity here: no read shape can carry it (INV-81).
import { z } from "zod";

import { zId } from "../primitives.ts";

/** Free-form label -> text pairs entered at onboarding. */
const zTextMap = z.record(z.string(), z.string());

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
  invoiceDefaults: zTextMap,
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
