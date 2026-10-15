// Sorting and paging of list rows the service has already totalled with the domain (SPEC-10 §4.2).
import type { Money } from "@senstosales/domain";

export type Comparator<T> = (a: T, b: T) => number;

export const on =
  <T, V>(get: (row: T) => V, compare: Comparator<V>): Comparator<T> =>
  (a, b) =>
    compare(get(a), get(b));

export const desc =
  <T>(compare: Comparator<T>): Comparator<T> =>
  (a, b) =>
    compare(b, a);

/** PO, SRV, DC and invoice numbers are digit strings, so they compare as numbers, as legacy sorts them. */
export const byNumber = new Intl.Collator("en", { numeric: true }).compare;
export const byNum = (a: number, b: number) => a - b;
export const byText = (a: string, b: string) => Number(a > b) - Number(a < b);

/** The list filter panels' inclusive value range; an absent bound does not limit. */
export const inValueRange = (
  value: Money,
  { valueMin, valueMax }: { valueMin?: Money | undefined; valueMax?: Money | undefined },
) => (valueMin === undefined || value >= valueMin) && (valueMax === undefined || value <= valueMax);

/** One page, sorted by the chosen column in `dir`, then by the default order. */
export function page<T, K extends string>(
  rows: T[],
  query: { page: number; pageSize: number; sort?: K | undefined; dir: "asc" | "desc" },
  sorts: Record<K, Comparator<T>>,
  defaults: readonly Comparator<T>[],
) {
  const chosen = query.sort === undefined ? [] : [query.dir === "desc" ? desc(sorts[query.sort]) : sorts[query.sort]];
  const order = [...chosen, ...defaults];
  rows.sort((a, b) => {
    for (const compare of order) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
  const start = (query.page - 1) * query.pageSize;
  return { items: rows.slice(start, start + query.pageSize), total: rows.length };
}

/** One page of rows that arrive in list order, and how many there are in all; only the page is kept. */
export async function pageOfRows<T>(rows: AsyncIterable<T>, { page, pageSize }: { page: number; pageSize: number }) {
  const start = (page - 1) * pageSize;
  const items: T[] = [];
  let total = 0;
  for await (const row of rows) {
    if (total >= start && items.length < pageSize) items.push(row);
    total += 1;
  }
  return { items, total };
}
