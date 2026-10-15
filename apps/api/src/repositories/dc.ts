// DC rows (ARCHITECTURE §8.2) and the DC list, detail and delete reads (SPEC-11 §2). Plain rows: the filters that
// need no business value run in SQL; the list totals come from the domain in the service (C2).
import type { Db, Statement } from "@senstosales/db";
import { dc, dcItem, invoice, po, poItem, reconciliationIssue, srvItem, UniqueViolation } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, count, eq, exists, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { srvRefs, srvsResolvedTo } from "./po-list.ts";
import { apiColumns, contains, flagColumns, inBatches } from "./sql.ts";

/** The filters of the DC list and its stats; the value range is applied to the totals by the service. */
export type DcFilters = z.output<(typeof routes)["dc.stats"]["query"]>;

/** Every DC line on the PO's items. */
export const dcLinesOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({
        id: dcItem.id,
        dcId: dcItem.dcId,
        poItemId: dcItem.poItemId,
        dspQty: dcItem.dspQty,
        createdAt: dcItem.createdAt,
      })
      .from(dcItem)
      .innerJoin(dc, eq(dc.id, dcItem.dcId))
      .where(eq(dc.poId, poId))
      .orderBy(dcItem.id),
  );

/** The supplier's DC numbers and dates, which SRV challan numbers resolve against (INV-37). */
export const dcNumbersOf = (db: Db, supplierId: string) =>
  db.query(
    db.build.select({ id: dc.id, number: dc.number, date: dc.dcDate }).from(dc).where(eq(dc.supplierId, supplierId)),
  );

/** The supplier's DCs with one of these numbers, in every FY: the candidates SRV links resolve against (INV-37). */
export const dcsNumbered = (db: Db, supplierId: string, numbers: readonly string[]) =>
  db.query(
    db.build
      .select({ id: dc.id, number: dc.number, date: dc.dcDate, financialYear: dc.financialYear })
      .from(dc)
      .where(and(eq(dc.supplierId, supplierId), inArray(dc.number, [...numbers]))),
  );

export async function findDc(db: Db, id: string) {
  const rows = await db.query(db.build.select(apiColumns(dc)).from(dc).where(eq(dc.id, id)));
  return rows[0];
}

/**
 * The DC with its PO's reference and version, in one read. A delete that commits after this read bumps that version,
 * so a batch guarded on it fails instead of writing for a DC that is gone (EC-25).
 */
export async function findDcWithPo(db: Db, id: string) {
  const rows = await db.query(
    db.build
      .select({
        dc: apiColumns(dc),
        po: { id: po.id, poNumber: po.poNumber, poDate: po.poDate, isGemc: po.isGemc },
        poVersion: po.version,
      })
      .from(dc)
      .innerJoin(po, eq(po.id, dc.poId))
      .where(eq(dc.id, id)),
  );
  return rows[0];
}

/** Whether a refused DC insert collided on a per-FY DC or GC number (INV-22, INV-26). */
export const isNumberCollision = (err: unknown): boolean =>
  err instanceof UniqueViolation &&
  ["dc.supplier_id, dc.number, dc.financial_year", "dc.supplier_id, dc.gc_number, dc.financial_year"].includes(
    err.target,
  );

/** The legacy filter panel: text in the DC number, PO number or consignee, DC date range. */
export const dcListWhere = (f: DcFilters) =>
  and(
    f.q ? or(contains(dc.number, f.q), contains(po.poNumber, f.q), contains(dc.consigneeName, f.q)) : undefined,
    f.from === undefined ? undefined : gte(dc.dcDate, f.from),
    f.to === undefined ? undefined : lte(dc.dcDate, f.to),
  );

/** Every line of every DC the filters keep, with its DC, its PO number and its PO item's quantities and rate. */
export const dcListLines = (db: Db, filters: DcFilters) =>
  db.query(
    db.build
      .select({
        id: dc.id,
        number: dc.number,
        dcDate: dc.dcDate,
        financialYear: dc.financialYear,
        poId: dc.poId,
        poNumber: po.poNumber,
        dspQty: dcItem.dspQty,
        ordQty: poItem.ordQty,
        rcdQty: poItem.rcdQty,
        rate: poItem.rate,
      })
      .from(dc)
      .innerJoin(po, eq(po.id, dc.poId))
      .innerJoin(dcItem, eq(dcItem.dcId, dc.id))
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .where(dcListWhere(filters)),
  );

/** The invoice of each of these DCs that has one (INV-28), by DC. */
export async function invoicesOfDcs(db: Db, dcIds: readonly string[]) {
  const rows = await db.query(
    db.build
      .select({
        dcId: invoice.dcId,
        id: invoice.id,
        number: invoice.number,
        date: invoice.invoiceDate,
        financialYear: invoice.financialYear,
      })
      .from(invoice)
      .where(inArray(invoice.dcId, [...dcIds])),
  );
  return new Map(rows.map(({ dcId, ...ref }) => [dcId, ref]));
}

/** How many open flags each of these DCs' lines carry, by DC; a DC without one is absent. */
export async function openFlagCountsOfDcs(db: Db, dcIds: readonly string[]) {
  const counts = await inBatches(
    dcIds,
    (ids) =>
      db.query(
        db.build
          .select({ dcId: dcItem.dcId, count: count() })
          .from(reconciliationIssue)
          .innerJoin(dcItem, eq(dcItem.id, reconciliationIssue.scopeId))
          .where(
            and(
              eq(reconciliationIssue.scopeType, "dc_item"),
              eq(reconciliationIssue.status, "open"),
              inArray(dcItem.dcId, ids),
            ),
          )
          .groupBy(dcItem.dcId),
      ),
    // The scope type and status.
    2,
  );
  return new Map(counts.map((row) => [row.dcId, row.count]));
}

/** The open flags on the DC's lines (DOC_ON_CANCELLED_ITEM); flags on its PO items show on the PO. */
export const openFlagsOfDc = (db: Db, dcId: string) =>
  db.query(
    db.build
      .select(flagColumns)
      .from(reconciliationIssue)
      .where(
        and(
          eq(reconciliationIssue.scopeType, "dc_item"),
          inArray(
            reconciliationIssue.scopeId,
            db.build.select({ id: dcItem.id }).from(dcItem).where(eq(dcItem.dcId, dcId)),
          ),
          eq(reconciliationIssue.status, "open"),
        ),
      )
      .orderBy(reconciliationIssue.openedAt, reconciliationIssue.id),
  );

/** The DC's lines with the PO item columns a document line shows, in item order. */
export const itemsOfDc = (db: Db, dcId: string) =>
  db.query(
    db.build
      .select({
        ...apiColumns(dcItem),
        poItemNo: poItem.poItemNo,
        materialCode: poItem.materialCode,
        description: poItem.description,
        drawingNo: poItem.drawingNo,
        unit: poItem.unit,
        rate: poItem.rate,
      })
      .from(dcItem)
      .innerJoin(poItem, eq(poItem.id, dcItem.poItemId))
      .where(eq(dcItem.dcId, dcId))
      .orderBy(poItem.poItemNo, dcItem.id),
  );

/** The SRVs with an item linked to the DC (INV-37). */
export const srvsOfDc = (db: Db, dcId: string) => srvRefs(db, srvsResolvedTo(db, srvItem.resolvedDcId, dcId));

/** The backward links that block a DC delete (INV-35): its invoice, and the SRV items linked to it. */
const blockingLinks = (db: Db, dcId: string) => ({
  invoices: exists(
    db.build
      .select({ one: sql`1` })
      .from(invoice)
      .where(eq(invoice.dcId, dcId)),
  ),
  srvItems: exists(
    db.build
      .select({ one: sql`1` })
      .from(srvItem)
      .where(eq(srvItem.resolvedDcId, dcId)),
  ),
});

/** Whether each kind of link that blocks a delete exists, as a count of 0 or 1 (INV-35). */
export async function deleteLinksOfDc(db: Db, dcId: string) {
  const { invoices, srvItems } = blockingLinks(db, dcId);
  const rows = await db.query(
    db.build
      .select({
        invoices: sql<number>`${invoices}`.mapWith(Number),
        srvItems: sql<number>`${srvItems}`.mapWith(Number),
      })
      .from(dc)
      .where(eq(dc.id, dcId)),
  );
  return rows[0] ?? { invoices: 0, srvItems: 0 };
}

/**
 * Fails its batch (stale `dc`, D-0124) when an invoice or an SRV item links the DC by the time the batch runs: a
 * delete built from a read without links must not remove a DC that gained one before the commit (INV-35).
 */
export const stillUnlinked = (db: Db, dcId: string): Statement => {
  const { invoices, srvItems } = blockingLinks(db, dcId);
  return db.build
    .update(dc)
    .set({ version: sql`CASE WHEN ${or(invoices, srvItems)} THEN NULL ELSE ${dc.version} END` })
    .where(eq(dc.id, dcId));
};
