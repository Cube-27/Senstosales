// Delivery tracker list and stats (SPEC-10 §2; export in SPEC-13). A row is one scheduled lot with its item's
// stored quantities (INV-06); the due buckets, days to due and values come from the domain (C2, D-0101).
import type { Db } from "@senstosales/db";
import { EXPORTS, xlsxChunks } from "@senstosales/documents";
import type { IsoDate } from "@senstosales/domain";
import { addDays, deliveryDue, pendingValueOfItems, qtyValue } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { fmtDaysToDue, moneyNumber, qtyNumber } from "@senstosales/schemas";
import type { z } from "zod";

import type { Clock } from "../ports/clock.ts";
import { istDateTime } from "../ports/clock.ts";
import type { TrackerFilters, TrackerLot } from "../repositories/delivery-tracker.ts";
import { lotColumns, TRACKER_ORDER, TRACKER_SORTS, trackerLots } from "../repositories/delivery-tracker.ts";
import { keysetRows, listKey } from "../repositories/keyset.ts";
import { inValueRange, LIST_READ_PAGE, pageOfRows } from "./paging.ts";

type Query = z.output<(typeof routes)["deliveryTracker.export"]["query"]>;

const BUCKET = { overdue: "overdue", "due-soon": "dueSoon", "due-this-month": "dueThisMonth" } as const;

/** A scheduled lot as the tracker shows it, with its due buckets for the status filter and stats. */
function toRow(
  { delyQty, status, delyDate, ...lot }: ReturnType<typeof lotColumns> & { delyDate: IsoDate },
  today: IsoDate,
) {
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

type Row = ReturnType<typeof toRow>;

/** The lot's row if the filters other than status keep it: a scheduled, open lot in the value range. */
function keptRow(lot: TrackerLot, today: IsoDate, filters: Partial<TrackerFilters>): Row | undefined {
  const { delyDate, ...rest } = lotColumns(lot);
  if (delyDate === null) return undefined;
  const row = toRow({ ...rest, delyDate }, today);
  return row.due.open && inValueRange(row.lotValue, filters) ? row : undefined;
}

const withStatus = (status: TrackerFilters["status"]) => (r: Row) => status === undefined || r.due[BUCKET[status]];

/** A row as the list sends it. */
const listed = ({ due: _, lotValue: __, unit: ___, ...row }: Row) => row;

/** Export cells (SPEC-13 catalog): quantities and amounts as numbers at 2 dp, dates and codes as text. */
async function* cells(rows: AsyncIterable<Row>) {
  for await (const r of rows) {
    yield {
      poNumber: r.poNumber,
      materialCode: r.materialCode,
      description: r.description,
      lot: `L${r.lotNo}`,
      unit: r.unit,
      delyDate: r.delyDate,
      entryAllowDate: r.entryAllowDate,
      ordQty: qtyNumber(r.ordQty),
      dspQty: qtyNumber(r.dspQty),
      rcdQty: qtyNumber(r.rcdQty),
      balanceQty: qtyNumber(r.balanceQty),
      rate: moneyNumber(r.rate),
      pendingValue: moneyNumber(r.pendingValue),
      daysOverdue: fmtDaysToDue(r.daysToDue),
    };
  }
}

export function deliveryTrackerService({ db, clock }: { db: Db; clock: Clock }) {
  /** The open lots the filters other than status keep, unordered. */
  async function rows(filters: Partial<TrackerFilters>): Promise<Row[]> {
    const today = clock.today();
    return (await trackerLots(db, filters)).flatMap((lot) => keptRow(lot, today, filters) ?? []);
  }

  /** The rows the filters keep in the list's order, a keyset page at a time; the list and the export read these. */
  async function* ordered(query: Query, pageSize?: number) {
    const today = clock.today();
    const key = listKey(TRACKER_SORTS, TRACKER_ORDER, query);
    const inStatus = withStatus(query.status);
    for await (const lot of keysetRows(key, (page) => trackerLots(db, query, page), pageSize)) {
      const row = keptRow(lot, today, query);
      if (row !== undefined && inStatus(row)) yield row;
    }
  }

  return {
    async list(query: Query & { page: number; pageSize: number }) {
      const { items, total } = await pageOfRows(ordered(query, LIST_READ_PAGE), query);
      return { items: items.map(listed), total };
    },

    /** The tracker as the legacy workbook, the list's rows in the list's order, named after the IST minute. */
    export(query: Query) {
      const { deliveryTracker } = EXPORTS;
      return {
        fileName: deliveryTracker.fileName(istDateTime(clock.now())),
        chunks: xlsxChunks(deliveryTracker.sheet, cells(ordered(query))),
      };
    },

    /** The stat cards count every bucket whatever the status toggle; the pending value follows it, as legacy. */
    async stats(filters: TrackerFilters) {
      const all = await rows(filters);
      const count = (bucket: keyof Row["due"]) => all.filter((r) => r.due[bucket]).length;
      return {
        overdueCount: count("overdue"),
        dueSoonCount: count("dueSoon"),
        dueThisMonthCount: count("dueThisMonth"),
        pendingValue: pendingValueOfItems(all.filter(withStatus(filters.status))),
      };
    },

    /** The dashboard's overdue card: overdue lots without filters. */
    /** Only lots due before today can be overdue, so the query reads no others. */
    overdueCount: async () => (await rows({ dueTo: addDays(clock.today(), -1) })).filter((r) => r.due.overdue).length,
  };
}

export type DeliveryTrackerService = ReturnType<typeof deliveryTrackerService>;
