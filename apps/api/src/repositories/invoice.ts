// Invoice rows (ARCHITECTURE §8.2).
import type { Db } from "@senstosales/db";
import { dcItem, invoice, invoiceItem, poItem, UniqueViolation } from "@senstosales/db";
import { and, eq, inArray } from "drizzle-orm";

import { apiColumns } from "./sql.ts";

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

/** The supplier's invoice numbers and dates, which SRV invoice numbers resolve against (INV-37). */
export const invoiceNumbersOf = (db: Db, supplierId: string) =>
  db.query(
    db.build
      .select({ id: invoice.id, number: invoice.number, date: invoice.invoiceDate })
      .from(invoice)
      .where(eq(invoice.supplierId, supplierId)),
  );

/** The supplier's invoices with one of these numbers, in every FY: the candidates SRV links resolve against (INV-37). */
export const invoicesNumbered = (db: Db, supplierId: string, numbers: readonly string[]) =>
  db.query(
    db.build
      .select({ id: invoice.id, number: invoice.number, date: invoice.invoiceDate })
      .from(invoice)
      .where(and(eq(invoice.supplierId, supplierId), inArray(invoice.number, [...numbers]))),
  );

/** A DC's lines with their PO item's rate: what a DC-sourced invoice must repeat (INV-29). */
export const dcLinesToInvoice = (db: Db, dcId: string) =>
  db.query(
    db.build
      .select({ dcItemId: dcItem.id, poItemId: dcItem.poItemId, qty: dcItem.dspQty, poRate: poItem.rate })
      .from(dcItem)
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .where(eq(dcItem.dcId, dcId))
      .orderBy(dcItem.id),
  );

/** The invoice with its kind and DC paired as the API carries them: a DC-sourced invoice has a DC, a direct one none. */
export async function findInvoice(db: Db, id: string) {
  const [row] = await db.query(db.build.select(apiColumns(invoice)).from(invoice).where(eq(invoice.id, id)));
  if (row === undefined) return undefined;
  if (row.kind === "dc" && row.dcId !== null) return { ...row, kind: row.kind, dcId: row.dcId };
  if (row.kind === "direct" && row.dcId === null) return { ...row, kind: row.kind, dcId: null };
  throw new Error(`Invoice ${row.id} is ${row.kind} with dc_id ${row.dcId ?? "null"}`);
}

/** Which unique index a refused invoice insert hit: its `(number, FY)` (INV-22) or its DC's one invoice (INV-28). */
export function invoiceCollision(err: unknown): "number" | "dc" | undefined {
  if (!(err instanceof UniqueViolation)) return undefined;
  if (err.target === "invoice.supplier_id, invoice.number, invoice.financial_year") return "number";
  return err.target === "invoice.dc_id" ? "dc" : undefined;
}
