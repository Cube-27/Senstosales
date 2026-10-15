// Delivery tracker reads (SPEC-10 §4.1). Plain rows: the text and date filters run in SQL; the due buckets, values
// and value range come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { po, poItem, poLot } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Keyset, KeysetPage, SortParts } from "./keyset.ts";
import { byPoNumber, contains } from "./sql.ts";

export type TrackerFilters = z.output<(typeof routes)["deliveryTracker.stats"]["query"]>;

/** NOT NULL sort values, selected so the keyset cursor holds them (D-0262). */
const keys = {
  kDelyDate: sql<string>`COALESCE(${poLot.delyDate}, '')`,
  kEntryDate: sql<string>`COALESCE(${poLot.entryAllowDate}, '')`,
  kPoNumber: sql<number>`${byPoNumber[0]}`,
  kMaterialCode: sql<string>`COALESCE(${poItem.materialCode}, '')`,
  /**
   * Orders rows as balance × rate does; never shown or stored (the value is the domain's `qtyValue`). REAL, because
   * the integer product can pass 2^63 and node:sqlite returns an integer past 2^53 inexactly to the cursor.
   */
  kPendingValue: sql<number>`CAST(${poItem.balanceQty} AS REAL) * ${poItem.rate}`,
};

/**
 * Every scheduled lot (one with a delivery date, as legacy) the text and date filters keep, with its item and PO;
 * with `page`, one keyset page of them.
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

/** The tracker's sort columns (D-0241): a missing entry date or material code sorts first ascending. */
export const TRACKER_SORTS = {
  delyDate: [{ by: keys.kDelyDate, field: "kDelyDate" }],
  entryAllowDate: [{ by: keys.kEntryDate, field: "kEntryDate" }],
  poNumber: [
    { by: keys.kPoNumber, field: "kPoNumber" },
    { by: po.poNumber, field: "poNumber" },
  ],
  materialCode: [{ by: keys.kMaterialCode, field: "kMaterialCode" }],
  ordQty: [{ by: poItem.ordQty, field: "ordQty" }],
  dspQty: [{ by: poItem.dspQty, field: "dspQty" }],
  rcdQty: [{ by: poItem.rcdQty, field: "rcdQty" }],
  pendingValue: [{ by: keys.kPendingValue, field: "kPendingValue" }],
} satisfies Record<string, SortParts<TrackerLot>>;

/** Latest delivery date first, as the legacy tracker opens; then PO number, item, lot and lot id (D-0241). */
export const TRACKER_ORDER: Keyset<TrackerLot> = {
  parts: [
    { by: keys.kDelyDate, field: "kDelyDate", dir: "desc" },
    { by: keys.kPoNumber, field: "kPoNumber", dir: "asc" },
    { by: po.poNumber, field: "poNumber", dir: "asc" },
    { by: poItem.poItemNo, field: "poItemNo", dir: "asc" },
    { by: poLot.lotNo, field: "lotNo", dir: "asc" },
  ],
  id: { by: poLot.id, field: "lotId", dir: "asc" },
};
