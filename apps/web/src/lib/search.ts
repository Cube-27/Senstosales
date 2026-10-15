// List filters as the URL holds them (SPEC-14 §2, ARCHITECTURE §12.1). The router reads a query value that looks like
// JSON as JSON (`q=4500` is the number 4500, `gemc=true` the boolean), so free text is read back as text here, and
// amounts stay the text the user typed until a list query turns them into money.
import type { Money } from "@senstosales/domain";
import { parseMoney } from "@senstosales/domain";
import { zIsoDate } from "@senstosales/schemas";
import { z } from "zod";

/** Text the user typed, whatever the router made of it. */
export const zUrlText = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .optional();

/** An on/off filter: `true` or absent. */
export const zUrlFlag = z.literal(true).optional();

/** The date and value ranges of the legacy filter panel, as URL search. */
export const zRangeSearch = {
  q: zUrlText,
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
  valueMin: zUrlText,
  valueMax: zUrlText,
};

export type RangeSearch = z.output<z.ZodObject<typeof zRangeSearch>>;

/** A typed amount as money, or null when it is not an amount. */
export const moneyOf = (text: string): Money | null => {
  const parsed = parseMoney(text.trim());
  return parsed.ok ? parsed.value : null;
};

/** An amount typed in a filter, or no filter when the text is not an amount. */
export const money = (text: string | undefined): Money | undefined =>
  text === undefined ? undefined : (moneyOf(text) ?? undefined);

/** The search box's text for a list query, or no filter when it is blank. */
export const searchText = (q: string | undefined): string | undefined => q?.trim() || undefined;

/** The URL's sort when it is one of a list's `options`: one URL sort serves views with different columns. */
export const sortIn =
  <T extends string>(options: readonly T[]) =>
  (sort: string | undefined): T | undefined =>
    options.find((o) => o === sort);

/** The range filters of a list query (`zRangeFilters`) from the URL's. */
export const rangeQuery = ({ q, from, to, valueMin, valueMax }: RangeSearch) => ({
  q: searchText(q),
  from,
  to,
  valueMin: money(valueMin),
  valueMax: money(valueMax),
});

/** A cleared input as no filter. */
export const orNone = <T extends string>(v: T | ""): T | undefined => (v === "" ? undefined : v);

/** A list's default paging and sort, left out of its URL so a plain `/po` stays `/po`. */
export const LIST_DEFAULTS = { page: 1, pageSize: 10, dir: "asc" } as const;
