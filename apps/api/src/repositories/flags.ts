// Reconciliation issue rows (ARCHITECTURE §6.9, §8.2) and the deviations screen reads (SPEC-10 PR 5). Plain rows;
// filters and sorts run in SQL over stored columns.
import type { Db, Instant } from "@senstosales/db";
import { po, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { AnyColumn, SQLWrapper } from "drizzle-orm";
import { and, asc, count, desc, eq, gte, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { byPoNumber, contains, flagColumns } from "./sql.ts";

/** The fingerprints of the PO's stored flags, open or acknowledged. */
export const flagFingerprintsOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({ fingerprint: reconciliationIssue.fingerprint })
      .from(reconciliationIssue)
      .where(eq(reconciliationIssue.poId, poId)),
  );

/** How many flags of each type were opened at or after `since`, by type. */
export const flagCountsSince = (db: Db, since: Instant) =>
  db.query(
    db.build
      .select({ type: reconciliationIssue.type, count: count() })
      .from(reconciliationIssue)
      .where(gte(reconciliationIssue.openedAt, since))
      .groupBy(reconciliationIssue.type)
      .orderBy(reconciliationIssue.type),
  );

export type FlagListQuery = z.output<(typeof routes)["flags.list"]["query"]>;

const SORTS: Record<NonNullable<FlagListQuery["sort"]>, readonly (AnyColumn | SQLWrapper)[]> = {
  openedAt: [reconciliationIssue.openedAt],
  type: [reconciliationIssue.type],
  status: [reconciliationIssue.status],
  poNumber: byPoNumber,
};

/** A value of the flag's details JSON (D1 runs `json_extract`). */
const detail = (key: "field" | "expected" | "actual") => {
  const path = "$." + key;
  return sql`json_extract(${reconciliationIssue.details}, ${path})`;
};

/**
 * The search box, as legacy matched it: the PO number, the SRV number, the type and scope codes, and the details'
 * field, expected and actual values.
 */
const searched = (q: string) =>
  or(
    ...[po.poNumber, srv.srvNumber, reconciliationIssue.type, reconciliationIssue.scopeType].map((c) => contains(c, q)),
    ...(["field", "expected", "actual"] as const).map((key) => contains(detail(key), q)),
  );

/** The flag's SRV line, for a flag on one. */
const srvItemOfFlag = and(eq(reconciliationIssue.scopeType, "srv_item"), eq(srvItem.id, reconciliationIssue.scopeId));

/** The deviations screen filters: the search text, type, status, one PO. */
const where = (f: FlagListQuery) =>
  and(
    f.q ? searched(f.q) : undefined,
    f.type === undefined ? undefined : eq(reconciliationIssue.type, f.type),
    f.status === undefined ? undefined : eq(reconciliationIssue.status, f.status),
    f.poId === undefined ? undefined : eq(reconciliationIssue.poId, f.poId),
  );

/**
 * One page with each flag's PO number, and for a flag on an SRV line its SRV (the deviations screen links both);
 * newest first unless a sort is given, then newest first.
 */
export async function listFlags(db: Db, query: FlagListQuery) {
  const filter = where(query);
  const dir = query.dir === "desc" ? desc : asc;
  const chosen = query.sort === undefined ? [] : SORTS[query.sort].map((c) => dir(c));
  const [items, totals] = await Promise.all([
    db.query(
      db.build
        .select({ ...flagColumns, poNumber: po.poNumber, srvId: srv.id, srvNumber: srv.srvNumber })
        .from(reconciliationIssue)
        .innerJoin(po, eq(po.id, reconciliationIssue.poId))
        .leftJoin(srvItem, srvItemOfFlag)
        .leftJoin(srv, eq(srv.id, srvItem.srvId))
        .where(filter)
        .orderBy(...chosen, desc(reconciliationIssue.openedAt), desc(reconciliationIssue.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ),
    db.query(
      db.build
        .select({ total: count() })
        .from(reconciliationIssue)
        .innerJoin(po, eq(po.id, reconciliationIssue.poId))
        .leftJoin(srvItem, srvItemOfFlag)
        .leftJoin(srv, eq(srv.id, srvItem.srvId))
        .where(filter),
    ),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

/** How many flags of each type are open. */
export const openFlagCounts = (db: Db) =>
  db.query(
    db.build
      .select({ type: reconciliationIssue.type, count: count() })
      .from(reconciliationIssue)
      .where(eq(reconciliationIssue.status, "open"))
      .groupBy(reconciliationIssue.type),
  );

export async function findFlag(db: Db, id: string) {
  const rows = await db.query(
    db.build.select(flagColumns).from(reconciliationIssue).where(eq(reconciliationIssue.id, id)),
  );
  return rows[0];
}

/**
 * Marks an open flag acknowledged. A flag no longer open (acknowledged by a concurrent request) gets `status = NULL`,
 * fails its NOT NULL constraint and rolls back the whole batch, its audit row included (the check of D-0124).
 */
export const acknowledgeFlag = (db: Db, id: string, note: string | null, at: Instant) =>
  db.build
    .update(reconciliationIssue)
    .set({
      status: sql`CASE WHEN ${reconciliationIssue.status} = 'open' THEN 'acknowledged' ELSE NULL END`,
      note,
      acknowledgedAt: at,
    })
    .where(eq(reconciliationIssue.id, id));
