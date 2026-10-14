// Financial year and document keys (ARCHITECTURE §6.6, A-10).
import type { IsoDate } from "./dates.ts";

/** An April–March financial year, named `"2024-25"`. */
export type Fy = string & { readonly __brand: "Fy" };

/** Lookup key for a DC, invoice or GC number; numbers restart every FY, so the key carries it. */
export type DocKey = string & { readonly __brand: "DocKey" };

/** INV-21: `2025-03-31 -> 2024-25`, `2025-04-01 -> 2025-26`. */
export function fyOf(date: IsoDate): Fy {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}` as Fy;
}

/**
 * INV-22, INV-24: the only way to build a lookup key for a document number. Surrounding whitespace is trimmed, as
 * legacy SRV linking does; other formatting differences are kept (EC-16). DC and invoice numbers are independent
 * (INV-23), so callers keep one key space per document kind.
 */
export const docKey = (number: string, fy: Fy): DocKey => `${fy}|${number.trim()}` as DocKey;
