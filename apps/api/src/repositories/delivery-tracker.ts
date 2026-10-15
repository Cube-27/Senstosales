// Delivery tracker reads (SPEC-10 §4.1). Plain rows: the text and date filters run in SQL; the due buckets, values
// and value range come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { po, poItem, poLot } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import type { z } from "zod";

import { contains } from "./sql.ts";

export type TrackerFilters = z.output<(typeof routes)["deliveryTracker.stats"]["query"]>;

/** Every scheduled lot (one with a delivery date, as legacy) the text and date filters keep, with its item and PO. */
export const trackerLots = (db: Db, f: Partial<TrackerFilters> = {}) =>
  db.query(
    db.build
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
        poId: po.id,
        poNumber: po.poNumber,
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
        ),
      ),
  );
