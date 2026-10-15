// PO and PO item rows (ARCHITECTURE §8.2). Plain rows only; derived values come from the domain (C2).
import type { Db, Statement } from "@senstosales/db";
import { po, poItem, poLot, reconciliationIssue, srv, srvItem, UniqueViolation } from "@senstosales/db";
import { and, eq, inArray } from "drizzle-orm";

/** Whether `err` is the unique index refusing a second PO with the same number. */
export const isDuplicatePoNumber = (err: unknown): boolean =>
  err instanceof UniqueViolation && err.target === "po.supplier_id, po.po_number";

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

/**
 * Removes the PO with its items, lots and flags. Its SRVs stay, keeping `po_number`, and become "PO not found" until
 * the PO is stored again (INV-40, A2-9). Children go first, while their subqueries can still find the PO's items.
 */
export function deletePoStatements(db: Db, poId: string): Statement[] {
  const b = db.build;
  const items = b.select({ id: poItem.id }).from(poItem).where(eq(poItem.poId, poId));
  const srvs = b.select({ id: srv.id }).from(srv).where(eq(srv.poId, poId));
  return [
    b.update(srvItem).set({ poItemId: null }).where(inArray(srvItem.srvId, srvs)),
    b.update(srv).set({ poId: null }).where(eq(srv.poId, poId)),
    b.delete(reconciliationIssue).where(eq(reconciliationIssue.poId, poId)),
    b.delete(poLot).where(inArray(poLot.poItemId, items)),
    b.delete(poItem).where(eq(poItem.poId, poId)),
    b.delete(po).where(eq(po.id, poId)),
  ];
}
