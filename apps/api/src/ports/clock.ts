// The Clock port (ARCHITECTURE §4.1): the only source of "today" and "now" for services, so tests fix time.
import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";

export interface Clock {
  /** Today's calendar date in IST (C3). */
  today(): IsoDate;
  /** The current instant, ISO-8601 UTC. */
  now(): Instant;
}

/** India has one time zone and no daylight saving, so IST is a fixed +05:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** The IST calendar date and `HH:MM` of an instant: `2025-06-01T05:30:00.000Z` -> `2025-06-01`, `11:00`. */
export function istDateTime(at: Instant): { date: IsoDate; time: string } {
  const ist = new Date(Date.parse(at) + IST_OFFSET_MS).toISOString();
  return { date: ist.slice(0, 10) as IsoDate, time: ist.slice(11, 16) };
}
