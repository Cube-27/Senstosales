// The dashboard's period and lead time (SPEC-10 §2), as the legacy dashboard shows them (A-22).
import type { IsoDate } from "./dates.ts";
import { addDays, daysBetween } from "./dates.ts";

export type DashboardRange = "month" | "30d" | "all";

/** The first date the range covers, or `null` for all time: `month` is the 1st of today's month, `30d` 30 days back. */
export function rangeStart(range: DashboardRange, today: IsoDate): IsoDate | null {
  if (range === "month") return `${today.slice(0, 8)}01` as IsoDate;
  if (range === "30d") return addDays(today, -30);
  return null;
}

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
