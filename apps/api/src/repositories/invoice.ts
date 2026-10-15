// Invoice rows (ARCHITECTURE §8.2) and the invoice list, detail and delete reads (SPEC-11 §2). Plain rows: the filters
// need no business value, so they run in SQL; the list totals come from the domain in the service (C2).
import type { Db, Statement } from "@senstosales/db";
import {
  dc,
  dcItem,
  invoice,
  invoiceItem,
  po,
  poItem,
  reconciliationIssue,
  srvItem,
  UniqueViolation,
} from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, eq, exists, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { srvRefs, srvsResolvedTo } from "./po-list.ts";
import { apiColumns, contains, flagColumns } from "./sql.ts";

/** The filters of the invoice list and its stats. */
export type InvoiceFilters = z.output<(typeof routes)["invoice.stats"]["query"]>;

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

/**
 * A DC's lines in its order with their PO item's rate, what a DC-sourced invoice must repeat (INV-29), and the item's
 * document columns and uninvoiced quantity, which the preview shows.
 */
export const dcLinesToInvoice = (db: Db, dcId: string) =>
  db.query(
    db.build
      .select({
        dcItemId: dcItem.id,
        poItemId: dcItem.poItemId,
        qty: dcItem.dspQty,
        poRate: poItem.rate,
        poItemNo: poItem.poItemNo,
        materialCode: poItem.materialCode,
        description: poItem.description,
        drawingNo: poItem.drawingNo,
        unit: poItem.unit,
        uninvoicedQty: poItem.uninvoicedQty,
      })
      .from(dcItem)
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .where(eq(dcItem.dcId, dcId))
      .orderBy(dcItem.id),
  );

const invoiceColumns = apiColumns(invoice);

/** The invoice with its kind and DC paired as the API carries them: a DC-sourced invoice has a DC, a direct one none. */
function paired<R extends { id: string; kind: "dc" | "direct"; dcId: string | null }>(row: R) {
  if (row.kind === "dc" && row.dcId !== null) return { ...row, kind: row.kind, dcId: row.dcId };
  if (row.kind === "direct" && row.dcId === null) return { ...row, kind: row.kind, dcId: null };
  throw new Error(`Invoice ${row.id} is ${row.kind} with dc_id ${row.dcId ?? "null"}`);
}

export async function findInvoice(db: Db, id: string) {
  const [row] = await db.query(db.build.select(invoiceColumns).from(invoice).where(eq(invoice.id, id)));
  return row === undefined ? undefined : paired(row);
}

/**
 * The invoice with its PO's reference and version and its DC's reference, in one read. A delete that commits after
 * this read bumps that version, so a batch guarded on it fails instead of writing for an invoice that is gone.
 */
export async function findInvoiceWithPo(db: Db, id: string) {
  const [row] = await db.query(
    db.build
      .select({
        invoice: invoiceColumns,
        po: { id: po.id, poNumber: po.poNumber, isGemc: po.isGemc },
        poVersion: po.version,
        dc: dcRef,
      })
      .from(invoice)
      .innerJoin(po, eq(po.id, invoice.poId))
      .leftJoin(dc, eq(dc.id, invoice.dcId))
      .where(eq(invoice.id, id)),
  );
  return row === undefined ? undefined : { ...row, invoice: paired(row.invoice) };
}

/** A DC reference with its FY (INV-24). */
const dcRef = { id: dc.id, number: dc.number, date: dc.dcDate, financialYear: dc.financialYear };

/** The legacy filter panel: text in the invoice, PO or DC number or the buyer, invoice date range, total range. */
const where = (f: InvoiceFilters) =>
  and(
    f.q
      ? or(
          contains(invoice.number, f.q),
          contains(po.poNumber, f.q),
          contains(dc.number, f.q),
          contains(invoice.buyerName, f.q),
        )
      : undefined,
    f.from === undefined ? undefined : gte(invoice.invoiceDate, f.from),
    f.to === undefined ? undefined : lte(invoice.invoiceDate, f.to),
    f.valueMin === undefined ? undefined : gte(invoice.total, f.valueMin),
    f.valueMax === undefined ? undefined : lte(invoice.total, f.valueMax),
  );

/** Every line of every invoice the filters keep, with its invoice's columns, PO number and DC reference. */
export const invoiceListLines = (db: Db, filters: InvoiceFilters) =>
  db.query(
    db.build
      .select({
        id: invoice.id,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate,
        financialYear: invoice.financialYear,
        poId: invoice.poId,
        poNumber: po.poNumber,
        kind: invoice.kind,
        dc: dcRef,
        taxable: invoice.taxable,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst,
        total: invoice.total,
        qty: invoiceItem.qty,
      })
      .from(invoice)
      .innerJoin(po, eq(po.id, invoice.poId))
      .innerJoin(invoiceItem, eq(invoiceItem.invoiceId, invoice.id))
      .leftJoin(dc, eq(dc.id, invoice.dcId))
      .where(where(filters)),
  );

/** The invoice's lines with the PO item columns a document line shows, in item order. */
export const itemsOfInvoice = (db: Db, invoiceId: string) =>
  db.query(
    db.build
      .select({
        ...apiColumns(invoiceItem),
        poItemNo: poItem.poItemNo,
        materialCode: poItem.materialCode,
        description: poItem.description,
        drawingNo: poItem.drawingNo,
        unit: poItem.unit,
      })
      .from(invoiceItem)
      .innerJoin(poItem, eq(poItem.id, invoiceItem.poItemId))
      .where(eq(invoiceItem.invoiceId, invoiceId))
      .orderBy(poItem.poItemNo, invoiceItem.id),
  );

/** The open flags on the invoice's lines (DOC_ON_CANCELLED_ITEM); flags on its PO items show on the PO. */
export const openFlagsOfInvoice = (db: Db, invoiceId: string) =>
  db.query(
    db.build
      .select(flagColumns)
      .from(reconciliationIssue)
      .where(
        and(
          eq(reconciliationIssue.scopeType, "invoice_item"),
          inArray(
            reconciliationIssue.scopeId,
            db.build.select({ id: invoiceItem.id }).from(invoiceItem).where(eq(invoiceItem.invoiceId, invoiceId)),
          ),
          eq(reconciliationIssue.status, "open"),
        ),
      )
      .orderBy(reconciliationIssue.openedAt, reconciliationIssue.id),
  );

/** The SRVs with an item linked to the invoice (INV-37). */
export const srvsOfInvoice = (db: Db, invoiceId: string) =>
  srvRefs(db, srvsResolvedTo(db, srvItem.resolvedInvoiceId, invoiceId));

/** The backward link that blocks an invoice delete (INV-35): an SRV item linked to it. */
const linkedSrvItems = (db: Db, invoiceId: string) =>
  exists(
    db.build
      .select({ one: sql`1` })
      .from(srvItem)
      .where(eq(srvItem.resolvedInvoiceId, invoiceId)),
  );

/** Whether an SRV item links the invoice, as a count of 0 or 1 (INV-35). */
export async function deleteLinksOfInvoice(db: Db, invoiceId: string) {
  const [row] = await db.query(
    db.build
      .select({ srvItems: sql<number>`${linkedSrvItems(db, invoiceId)}`.mapWith(Number) })
      .from(invoice)
      .where(eq(invoice.id, invoiceId)),
  );
  return row ?? { srvItems: 0 };
}

/**
 * Fails its batch (stale `invoice`, D-0124) when an SRV item links the invoice by the time the batch runs: a delete
 * built from a read without links must not remove an invoice that gained one before the commit (INV-35).
 */
export const invoiceStillUnlinked = (db: Db, invoiceId: string): Statement =>
  db.build
    .update(invoice)
    .set({ version: sql`CASE WHEN ${linkedSrvItems(db, invoiceId)} THEN NULL ELSE ${invoice.version} END` })
    .where(eq(invoice.id, invoiceId));

/** Which unique index a refused invoice insert hit: its `(number, FY)` (INV-22) or its DC's one invoice (INV-28). */
export function invoiceCollision(err: unknown): "number" | "dc" | undefined {
  if (!(err instanceof UniqueViolation)) return undefined;
  if (err.target === "invoice.supplier_id, invoice.number, invoice.financial_year") return "number";
  return err.target === "invoice.dc_id" ? "dc" : undefined;
}
