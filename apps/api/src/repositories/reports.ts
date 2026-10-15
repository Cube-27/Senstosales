// Report reads (SPEC-13 §4.1): PO item rows for the pending and reconciliation tabs and their exports, one keyset
// page at a time (INV-99), with the stored quantities as they stand (INV-61).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem } from "@senstosales/db";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray } from "drizzle-orm";

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
  db.query(db.build.select({ id: po.id, poNumber: po.poNumber }).from(po).where(inArray(po.id, [...poIds])));

/** The most item ids {@link itemDocuments} takes. */
export const DOCUMENTS_BATCH = 100;
