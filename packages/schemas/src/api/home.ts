// The dashboard and global search (SPEC-10). The dashboard shows the legacy cards, funnel and recent activity plus
// the open-flag count (INV-60); insights and forecast are dropped (INV-87). Search hits show the FY of DC and
// invoice numbers (INV-24).
import { z } from "zod";

import { zPoStatus } from "../enums.ts";
import { zFy, zId, zInstant, zIsoDate, zMoney, zQty } from "../primitives.ts";
import { zCount, zDocRef, zFyDocRef } from "./common.ts";

export const zDashboardQuery = z.object({ range: z.enum(["month", "30d", "all"]).default("month") });

export const zDashboardSummary = z.object({
  poValue: zMoney,
  invoicedValue: zMoney,
  /** Whole days; `null` with nothing delivered yet. */
  avgLeadTimeDays: z.int().nonnegative().nullable(),
  overdueCount: zCount,
  /** DCs that wait for an invoice. */
  uninvoicedDcCount: zCount,
  openFlagCount: zCount,
  pendingDispatchValue: zMoney,
  funnel: z.object({ ordQty: zQty, dspQty: zQty, invoicedQty: zQty, rcdQty: zQty }),
});

const zDocType = z.enum(["po", "dc", "invoice", "srv"]);

export const zActivity = z.object({
  type: zDocType.exclude(["srv"]),
  id: zId,
  number: z.string(),
  date: zIsoDate.nullable(),
  createdAt: zInstant,
});

export const zSearchQuery = z.object({
  q: z.string(),
  /** A repeated key; one value arrives as a string. */
  types: z
    .array(zDocType)
    .or(zDocType.transform((t) => [t]))
    .optional(),
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
  amountMin: zMoney.optional(),
  amountMax: zMoney.optional(),
});

export const zSearchHit = z.object({
  type: zDocType,
  id: zId,
  number: z.string(),
  /** Set for DC and invoice hits (INV-24). */
  financialYear: zFy.nullable(),
  date: zIsoDate.nullable(),
  party: z.string().nullable(),
  /** The text that matched, for the result row. */
  match: z.string(),
  /** PO hits only. */
  status: zPoStatus.nullable(),
  hasFlags: z.boolean(),
  qty: zQty.nullable(),
  value: zMoney.nullable(),
  links: z.object({
    po: zDocRef.nullable(),
    dcs: z.array(zFyDocRef),
    invoices: z.array(zFyDocRef),
    srvs: z.array(zDocRef),
  }),
});
