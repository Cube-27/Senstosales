// SQL pieces the list repositories share.
import type { SQLWrapper, Table } from "drizzle-orm";
import { getTableColumns, sql } from "drizzle-orm";

/** A table's columns without `supplier_id`, which no API shape carries. */
export function apiColumns<T extends Table>(table: T) {
  const { supplierId: _, ...columns } = getTableColumns(table);
  return columns;
}

/** `LIKE` on the text as typed: `%` and `_` match themselves. */
export function contains(column: SQLWrapper, text: string) {
  const pattern = "%" + text.replace(/[\\%_]/g, String.raw`\$&`) + "%";
  return sql`${column} LIKE ${pattern} ESCAPE ${sql.raw(String.raw`'\'`)}`;
}
