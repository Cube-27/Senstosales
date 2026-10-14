// Dates are `YYYY-MM-DD` strings holding IST calendar dates (C3); no `Date` objects in the domain.
import type { Result } from "./result.ts";

export type IsoDate = string & { readonly __brand: "IsoDate" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Accepts only a real Gregorian calendar date: `2024-02-29` yes, `2025-02-29` and `2025-04-31` no. */
export function parseIsoDate(s: string): Result<IsoDate> {
  const m = ISO_DATE.exec(s);
  if (!m) return { ok: false, error: `Not a YYYY-MM-DD date: "${s}"` };
  const [year, month, day] = m.slice(1).map(Number) as [number, number, number];
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (days === undefined || day < 1 || day > days) return { ok: false, error: `No such date: "${s}"` };
  return { ok: true, value: s as IsoDate };
}

/** Fixed-width `YYYY-MM-DD` strings order chronologically. */
export const compareIsoDate = (a: IsoDate, b: IsoDate): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);
