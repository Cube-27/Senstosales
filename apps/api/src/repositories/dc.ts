// DC rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { dc, dcItem, UniqueViolation } from "@senstosales/db";
import { and, eq, inArray } from "drizzle-orm";

import { apiColumns } from "./sql.ts";

/** Every DC line on the PO's items. */
export const dcLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
        id: dcItem.id,
        dcId: dcItem.dcId,
        poItemId: dcItem.poItemId,
        dspQty: dcItem.dspQty,
        createdAt: dcItem.createdAt,
      })
      .from(dcItem)
      .innerJoin(dc, eq(dc.id, dcItem.dcId))
      .where(eq(dc.poId, poId))
      .orderBy(dcItem.id),
  );

/** The supplier's DC numbers and dates, which SRV challan numbers resolve against (INV-37). */
export const dcNumbersOf = (db: Db, supplierId: string) =>
  db.query(
    db.build.select({ id: dc.id, number: dc.number, date: dc.dcDate }).from(dc).where(eq(dc.supplierId, supplierId)),
  );

/** The supplier's DCs with one of these numbers, in every FY: the candidates SRV links resolve against (INV-37). */
export const dcsNumbered = (db: Db, supplierId: string, numbers: readonly string[]) =>
  db.query(
    db.build
      .select({ id: dc.id, number: dc.number, date: dc.dcDate })
      .from(dc)
      .where(and(eq(dc.supplierId, supplierId), inArray(dc.number, [...numbers]))),
  );

export async function findDc(db: Db, id: string) {
  const rows = await db.query(db.build.select(apiColumns(dc)).from(dc).where(eq(dc.id, id)));
  return rows[0];
}

/** Whether a refused DC insert collided on a per-FY DC or GC number (INV-22, INV-26). */
export const isNumberCollision = (err: unknown): boolean =>
  err instanceof UniqueViolation &&
  ["dc.supplier_id, dc.number, dc.financial_year", "dc.supplier_id, dc.gc_number, dc.financial_year"].includes(
    err.target,
  );
