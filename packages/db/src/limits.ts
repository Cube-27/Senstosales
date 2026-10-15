// D1 binds at most 100 parameters to one statement (C4). A read or write over a list of ids or rows splits the list
// into runs that each stay within it; the port refuses any statement over it, so a missed list fails every executor.
import { getTableColumns, type Table } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { Db } from "./port.ts";

export const MAX_BOUND_PARAMS = 100;

/** `items` in runs of at most `size`, in order; no run for an empty list. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}

/** `ids` in runs that fit one statement binding `others` parameters besides them. */
export const idRuns = <T>(ids: readonly T[], others = 0): T[][] => chunk(ids, MAX_BOUND_PARAMS - others);

/** How many rows of `table` one insert can carry: a row binds at most one parameter per column. */
export const rowsPerInsert = (table: Table): number =>
  Math.floor(MAX_BOUND_PARAMS / Object.keys(getTableColumns(table)).length);

/** The inserts of `rows` into `table`, as many rows to a statement as fit. */
export function insertRows<T extends SQLiteTable>(db: Db, table: T, rows: readonly T["$inferInsert"][]) {
  return chunk(rows, rowsPerInsert(table)).map((run) => db.build.insert(table).values(run));
}

type Built = { toSQL?: () => { params: unknown[] }; getQuery?: () => { params: unknown[] } };

/** The parameters a statement built with `Db.build` binds: a query builder's `toSQL`, a raw `run`'s `getQuery`. */
export function boundParams(statement: unknown): number {
  const built = statement as Built;
  return (built.toSQL?.() ?? built.getQuery?.())?.params.length ?? 0;
}
