import type { IsoDate, Money, Qty, Result } from "@senstosales/domain";
import { fyOf, parseIsoDate, parseMoney, parseQty } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import {
  fmtCount,
  fmtDate,
  fmtDateMonthName,
  fmtFixed,
  fmtFy,
  fmtMoney,
  fmtMoneyCompact,
  fmtMoneyCompactSpaced,
  fmtQty,
  fmtRate,
} from "../src/index.ts";

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const qty = (s: string): Qty => unwrap(parseQty(s));
const money = (s: string): Money => unwrap(parseMoney(s));
const date = (s: string): IsoDate => unwrap(parseIsoDate(s));

// Expected strings are the legacy frontend's visible output for the same value (SPEC-04 §4.4, A-2), except rows marked
// "legacy": there legacy printed a negative zero ("-0", "-₹0") or rounded a binary float tie down; these print
// zero unsigned and round exact ties half away from zero (D-0021).

describe("fmtQty: whole units, Indian grouping", () => {
  it.each([
    ["0", "0"],
    ["1", "1"],
    ["2.499", "2"],
    ["2.5", "3"],
    ["-2.5", "-2"],
    ["-2.501", "-3"],
    ["-0.4", "0"], // legacy "-0"
    ["1234", "1,234"],
    ["123456", "1,23,456"],
    ["12345678.9", "1,23,45,679"],
    ["-100000", "-1,00,000"],
    ["9007199254740.499", "90,07,19,92,54,740"],
    ["-9007199254740.501", "-90,07,19,92,54,741"],
  ])("%s -> %s", (q, expected) => {
    expect(fmtQty(qty(q))).toBe(expected);
  });
});

describe("fmtCount", () => {
  it.each([
    [0, "0"],
    [25, "25"],
    [1234, "1,234"],
    [1234567, "12,34,567"],
  ])("%i -> %s", (n, expected) => {
    expect(fmtCount(n)).toBe(expected);
  });
});

describe("fmtMoney: rupee sign, 2 dp, trailing zeros dropped", () => {
  it.each([
    ["0", "₹0"],
    ["848.75", "₹848.75"],
    ["500", "₹500"],
    ["1.50", "₹1.5"],
    ["719.27966", "₹719.28"],
    ["848.755", "₹848.76"], // legacy "₹848.75"
    ["848.745", "₹848.75"],
    ["0.004", "₹0"],
    ["0.005", "₹0.01"],
    ["99999.999", "₹1,00,000"],
    ["12345678.9", "₹1,23,45,678.9"],
    ["-848.75", "-₹848.75"],
    ["-848.755", "-₹848.76"], // legacy "-₹848.75"
    ["-0.001", "₹0"], // legacy "-₹0"
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoney(money(m), { gemc: false })).toBe(expected);
  });
});

describe("fmtMoney: GEMC at 5 dp (A-12)", () => {
  it.each([
    ["0", "₹0"],
    ["100", "₹100"],
    ["719.2", "₹719.2"],
    ["719.27966", "₹719.27966"],
    ["1234567.12345", "₹12,34,567.12345"],
    ["-0.00001", "-₹0.00001"],
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoney(money(m), { gemc: true })).toBe(expected);
  });
});

describe("fmtRate: as fmtMoney without the rupee sign", () => {
  it.each([
    ["0", false, "0"],
    ["848.75", false, "848.75"],
    ["1234.50", false, "1,234.5"],
    ["719.27966", false, "719.28"],
    ["719.27966", true, "719.27966"],
    ["-12.3", false, "-12.3"],
  ])("%s gemc=%s -> %s", (m, gemc, expected) => {
    expect(fmtRate(money(m), { gemc })).toBe(expected);
  });
});

describe("fmtFixed: every decimal place, no grouping (legacy DC consignment value)", () => {
  it.each([
    ["0", false, "0.00"],
    ["1234.5", false, "1234.50"],
    ["1234567.891", false, "1234567.89"],
    ["0.005", false, "0.01"],
    ["719.27966", false, "719.28"],
    ["719.2796", true, "719.27960"],
    ["12", true, "12.00000"],
  ])("%s gemc=%s -> %s", (m, gemc, expected) => {
    expect(fmtFixed(money(m), { gemc })).toBe(expected);
  });
});

describe("fmtMoneyCompact: whole rupees, lakh and crore", () => {
  it.each([
    ["0", "₹0"],
    ["848.49", "₹848"],
    ["848.75", "₹849"],
    ["99999.49", "₹99,999"],
    ["99999.5", "₹1.00L"],
    ["150000", "₹1.50L"],
    ["1234567", "₹12.35L"],
    ["9999999", "₹100.00L"],
    ["10000000", "₹1.00Cr"],
    ["123456789", "₹12.35Cr"],
    ["-150000", "-₹1.50L"],
    ["-848.75", "-₹849"],
    ["-2.5", "-₹2"],
    ["-0.4", "₹0"],
  ])("%s -> %s", (m, expected) => {
    expect(fmtMoneyCompact(money(m))).toBe(expected);
  });

  it.each([
    ["0", "₹0"],
    ["848.75", "₹849"],
    ["99999.5", "₹1,00,000"],
    ["150000", "₹1.50 L"],
    ["123456789", "₹12.35 Cr"],
    ["-150000", "- ₹1.50 L"],
    ["-2.5", "- ₹3"],
    ["-0.5", "- ₹1"],
    ["-0.4", "₹0"], // legacy "- ₹0"
  ])("fmtMoneyCompactSpaced: %s -> %s", (m, expected) => {
    expect(fmtMoneyCompactSpaced(money(m))).toBe(expected);
  });
});

describe("fmtDate: DD/MM/YYYY", () => {
  it.each([
    ["2025-01-05", "05/01/2025"],
    ["2024-12-31", "31/12/2024"],
    ["2024-02-29", "29/02/2024"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDate(date(d))).toBe(expected);
  });

  it("shows an empty date as an em dash", () => {
    expect(fmtDate(null)).toBe("—");
  });
});

describe("fmtDateMonthName: DD Mon YYYY", () => {
  it.each([
    ["2025-01-05", "05 Jan 2025"],
    ["2024-09-30", "30 Sep 2024"],
    ["2024-12-31", "31 Dec 2024"],
  ])("%s -> %s", (d, expected) => {
    expect(fmtDateMonthName(date(d))).toBe(expected);
  });

  it("shows an empty date as a hyphen", () => {
    expect(fmtDateMonthName(null)).toBe("-");
  });
});

describe("fmtFy", () => {
  it.each([
    ["2025-03-31", "FY 2024-25"],
    ["2025-04-01", "FY 2025-26"],
    ["2000-03-31", "FY 1999-00"],
  ])("FY of %s -> %s", (d, expected) => {
    expect(fmtFy(fyOf(date(d)))).toBe(expected);
  });
});
