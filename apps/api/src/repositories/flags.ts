// Reconciliation issue rows (ARCHITECTURE §6.9, §8.2) and the deviations screen reads (SPEC-10 PR 5). Plain rows;
// filters and sorts run in SQL over stored columns.
import type { Db, Instant } from "@senstosales/db";
import { po, reconciliationIssue } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { AnyColumn, SQLWrapper } from "drizzle-orm";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";

import { apiColumns, contains } from "./sql.ts";

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

type FlagListQuery = z.output<(typeof routes)["flags.list"]["query"]>;

/** The API columns: no supplier and no fingerprint, which is storage only. */
function flagColumns() {
  const { fingerprint: _, ...columns } = apiColumns(reconciliationIssue);
  return columns;
}

const byPoNumber = [sql`CAST(${po.poNumber} AS INTEGER)`, po.poNumber];

const SORTS: Record<NonNullable<FlagListQuery["sort"]>, readonly (AnyColumn | SQLWrapper)[]> = {
  openedAt: [reconciliationIssue.openedAt],
  type: [reconciliationIssue.type],
  status: [reconciliationIssue.status],
  poNumber: byPoNumber,
};

/** The deviations screen filters: text in the PO number, type, status, one PO. */
const where = (f: FlagListQuery) =>
  and(
    f.q ? contains(po.poNumber, f.q) : undefined,
    f.type === undefined ? undefined : eq(reconciliationIssue.type, f.type),
    f.status === undefined ? undefined : eq(reconciliationIssue.status, f.status),
    f.poId === undefined ? undefined : eq(reconciliationIssue.poId, f.poId),
  );

/** One page with each flag's PO number; newest first unless a sort is given, then newest first. */
export async function listFlags(db: Db, query: FlagListQuery) {
  const filter = where(query);
  const dir = query.dir === "desc" ? desc : asc;
  const chosen = query.sort === undefined ? [] : SORTS[query.sort].map((c) => dir(c));
  const [items, totals] = await Promise.all([
    db.query(
      db.build
        .select({ ...flagColumns(), poNumber: po.poNumber })
        .from(reconciliationIssue)
        .innerJoin(po, eq(po.id, reconciliationIssue.poId))
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
    db.build.select(flagColumns()).from(reconciliationIssue).where(eq(reconciliationIssue.id, id)),
  );
  return rows[0];
}

/** Marks an open flag acknowledged; the status guard keeps a flag acknowledged once (INV-59). */
export const acknowledgeFlag = (db: Db, id: string, note: string | null, at: Instant) =>
  db.build
    .update(reconciliationIssue)
    .set({ status: "acknowledged", note, acknowledgedAt: at })
    .where(and(eq(reconciliationIssue.id, id), eq(reconciliationIssue.status, "open")));
