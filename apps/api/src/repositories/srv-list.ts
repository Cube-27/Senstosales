// SRV list, detail and delete reads (SPEC-10 §4.1). Plain rows: the filters that need no business value run in SQL;
// the SRV totals come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { po, poItem, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { and, eq, exists, getTableColumns, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

/** The filters of both SRV views; the value range is applied to the totals by the service. */
export type SrvFilters = z.output<(typeof routes)["srv.stats"]["query"]>;

/** `LIKE` on the text as typed: `%` and `_` match themselves. */
const contains = (column: SQLWrapper, text: string) =>
  sql`${column} LIKE ${`%${text.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'`;

/** The legacy filter panel: text in the SRV, PO or invoice number, SRV date range, one PO. */
function where(db: Db, f: SrvFilters): SQL | undefined {
  const invoiceNo = (q: string) =>
    exists(
      db.build
        .select({ one: sql`1` })
        .from(srvItem)
        .where(and(eq(srvItem.srvId, srv.id), contains(srvItem.invoiceNo, q))),
    );
  return and(
    f.q ? or(contains(srv.srvNumber, f.q), contains(srv.poNumber, f.q), invoiceNo(f.q)) : undefined,
    f.from === undefined ? undefined : gte(srv.srvDate, f.from),
    f.to === undefined ? undefined : lte(srv.srvDate, f.to),
    f.poNumber === undefined ? undefined : eq(srv.poNumber, f.poNumber),
  );
}

/**
 * Every line of every SRV the filters keep, with its SRV, the stored PO's ordered total and the matched PO item's
 * ordered quantity and rate (both `null` when unmatched or the PO is not in the system, INV-40).
 */
export const srvListLines = (db: Db, filters: SrvFilters) =>
  db.query(
    db.build
      .select({
        id: srv.id,
        srvNumber: srv.srvNumber,
        srvDate: srv.srvDate,
        poNumber: srv.poNumber,
        poId: srv.poId,
        poOrdQty: po.ordQty,
        rcdQty: srvItem.rcdQty,
        acceptedQty: srvItem.acceptedQty,
        rejQty: srvItem.rejQty,
        poItemId: poItem.id,
        itemOrdQty: poItem.ordQty,
        rate: poItem.rate,
      })
      .from(srv)
      .innerJoin(srvItem, eq(srvItem.srvId, srv.id))
      .leftJoin(po, eq(po.id, srv.poId))
      .leftJoin(poItem, eq(poItem.id, srvItem.poItemId))
      .where(where(db, filters)),
  );

export async function findSrvRow(db: Db, id: string) {
  const { supplierId: _, ...columns } = getTableColumns(srv);
  const rows = await db.query(db.build.select(columns).from(srv).where(eq(srv.id, id)));
  return rows[0];
}

export function itemsOfSrv(db: Db, srvId: string) {
  const { supplierId: _, ...columns } = getTableColumns(srvItem);
  return db.query(
    db.build
      .select(columns)
      .from(srvItem)
      .where(eq(srvItem.srvId, srvId))
      .orderBy(srvItem.poItemNo, srvItem.lotNo, srvItem.srvItemNo),
  );
}

/** The open flags raised on these SRV items (QTY_MISMATCH, DOC_NUMBER_CONFLICT). */
export function openFlagsOfSrvItems(db: Db, itemIds: readonly string[]) {
  // The fingerprint is storage only; `zFlag` does not carry it.
  const { supplierId: _, fingerprint: _f, ...columns } = getTableColumns(reconciliationIssue);
  return db.query(
    db.build
      .select(columns)
      .from(reconciliationIssue)
      .where(
        and(
          eq(reconciliationIssue.scopeType, "srv_item"),
          inArray(reconciliationIssue.scopeId, [...itemIds]),
          eq(reconciliationIssue.status, "open"),
        ),
      )
      .orderBy(reconciliationIssue.openedAt, reconciliationIssue.id),
  );
}
