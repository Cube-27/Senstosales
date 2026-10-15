// The system Clock (ARCHITECTURE §4.1).
import type { Instant } from "@senstosales/db";

import type { Clock } from "../../ports/clock.ts";
import { istDateTime } from "../../ports/clock.ts";

export function createClock(nowMs: () => number = Date.now): Clock {
  const now = () => new Date(nowMs()).toISOString() as Instant;
  return { today: () => istDateTime(now()).date, now };
}
