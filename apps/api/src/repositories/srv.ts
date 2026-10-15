// SRV rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { srv, srvItem } from "@senstosales/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { inBatches } from "./sql.ts";

const lineColumns = {
  id: srvItem.id,
  srvId: srvItem.srvId,
  poItemId: srvItem.poItemId,
  poItemNo: srvItem.poItemNo,
  srvItemNo: srvItem.srvItemNo,
  srvDate: srv.srvDate,
  ordQty: srvItem.ordQty,
  rcdQty: srvItem.rcdQty,
  acceptedQty: srvItem.acceptedQty,
  rejQty: srvItem.rejQty,
  challanNo: srvItem.challanNo,
  invoiceNo: srvItem.invoiceNo,
  resolvedDcId: srvItem.resolvedDcId,
  resolvedInvoiceId: srvItem.resolvedInvoiceId,
};

/** Every SRV line of the SRVs attached to the PO, matched to an item or not, with its SRV's date. */
export const srvLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select(lineColumns)
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(eq(srv.poId, poId))
      .orderBy(srvItem.id),
  );

/**
 * The unmatched lines of the supplier's SRVs for `poNumber`, with what item matching reads (INV-39): every line of
 * an SRV stored while the PO was not in the system ("PO not found", INV-40), and lines of attached SRVs whose
 * PO item number was on no item (EC-12).
 */
export const unmatchedSrvLines = (db: Db, supplierId: string, poNumber: string) =>
  db.query(
    db.build
      .select(lineColumns)
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(and(eq(srv.supplierId, supplierId), eq(srv.poNumber, poNumber), isNull(srvItem.poItemId)))
      .orderBy(srvItem.id),
  );

/** The supplier's stored SRVs of `poNumber`, attached to its PO or not, for the date guard (INV-43). */
export const srvsOfPoNumber = (db: Db, supplierId: string, poNumber: string) =>
  db.query(
    db.build
      .select({ id: srv.id, srvNumber: srv.srvNumber, srvDate: srv.srvDate })
      .from(srv)
      .where(and(eq(srv.supplierId, supplierId), eq(srv.poNumber, poNumber))),
  );

/** The item keys and ids of these SRVs in row order, so a replaced SRV keeps the ids its flags cite (INV-59). */
export const srvItemKeysOf = (db: Db, srvIds: readonly string[]) =>
  inBatches(srvIds, (ids) =>
    db.query(
      db.build
        .select({
          id: srvItem.id,
          srvId: srvItem.srvId,
          poItemNo: srvItem.poItemNo,
          lotNo: srvItem.lotNo,
          srvItemNo: srvItem.srvItemNo,
        })
        .from(srvItem)
        .where(inArray(srvItem.srvId, ids))
        .orderBy(srvItem.srvId, srvItem.rowNo),
    ),
  );

/** The SRV fields that cite a DC or an invoice by number, and the resolved link kept beside each (INV-38). */
export const CITATIONS = {
  dc: { raw: srvItem.challanNo, resolved: srvItem.resolvedDcId, key: "resolvedDcId" },
  invoice: { raw: srvItem.invoiceNo, resolved: srvItem.resolvedInvoiceId, key: "resolvedInvoiceId" },
} as const;

/**
 * The supplier's SRV items whose cited number of `kind` contains one of `numbers`, with the SRV's date and PO. Containment is
 * a superset of every number that trims to one of them; the domain decides the link (INV-24).
 */
export function srvItemsCiting(db: Db, supplierId: string, kind: keyof typeof CITATIONS, numbers: readonly string[]) {
  const { raw, resolved } = CITATIONS[kind];
  return db.query(
    db.build
      .select({ id: srvItem.id, raw, resolved, srvDate: srv.srvDate, poId: srv.poId })
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(and(eq(srvItem.supplierId, supplierId), or(...numbers.map((n) => sql`instr(${raw}, ${n}) > 0`))))
      .orderBy(srvItem.id),
  );
}
