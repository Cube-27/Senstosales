// The dashboard's period and lead time (SPEC-10 §2), as the legacy dashboard shows them (A-22).
import type { IsoDate } from "./dates.ts";
import { addDays, daysBetween } from "./dates.ts";
import { fyStartOf } from "./fy.ts";
import { sumActive } from "./quantities.ts";
import type { Qty } from "./units.ts";

export type DashboardRange = "fy" | "month" | "30d" | "all";

/**
 * The first document date the range covers, or `null` for all time: `fy` is the start of today's FY (the default,
 * owner 2026-10-15), `month` the 1st of today's month, `30d` 30 days back.
 */
export function rangeStart(range: DashboardRange, today: IsoDate): IsoDate | null {
  if (range === "fy") return fyStartOf(today);
  if (range === "month") return `${today.slice(0, 8)}01` as IsoDate;
  if (range === "30d") return addDays(today, -30);
  return null;
}

/**
 * INV-113: a report's period when none is chosen: the start of today's FY to today (owner, 2026-10-15; legacy used
 * yesterday to today on Operations Insights and the 30 days to today on reconciliation).
 */
export const defaultReportRange = (today: IsoDate): { from: IsoDate; to: IsoDate } => ({
  from: fyStartOf(today),
  to: today,
});

/**
 * The mean days from PO date to the PO's first SRV, over POs whose first SRV is not earlier than the PO date, in
 * whole days rounded half up (D-0102); `null` when no PO qualifies.
 */
export function averageLeadTimeDays(pos: readonly { poDate: IsoDate; firstSrvDate: IsoDate }[]): number | null {
  const days = pos.map((p) => daysBetween(p.poDate, p.firstSrvDate)).filter((d) => d >= 0);
  if (days.length === 0) return null;
  const total = days.reduce((sum, d) => sum + d, 0);
  return Math.floor((2 * total + days.length) / (2 * days.length));
}

/**
 * The funnel's Pending Dispatch (A-22): ordered minus dispatched, never below 0 on each item, as the pending value is
 * clamped (owner, 2026-10-15); cancelled items have nothing pending (INV-07).
 */
export function pendingDispatchQty(items: readonly { ordQty: Qty; dspQty: Qty; cancelled: boolean }[]): Qty {
  // A difference of two milli-unit integers is a milli-unit integer; the brand cannot follow arithmetic.
  return sumActive(items, (i) => Math.max(0, i.ordQty - i.dspQty) as Qty);
}
