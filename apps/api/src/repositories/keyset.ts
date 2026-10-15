// Keyset paging for exports (SPEC-13 §4.2, INV-99): every row in a fixed order, one page at a time, each page starting
// after the last row of the one before (no OFFSET), so no row is read twice or skipped.
import type { SQL, SQLWrapper } from "drizzle-orm";
import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";

/**
 * One part of the sort key: a NOT NULL column or expression, its direction, and the field of the fetched row that
 * holds its value. The fetch selects `by` itself under that field, so the cursor compares SQL values with SQL values.
 * A nullable column goes in as `COALESCE(column, <value>)`: a NULL compares as nothing, so rows after it would be
 * skipped.
 */
export interface KeyPart<Row> {
  readonly by: SQLWrapper;
  readonly dir: "asc" | "desc";
  readonly field: keyof Row;
}

export interface KeysetPage {
  /** Rows after the previous page's last row; undefined for the first page. AND it with the filters. */
  readonly after: SQL | undefined;
  readonly orderBy: SQL[];
  readonly limit: number;
}

/** Rows strictly after `last` in key order: equal on the leading parts, then past it on the next one. */
function after<Row>(key: readonly KeyPart<Row>[], last: Row): SQL | undefined {
  const values = key.map((part) => last[part.field]);
  return or(
    ...key.map((part, i) =>
      and(
        ...key.slice(0, i).map((p, j) => eq(p.by, values[j])),
        part.dir === "asc" ? gt(part.by, values[i]) : lt(part.by, values[i]),
      ),
    ),
  );
}

/**
 * Every row `fetch` returns, page by page, fetching a page only when the previous one has been read. The key's last
 * part must be unique (the id), so the key orders rows totally.
 */
export async function* keysetRows<Row>(
  key: readonly KeyPart<Row>[],
  fetch: (page: KeysetPage) => Promise<readonly Row[]>,
  pageSize = 500,
): AsyncGenerator<Row> {
  const orderBy = key.map((part) => (part.dir === "asc" ? asc(part.by) : desc(part.by)));
  let last: Row | undefined;
  for (;;) {
    const rows = await fetch({ after: last === undefined ? undefined : after(key, last), orderBy, limit: pageSize });
    yield* rows;
    last = rows.at(-1);
    // `last` is undefined only for an empty page, which is also short; the check narrows its type.
    if (rows.length < pageSize || last === undefined) return;
  }
}
