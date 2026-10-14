// SQL pieces the list repositories share.
import type { SQLWrapper, Table } from "drizzle-orm";
import { getTableColumns, sql } from "drizzle-orm";

/** A table's columns without `supplier_id`, which no API shape carries. */
export function apiColumns<T extends Table>(table: T) {
  const { supplierId: _, ...columns } = getTableColumns(table);
  return columns;
}

/** `LIKE` on the text as typed: `%` and `_` match themselves. */
export const contains = (column: SQLWrapper, text: string) =>
  sql`${column} LIKE ${`%${text.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'`;
