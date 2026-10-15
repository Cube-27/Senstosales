// The register and list-CSV exports' reads (SPEC-13 §2): one keyset page of documents at a time (INV-99), then the
// lines of that page's documents. Plain rows; the totals come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { and, count, eq, inArray } from "drizzle-orm";
import type { z } from "zod";

import type { DcFilters } from "./dc.ts";
import { dcListWhere } from "./dc.ts";
import type { InvoiceFilters } from "./invoice.ts";
import { invoiceListWhere } from "./invoice.ts";
import type { Keyset, KeysetPage, PrimaryKey } from "./keyset.ts";
import { asNumber, inBatches, inRange, orEmpty } from "./sql.ts";

/** A register's date range. */
export type Range = z.output<(typeof routes)["reports.poRegisterExport"]["query"]>;

/** Newest first: the date, then the number as a number, then its text, then the id. */
function newestFirst<Row extends { numberKey: unknown; number: unknown; id: unknown }>(
  date: { by: SQLWrapper; field: keyof Row },
  number: SQLWrapper,
  id: PrimaryKey,
): Keyset<Row> {
  return {
    parts: [
      { ...date, dir: "desc" },
      { by: asNumber(number), dir: "desc", field: "numberKey" },
      { by: number, dir: "desc", field: "number" },
    ],
    id: { by: id, dir: "desc", field: "id" },
  };
}

const poDateKey = orEmpty(po.poDate);

/** A page of POs dated in the range, newest first (no date last). */
export const poRegisterPage = (db: Db, range: Range, page: KeysetPage) =>
  db.query(
    db.build
      .select({
        id: po.id,
        number: po.poNumber,
        poDate: po.poDate,
        poValue: po.poValue,
        status: po.status,
        ordQty: po.ordQty,
        dateKey: poDateKey,
        numberKey: asNumber(po.poNumber),
      })
      .from(po)
      .where(and(inRange(po.poDate, range), page.after))
      .orderBy(...page.orderBy)
      .limit(page.limit),
  );

export const PO_REGISTER_KEY = newestFirst<Awaited<ReturnType<typeof poRegisterPage>>[number]>(
  { by: poDateKey, field: "dateKey" },
  po.poNumber,
  po.id,
);

/** How many items each of these POs has, by PO; a PO without items is absent. */
export async function itemCountsOfPos(db: Db, poIds: readonly string[]) {
  const rows = await inBatches(poIds, (ids) =>
    db.query(
      db.build
        .select({ poId: poItem.poId, count: count() })
        .from(poItem)
        .where(inArray(poItem.poId, ids))
        .groupBy(poItem.poId),
    ),
  );
  return new Map(rows.map((row) => [row.poId, row.count]));
}

const dcPage = (db: Db, where: SQL | undefined, page: KeysetPage) =>
  db.query(
    db.build
      .select({
        id: dc.id,
        number: dc.number,
        dcDate: dc.dcDate,
        poNumber: po.poNumber,
        consigneeName: dc.consigneeName,
        numberKey: asNumber(dc.number),
      })
      .from(dc)
      .innerJoin(po, eq(po.id, dc.poId))
      .where(and(where, page.after))
      .orderBy(...page.orderBy)
      .limit(page.limit),
  );

/** A page of DCs dated in the range, newest first, with their PO number. */
export const dcRegisterPage = (db: Db, range: Range, page: KeysetPage) => dcPage(db, inRange(dc.dcDate, range), page);

/** A page of the DCs the DC list's filters keep (text and date; the value range is the service's), newest first. */
export const dcListPage = (db: Db, filters: DcFilters, page: KeysetPage) => dcPage(db, dcListWhere(filters), page);

export const DC_KEY = newestFirst<Awaited<ReturnType<typeof dcPage>>[number]>(
  { by: dc.dcDate, field: "dcDate" },
  dc.number,
  dc.id,
);

/** The lines of these DCs with their PO item's ordered and received quantities and rate. */
export const linesOfDcs = (db: Db, dcIds: readonly string[]) =>
  inBatches(dcIds, (ids) =>
    db.query(
      db.build
        .select({
          dcId: dcItem.dcId,
          poItemId: dcItem.poItemId,
          dspQty: dcItem.dspQty,
          ordQty: poItem.ordQty,
          rcdQty: poItem.rcdQty,
          rate: poItem.rate,
        })
        .from(dcItem)
        .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
        .where(inArray(dcItem.dcId, ids)),
    ),
  );

/** The dispatched quantity of each line of these DCs. */
export const dspOfDcs = (db: Db, dcIds: readonly string[]) =>
  inBatches(dcIds, (ids) =>
    db.query(
      db.build.select({ dcId: dcItem.dcId, dspQty: dcItem.dspQty }).from(dcItem).where(inArray(dcItem.dcId, ids)),
    ),
  );

/** Every DC line on these PO items, on any DC. */
export const dcLinesOfItems = (db: Db, poItemIds: readonly string[]) =>
  inBatches(poItemIds, (ids) =>
    db.query(
      db.build
        .select({ poItemId: dcItem.poItemId, dspQty: dcItem.dspQty })
        .from(dcItem)
        .where(inArray(dcItem.poItemId, ids)),
    ),
  );

const invoicePage = (db: Db, where: SQL | undefined, page: KeysetPage) =>
  db.query(
    db.build
      .select({
        id: invoice.id,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate,
        poNumber: po.poNumber,
        dcId: invoice.dcId,
        dcNumber: dc.number,
        taxable: invoice.taxable,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        igst: invoice.igst,
        total: invoice.total,
        numberKey: asNumber(invoice.number),
      })
      .from(invoice)
      .innerJoin(po, eq(po.id, invoice.poId))
      .leftJoin(dc, eq(dc.id, invoice.dcId))
      .where(and(where, page.after))
      .orderBy(...page.orderBy)
      .limit(page.limit),
  );

/** A page of invoices dated in the range, newest first, with their PO number and source DC (none if PO-direct). */
export const invoiceRegisterPage = (db: Db, range: Range, page: KeysetPage) =>
  invoicePage(db, inRange(invoice.invoiceDate, range), page);

/** A page of the invoices the invoice list's filters keep, newest first. */
export const invoiceListPage = (db: Db, filters: InvoiceFilters, page: KeysetPage) =>
  invoicePage(db, invoiceListWhere(filters), page);

export const INVOICE_KEY = newestFirst<Awaited<ReturnType<typeof invoicePage>>[number]>(
  { by: invoice.invoiceDate, field: "invoiceDate" },
  invoice.number,
  invoice.id,
);

/** The lines of these invoices. */
export const linesOfInvoices = (db: Db, invoiceIds: readonly string[]) =>
  inBatches(invoiceIds, (ids) =>
    db.query(
      db.build
        .select({ invoiceId: invoiceItem.invoiceId, qty: invoiceItem.qty })
        .from(invoiceItem)
        .where(inArray(invoiceItem.invoiceId, ids)),
    ),
  );

const srvLineColumns = { rcdQty: srvItem.rcdQty, acceptedQty: srvItem.acceptedQty, rejQty: srvItem.rejQty };

/** The SRV lines resolved to one of these DCs (INV-37). */
export const srvLinesOfDcs = (db: Db, dcIds: readonly string[]) =>
  inBatches(dcIds, (ids) =>
    db.query(
      db.build
        .select({ resolvedDcId: srvItem.resolvedDcId, ...srvLineColumns })
        .from(srvItem)
        .where(inArray(srvItem.resolvedDcId, ids)),
    ),
  );

/** The SRV lines resolved to one of these invoices (INV-37). */
export const srvLinesOfInvoices = (db: Db, invoiceIds: readonly string[]) =>
  inBatches(invoiceIds, (ids) =>
    db.query(
      db.build
        .select({ resolvedInvoiceId: srvItem.resolvedInvoiceId, ...srvLineColumns })
        .from(srvItem)
        .where(inArray(srvItem.resolvedInvoiceId, ids)),
    ),
  );
