// Delivery tracker list and stats (SPEC-10 §2; export in SPEC-13). A row is one scheduled lot with its item's
// stored quantities (INV-06); the due buckets, days to due and values come from the domain (C2, D-0101).
import type { Db } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { addDays, compareIsoDate, deliveryDue, pendingValueOfItems, qtyValue } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import type { Clock } from "../ports/clock.ts";
import type { TrackerFilters } from "../repositories/delivery-tracker.ts";
import { trackerLots } from "../repositories/delivery-tracker.ts";
import type { Comparator } from "./paging.ts";
import { byNum, byNumber, byText, desc, on, page } from "./paging.ts";

type Query = z.output<(typeof routes)["deliveryTracker.list"]["query"]>;
type Lot = Awaited<ReturnType<typeof trackerLots>>[number];

/** A lot as the tracker shows it, with its due buckets for the status filter and stats. */
type Row = ReturnType<typeof toRow>;

const BUCKET = { overdue: "overdue", "due-soon": "dueSoon", "due-this-month": "dueThisMonth" } as const;

const orNull =
  <T>(compare: Comparator<T>): Comparator<T | null> =>
  (a, b) =>
    a === null || b === null ? Number(b === null) - Number(a === null) : compare(a, b);

const SORTS: Record<NonNullable<Query["sort"]>, Comparator<Row>> = {
  delyDate: on((r) => r.delyDate, compareIsoDate),
  entryAllowDate: on((r) => r.entryAllowDate, orNull(compareIsoDate)),
  poNumber: on((r) => r.poNumber, byNumber),
  materialCode: on((r) => r.materialCode, orNull(byText)),
  ordQty: on((r) => r.ordQty, byNum),
  dspQty: on((r) => r.dspQty, byNum),
  rcdQty: on((r) => r.rcdQty, byNum),
  pendingValue: on((r) => r.pendingValue, byNum),
};

/** Latest delivery date first, as the legacy tracker opens; then PO, item and lot, so pages are stable. */
const DEFAULT = [
  desc(SORTS.delyDate),
  SORTS.poNumber,
  on<Row, number>((r) => r.poItemNo, byNum),
  on<Row, number>((r) => r.lotNo, byNum),
  on<Row, string>((r) => r.lotId, byText),
];

function toRow({ delyQty, status, delyDate, ...lot }: Lot & { delyDate: IsoDate }, today: IsoDate) {
  const { daysToDue, ...due } = deliveryDue(delyDate, today, status);
  return {
    ...lot,
    delyDate,
    daysToDue,
    pendingValue: qtyValue(lot.balanceQty, lot.rate),
    /** The legacy value filter compares the lot's scheduled value. */
    lotValue: qtyValue(delyQty, lot.rate),
    due,
  };
}

export function deliveryTrackerService({ db, clock }: { db: Db; clock: Clock }) {
  /** The open lots the filters other than status keep. */
  async function rows(filters: Partial<TrackerFilters>): Promise<Row[]> {
    const today = clock.today();
    const { valueMin, valueMax } = filters;
    return (await trackerLots(db, filters))
      .flatMap((lot) => (lot.delyDate === null ? [] : [toRow({ ...lot, delyDate: lot.delyDate }, today)]))
      .filter(
        (r) =>
          r.due.open &&
          (valueMin === undefined || r.lotValue >= valueMin) &&
          (valueMax === undefined || r.lotValue <= valueMax),
      );
  }

  const withStatus = (all: Row[], status: TrackerFilters["status"]) =>
    status === undefined ? all : all.filter((r) => r.due[BUCKET[status]]);

  return {
    async list(query: Query) {
      const { items, total } = page(withStatus(await rows(query), query.status), query, SORTS, DEFAULT);
      return { items: items.map(({ due: _, lotValue: __, ...row }) => row), total };
    },

    /** The stat cards count every bucket whatever the status toggle; the pending value follows it, as legacy. */
    async stats(filters: TrackerFilters) {
      const all = await rows(filters);
      const count = (bucket: keyof Row["due"]) => all.filter((r) => r.due[bucket]).length;
      return {
        overdueCount: count("overdue"),
        dueSoonCount: count("dueSoon"),
        dueThisMonthCount: count("dueThisMonth"),
        pendingValue: pendingValueOfItems(withStatus(all, filters.status)),
      };
    },

    /** The dashboard's overdue card: overdue lots without filters. */
    /** Only lots due before today can be overdue, so the query reads no others. */
    overdueCount: async () => (await rows({ dueTo: addDays(clock.today(), -1) })).filter((r) => r.due.overdue).length,
  };
}

export type DeliveryTrackerService = ReturnType<typeof deliveryTrackerService>;
