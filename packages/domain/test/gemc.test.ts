import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { Money } from "../src/index.ts";
import { extractGemcNumber, gemcNetRate, gemcNumberOf, gemcSourceRate, moneyToString } from "../src/index.ts";
import { money } from "./unwrap.ts";

// The domain package has no DOM or Node types; the test runtime provides the timer.
declare const performance: { now(): number };

const net = (source: string): string => moneyToString(gemcNetRate(gemcSourceRate(money(source))));

describe("INV-16: GEMC net rate = round5(source / 1.18)", () => {
  it.each([
    ["848.75", "719.27966"],
    ["118", "100"],
    ["1.18", "1"],
    ["0", "0"],
    ["0.00001", "0.00001"],
    ["0.00002", "0.00002"],
    ["100", "84.74576"],
    ["0.00059", "0.0005"],
    ["0.00177", "0.0015"],
    ["-848.75", "-719.27966"],
    ["90071992547.40991", "76332197074.07619"],
  ])("gemcNetRate(%s) -> %s", (source, expected) => {
    expect(net(source)).toBe(expected);
  });
});

describe("INV-17: the net is always derived from the stored source rate", () => {
  it("re-deriving 848.75 any number of times leaves 719.27966", () => {
    const source = gemcSourceRate(money("848.75"));
    const results = Array.from({ length: 5 }, () => moneyToString(gemcNetRate(source)));
    expect(results).toEqual(Array(5).fill("719.27966"));
  });

  it("does not accept its own output as a source rate", () => {
    const once = gemcNetRate(gemcSourceRate(money("848.75")));
    // @ts-expect-error A net rate is plain Money, not a GemcSourceRate (INV-17).
    expect(moneyToString(gemcNetRate(once))).toBe("609.55903");
  });

  it("is never above the source rate", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000_000_000 }), (n) => {
        expect(gemcNetRate(gemcSourceRate(n as Money))).toBeLessThanOrEqual(n);
      }),
    );
  });
});

describe("INV-19: GEMC number from REMARKS", () => {
  it.each([
    ["GEMC- 5116", "5116"],
    ["GEMC 5116", "5116"],
    ["GEMC5116", "5116"],
    ["GEMC:5116", "5116"],
    ["GEMC / 5116", "5116"],
    ["gemc-ab12", "ab12"],
    ["GEMC-ABC-12 dated 2024-05-01", "ABC-12"],
    ["Supply against GEMC no. 5116", "no"],
    ["Supply against GEMC - 5116, delivery at site", "5116"],
    ["Ref GEMC 11 and GEMC 22", "11"],
    ["GEMC", null],
    ["GEMC -", null],
    ["GEMC --5116", null],
    ["AGEMC 5116", null],
    ["GEM 5116", null],
    ["", null],
  ])("extractGemcNumber(%j) -> %j", (remarks, expected) => {
    expect(extractGemcNumber(remarks)).toBe(expected);
  });

  it("captures what the INV-19 pattern captures", () => {
    const inv19 = /\bGEMC\s*[-:/]?\s*([A-Z0-9][A-Z0-9-]*)/i;
    const remarks = fc
      .array(fc.constantFrom("GEMC", "gemc", "A", "5", " ", "  ", "-", ":", "/", ".", "\t"), { maxLength: 12 })
      .map((parts) => parts.join(""));
    fc.assert(
      fc.property(remarks, (s) => {
        expect(extractGemcNumber(s)).toBe(inv19.exec(s)?.[1] ?? null);
      }),
      { numRuns: 2000 },
    );
  });

  it("scans a long run of spaces after GEMC in linear time", () => {
    const start = performance.now();
    expect(extractGemcNumber(`GEMC${" ".repeat(50_000)}--`)).toBe(null);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

// A2-3: the GEMC number entered on the form, else the one the remarks name (owner, 2026-10-15).
describe("gemcNumberOf", () => {
  it.each<[string | null, string | null, string | null]>([
    ["GEMC-77", null, "GEMC-77"],
    [" GEMC-77 ", "GEMC- 5116", "GEMC-77"],
    [" ", "Supply against GEMC- 5116 only", "5116"],
    [null, "GEMC/88", "88"],
    [null, "No marker here", null],
    ["", null, null],
  ])("entered %j, remarks %j -> %j", (entered, remarks, expected) => {
    expect(gemcNumberOf(entered, remarks)).toBe(expected);
  });
});
