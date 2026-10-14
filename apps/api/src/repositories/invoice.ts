// Invoice rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { invoice, invoiceItem } from "@senstosales/db";
import { eq } from "drizzle-orm";

/** Every invoice line on the PO's items, with its invoice's kind (`dc` or `direct`). */
export const invoiceLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
        id: invoiceItem.id,
        invoiceId: invoiceItem.invoiceId,
        poItemId: invoiceItem.poItemId,
        qty: invoiceItem.qty,
        kind: invoice.kind,
      })
      .from(invoiceItem)
      .innerJoin(invoice, eq(invoice.id, invoiceItem.invoiceId))
      .where(eq(invoice.poId, poId))
      .orderBy(invoiceItem.id),
  );
