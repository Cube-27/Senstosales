// Report reads (SPEC-13 §4.1): PO item rows for the pending and reconciliation tabs and their exports, one keyset
// page at a time (INV-99), with the stored quantities as they stand (INV-61).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem, poLot } from "@senstosales/db";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Keyset, KeysetPage, SortParts } from "./keyset.ts";
import { DC_REF_ORDER, dcRefColumns, INVOICE_REF_ORDER, invoiceRefColumns } from "./po-list.ts";
import { orEmpty, PO_NUMBER_KEY, PO_NUMBER_SORT } from "./sql.ts";

/** NOT NULL sort values, selected so the keyset cursor holds them (D-0262). */
const keys = { kPoNumber: PO_NUMBER_KEY, kPoDate: orEmpty(po.poDate), kDescription: orEmpty(poItem.description) };

/** One page of PO items with their PO, in `page`'s order, among those `where` keeps. */
export const reportItems = (db: Db, where: SQL | undefined, page: KeysetPage) =>
  db.query(
    db.build
      .select({
        poItemId: poItem.id,
        poId: po.id,
        poNumber: po.poNumber,
        poDate: po.poDate,
        gemcNumber: po.gemcNumber,
        poItemNo: poItem.poItemNo,
        description: poItem.description,
        materialCode: poItem.materialCode,
        unit: poItem.unit,
        ordQty: poItem.ordQty,
        dspQty: poItem.dspQty,
        rcdQty: poItem.rcdQty,
        rejQty: poItem.rejQty,
        balanceQty: poItem.balanceQty,
        ...keys,
      })
      .from(poItem)
      .innerJoin(po, eq(po.id, poItem.poId))
      .where(and(where, page.after))
      .orderBy(...page.orderBy)
      .limit(page.limit),
  );

export type ReportItem = Awaited<ReturnType<typeof reportItems>>[number];

/** A report row: the item's columns without the sort keys and the PO's GEMC number. */
export const reportColumns = ({ kPoNumber: _, kPoDate: __, kDescription: ___, gemcNumber: ____, ...row }: ReportItem) =>
  row;

/** The sort columns of both tabs; PO numbers sort as numbers, as legacy. */
export const REPORT_SORTS = {
  poNumber: PO_NUMBER_SORT,
  poDate: [{ by: keys.kPoDate, field: "kPoDate" }],
  description: [{ by: keys.kDescription, field: "kDescription" }],
  ordQty: [{ by: poItem.ordQty, field: "ordQty" }],
  dspQty: [{ by: poItem.dspQty, field: "dspQty" }],
  rcdQty: [{ by: poItem.rcdQty, field: "rcdQty" }],
  rejQty: [{ by: poItem.rejQty, field: "rejQty" }],
} satisfies Record<string, SortParts<ReportItem>>;

const BY_ITEM_ID = { by: poItem.id, field: "poItemId", dir: "asc" } as const;
const BY_ITEM_NO = { by: poItem.poItemNo, field: "poItemNo", dir: "asc" } as const;

/** PO number as a number, then item number (legacy pending order). */
export const BY_PO_NUMBER: Keyset<ReportItem> = {
  parts: [...PO_NUMBER_SORT.map((p) => ({ ...p, dir: "asc" as const })), BY_ITEM_NO],
  id: BY_ITEM_ID,
};

/** Newest PO date first, then {@link BY_PO_NUMBER} (legacy reconciliation order). */
export const BY_NEWEST_PO: Keyset<ReportItem> = {
  parts: [{ by: keys.kPoDate, field: "kPoDate", dir: "desc" }, ...BY_PO_NUMBER.parts],
  id: BY_ITEM_ID,
};

/**
 * The DCs and invoices with a line on each item, oldest first, and each invoice's GEMC number. Read by item ids,
 * so at most 100 at a time: D1 binds at most 100 parameters to a statement.
 */
export async function itemDocuments(db: Db, poItemIds: readonly string[]) {
  if (poItemIds.length === 0) return { dcs: [], invoices: [] };
  const ids = [...poItemIds];
  const [dcs, invoices] = await Promise.all([
    db.query(
      db.build
        .selectDistinct({ poItemId: dcItem.poItemId, ...dcRefColumns })
        .from(dcItem)
        .innerJoin(dc, eq(dc.id, dcItem.dcId))
        .where(inArray(dcItem.poItemId, ids))
        .orderBy(...DC_REF_ORDER),
    ),
    db.query(
      db.build
        .selectDistinct({ poItemId: invoiceItem.poItemId, ...invoiceRefColumns, gemcNumber: invoice.gemcNumber })
        .from(invoiceItem)
        .innerJoin(invoice, eq(invoice.id, invoiceItem.invoiceId))
        .where(inArray(invoiceItem.poItemId, ids))
        .orderBy(...INVOICE_REF_ORDER),
    ),
  ]);
  return { dcs, invoices };
}

/** The numbers of the POs with these ids, unknown ids left out; at most 100 ids (D1). */
export const poNumbersOf = (db: Db, poIds: readonly string[]) =>
  db.query(
    db.build
      .select({ id: po.id, poNumber: po.poNumber })
      .from(po)
      .where(inArray(po.id, [...poIds])),
  );

/** The destination codes of a PO item's lots, distinct and joined by `,`; null when none has one. */
const lotDestCodes = sql<
  string | null
>`(select group_concat(distinct ${poLot.destCode}) from ${poLot} where ${poLot.poItemId} = ${poItem.id} and trim(${poLot.destCode}) <> '')`;

/**
 * One page of DC lines with their DC, PO item and PO, and the invoice made from the DC (at most one, INV-30) with its
 * line for the DC line, in `page`'s order, among those `where` keeps. Packets are the invoice line's, else the DC
 * line's; the department is the DC's, else the item's lot destination codes (owner 2026-10-16).
 */
export const dispatchLines = (db: Db, where: SQL | undefined, page: KeysetPage) =>
  db.query(
    db.build
      .select({
        dcItemId: dcItem.id,
        dcId: dc.id,
        dcNumber: dc.number,
        dcDate: dc.dcDate,
        createdAt: dc.createdAt,
        departmentNo: sql<string | null>`coalesce(nullif(trim(${dc.departmentNo}), ''), ${lotDestCodes})`,
        dcInvoiceNumber: dc.invoiceNumber,
        poId: po.id,
        poNumber: po.poNumber,
        poGemcNumber: po.gemcNumber,
        poItemNo: poItem.poItemNo,
        description: poItem.description,
        materialCode: poItem.materialCode,
        unit: poItem.unit,
        dspQty: dcItem.dspQty,
        packets: sql<number | null>`coalesce(${invoiceItem.packets}, ${dcItem.packets})`,
        invoiceNumber: invoice.number,
        invoiceGemcNumber: invoice.gemcNumber,
      })
      .from(dcItem)
      .innerJoin(dc, eq(dc.id, dcItem.dcId))
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .innerJoin(po, eq(po.id, poItem.poId))
      .leftJoin(invoice, eq(invoice.dcId, dc.id))
      .leftJoin(invoiceItem, and(eq(invoiceItem.invoiceId, invoice.id), eq(invoiceItem.dcItemId, dcItem.id)))
      .where(and(where, page.after))
      .orderBy(...page.orderBy)
      .limit(page.limit),
  );

export type DispatchLine = Awaited<ReturnType<typeof dispatchLines>>[number];

/** DC date, then the order the DCs were made in (legacy), then each DC's lines by item number. */
export const BY_DISPATCH: Keyset<DispatchLine> = {
  parts: [
    { by: dc.dcDate, field: "dcDate", dir: "asc" },
    { by: dc.createdAt, field: "createdAt", dir: "asc" },
    { by: dc.id, field: "dcId", dir: "asc" },
    { by: poItem.poItemNo, field: "poItemNo", dir: "asc" },
  ],
  id: { by: dcItem.id, field: "dcItemId", dir: "asc" },
};

/** The daily dispatch tab's sort column. */
export const DISPATCH_SORTS = {
  dcDate: [{ by: dc.dcDate, field: "dcDate" }],
} satisfies Record<string, SortParts<DispatchLine>>;

/** The most item ids {@link itemDocuments} takes. */
export const DOCUMENTS_BATCH = 100;
