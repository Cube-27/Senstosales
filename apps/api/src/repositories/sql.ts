// SQL pieces the list repositories share.
import { po, reconciliationIssue } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import type { SQLWrapper, Table } from "drizzle-orm";
import { getTableColumns, sql } from "drizzle-orm";

/** A table's columns without `supplier_id`, which no API shape carries. */
export function apiColumns<T extends Table>(table: T) {
  const { supplierId: _, ...columns } = getTableColumns(table);
  return columns;
}

const literal = (text: string) => text.replace(/[\\%_]/g, String.raw`\$&`);
const like = (column: SQLWrapper, pattern: string) => sql`${column} LIKE ${pattern} ESCAPE ${sql.raw(String.raw`'\'`)}`;

/** `LIKE` on the text as typed: `%` and `_` match themselves. */
export const contains = (column: SQLWrapper, text: string) => like(column, `%${literal(text)}%`);

/** Starts with the text as typed, ignoring ASCII case as `LIKE` does. */
export const startsWith = (column: SQLWrapper, text: string) => like(column, `${literal(text)}%`);

/** A flag's API columns: the fingerprint is storage only; `zFlag` does not carry it. */
const { fingerprint: _, ...flagApiColumns } = apiColumns(reconciliationIssue);
export const flagColumns = flagApiColumns;

/** PO numbers are digit strings, so they sort as numbers (as legacy); the text breaks ties for any that are not. */
export const byPoNumber = [sql`CAST(${po.poNumber} AS INTEGER)`, po.poNumber];

/**
 * The UTC instant (ISO-8601, as stored) at which the IST calendar date `date` begins, `days` after it. IST is a fixed
 * +05:30 (C3). Built on the constant side so a filter compares the stored column as it is.
 */
export const istDayStart = (date: IsoDate, days = 0) =>
  sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${date}, ${`${days} days`}, '-330 minutes')`;
