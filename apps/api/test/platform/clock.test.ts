// SPEC-07 PR 2: the system clock's "today" is the IST calendar date (C3).
import { describe, expect, it } from "vite-plus/test";

import { createClock } from "../../src/platform/node/clock.ts";

const at = (iso: string) => () => Date.parse(iso);

describe("createClock", () => {
  it.each([
    ["2025-03-31T18:29:59.999Z", "2025-03-31"],
    ["2025-03-31T18:30:00.000Z", "2025-04-01"],
    ["2024-12-31T20:00:00.000Z", "2025-01-01"],
    ["2025-04-01T00:00:00.000Z", "2025-04-01"],
  ])("at %s today() is %s in IST", (instant, today) => {
    expect(createClock(at(instant)).today()).toBe(today);
  });

  it("now() is the ISO-8601 UTC instant", () => {
    expect(createClock(at("2025-04-01T05:30:00.000Z")).now()).toBe("2025-04-01T05:30:00.000Z");
  });

  it("reads the system time by default", () => {
    const before = Date.now();
    const now = Date.parse(createClock().now());
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
