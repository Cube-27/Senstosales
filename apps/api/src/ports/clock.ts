// The Clock port (ARCHITECTURE §4.1): the only source of "today" and "now" for services, so tests fix time.
import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";

export interface Clock {
  /** Today's calendar date in IST (C3). */
  today(): IsoDate;
  /** The current instant, ISO-8601 UTC. */
  now(): Instant;
}
