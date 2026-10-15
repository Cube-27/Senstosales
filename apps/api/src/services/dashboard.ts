// Dashboard summary and recent activity (SPEC-10 §2): the legacy cards, funnel and activity plus the open-flag count
// (INV-60); no insights or forecast (INV-87). Values, the period and lead time come from the domain (C2).
import type { Db } from "@senstosales/db";
import {
  averageLeadTimeDays,
  pendingDispatchQty,
  qtyValue,
  rangeStart,
  srvLineShown,
  sumMoney,
  sumQty,
} from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import type { Clock } from "../ports/clock.ts";
import * as repo from "../repositories/dashboard.ts";
import type { DeliveryTrackerService } from "./delivery-tracker.ts";
import { byText, desc, on } from "./paging.ts";

type Query = z.output<(typeof routes)["dashboard.summary"]["query"]>;

/** The legacy dashboard lists this many recent documents. */
const ACTIVITY_LIMIT = 5;

export function dashboardService({ db, clock, tracker }: { db: Db; clock: Clock; tracker: DeliveryTrackerService }) {
  return {
    /** Values and the funnel cover the chosen period; the overdue, uninvoiced-DC and flag counts are as of today. */
    async summary({ range }: Query) {
      const start = rangeStart(range, clock.today());
      const [pos, invoiced, invoicedQty, srvLines, balances, leadTimes, overdueCount, uninvoicedDcs, openFlags] =
        await Promise.all([
          repo.poTotals(db, start),
          repo.invoicedValue(db, start),
          repo.invoicedQty(db, start),
          repo.srvLinesFrom(db, start),
          repo.itemBalances(db, start),
          repo.firstSrvDates(db, start),
          tracker.overdueCount(),
          repo.uninvoicedDcCount(db),
          repo.openFlagCount(db),
        ]);
      return {
        poValue: pos.poValue,
        invoicedValue: invoiced.total,
        avgLeadTimeDays: averageLeadTimeDays(
          leadTimes.flatMap(({ poDate, firstSrvDate }) =>
            poDate === null || firstSrvDate === null ? [] : [{ poDate, firstSrvDate }],
          ),
        ),
        overdueCount,
        uninvoicedDcCount: uninvoicedDcs.count,
        openFlagCount: openFlags.count,
        pendingDispatchValue: sumMoney(balances.map((i) => qtyValue(i.balanceQty, i.rate))),
        funnel: {
          ordQty: pos.ordQty,
          dspQty: pos.dspQty,
          invoicedQty: invoicedQty.qty,
          rcdQty: sumQty(srvLines.map((line) => srvLineShown(line).rcdQty)),
          pendingQty: pendingDispatchQty(balances),
        },
      };
    },

    /** The POs, DCs and invoices that entered the system last, newest first. */
    async activity() {
      const { pos, dcs, invoices } = await repo.latestDocuments(db, ACTIVITY_LIMIT);
      return [
        ...pos.map((r) => ({ type: "po" as const, ...r })),
        ...dcs.map((r) => ({ type: "dc" as const, ...r })),
        ...invoices.map((r) => ({ type: "invoice" as const, ...r })),
      ]
        .sort(on((r) => r.createdAt, desc(byText)))
        .slice(0, ACTIVITY_LIMIT);
    },
  };
}

export type DashboardService = ReturnType<typeof dashboardService>;
