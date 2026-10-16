// Delivery tracker reads (SPEC-10 §4.1). Plain rows: the text and date filters run in SQL; the due buckets, values
// and value range come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { po, poItem, poLot } from "@senstosales/db";
import { TRACKED_STATUSES } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import { and, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Keyset, KeysetPage, SortParts } from "./keyset.ts";
import { contains, orEmpty, PO_NUMBER_KEY, PO_NUMBER_SORT } from "./sql.ts";

export type TrackerFilters = z.output<(typeof routes)["deliveryTracker.stats"]["query"]>;

/** NOT NULL sort values, selected so the keyset cursor holds them (D-0262). */
const keys = {
  kEntryDate: orEmpty(poLot.entryAllowDate),
  kPoNumber: PO_NUMBER_KEY,
  kMaterialCode: orEmpty(poItem.materialCode),
  /**
   * Orders rows as balance × rate does; never shown or stored (the value is the domain's `qtyValue`). REAL, because
   * the integer product can pass 2^63 and node:sqlite returns an integer past 2^53 inexactly to the cursor.
   */
  kPendingValue: sql<number>`CAST(${poItem.balanceQty} AS REAL) * ${poItem.rate}`,
};

/**
 * Every scheduled lot (one with a delivery date, as legacy) of a tracked item the text and date filters keep, with its
 * item and PO; with `page`, one keyset page of them. Lots of closed items are never read: most lots are (N-PERF).
 */
export const trackerLots = (db: Db, f: Partial<TrackerFilters> = {}, page?: KeysetPage) => {
  const query = db.build
    .select({
      lotId: poLot.id,
      lotNo: poLot.lotNo,
      delyQty: poLot.delyQty,
      delyDate: poLot.delyDate,
      entryAllowDate: poLot.entryAllowDate,
      entryAllowNote: poLot.entryAllowNote,
      poItemId: poItem.id,
      poItemNo: poItem.poItemNo,
      materialCode: poItem.materialCode,
      description: poItem.description,
      drawingNo: poItem.drawingNo,
      rate: poItem.rate,
      ordQty: poItem.ordQty,
      dspQty: poItem.dspQty,
      rcdQty: poItem.rcdQty,
      balanceQty: poItem.balanceQty,
      status: poItem.status,
      unit: poItem.unit,
      poId: po.id,
      poNumber: po.poNumber,
      ...keys,
    })
    .from(poLot)
    .innerJoin(poItem, eq(poItem.id, poLot.poItemId))
    .innerJoin(po, eq(po.id, poItem.poId))
    .where(
      and(
        isNotNull(poLot.delyDate),
        inArray(poItem.status, [...TRACKED_STATUSES]),
        f.q
          ? or(contains(po.poNumber, f.q), contains(poItem.materialCode, f.q), contains(poItem.description, f.q))
          : undefined,
        f.dueFrom === undefined ? undefined : gte(poLot.delyDate, f.dueFrom),
        f.dueTo === undefined ? undefined : lte(poLot.delyDate, f.dueTo),
        f.entryFrom === undefined ? undefined : gte(poLot.entryAllowDate, f.entryFrom),
        f.entryTo === undefined ? undefined : lte(poLot.entryAllowDate, f.entryTo),
        page?.after,
      ),
    );
  return db.query(page === undefined ? query : query.orderBy(...page.orderBy).limit(page.limit));
};

export type TrackerLot = Awaited<ReturnType<typeof trackerLots>>[number];

/** A lot without its sort keys. */
export const lotColumns = ({
  kEntryDate: _,
  kPoNumber: __,
  kMaterialCode: ___,
  kPendingValue: ____,
  ...lot
}: TrackerLot) => lot;

/** The tracker's sort columns (D-0241): a missing entry date or material code sorts first ascending. */
export const TRACKER_SORTS = {
  // Never NULL here: the query keeps only scheduled lots.
  delyDate: [{ by: poLot.delyDate, field: "delyDate" }],
  entryAllowDate: [{ by: keys.kEntryDate, field: "kEntryDate" }],
  poNumber: PO_NUMBER_SORT,
  materialCode: [{ by: keys.kMaterialCode, field: "kMaterialCode" }],
  ordQty: [{ by: poItem.ordQty, field: "ordQty" }],
  dspQty: [{ by: poItem.dspQty, field: "dspQty" }],
  rcdQty: [{ by: poItem.rcdQty, field: "rcdQty" }],
  pendingValue: [{ by: keys.kPendingValue, field: "kPendingValue" }],
} satisfies Record<string, SortParts<TrackerLot>>;

/** Latest delivery date first, as the legacy tracker opens; then PO number, item, lot and lot id (D-0241). */
export const TRACKER_ORDER: Keyset<TrackerLot> = {
  parts: [
    { by: poLot.delyDate, field: "delyDate", dir: "desc" },
    ...PO_NUMBER_SORT.map((p) => ({ ...p, dir: "asc" as const })),
    { by: poItem.poItemNo, field: "poItemNo", dir: "asc" },
    { by: poLot.lotNo, field: "lotNo", dir: "asc" },
  ],
  id: { by: poLot.id, field: "lotId", dir: "asc" },
};
