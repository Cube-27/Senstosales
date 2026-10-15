// The dashboard and global search (SPEC-10). The dashboard shows the legacy cards, funnel and recent activity plus
// the open-flag count (INV-60); insights and forecast are dropped (INV-87). Search hits show the FY of DC and
// invoice numbers (INV-24).
import { z } from "zod";

import { zPoStatus } from "../enums.ts";
import { zCount, zFy, zId, zInstant, zIsoDate, zMoney, zQty } from "../primitives.ts";
import { zDocRef, zLinkedDocs, zRangeFilters, zRepeated } from "./common.ts";

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
  /** `pendingQty`: ordered minus dispatched, never below 0 (A-22). */
  funnel: z.object({ ordQty: zQty, dspQty: zQty, invoicedQty: zQty, rcdQty: zQty, pendingQty: zQty }),
});

const zDocType = z.enum(["po", "dc", "invoice", "srv"]);

export const zActivity = z.object({
  type: zDocType.exclude(["srv"]),
  id: zId,
  number: z.string(),
  date: zIsoDate.nullable(),
  createdAt: zInstant,
});

export const zSearchQuery = z.object({ ...zRangeFilters, q: z.string(), types: zRepeated(zDocType).optional() });

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
  links: zLinkedDocs.extend({ po: zDocRef.nullable() }),
});
