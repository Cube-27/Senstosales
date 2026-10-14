// The three date formats BHEL pages print (SPEC-06 §2), read as IST calendar dates (C3).
import { parseIsoDate } from "@senstosales/domain";
import type { IsoDate, Result } from "@senstosales/domain";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** `DD/MM/YYYY` and `DD/MM/YY`. */
const NUMERIC = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/;
/** `DD-MON-YY`. */
const NAMED = /^(\d{1,2})-([A-Z]{3})-(\d{2})$/i;

const pad = (n: string): string => n.padStart(2, "0");

/** Splits `text` into year, month and day; a two-digit year is 20YY, as the legacy parser read it (SPEC-06 §9). */
function dateParts(text: string): [string, string, string] | undefined {
  const numeric = NUMERIC.exec(text);
  if (numeric) {
    const [, day = "", month = "", year = ""] = numeric;
    return [year.length === 2 ? `20${year}` : year, pad(month), pad(day)];
  }
  const named = NAMED.exec(text);
  if (!named) return undefined;
  const [, day = "", name = "", year = ""] = named;
  const month = MONTHS.indexOf(name.toUpperCase()) + 1;
  return month === 0 ? undefined : [`20${year}`, pad(String(month)), pad(day)];
}

/** A page date as an `IsoDate`; anything else, including a date that does not exist, is an error. */
export function parsePageDate(text: string): Result<IsoDate> {
  const parts = dateParts(text.trim());
  const iso = parts && parseIsoDate(parts.join("-"));
  return iso?.ok ? iso : { ok: false, error: `Not a page date: "${text}"` };
}
