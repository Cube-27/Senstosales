// SRV rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { srv, srvItem } from "@senstosales/db";
import { and, eq, isNull } from "drizzle-orm";

const lineColumns = {
  id: srvItem.id,
  poItemId: srvItem.poItemId,
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
 * material code was on no item (EC-12).
 */
export const unmatchedSrvLines = (db: Db, supplierId: string, poNumber: string) =>
  db.query(
    db.build
      .select({ ...lineColumns, srvId: srv.id, materialCode: srvItem.materialCode, poItemNo: srvItem.poItemNo })
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(and(eq(srv.supplierId, supplierId), eq(srv.poNumber, poNumber), isNull(srvItem.poItemId)))
      .orderBy(srvItem.id),
  );
