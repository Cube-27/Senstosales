// The system Clock (ARCHITECTURE §4.1). India has one time zone and no daylight saving, so IST is a fixed offset.
import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";

import type { Clock } from "../../ports/clock.ts";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export function createClock(nowMs: () => number = Date.now): Clock {
  return {
    today: () => new Date(nowMs() + IST_OFFSET_MS).toISOString().slice(0, 10) as IsoDate,
    now: () => new Date(nowMs()).toISOString() as Instant,
  };
}
