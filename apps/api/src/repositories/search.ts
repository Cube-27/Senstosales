// Global search reads (SPEC-10 §4.1). Each document type is matched in SQL as the legacy search matches it: the
// number from its start, the material code or drawing number from its start or the description anywhere on any of
// its PO items, and party names anywhere. Quantities and values of the hits come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { AnyColumn, SQL } from "drizzle-orm";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { contains, qualified, startsWith } from "./sql.ts";

export type SearchQuery = z.output<(typeof routes)["search.query"]["query"]>;

/** The search text and the legacy rules for it: digits alone skip party names, one digit also skips items. */
export interface Terms {
  readonly q: string;
  readonly items: boolean;
  readonly party: boolean;
  readonly numeric: boolean;
}

/** A document's PO items, as a FROM clause that joins `po_item` and a condition tying it to the document row. */
interface ItemSet {
  readonly from: SQL;
  readonly where: SQL;
}

const itemFieldMatches = (q: string) =>
  or(startsWith(poItem.materialCode, q), contains(poItem.description, q), startsWith(poItem.drawingNo, q));

const anyItemMatches = (t: Terms, items: ItemSet) =>
  t.items ? sql`EXISTS (SELECT 1 FROM ${items.from} WHERE ${items.where} AND ${itemFieldMatches(t.q)})` : undefined;

/** The first matching item field, to show what matched: code, then drawing number, then description. */
const matchedItemText = (t: Terms, items: ItemSet) =>
  t.items
    ? sql<
        string | null
      >`(SELECT CASE WHEN ${startsWith(poItem.materialCode, t.q)} THEN ${qualified(poItem.materialCode)}
        WHEN ${startsWith(poItem.drawingNo, t.q)} THEN ${qualified(poItem.drawingNo)} ELSE ${qualified(poItem.description)} END
        FROM ${items.from} WHERE ${items.where} AND ${itemFieldMatches(t.q)} LIMIT 1)`
    : sql<string | null>`NULL`;

const hasOpenFlag = (where: SQL) =>
  sql`EXISTS (SELECT 1 FROM ${reconciliationIssue} WHERE ${qualified(reconciliationIssue.status)} = 'open' AND ${where})`.mapWith(
    (v) => v === 1,
  );

/** An open flag on one of the document's lines. */
const lineFlag = (scope: "dc_item" | "invoice_item" | "srv_item", lineIds: SQL) =>
  hasOpenFlag(
    sql`${qualified(reconciliationIssue.scopeType)} = ${scope} AND ${qualified(reconciliationIssue.scopeId)} IN (${lineIds})`,
  );

/** Exact number first, then numbers that start with the text, then other matches; higher numbers first within each. */
const ranked = (t: Terms, number: AnyColumn) => [
  sql`CASE WHEN ${number} = ${t.q} THEN 0 WHEN ${startsWith(number, t.q)} THEN 1 ELSE 2 END`,
  desc(sql`CAST(${number} AS INTEGER)`),
  desc(number),
];

const dated = (column: AnyColumn, f: SearchQuery) =>
  and(f.from === undefined ? undefined : gte(column, f.from), f.to === undefined ? undefined : lte(column, f.to));

const valued = (column: AnyColumn, f: SearchQuery) =>
  and(
    f.valueMin === undefined ? undefined : sql`COALESCE(${column}, 0) >= ${f.valueMin}`,
    f.valueMax === undefined ? undefined : sql`COALESCE(${column}, 0) <= ${f.valueMax}`,
  );

export function searchPos(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items = { from: sql`${poItem}`, where: sql`${poItem.poId} = ${po.id}` };
  return db.query(
    db.build
      .select({
        id: po.id,
        number: po.poNumber,
        date: po.poDate,
        status: po.status,
        qty: po.ordQty,
        value: po.poValue,
        itemMatch: matchedItemText(t, items),
        hasFlags: hasOpenFlag(sql`${qualified(reconciliationIssue.poId)} = ${qualified(po.id)}`),
      })
      .from(po)
      .where(
        and(or(startsWith(po.poNumber, t.q), anyItemMatches(t, items)), dated(po.poDate, f), valued(po.poValue, f)),
      )
      .orderBy(...ranked(t, po.poNumber), po.id)
      .limit(limit),
  );
}

/** DCs match on the consignee too; the legacy search applies no value range to them. */
export function searchDcs(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items = {
    from: sql`${dcItem} INNER JOIN ${poItem} ON ${poItem.id} = ${dcItem.poItemId}`,
    where: sql`${dcItem.dcId} = ${dc.id}`,
  };
  return db.query(
    db.build
      .select({
        id: dc.id,
        number: dc.number,
        date: dc.dcDate,
        financialYear: dc.financialYear,
        party: dc.consigneeName,
        poId: dc.poId,
        itemMatch: matchedItemText(t, items),
        hasFlags: lineFlag(
          "dc_item",
          sql`SELECT ${qualified(dcItem.id)} FROM ${dcItem} WHERE ${qualified(dcItem.dcId)} = ${qualified(dc.id)}`,
        ),
      })
      .from(dc)
      .where(
        and(
          or(
            startsWith(dc.number, t.q),
            anyItemMatches(t, items),
            t.party ? contains(dc.consigneeName, t.q) : undefined,
          ),
          dated(dc.dcDate, f),
        ),
      )
      .orderBy(...ranked(t, dc.number), desc(dc.dcDate), dc.id)
      .limit(limit),
  );
}

export function searchInvoices(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items = {
    from: sql`${invoiceItem} INNER JOIN ${poItem} ON ${poItem.id} = ${invoiceItem.poItemId}`,
    where: sql`${invoiceItem.invoiceId} = ${invoice.id}`,
  };
  return db.query(
    db.build
      .select({
        id: invoice.id,
        number: invoice.number,
        date: invoice.invoiceDate,
        financialYear: invoice.financialYear,
        party: invoice.buyerName,
        poId: invoice.poId,
        dcId: invoice.dcId,
        value: invoice.total,
        itemMatch: matchedItemText(t, items),
        hasFlags: lineFlag(
          "invoice_item",
          sql`SELECT ${qualified(invoiceItem.id)} FROM ${invoiceItem} WHERE ${qualified(invoiceItem.invoiceId)} = ${qualified(invoice.id)}`,
        ),
      })
      .from(invoice)
      .where(
        and(
          or(
            startsWith(invoice.number, t.q),
            anyItemMatches(t, items),
            t.party ? contains(invoice.buyerName, t.q) : undefined,
          ),
          dated(invoice.invoiceDate, f),
          valued(invoice.total, f),
        ),
      )
      .orderBy(...ranked(t, invoice.number), desc(invoice.invoiceDate), invoice.id)
      .limit(limit),
  );
}

/** SRVs match on their PO number too; their value range is applied by the service to the domain totals. */
export function searchSrvs(db: Db, t: Terms, f: SearchQuery, limit: number | undefined) {
  const items = {
    from: sql`${srvItem} INNER JOIN ${poItem} ON ${poItem.id} = ${srvItem.poItemId}`,
    where: sql`${srvItem.srvId} = ${srv.id}`,
  };
  const query = db.build
    .select({
      id: srv.id,
      number: srv.srvNumber,
      date: srv.srvDate,
      poId: srv.poId,
      poNumber: srv.poNumber,
      itemMatch: matchedItemText(t, items),
      hasFlags: lineFlag(
        "srv_item",
        sql`SELECT ${qualified(srvItem.id)} FROM ${srvItem} WHERE ${qualified(srvItem.srvId)} = ${qualified(srv.id)}`,
      ),
    })
    .from(srv)
    .where(
      and(
        or(
          startsWith(srv.srvNumber, t.q),
          t.numeric ? startsWith(srv.poNumber, t.q) : contains(srv.poNumber, t.q),
          anyItemMatches(t, items),
        ),
        dated(srv.srvDate, f),
      ),
    )
    .orderBy(...ranked(t, srv.srvNumber), desc(srv.srvDate), srv.id);
  return db.query(limit === undefined ? query : query.limit(limit));
}

export const poRef = async (db: Db, poId: string) =>
  (
    await db.query(db.build.select({ id: po.id, number: po.poNumber, date: po.poDate }).from(po).where(eq(po.id, poId)))
  )[0];

const dcRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select({ id: dc.id, number: dc.number, date: dc.dcDate, financialYear: dc.financialYear })
      .from(dc)
      .where(where)
      .orderBy(dc.dcDate, dc.id),
  );

const invoiceRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select({
        id: invoice.id,
        number: invoice.number,
        date: invoice.invoiceDate,
        financialYear: invoice.financialYear,
      })
      .from(invoice)
      .where(where)
      .orderBy(invoice.invoiceDate, invoice.id),
  );

const srvRefs = (db: Db, where: SQL | undefined) =>
  db.query(
    db.build
      .select({ id: srv.id, number: srv.srvNumber, date: srv.srvDate })
      .from(srv)
      .where(where)
      .orderBy(srv.srvDate, srv.id),
  );

/** The SRVs with a line resolved to `column = id` (INV-37). */
const srvsResolvedTo = (column: AnyColumn, id: string) =>
  sql`${srv.id} IN (SELECT ${srvItem.srvId} FROM ${srvItem} WHERE ${column} = ${id})`;

/** A DC's lines with their PO item rate, its invoice and the SRVs resolved to it. */
export const dcExtras = (db: Db, dcId: string) =>
  Promise.all([
    db.query(
      db.build
        .select({ qty: dcItem.dspQty, rate: poItem.rate })
        .from(dcItem)
        .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
        .where(eq(dcItem.dcId, dcId)),
    ),
    invoiceRefs(db, eq(invoice.dcId, dcId)),
    srvRefs(db, srvsResolvedTo(srvItem.resolvedDcId, dcId)),
  ]);

/** An invoice's line quantities, its DC and the SRVs resolved to it. */
export const invoiceExtras = (db: Db, invoiceId: string, dcId: string | null) =>
  Promise.all([
    db.query(db.build.select({ qty: invoiceItem.qty }).from(invoiceItem).where(eq(invoiceItem.invoiceId, invoiceId))),
    dcId === null ? Promise.resolve([]) : dcRefs(db, eq(dc.id, dcId)),
    srvRefs(db, srvsResolvedTo(srvItem.resolvedInvoiceId, invoiceId)),
  ]);

/** An SRV's lines with their matched PO item, and the DCs and invoices its lines resolved to. */
export const srvExtras = (db: Db, srvId: string) => {
  const resolvedTo = (target: AnyColumn, column: AnyColumn) =>
    sql`${target} IN (SELECT ${column} FROM ${srvItem} WHERE ${srvItem.srvId} = ${srvId})`;
  return Promise.all([
    db.query(
      db.build
        .select({
          rcdQty: srvItem.rcdQty,
          acceptedQty: srvItem.acceptedQty,
          rejQty: srvItem.rejQty,
          poItem: { id: poItem.id, ordQty: poItem.ordQty, rate: poItem.rate },
        })
        .from(srvItem)
        .leftJoin(poItem, eq(poItem.id, srvItem.poItemId))
        .where(eq(srvItem.srvId, srvId)),
    ),
    dcRefs(db, resolvedTo(dc.id, srvItem.resolvedDcId)),
    invoiceRefs(db, resolvedTo(invoice.id, srvItem.resolvedInvoiceId)),
  ]);
};
