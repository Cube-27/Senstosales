// PO and PO item rows (ARCHITECTURE §8.2). Plain rows only; derived values come from the domain (C2).
import type { Db } from "@senstosales/db";
import { po, poItem } from "@senstosales/db";
import { and, eq } from "drizzle-orm";

/** The PO header fields recompute needs, or `undefined` when there is no such PO. */
export async function findPo(db: Db, poId: string) {
  const rows = await db.query(
    db.build.select({ id: po.id, supplierId: po.supplierId, poDate: po.poDate }).from(po).where(eq(po.id, poId)),
  );
  return rows[0];
}

/** The supplier's PO with this BHEL number, with what the ingest guard, its version check and the audit read, or `undefined`. */
export async function findPoByNumber(db: Db, supplierId: string, poNumber: string) {
  const rows = await db.query(
    db.build
      .select({ id: po.id, poDate: po.poDate, amendNo: po.amendNo, version: po.version })
      .from(po)
      .where(and(eq(po.supplierId, supplierId), eq(po.poNumber, poNumber))),
  );
  return rows[0];
}

/** The PO's items with their stored inputs, in item-number order. */
export const poItemsOf = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
        id: poItem.id,
        poItemNo: poItem.poItemNo,
        materialCode: poItem.materialCode,
        ordQty: poItem.ordQty,
        poRcdQty: poItem.poRcdQty,
        poRejQty: poItem.poRejQty,
        cancelledAt: poItem.cancelledAt,
        manualDispatchedQty: poItem.manualDispatchedQty,
        manualSetAt: poItem.manualSetAt,
      })
      .from(poItem)
      .where(eq(poItem.poId, poId))
      .orderBy(poItem.poItemNo),
  );
