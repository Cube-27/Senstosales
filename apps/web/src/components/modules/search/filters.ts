// The search dialog's filters (legacy filter panel): document types, a date range and an amount range, and how they
// become the `search.query` request. Amounts are typed as text and sent only when they read as rupees (C3).
import { type RouteInput, zMoney } from "@senstosales/schemas";

export const DOC_TYPES = ["po", "dc", "invoice", "srv"] as const;
export type DocType = (typeof DOC_TYPES)[number];

type IsoDate = NonNullable<NonNullable<RouteInput<"search.query">["query"]>["from"]>;

export interface Filters {
  readonly types: readonly DocType[];
  readonly dateFrom: IsoDate | "";
  readonly dateTo: IsoDate | "";
  readonly amountMin: string;
  readonly amountMax: string;
}

export const NO_FILTERS: Filters = { types: DOC_TYPES, dateFrom: "", dateTo: "", amountMin: "", amountMax: "" };

export function hasActiveFilters(f: Filters): boolean {
  return (
    f.types.length < DOC_TYPES.length ||
    f.dateFrom !== "" ||
    f.dateTo !== "" ||
    f.amountMin !== "" ||
    f.amountMax !== ""
  );
}

/** Whether there is anything to search for: some text or a filter, and at least one document type. */
export function isSearchable(q: string, f: Filters): boolean {
  return f.types.length > 0 && (q.trim() !== "" || hasActiveFilters(f));
}

/** `"1500.50"` as money, or undefined for blank or unreadable text. */
export function amount(text: string) {
  const parsed = zMoney.safeDecode(text.trim());
  return text.trim() !== "" && parsed.success ? parsed.data : undefined;
}

/** The request: only what is set, types only when not all four (the API's default). */
export function searchQuery(q: string, f: Filters): NonNullable<RouteInput<"search.query">["query"]> {
  const valueMin = amount(f.amountMin);
  const valueMax = amount(f.amountMax);
  return {
    q: q.trim(),
    ...(f.types.length < DOC_TYPES.length ? { types: [...f.types] } : {}),
    ...(f.dateFrom !== "" ? { from: f.dateFrom } : {}),
    ...(f.dateTo !== "" ? { to: f.dateTo } : {}),
    ...(valueMin !== undefined ? { valueMin } : {}),
    ...(valueMax !== undefined ? { valueMax } : {}),
  };
}
