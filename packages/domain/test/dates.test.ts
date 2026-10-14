import { describe, expect, it } from "vite-plus/test";

import type { IsoDate } from "../src/index.ts";
import { compareIsoDate, parseIsoDate } from "../src/index.ts";

const date = (s: string): IsoDate => {
  const r = parseIsoDate(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

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
