// D1 binds at most 100 parameters to one statement (C4). A read or write over a list of ids or rows splits the list
// into runs that each stay within it.
import { getTableColumns, type Table } from "drizzle-orm";

export const MAX_BOUND_PARAMS = 100;

/** `items` in runs of at most `size`, in order; no run for an empty list. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}

/** How many rows of `table` one insert can carry: a row binds at most one parameter per column. */
export const rowsPerInsert = (table: Table): number =>
  Math.floor(MAX_BOUND_PARAMS / Object.keys(getTableColumns(table)).length);
