// Optimistic concurrency for `po`, `dc` and `invoice` (INV-95, ARCHITECTURE §8.1). The port has no transaction to
// read the version and then decide (C4), and SQLite's RAISE() works only in triggers (none: INV-84), so the check
// lives in the statement itself: a stale row gets `version = NULL`, its NOT NULL constraint fails, and the whole
// batch rolls back. `staleTable` recognises that failure so the port can raise ConflictError.
import { eq, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import type { Db, Statement } from "./port.ts";
import type { dc } from "./schema/dc.ts";
import type { invoice } from "./schema/invoice.ts";
import type { po } from "./schema/po.ts";

export type Versioned = typeof po | typeof dc | typeof invoice;

const STALE = /NOT NULL constraint failed: (po|dc|invoice)\.version\b/;

/** The versioned table a database error message reports as stale, if the message is that failure. */
export const staleTable = (message: string): string | undefined => STALE.exec(message)?.[1];

/**
 * Updates row `id` of `table` with `set` and bumps its version, if its version is still `expected`. Otherwise the
 * batch it is in fails with `ConflictError` and writes nothing. A missing row updates nothing (EC-25).
 */
export function updateWithVersion<T extends Versioned>(
  db: Db,
  table: T,
  id: string,
  expected: number,
  set: SQLiteUpdateSetSource<T>,
): Statement {
  // The union of three tables defeats Drizzle's per-table generics; each member has `id` and `version`.
  const t = table as typeof po;
  const version = sql`CASE WHEN ${t.version} = ${expected} THEN ${t.version} + 1 ELSE NULL END`;
  return db.build
    .update(t)
    .set({ ...(set as SQLiteUpdateSetSource<typeof po>), version })
    .where(eq(t.id, id));
}
