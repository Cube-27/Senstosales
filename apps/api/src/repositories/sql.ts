// SQL pieces the list repositories share.
import { po, reconciliationIssue } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import type { SQLWrapper, Table } from "drizzle-orm";
import { getTableColumns, sql } from "drizzle-orm";

import { IST_OFFSET_MINUTES } from "../ports/clock.ts";

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
export const byPoNumber = [sql`CAST(${po.poNumber} AS INTEGER)`, po.poNumber] as const;

/**
 * The UTC instant (ISO-8601, as stored) at which the IST calendar date `date` begins, `days` after it. IST is a fixed
 * +05:30 (C3). Built on the constant side so a filter compares the stored column as it is.
 */
export const istDayStart = (date: IsoDate, days = 0) =>
  sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${date}, ${`${days} days`}, ${sql.raw(`'-${IST_OFFSET_MINUTES} minutes'`)})`;

/** {@link byPoNumber} as keyset sort parts: select `kPoNumber: PO_NUMBER_KEY` and `poNumber` (D-0262). */
export const PO_NUMBER_KEY = sql<number>`${byPoNumber[0]}`;
export const PO_NUMBER_SORT = [
  { by: PO_NUMBER_KEY, field: "kPoNumber" },
  { by: po.poNumber, field: "poNumber" },
] as const;

/** A nullable column as a NOT NULL sort value; a missing value sorts first ascending. */
export const orEmpty = (column: SQLWrapper) => sql<string>`COALESCE(${column}, '')`;
