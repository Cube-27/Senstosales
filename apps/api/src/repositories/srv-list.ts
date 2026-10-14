// SRV list, detail and delete reads (SPEC-10 §4.1). Plain rows: the filters that need no business value run in SQL;
// the SRV totals come from the domain in the service (C2).
import type { Db } from "@senstosales/db";
import { po, poItem, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { apiColumns, contains } from "./sql.ts";

/** The filters of both SRV views; the value range is applied to the totals by the service. */
export type SrvFilters = z.output<(typeof routes)["srv.stats"]["query"]>;

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
 * Every line of every SRV the filters keep, with its SRV, the stored PO's ordered total and the matched PO item
 * (`poItem` and `poOrdQty` are `null` when unmatched or the PO is not in the system, INV-40).
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
        poItem: { id: poItem.id, ordQty: poItem.ordQty, rate: poItem.rate },
      })
      .from(srv)
      .innerJoin(srvItem, eq(srvItem.srvId, srv.id))
      .leftJoin(po, eq(po.id, srv.poId))
      .leftJoin(poItem, eq(poItem.id, srvItem.poItemId))
      .where(where(db, filters)),
  );

export async function findSrvRow(db: Db, id: string) {
  const rows = await db.query(db.build.select(apiColumns(srv)).from(srv).where(eq(srv.id, id)));
  return rows[0];
}

export const itemsOfSrv = (db: Db, srvId: string) =>
  db.query(
    db.build
      .select(apiColumns(srvItem))
      .from(srvItem)
      .where(eq(srvItem.srvId, srvId))
      .orderBy(srvItem.poItemNo, srvItem.lotNo, srvItem.srvItemNo),
  );

const itemIdsOf = (db: Db, srvId: string) =>
  db.build.select({ id: srvItem.id }).from(srvItem).where(eq(srvItem.srvId, srvId));

/** The ids of the SRV's items. */
export const itemIdsOfSrv = (db: Db, srvId: string) => db.query(itemIdsOf(db, srvId));

/** The open flags raised on the SRV's items (QTY_MISMATCH, DOC_NUMBER_CONFLICT). */
export function openFlagsOfSrv(db: Db, srvId: string) {
  // The fingerprint is storage only; `zFlag` does not carry it.
  const { fingerprint: _, ...columns } = apiColumns(reconciliationIssue);
  return db.query(
    db.build
      .select(columns)
      .from(reconciliationIssue)
      .where(
        and(
          eq(reconciliationIssue.scopeType, "srv_item"),
          inArray(reconciliationIssue.scopeId, itemIdsOf(db, srvId)),
          eq(reconciliationIssue.status, "open"),
        ),
      )
      .orderBy(reconciliationIssue.openedAt, reconciliationIssue.id),
  );
}
