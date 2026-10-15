// The DC and invoice header reads the Excel documents print (SPEC-12 §4.1): the document row with its PO's number,
// date and GEMC flag, a DC's own invoice and an invoice's source DC. The lines come from the detail reads
// (`itemsOfDc`, `itemsOfInvoice`).
import type { Db } from "@senstosales/db";
import { dc, invoice, po } from "@senstosales/db";
import { eq } from "drizzle-orm";

import { apiColumns } from "./sql.ts";

const poColumns = { poNumber: po.poNumber, poDate: po.poDate, isGemc: po.isGemc };

export async function dcForDocument(db: Db, id: string) {
  const [row] = await db.query(
    db.build
      .select({
        dc: apiColumns(dc),
        po: poColumns,
        invoice: { number: invoice.number, invoiceDate: invoice.invoiceDate },
      })
      .from(dc)
      .innerJoin(po, eq(po.id, dc.poId))
      // A DC has at most one invoice (INV-28).
      .leftJoin(invoice, eq(invoice.dcId, dc.id))
      .where(eq(dc.id, id)),
  );
  return row;
}

export async function invoiceForDocument(db: Db, id: string) {
  const [row] = await db.query(
    db.build
      .select({ invoice: apiColumns(invoice), po: poColumns, dc: { number: dc.number, dcDate: dc.dcDate } })
      .from(invoice)
      .innerJoin(po, eq(po.id, invoice.poId))
      .leftJoin(dc, eq(dc.id, invoice.dcId))
      .where(eq(invoice.id, id)),
  );
  return row;
}
