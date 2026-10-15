// Global search reads (SPEC-10 §4.1). Each document type is matched in SQL as the legacy search matches it: the
// number from its start, the material code or drawing number from its start or the description anywhere on any of
// its PO items, and party names anywhere. Quantities and values of the hits come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { dc, dcItem, invoice, invoiceItem, po, poItem, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { AnyColumn, SQL, SQLWrapper } from "drizzle-orm";
import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { dcRefs, invoiceRefs, srvRefs, srvsResolvedTo } from "./po-list.ts";
import { asNumber, contains, inRange, startsWith } from "./sql.ts";

export type SearchQuery = z.output<(typeof routes)["search.query"]["query"]>;

/** The search text and the legacy rules for it: digits alone skip party names, one digit also skips items. */
export interface Terms {
  readonly q: string;
  readonly items: boolean;
  readonly numeric: boolean;
}

/** A document's PO items, selecting `field` where `match` holds. */
type ItemSet = (field: SQL, match: SQL | undefined) => SQLWrapper & { limit(n: number): SQLWrapper };

const itemFieldMatches = (q: string) =>
  or(startsWith(poItem.materialCode, q), contains(poItem.description, q), startsWith(poItem.drawingNo, q));

const anyItemMatches = (t: Terms, items: ItemSet) =>
  t.items ? exists(items(sql`1`, itemFieldMatches(t.q))) : undefined;

/** The lowest-numbered matching item's field, to show what matched: code, then drawing number, then description. */
const matchedItemText = (t: Terms, items: ItemSet) => {
  const text = sql`CASE WHEN ${startsWith(poItem.materialCode, t.q)} THEN ${poItem.materialCode}
    WHEN ${startsWith(poItem.drawingNo, t.q)} THEN ${poItem.drawingNo} ELSE ${poItem.description} END`;
  return t.items ? sql<string | null>`${items(text, itemFieldMatches(t.q)).limit(1)}` : sql<string | null>`NULL`;
};

/** An open flag on one of the document's lines (`lineIds`). */
const lineFlag = (db: Db, scope: "dc_item" | "invoice_item" | "srv_item", lineIds: SQLWrapper) =>
  hasOpenFlag(db, and(eq(reconciliationIssue.scopeType, scope), inArray(reconciliationIssue.scopeId, lineIds)));

function hasOpenFlag(db: Db, where: SQL | undefined) {
  const flags = db.build
    .select({ one: sql`1` })
    .from(reconciliationIssue)
    .where(and(eq(reconciliationIssue.status, "open"), where));
  return sql`${exists(flags)}`.mapWith((v) => v === 1);
}

/** Exact number first, then numbers that start with the text, then other matches; higher numbers first within each. */
const ranked = (t: Terms, number: AnyColumn) => [
  sql`CASE WHEN ${number} = ${t.q} THEN 0 WHEN ${startsWith(number, t.q)} THEN 1 ELSE 2 END`,
  desc(asNumber(number)),
  desc(number),
];

const valued = (column: AnyColumn, f: SearchQuery) =>
  and(
    f.valueMin === undefined ? undefined : sql`COALESCE(${column}, 0) >= ${f.valueMin}`,
    f.valueMax === undefined ? undefined : sql`COALESCE(${column}, 0) <= ${f.valueMax}`,
  );

/** The PO a DC, invoice or SRV belongs to, as its link shows it. */
const poRef = { id: po.id, number: po.poNumber, date: po.poDate };

export function searchPos(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items: ItemSet = (field, match) =>
    db.build
      .select({ field })
      .from(poItem)
      .where(and(eq(poItem.poId, po.id), match))
      .orderBy(poItem.poItemNo);
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
        hasFlags: hasOpenFlag(db, eq(reconciliationIssue.poId, po.id)),
      })
      .from(po)
      .where(
        and(or(startsWith(po.poNumber, t.q), anyItemMatches(t, items)), inRange(po.poDate, f), valued(po.poValue, f)),
      )
      .orderBy(...ranked(t, po.poNumber), po.id)
      .limit(limit),
  );
}

/** DCs match on the consignee too; the legacy search applies no value range to them. */
export function searchDcs(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items: ItemSet = (field, match) =>
    db.build
      .select({ field })
      .from(dcItem)
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .where(and(eq(dcItem.dcId, dc.id), match))
      .orderBy(poItem.poItemNo);
  const lineIds = db.build.select({ id: dcItem.id }).from(dcItem).where(eq(dcItem.dcId, dc.id));
  return db.query(
    db.build
      .select({
        id: dc.id,
        number: dc.number,
        date: dc.dcDate,
        financialYear: dc.financialYear,
        party: dc.consigneeName,
        po: poRef,
        itemMatch: matchedItemText(t, items),
        hasFlags: lineFlag(db, "dc_item", lineIds),
      })
      .from(dc)
      .innerJoin(po, eq(po.id, dc.poId))
      .where(
        and(
          or(
            startsWith(dc.number, t.q),
            anyItemMatches(t, items),
            t.numeric ? undefined : contains(dc.consigneeName, t.q),
          ),
          inRange(dc.dcDate, f),
        ),
      )
      .orderBy(...ranked(t, dc.number), desc(dc.dcDate), dc.id)
      .limit(limit),
  );
}

export function searchInvoices(db: Db, t: Terms, f: SearchQuery, limit: number) {
  const items: ItemSet = (field, match) =>
    db.build
      .select({ field })
      .from(invoiceItem)
      .innerJoin(poItem, eq(poItem.id, invoiceItem.poItemId))
      .where(and(eq(invoiceItem.invoiceId, invoice.id), match))
      .orderBy(poItem.poItemNo);
  const lineIds = db.build
    .select({ id: invoiceItem.id })
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, invoice.id));
  return db.query(
    db.build
      .select({
        id: invoice.id,
        number: invoice.number,
        date: invoice.invoiceDate,
        financialYear: invoice.financialYear,
        party: invoice.buyerName,
        po: poRef,
        dcId: invoice.dcId,
        value: invoice.total,
        itemMatch: matchedItemText(t, items),
        hasFlags: lineFlag(db, "invoice_item", lineIds),
      })
      .from(invoice)
      .innerJoin(po, eq(po.id, invoice.poId))
      .where(
        and(
          or(
            startsWith(invoice.number, t.q),
            anyItemMatches(t, items),
            t.numeric ? undefined : contains(invoice.buyerName, t.q),
          ),
          inRange(invoice.invoiceDate, f),
          valued(invoice.total, f),
        ),
      )
      .orderBy(...ranked(t, invoice.number), desc(invoice.invoiceDate), invoice.id)
      .limit(limit),
  );
}

/** SRVs match on their PO number too; their value range is applied by the service to the domain totals. */
export function searchSrvs(db: Db, t: Terms, f: SearchQuery, limit: number | undefined) {
  const items: ItemSet = (field, match) =>
    db.build
      .select({ field })
      .from(srvItem)
      .innerJoin(poItem, eq(poItem.id, srvItem.poItemId))
      .where(and(eq(srvItem.srvId, srv.id), match))
      .orderBy(poItem.poItemNo);
  const lineIds = db.build.select({ id: srvItem.id }).from(srvItem).where(eq(srvItem.srvId, srv.id));
  const query = db.build
    .select({
      id: srv.id,
      number: srv.srvNumber,
      date: srv.srvDate,
      poNumber: srv.poNumber,
      // Null for an SRV of a PO not in the system (INV-40).
      po: poRef,
      itemMatch: matchedItemText(t, items),
      hasFlags: lineFlag(db, "srv_item", lineIds),
    })
    .from(srv)
    .leftJoin(po, eq(po.id, srv.poId))
    .where(
      and(
        or(
          startsWith(srv.srvNumber, t.q),
          t.numeric ? startsWith(srv.poNumber, t.q) : contains(srv.poNumber, t.q),
          anyItemMatches(t, items),
        ),
        inRange(srv.srvDate, f),
      ),
    )
    .orderBy(...ranked(t, srv.srvNumber), desc(srv.srvDate), srv.id);
  return db.query(limit === undefined ? query : query.limit(limit));
}

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
    srvRefs(db, srvsResolvedTo(db, srvItem.resolvedDcId, dcId)),
  ]);

/** An invoice's line quantities, its DC and the SRVs resolved to it. */
export const invoiceExtras = (db: Db, invoiceId: string, dcId: string | null) =>
  Promise.all([
    db.query(db.build.select({ qty: invoiceItem.qty }).from(invoiceItem).where(eq(invoiceItem.invoiceId, invoiceId))),
    dcId === null ? Promise.resolve([]) : dcRefs(db, eq(dc.id, dcId)),
    srvRefs(db, srvsResolvedTo(db, srvItem.resolvedInvoiceId, invoiceId)),
  ]);

/** The lines of `srvIds` with their matched PO item, for the domain totals, in one query. */
export const srvLinesOf = (db: Db, srvIds: readonly string[]) =>
  db.query(
    db.build
      .select({
        srvId: srvItem.srvId,
        rcdQty: srvItem.rcdQty,
        acceptedQty: srvItem.acceptedQty,
        rejQty: srvItem.rejQty,
        poItem: { id: poItem.id, ordQty: poItem.ordQty, rate: poItem.rate },
      })
      .from(srvItem)
      .leftJoin(poItem, eq(poItem.id, srvItem.poItemId))
      .where(inArray(srvItem.srvId, [...srvIds])),
  );

/** The DCs and invoices an SRV's lines resolved to (INV-37). */
export const srvLinks = (db: Db, srvId: string) => {
  const resolved = (column: typeof srvItem.resolvedDcId | typeof srvItem.resolvedInvoiceId) =>
    db.build.select({ id: column }).from(srvItem).where(eq(srvItem.srvId, srvId));
  return Promise.all([
    dcRefs(db, inArray(dc.id, resolved(srvItem.resolvedDcId))),
    invoiceRefs(db, inArray(invoice.id, resolved(srvItem.resolvedInvoiceId))),
  ]);
};
