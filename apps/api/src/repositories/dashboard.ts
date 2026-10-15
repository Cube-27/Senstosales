// Dashboard reads (SPEC-10 §4.1). Plain rows and sums of stored columns; the period start, lead time and values come
// from the domain in the service (C2). `start` null means all time.
import type { Db } from "@senstosales/db";
import { auditLog, dc, invoice, invoiceItem, po, poItem, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import type { AnyColumn, SQLWrapper } from "drizzle-orm";
import { and, count, desc, eq, gte, inArray, isNotNull, min, notExists, sql } from "drizzle-orm";

const from = (column: SQLWrapper, start: IsoDate | null) => (start === null ? undefined : gte(column, start));

const sumOf = <C extends AnyColumn>(column: C) => sql<C["_"]["data"]>`COALESCE(SUM(${column}), 0)`.mapWith(column);

/** One aggregate row; an aggregate without GROUP BY always returns one. */
async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (row === undefined) throw new Error("Dashboard aggregate returned no row");
  return row;
}

/** The PO value and the ordered and dispatched totals of the POs dated in the period. */
export const poTotals = (db: Db, start: IsoDate | null) =>
  one(
    db.query(
      db.build
        .select({ poValue: sumOf(po.poValue), ordQty: sumOf(po.ordQty), dspQty: sumOf(po.dspQty) })
        .from(po)
        .where(from(po.poDate, start)),
    ),
  );

/** The invoiced value of the invoices dated in the period. */
export const invoicedValue = (db: Db, start: IsoDate | null) =>
  one(
    db.query(
      db.build
        .select({ total: sumOf(invoice.total) })
        .from(invoice)
        .where(from(invoice.invoiceDate, start)),
    ),
  );

/** The invoiced quantity of the invoices dated in the period. */
export const invoicedQty = (db: Db, start: IsoDate | null) =>
  one(
    db.query(
      db.build
        .select({ qty: sumOf(invoiceItem.qty) })
        .from(invoiceItem)
        .innerJoin(invoice, eq(invoice.id, invoiceItem.invoiceId))
        .where(from(invoice.invoiceDate, start)),
    ),
  );

/** The lines of the SRVs dated in the period. */
export const srvLinesFrom = (db: Db, start: IsoDate | null) =>
  db.query(
    db.build
      .select({ rcdQty: srvItem.rcdQty, acceptedQty: srvItem.acceptedQty, rejQty: srvItem.rejQty })
      .from(srvItem)
      .innerJoin(srv, eq(srv.id, srvItem.srvId))
      .where(from(srv.srvDate, start)),
  );

/** The balance and rate of every item of the POs dated in the period. */
export const itemBalances = (db: Db, start: IsoDate | null) =>
  db.query(
    db.build
      .select({ balanceQty: poItem.balanceQty, rate: poItem.rate })
      .from(poItem)
      .innerJoin(po, eq(po.id, poItem.poId))
      .where(from(po.poDate, start)),
  );

/** Each dated PO of the period that has an SRV, with its first SRV date. */
export const firstSrvDates = (db: Db, start: IsoDate | null) =>
  db.query(
    db.build
      .select({ poDate: po.poDate, firstSrvDate: min(srv.srvDate) })
      .from(po)
      .innerJoin(srv, eq(srv.poId, po.id))
      .where(and(isNotNull(po.poDate), from(po.poDate, start)))
      .groupBy(po.id),
  );

/** DCs that wait for an invoice. */
export const uninvoicedDcCount = (db: Db) =>
  one(
    db.query(
      db.build
        .select({ count: count() })
        .from(dc)
        .where(
          notExists(
            db.build
              .select({ one: sql`1` })
              .from(invoice)
              .where(eq(invoice.dcId, dc.id)),
          ),
        ),
    ),
  );

export const openFlagCount = (db: Db) =>
  one(
    db.query(
      db.build.select({ count: count() }).from(reconciliationIssue).where(eq(reconciliationIssue.status, "open")),
    ),
  );

/** The POs, DCs and invoices that entered the system last, `limit` of each, newest first. */
export async function latestDocuments(db: Db, limit: number) {
  // A PO enters the system with its first ingest or manual create; that audit row holds the time.
  const poCreatedAt = min(auditLog.at);
  const poEntered = and(
    eq(auditLog.entityType, "po"),
    eq(auditLog.entityId, po.id),
    inArray(auditLog.action, ["po.ingest", "po.create"]),
  );
  const [pos, dcs, invoices] = await Promise.all([
    db.query(
      db.build
        .select({
          id: po.id,
          number: po.poNumber,
          date: po.poDate,
          createdAt: sql`${poCreatedAt}`.mapWith(auditLog.at),
        })
        .from(po)
        .innerJoin(auditLog, poEntered)
        .groupBy(po.id)
        .orderBy(desc(poCreatedAt))
        .limit(limit),
    ),
    db.query(
      db.build
        .select({ id: dc.id, number: dc.number, date: dc.dcDate, createdAt: dc.createdAt })
        .from(dc)
        .orderBy(desc(dc.createdAt))
        .limit(limit),
    ),
    db.query(
      db.build
        .select({ id: invoice.id, number: invoice.number, date: invoice.invoiceDate, createdAt: invoice.createdAt })
        .from(invoice)
        .orderBy(desc(invoice.createdAt))
        .limit(limit),
    ),
  ]);
  return { pos, dcs, invoices };
}
