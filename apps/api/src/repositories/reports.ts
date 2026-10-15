// Report reads (SPEC-13 §4.1): PO item rows for the pending and reconciliation tabs and their exports, one keyset
// page at a time (INV-99), with the stored quantities as they stand (INV-61). Which rows a report keeps is the
// service's (C2).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem } from "@senstosales/db";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { KeyPart, Keyset, KeysetPage, SortParts } from "./keyset.ts";
import { byPoNumber } from "./sql.ts";

/** D1 binds at most 100 parameters to a statement, and a page's documents are read by its item ids. */
export const REPORT_PAGE = 100;

/** NOT NULL sort values, selected so the keyset cursor holds them (D-0262). */
const keys = {
  kPoNumber: sql<number>`${byPoNumber[0]}`,
  kPoDate: sql<string>`COALESCE(${po.poDate}, '')`,
  kDescription: sql<string>`COALESCE(${poItem.description}, '')`,
};

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

/** The sort columns of both tabs; PO numbers sort as numbers, as legacy (`byPoNumber`). */
export const REPORT_SORTS = {
  poNumber: [
    { by: keys.kPoNumber, field: "kPoNumber" },
    { by: po.poNumber, field: "poNumber" },
  ],
  poDate: [{ by: keys.kPoDate, field: "kPoDate" }],
  description: [{ by: keys.kDescription, field: "kDescription" }],
  ordQty: [{ by: poItem.ordQty, field: "ordQty" }],
  dspQty: [{ by: poItem.dspQty, field: "dspQty" }],
  rcdQty: [{ by: poItem.rcdQty, field: "rcdQty" }],
  rejQty: [{ by: poItem.rejQty, field: "rejQty" }],
} satisfies Record<string, SortParts<ReportItem>>;

const asc = (parts: SortParts<ReportItem>): KeyPart<ReportItem>[] => parts.map((p) => ({ ...p, dir: "asc" }));

const BY_ITEM_ID = { by: poItem.id, field: "poItemId", dir: "asc" } as const;

/** PO number as a number, then item number (legacy pending order). */
export const BY_PO_NUMBER: Keyset<ReportItem> = {
  parts: [...asc(REPORT_SORTS.poNumber), { by: poItem.poItemNo, field: "poItemNo", dir: "asc" }],
  id: BY_ITEM_ID,
};

/** Newest PO date first, then {@link BY_PO_NUMBER} (legacy reconciliation order). */
export const BY_NEWEST_PO: Keyset<ReportItem> = {
  parts: [{ by: keys.kPoDate, field: "kPoDate", dir: "desc" }, ...BY_PO_NUMBER.parts],
  id: BY_ITEM_ID,
};

/** The DCs and invoices with a line on each item, oldest first, and each invoice's GEMC number. */
export async function itemDocuments(db: Db, poItemIds: readonly string[]) {
  if (poItemIds.length === 0) return { dcs: [], invoices: [] };
  const [dcs, invoices] = await Promise.all([
    db.query(
      db.build
        .selectDistinct({
          poItemId: dcItem.poItemId,
          id: dc.id,
          number: dc.number,
          date: dc.dcDate,
          financialYear: dc.financialYear,
        })
        .from(dcItem)
        .innerJoin(dc, eq(dc.id, dcItem.dcId))
        .where(inArray(dcItem.poItemId, [...poItemIds]))
        .orderBy(dc.dcDate, dc.id),
    ),
    db.query(
      db.build
        .selectDistinct({
          poItemId: invoiceItem.poItemId,
          id: invoice.id,
          number: invoice.number,
          date: invoice.invoiceDate,
          financialYear: invoice.financialYear,
          gemcNumber: invoice.gemcNumber,
        })
        .from(invoiceItem)
        .innerJoin(invoice, eq(invoice.id, invoiceItem.invoiceId))
        .where(inArray(invoiceItem.poItemId, [...poItemIds]))
        .orderBy(invoice.invoiceDate, invoice.id),
    ),
  ]);
  return { dcs, invoices };
}
