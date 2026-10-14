// Optimistic concurrency for `po`, `dc` and `invoice` (INV-95, ARCHITECTURE §8.1). The port has no transaction to
// read the version and then decide (C4), so the check lives in the statement itself: a stale row gets `version =
// NULL`, its NOT NULL constraint fails, and the whole batch rolls back. The port maps that failure to ConflictError.
import { eq, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

import type { Db, Statement } from "./port.ts";
import type { dc } from "./schema/dc.ts";
import type { invoice } from "./schema/invoice.ts";
import type { po } from "./schema/po.ts";

type Versioned = typeof po | typeof dc | typeof invoice;

/**
 * Updates row `id` of `table` with `set` and bumps its version, if its version is still `expected`. Otherwise the
 * batch it is in fails with `ConflictError` and writes nothing. A missing row updates nothing.
 */
export function updateWithVersion<T extends Versioned>(
  db: Db,
  table: T,
  id: string,
  expected: number,
  set: SQLiteUpdateSetSource<T>,
): Statement {
  const version = sql`CASE WHEN ${table.version} = ${expected} THEN ${table.version} + 1 ELSE NULL END`;
  // The union of three tables defeats Drizzle's per-table generics; each member has `id` and `version`.
  return db.build
    .update(table as typeof po)
    .set({ ...(set as SQLiteUpdateSetSource<typeof po>), version })
    .where(eq((table as typeof po).id, id));
}
