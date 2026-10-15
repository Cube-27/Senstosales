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

/** An amount typed in a filter, or no filter when the text is not an amount. */
const money = (text: string | undefined): Money | undefined => {
  if (text === undefined || text.trim() === "") return undefined;
  const parsed = parseMoney(text.trim());
  return parsed.ok ? parsed.value : undefined;
};

/** The range filters of a list query (`zRangeFilters`) from the URL's. */
export const rangeQuery = ({ q, from, to, valueMin, valueMax }: RangeSearch) => ({
  q: q?.trim() || undefined,
  from,
  to,
  valueMin: money(valueMin),
  valueMax: money(valueMax),
});
