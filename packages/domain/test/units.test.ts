import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { Money, Qty } from "../src/index.ts";
import {
  TOL,
  gtTol,
  gte,
  moneyToString,
  parseMoney,
  parseQty,
  qtyToString,
  roundMoney,
  sumMoney,
  sumQty,
} from "../src/index.ts";
import { money, qty } from "./unwrap.ts";

describe("INV-01: exact integer units", () => {
  it.each([
    ["2.5", 2500],
    ["0", 0],
    ["10", 10000],
    ["0.001", 1],
    ["9.999", 9999],
    ["007.250", 7250],
    ["-2", -2000],
    ["-0", 0],
  ])("parseQty(%j) -> %i milli-units", (s, expected) => {
    expect(parseQty(s)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ["848.75", 84875000],
    ["719.27966", 71927966],
    ["0.00001", 1],
    ["100", 10000000],
    ["-848.75", -84875000],
  ])("parseMoney(%j) -> %i 1e-5 units", (s, expected) => {
    expect(parseMoney(s)).toEqual({ ok: true, value: expected });
  });

  it.each([
    "",
    " 2.5",
    "2.5 ",
    "2.",
    ".5",
    "+2",
    "1,000",
    "1e3",
    "0x10",
    "2.5.1",
    "--2",
    "NaN",
    "Infinity",
    "9.9995",
    "0.0001",
    "9007199254740.992",
  ])("parseQty rejects %j", (s) => {
    expect(parseQty(s).ok).toBe(false);
  });

  it.each(["848.755555", "0.000001", "abc", "1 000", "90071992547.40992"])("parseMoney rejects %j", (s) => {
    expect(parseMoney(s).ok).toBe(false);
  });

  it.each([
    [2500, "2.5"],
    [10000, "10"],
    [1, "0.001"],
    [0, "0"],
    [-2000, "-2"],
    [-1, "-0.001"],
    [123456789, "123456.789"],
  ])("qtyToString(%i) -> %j", (n, expected) => {
    expect(qtyToString(n as Qty)).toBe(expected);
  });

  it.each([
    [84875000, "848.75"],
    [71927966, "719.27966"],
    [1, "0.00001"],
    [10000000, "100"],
    [-84875000, "-848.75"],
  ])("moneyToString(%i) -> %j", (n, expected) => {
    expect(moneyToString(n as Money)).toBe(expected);
  });

  it("sums 0.1 + 0.2 to exactly 300 milli-units", () => {
    expect(sumQty([qty("0.1"), qty("0.2")])).toBe(300);
  });

  it.each([
    [[], 0],
    [["4", "4", "3"], 11000],
    [["0.001", "0.001", "0.001"], 3],
    [["10", "-12"], -2000],
  ])("sumQty(%j) -> %i", (parts, expected) => {
    expect(sumQty(parts.map(qty))).toBe(expected);
  });

  it.each([
    [[], 0],
    [["0.1", "0.2"], 30000],
    [["2157.83898", "100.00001"], 225783899],
    [["848.75", "-848.75"], 0],
  ])("sumMoney(%j) -> %i", (parts, expected) => {
    expect(sumMoney(parts.map(money))).toBe(expected);
  });

  it("round-trips every safe integer through its decimal string", () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        expect(parseQty(qtyToString(n as Qty))).toEqual({ ok: true, value: n });
        expect(parseMoney(moneyToString(n as Money))).toEqual({ ok: true, value: n });
      }),
    );
  });
});

describe("A2-4 (INV-41): roundMoney to 2 or 5 decimal places", () => {
  it.each([
    ["848.75", 2, "848.75"],
    ["848.755", 2, "848.76"],
    ["848.75499", 2, "848.75"],
    ["848.74501", 2, "848.75"],
    ["0.005", 2, "0.01"],
    ["0.00499", 2, "0"],
    ["-848.755", 2, "-848.76"],
    ["-848.75499", 2, "-848.75"],
    ["719.27966", 5, "719.27966"],
  ] as const)("roundMoney(%s, %i) -> %s", (m, dp, expected) => {
    expect(moneyToString(roundMoney(money(m), dp))).toBe(expected);
  });
});

describe("INV-02: tolerance 0.001", () => {
  it("TOL is one milli-unit", () => {
    expect(TOL).toBe(1);
  });

  it.each([
    ["9.999", "10", true],
    ["9.998", "10", false],
    ["10", "10", true],
    ["10.5", "10", true],
    ["0", "0", true],
    ["0", "0.001", true],
    ["0", "0.002", false],
  ])("gte(%s, %s) -> %s", (a, b, expected) => {
    expect(gte(qty(a), qty(b))).toBe(expected);
  });

  it.each([
    ["10.002", "10", true],
    ["10.001", "10", false],
    ["10", "10", false],
    ["9", "10", false],
    ["0.002", "0", true],
  ])("gtTol(%s, %s) -> %s", (a, b, expected) => {
    expect(gtTol(qty(a), qty(b))).toBe(expected);
  });
});
