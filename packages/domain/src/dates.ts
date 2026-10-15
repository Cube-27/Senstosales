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
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const days = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (days === undefined || day < 1 || day > days) return { ok: false, error: `No such date: "${s}"` };
  return { ok: true, value: s as IsoDate };
}

/** Fixed-width `YYYY-MM-DD` strings order chronologically. */
export function compareIsoDate(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Days since 1970-01-01 and back, by the proleptic Gregorian calendar in whole-number arithmetic (no `Date`, C3).
// Years run March to February, so the leap day ends a year.
const DAYS_PER_400_YEARS = 146_097;
const EPOCH_SHIFT = 719_468;

function dayNumber(date: IsoDate): number {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4)) - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + Number(date.slice(8, 10)) - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_400_YEARS + dayOfEra - EPOCH_SHIFT;
}

function fromDayNumber(days: number): IsoDate {
  const shifted = days + EPOCH_SHIFT;
  const era = Math.floor(shifted / DAYS_PER_400_YEARS);
  const dayOfEra = shifted - era * DAYS_PER_400_YEARS;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (n: number, width: number) => String(n).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as IsoDate;
}

/** Whole calendar days from `from` to `to`, negative when `to` is earlier: `2025-02-28 -> 2025-03-01` is 1. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => dayNumber(to) - dayNumber(from);

/** The date `days` calendar days after `date` (before it when negative). */
export const addDays = (date: IsoDate, days: number): IsoDate => fromDayNumber(dayNumber(date) + days);
