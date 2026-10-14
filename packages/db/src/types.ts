// Column types for the unit-suffixed columns (ARCHITECTURE §8.1, C3): `*_qty_m` integer milli-units, `*_u5` integer
// 1e-5 units, `*_date` YYYY-MM-DD text, `*_at` ISO-8601 UTC text. Each maps to the domain's branded type, so a
// quantity cannot be stored in a money column. Integer units are checked both ways: SQLite would keep 2.5 as REAL.
import type { Fy, GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { customType } from "drizzle-orm/sqlite-core";

import { DbError } from "./port.ts";

/** An instant, ISO-8601 UTC (`2025-04-01T05:30:00.000Z`), as `Clock.now()` returns it. */
export type Instant = string & { readonly __brand: "Instant" };

function integerUnits<T extends number>() {
  const checked = (value: number): T => {
    if (!Number.isSafeInteger(value)) throw new DbError(`Not an integer unit: ${value}`);
    return value as T;
  };
  return customType<{ data: T; driverData: number }>({
    dataType: () => "integer",
    toDriver: checked,
    fromDriver: checked,
  });
}

// Text is stored as written; the brands were checked where the value entered (parsers, API codecs, the domain).
function brandedText<T extends string>() {
  return customType<{ data: T; driverData: string }>({ dataType: () => "text" });
}

/** `*_qty_m`: quantity in milli-units. */
export const qtyM = integerUnits<Qty>();
/** `*_u5`: money in 1e-5 units. */
export const moneyU5 = integerUnits<Money>();
/** `*_pct_u5`: GST percentage in 1e-5 units. */
export const pctU5 = integerUnits<GstPct>();
/** `*_date`: IST calendar date `YYYY-MM-DD`. */
export const isoDate = brandedText<IsoDate>();
/** `*_at` (and `at`): an instant. */
export const instant = brandedText<Instant>();
/** `financial_year`: `2024-25`. */
export const fy = brandedText<Fy>();
/** Surrogate ids: ULID text generated in services (C4). Unbranded, as ids arrive from the API as plain strings. */
export const ulid = brandedText<string>();
