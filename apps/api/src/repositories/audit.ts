// The audit row each write batch carries (ARCHITECTURE §8.2): append-only, never a secret (INV-81, INV-83). The
// ledger reads it; nothing here updates or deletes a row.
import { auditLog, type Db, type Statement } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, asc, count, desc, eq, gte, lt, or } from "drizzle-orm";
import type { SQLiteInsertValue } from "drizzle-orm/sqlite-core";
import type { z } from "zod";

import { contains, istDayStart } from "./sql.ts";

export type AuditListQuery = z.output<(typeof routes)["audit.list"]["query"]>;

export const insertAudit = (db: Db, entry: SQLiteInsertValue<typeof auditLog>): Statement =>
  db.build.insert(auditLog).values(entry);

/** The ledger filters: text in the action, entity type or entity id; entity type; action; IST date range. */
const where = (f: AuditListQuery) =>
  and(
    f.q
      ? or(contains(auditLog.action, f.q), contains(auditLog.entityType, f.q), contains(auditLog.entityId, f.q))
      : undefined,
    f.entityType === undefined ? undefined : eq(auditLog.entityType, f.entityType),
    f.action === undefined ? undefined : eq(auditLog.action, f.action),
    f.from === undefined ? undefined : gte(auditLog.at, istDayStart(f.from)),
    f.to === undefined ? undefined : lt(auditLog.at, istDayStart(f.to, 1)),
  );

/** One page; newest first unless a sort is given, then newest first. */
export async function listAudit(db: Db, query: AuditListQuery) {
  const filter = where(query);
  const dir = query.dir === "desc" ? desc : asc;
  const chosen = query.sort === undefined ? [] : [dir(auditLog[query.sort])];
  const [items, totals] = await Promise.all([
    db.query(
      db.build
        .select()
        .from(auditLog)
        .where(filter)
        .orderBy(...chosen, desc(auditLog.at), desc(auditLog.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ),
    db.query(db.build.select({ total: count() }).from(auditLog).where(filter)),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}
