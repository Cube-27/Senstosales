import { describe, expect, it } from "vite-plus/test";

import { addDays, compareIsoDate, daysBetween, parseIsoDate } from "../src/index.ts";
import { date } from "./unwrap.ts";

// C3: dates are YYYY-MM-DD strings (IST calendar dates), validated as real calendar dates.
describe("C3: IsoDate", () => {
  it.each(["2025-03-31", "2025-04-01", "2024-02-29", "2000-02-29", "2025-12-31", "2025-01-01"])(
    "parseIsoDate accepts %j unchanged",
    (s) => {
      expect(parseIsoDate(s)).toEqual({ ok: true, value: s });
    },
  );

  it.each([
    "",
    "2025-3-31",
    "25-03-31",
    "2025/03/31",
    "2025-03-31T00:00:00Z",
    " 2025-03-31",
    "31-03-2025",
    "2025-00-10",
    "2025-13-01",
    "2025-04-31",
    "2025-02-29",
    "1900-02-29",
    "2025-01-00",
    "2025-01-32",
    "２０２５-01-01",
  ])("parseIsoDate rejects %j", (s) => {
    expect(parseIsoDate(s).ok).toBe(false);
  });

  it.each([
    ["2025-03-31", "2025-04-01", -1],
    ["2025-04-01", "2025-03-31", 1],
    ["2025-04-01", "2025-04-01", 0],
    ["2024-12-31", "2025-01-01", -1],
    ["2025-10-02", "2025-09-30", 1],
  ])("compareIsoDate(%s, %s) -> %i", (a, b, expected) => {
    expect(compareIsoDate(date(a), date(b))).toBe(expected);
  });
});

// Calendar arithmetic for the delivery tracker and dashboard (SPEC-10 §2).
describe("daysBetween and addDays", () => {
  it.each([
    ["2025-06-01", "2025-06-01", 0],
    ["2025-06-01", "2025-06-08", 7],
    ["2025-06-01", "2025-05-30", -2],
    ["2025-02-28", "2025-03-01", 1],
    ["2024-02-28", "2024-03-01", 2],
    ["2024-12-31", "2025-01-01", 1],
    ["1970-01-01", "2000-03-01", 11017],
    ["2000-02-28", "2000-03-01", 2],
    ["2100-02-28", "2100-03-01", 1],
    ["2025-04-01", "2026-03-31", 364],
  ])("daysBetween(%s, %s) -> %i", (from, to, expected) => {
    expect(daysBetween(date(from), date(to))).toBe(expected);
  });

  it.each([
    ["2025-06-01", -30, "2025-05-02"],
    ["2025-03-01", -1, "2025-02-28"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2025-12-25", 7, "2026-01-01"],
    ["2025-06-01", 0, "2025-06-01"],
    ["1999-12-31", 61, "2000-03-01"],
    ["0001-01-01", 0, "0001-01-01"],
  ])("addDays(%s, %i) -> %s", (from, days, expected) => {
    expect(addDays(date(from), days)).toBe(expected);
  });
});
