import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import { docKey, fyOf, parseFy } from "../src/index.ts";
import { date } from "./unwrap.ts";

// INV-21: the financial year runs April to March and is named "YYYY-YY".
describe("INV-21: fyOf", () => {
  it.each([
    ["2025-03-31", "2024-25"],
    ["2025-04-01", "2025-26"],
    ["2024-02-29", "2023-24"],
    ["1999-04-01", "1999-00"],
    ["2000-03-31", "1999-00"],
    ["2009-04-01", "2009-10"],
  ])("fyOf(%s) -> %s", (d, expected) => {
    expect(fyOf(date(d))).toBe(expected);
  });

  it("is constant from 1 April to 31 March", () => {
    const pad = (n: number): string => String(n).padStart(2, "0");
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2098 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 1, max: 28 }),
        (startYear, offset, day) => {
          // offset 0..11 walks April of startYear through March of startYear + 1.
          const month = ((offset + 3) % 12) + 1;
          const year = month >= 4 ? startYear : startYear + 1;
          const d = date(`${year}-${pad(month)}-${pad(day)}`);
          expect(fyOf(d)).toBe(fyOf(date(`${startYear}-04-01`)));
        },
      ),
    );
  });
});

// INV-22, INV-24: document numbers restart every FY, so every lookup key carries the FY.
describe("INV-22/INV-24: docKey", () => {
  it.each([
    ["100", "2025-03-31", "100", "2025-04-01", false],
    ["100", "2025-04-01", "100", "2026-03-31", true],
    ["100", "2025-04-01", "101", "2025-04-01", false],
    // Surrounding whitespace is trimmed, as legacy SRV linking does (SPEC-03 §4.2).
    [" \t100\n", "2025-04-01", "100", "2025-04-01", true],
    // Other formatting differences are not normalised (EC-16).
    ["007", "2025-04-01", "7", "2025-04-01", false],
    ["DC-7", "2025-04-01", "7", "2025-04-01", false],
    ["1 00", "2025-04-01", "100", "2025-04-01", false],
  ])("number %j dated %s and number %j dated %s share a key: %s", (n1, d1, n2, d2, same) => {
    expect(docKey(n1, fyOf(date(d1))) === docKey(n2, fyOf(date(d2)))).toBe(same);
  });
});

describe("INV-21: parseFy accepts only the label fyOf writes", () => {
  it.each(["2024-25", "1999-00", "2009-10"])("accepts %j", (s) => {
    expect(parseFy(s)).toEqual({ ok: true, value: s });
  });

  it.each(["2024-26", "2024", "2024-2025", "24-25", "", " 2024-25", "2024-25\n"])("rejects %j", (s) => {
    expect(parseFy(s).ok).toBe(false);
  });
});
