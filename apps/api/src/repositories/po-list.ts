// PO list, stats and detail reads (SPEC-10 §4.1). Plain rows: filters and sorts run in SQL over stored columns,
// including the derived ones; nothing here computes a business value (C2).
import type { Db } from "@senstosales/db";
import { dc, invoice, po, poItem, poLot, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { AnyColumn, SQL, SQLWrapper } from "drizzle-orm";
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { apiColumns, byPoNumber, contains, flagColumns } from "./sql.ts";

type PoListQuery = z.output<(typeof routes)["po.list"]["query"]>;
export type PoFilters = z.output<(typeof routes)["po.stats"]["query"]>;
type SortKey = NonNullable<PoListQuery["sort"]>;

const countOf = (where: SQL) => sql`(SELECT COUNT(*) FROM ${where})`.mapWith(Number);

const openFlagsOf = sql`${reconciliationIssue} WHERE ${reconciliationIssue.poId} = ${po.id} AND ${reconciliationIssue.status} = 'open'`;

/** Live counts per PO (INV-73); every document of the PO, as the legacy list counted them. */
const links = {
  itemCount: countOf(sql`${poItem} WHERE ${poItem.poId} = ${po.id}`),
  dcCount: countOf(sql`${dc} WHERE ${dc.poId} = ${po.id}`),
  invoiceCount: countOf(sql`${invoice} WHERE ${invoice.poId} = ${po.id}`),
  srvCount: countOf(sql`${srv} WHERE ${srv.poId} = ${po.id}`),
  openFlagCount: countOf(openFlagsOf),
};

/** Every PO's id and number, in PO-number order. */
export const allPoRefs = (db: Db) =>
  db.query(
    db.build
      .select({ id: po.id, poNumber: po.poNumber })
      .from(po)
      .orderBy(...byPoNumber),
  );

/** The legacy status order: Pending, then Delivered, then Closed. */
const statusRank = sql`CASE ${po.status} WHEN 'Pending' THEN 1 WHEN 'Delivered' THEN 2 ELSE 3 END`;

const SORTS: Record<SortKey, readonly (AnyColumn | SQLWrapper)[]> = {
  poNumber: byPoNumber,
  poDate: [po.poDate],
  itemCount: [links.itemCount],
  ordQty: [po.ordQty],
  dspQty: [po.dspQty],
  rcdQty: [po.rcdQty],
  rejQty: [po.rejQty],
  poValue: [po.poValue],
  status: [statusRank],
};

/** The Flagged filter: POs with open flags, or POs without. */
function flaggedIs(flagged: boolean): SQL {
  const hasOpenFlags = sql`EXISTS (SELECT 1 FROM ${openFlagsOf})`;
  return flagged ? hasOpenFlags : sql`NOT ${hasOpenFlags}`;
}

/** Text anywhere in one of the PO's item descriptions (owner, 2026-10-15). */
const describedAs = (q: string) =>
  sql`EXISTS (SELECT 1 FROM ${poItem} WHERE ${poItem.poId} = ${po.id} AND ${contains(poItem.description, q)})`;

/**
 * The legacy filter panel: text in the PO or GEMC number or an item description, PO date range, value range (no
 * value = 0).
 */
function where(f: PoFilters): SQL | undefined {
  const value = sql`COALESCE(${po.poValue}, 0)`;
  return and(
    f.q ? or(contains(po.poNumber, f.q), contains(po.gemcNumber, f.q), describedAs(f.q)) : undefined,
    f.from === undefined ? undefined : gte(po.poDate, f.from),
    f.to === undefined ? undefined : lte(po.poDate, f.to),
    f.valueMin === undefined ? undefined : sql`${value} >= ${f.valueMin}`,
    f.valueMax === undefined ? undefined : sql`${value} <= ${f.valueMax}`,
    f.status === undefined ? undefined : eq(po.status, f.status),
    f.flagged === undefined ? undefined : flaggedIs(f.flagged),
    f.gemc === undefined ? undefined : eq(po.isGemc, f.gemc),
  );
}

/** One page; newest PO date first unless a sort is given, then PO date and number descending, as legacy. */
export async function listPos(db: Db, query: PoListQuery) {
  const filter = where(query);
  const dir = query.dir === "desc" ? desc : asc;
  const chosen = query.sort === undefined ? [] : SORTS[query.sort].map((c) => dir(c));
  const tieBreak = [desc(po.poDate), ...byPoNumber.map((c) => desc(c)), desc(po.id)];
  const [items, totals] = await Promise.all([
    db.query(
      db.build
        .select({
          id: po.id,
          poNumber: po.poNumber,
          poDate: po.poDate,
          isGemc: po.isGemc,
          poValue: po.poValue,
          status: po.status,
          ordQty: po.ordQty,
          dspQty: po.dspQty,
          rcdQty: po.rcdQty,
          rejQty: po.rejQty,
          balanceQty: po.balanceQty,
          ...links,
        })
        .from(po)
        .where(filter)
        .orderBy(...chosen, ...tieBreak)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ),
    db.query(db.build.select({ total: count() }).from(po).where(filter)),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

/** The legacy KPI cards over every PO the filters keep (D-0096). */
export async function poStats(db: Db, filters: PoFilters) {
  const rows = await db.query(
    db.build
      .select({
        count: count(),
        poValue: sql`COALESCE(SUM(COALESCE(${po.poValue}, 0)), 0)`.mapWith(po.poValue),
        dspQty: sql`COALESCE(SUM(${po.dspQty}), 0)`.mapWith(po.dspQty),
        rejQty: sql`COALESCE(SUM(${po.rejQty}), 0)`.mapWith(po.rejQty),
      })
      .from(po)
      .where(where(filters)),
  );
  // An aggregate without GROUP BY always returns one row.
  const [row] = rows;
  if (row === undefined) throw new Error("PO stats returned no row");
  return row;
}

/** The stored uninvoiced quantity and cancelled marker of every item of `poIds`. */
export const itemUninvoicedOf = (db: Db, poIds: readonly string[]) =>
  db.query(
    db.build
      .select({ poId: poItem.poId, uninvoicedQty: poItem.uninvoicedQty, cancelledAt: poItem.cancelledAt })
      .from(poItem)
      .where(inArray(poItem.poId, [...poIds])),
  );

export async function findPoRow(db: Db, poId: string) {
  const rows = await db.query(db.build.select(apiColumns(po)).from(po).where(eq(po.id, poId)));
  return rows[0];
}

export const itemsOfPo = (db: Db, poId: string) =>
  db.query(db.build.select(apiColumns(poItem)).from(poItem).where(eq(poItem.poId, poId)).orderBy(poItem.poItemNo));

export const lotsOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select(apiColumns(poLot))
      .from(poLot)
      .innerJoin(poItem, eq(poItem.id, poLot.poItemId))
      .where(eq(poItem.poId, poId))
      .orderBy(poLot.lotNo, poLot.id),
  );

export function openFlagsOfPo(db: Db, poId: string) {
  return db.query(
    db.build
      .select(flagColumns)
      .from(reconciliationIssue)
      .where(and(eq(reconciliationIssue.poId, poId), eq(reconciliationIssue.status, "open")))
      .orderBy(reconciliationIssue.openedAt, reconciliationIssue.id),
  );
}

/** A DC reference as links and popovers show it, with its FY (INV-24); listed oldest first. */
export const dcRefColumns = { id: dc.id, number: dc.number, date: dc.dcDate, financialYear: dc.financialYear };
export const DC_REF_ORDER = [dc.dcDate, dc.id] as const;

/** An invoice reference as links and popovers show it, with its FY (INV-24); listed oldest first. */
export const invoiceRefColumns = {
  id: invoice.id,
  number: invoice.number,
  date: invoice.invoiceDate,
  financialYear: invoice.financialYear,
};
export const INVOICE_REF_ORDER = [invoice.invoiceDate, invoice.id] as const;

export const dcRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select(dcRefColumns)
      .from(dc)
      .where(where)
      .orderBy(...DC_REF_ORDER),
  );

export const invoiceRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select(invoiceRefColumns)
      .from(invoice)
      .where(where)
      .orderBy(...INVOICE_REF_ORDER),
  );

/** SRV references as links and popovers show them, oldest first. */
export const srvRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select({ id: srv.id, number: srv.srvNumber, date: srv.srvDate })
      .from(srv)
      .where(where)
      .orderBy(srv.srvDate, srv.id),
  );

/** The SRVs with a line resolved to `column = id` (INV-37). */
export const srvsResolvedTo = (db: Db, column: AnyColumn, id: string) =>
  inArray(srv.id, db.build.select({ id: srvItem.srvId }).from(srvItem).where(eq(column, id)));

/** Every DC, invoice and SRV of the PO, unpaged, oldest first (INV-73). */
export async function linkedDocsOfPo(db: Db, poId: string) {
  const [dcs, invoices, srvs] = await Promise.all([
    dcRefs(db, eq(dc.poId, poId)),
    invoiceRefs(db, eq(invoice.poId, poId)),
    srvRefs(db, eq(srv.poId, poId)),
  ]);
  return { dcs, invoices, srvs };
}
