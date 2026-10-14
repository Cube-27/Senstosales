// SRV rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { srv, srvItem } from "@senstosales/db";
import { eq } from "drizzle-orm";

/** Every SRV line of the SRVs attached to the PO, matched to an item or not, with its SRV's date. */
export const srvLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
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
      })
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(eq(srv.poId, poId))
      .orderBy(srvItem.id),
  );
