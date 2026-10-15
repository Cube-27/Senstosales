// SQL pieces the list repositories share.
import { po, reconciliationIssue } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import type { SQLWrapper, Table } from "drizzle-orm";
import { and, getTableColumns, gte, lte, sql } from "drizzle-orm";

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

/** D1 binds at most 100 parameters to a statement, so the reads by id take the ids 100 at a time. */
const ID_BATCH = 100;

/** `read` over `ids` in batches of at most 100, the rows in batch order. */
export async function inBatches<T>(ids: readonly string[], read: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) out.push(...(await read(ids.slice(i, i + ID_BATCH))));
  return out;
}

/** A document number as a number: PO, DC, invoice and SRV numbers are digit strings and sort as numbers (as legacy). */
export const asNumber = (column: SQLWrapper) => sql<number>`CAST(${column} AS INTEGER)`;

/** PO numbers sort as numbers; the text breaks ties for any that are not digits. */
export const byPoNumber = [asNumber(po.poNumber), po.poNumber] as const;

/** The list filter panels' inclusive date range; an absent bound does not limit. */
export const inRange = (column: SQLWrapper, { from, to }: { from?: string | undefined; to?: string | undefined }) =>
  and(from === undefined ? undefined : gte(column, from), to === undefined ? undefined : lte(column, to));

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
