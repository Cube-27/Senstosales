import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { GstPct, LineTax, Money, Qty } from "../src/index.ts";
import { invoiceLineTax, invoiceTotals, moneyToString, parsePct } from "../src/index.ts";
import { money, qty, unwrap } from "./unwrap.ts";

const pct = (s: string) => unwrap(parsePct(s));

// Literal decimal strings, so a failure reads in rupees.
const show = (t: LineTax) => ({
  taxable: moneyToString(t.taxable),
  cgst: moneyToString(t.cgst),
  sgst: moneyToString(t.sgst),
  igst: moneyToString(t.igst),
  total: moneyToString(t.total),
});

describe("parsePct: GST percentages in 1e-5 units (SPEC-03 §9)", () => {
  it.each([
    ["9", 900000],
    ["2.5", 250000],
    ["0", 0],
    ["14.00001", 1400001],
  ])("parsePct(%j) -> %i", (s, expected) => {
    expect(parsePct(s)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "9%", "9.000001", "nine"])("parsePct(%j) is an error", (s) => {
    expect(parsePct(s).ok).toBe(false);
  });
});

// INV-41: per line taxable = round(qty × rate), cgst/sgst = round(taxable × pct / 100), igst 0; 5 dp for GEMC POs,
// 2 dp otherwise (INV-18); ties round half away from zero (D-0021).
describe("INV-41, INV-18: invoiceLineTax", () => {
  it.each([
    // The INV-41 example.
    [
      "GEMC 3 × 719.27966 at 9 % + 9 %",
      ["3", "719.27966", "9", "9", true],
      { taxable: "2157.83898", cgst: "194.20551", sgst: "194.20551", igst: "0", total: "2546.25" },
    ],
    [
      "same line on a non-GEMC PO rounds to 2 dp",
      ["3", "719.27966", "9", "9", false],
      { taxable: "2157.84", cgst: "194.21", sgst: "194.21", igst: "0", total: "2546.26" },
    ],
    [
      "fractional qty",
      ["2.5", "100", "9", "9", false],
      { taxable: "250", cgst: "22.5", sgst: "22.5", igst: "0", total: "295" },
    ],
    [
      "taxable tie at 2 dp rounds away from zero",
      ["1", "848.755", "9", "9", false],
      { taxable: "848.76", cgst: "76.39", sgst: "76.39", igst: "0", total: "1001.54" },
    ],
    [
      "cgst tie at 2 dp rounds away from zero (half-even would give 0.04)",
      ["1", "0.5", "9", "9", false],
      { taxable: "0.5", cgst: "0.05", sgst: "0.05", igst: "0", total: "0.6" },
    ],
    [
      "taxable tie at 5 dp on a GEMC PO",
      ["0.5", "0.00001", "9", "9", true],
      { taxable: "0.00001", cgst: "0", sgst: "0", igst: "0", total: "0.00001" },
    ],
    [
      "fractional percentages, cgst and sgst differ",
      ["10", "12.34", "2.5", "6", false],
      { taxable: "123.4", cgst: "3.09", sgst: "7.4", igst: "0", total: "133.89" },
    ],
    ["zero percent", ["4", "25.5", "0", "0", false], { taxable: "102", cgst: "0", sgst: "0", igst: "0", total: "102" }],
    // qty × rate exceeds 2^53 in 1e-8 units: exact integer arithmetic, no float loss.
    [
      "large line, 2 dp",
      ["123456.789", "98765.43219", "9", "9", false],
      { taxable: "12193263122.37", cgst: "1097393681.01", sgst: "1097393681.01", igst: "0", total: "14388050484.39" },
    ],
    [
      "large line, 5 dp",
      ["123456.789", "98765.43219", "9", "9", true],
      {
        taxable: "12193263122.37464",
        cgst: "1097393681.01372",
        sgst: "1097393681.01372",
        igst: "0",
        total: "14388050484.40208",
      },
    ],
  ] as const)("%s", (_name, [q, rate, cgst, sgst, gemc], expected) => {
    const tax = invoiceLineTax({ qty: qty(q), rate: money(rate), cgstPct: pct(cgst), sgstPct: pct(sgst), gemc });
    expect(show(tax)).toEqual(expected);
  });

  it("returns integer 1e-5 units", () => {
    const tax = invoiceLineTax({
      qty: qty("3"),
      rate: money("719.27966"),
      cgstPct: pct("9"),
      sgstPct: pct("9"),
      gemc: true,
    });
    expect(tax).toEqual({ taxable: 215783898, cgst: 19420551, sgst: 19420551, igst: 0, total: 254625000 });
  });

  it("throws rather than lose precision past 2^53 units", () => {
    const line = { qty: qty("1000000"), rate: money("99999999"), cgstPct: pct("9"), sgstPct: pct("9"), gemc: false };
    expect(() => invoiceLineTax(line)).toThrow(RangeError);
  });

  it("property: a line's total is taxable + cgst + sgst + igst", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 2_800_000 }),
        fc.integer({ min: 0, max: 2_800_000 }),
        fc.boolean(),
        (q, rate, cgstPct, sgstPct, gemc) => {
          const t = invoiceLineTax({
            qty: q as Qty,
            rate: rate as Money,
            cgstPct: cgstPct as GstPct,
            sgstPct: sgstPct as GstPct,
            gemc,
          });
          expect(t.total).toBe(t.taxable + t.cgst + t.sgst + t.igst);
          if (!gemc) expect(t.total % 1000).toBe(0);
        },
      ),
    );
  });
});

// INV-41, INV-18: header totals are sums of the lines, never recomputed from a header taxable.
describe("INV-41: invoiceTotals", () => {
  const line = (q: string, rate: string, gemc: boolean) =>
    invoiceLineTax({ qty: qty(q), rate: money(rate), cgstPct: pct("9"), sgstPct: pct("9"), gemc });

  it.each([
    ["no lines", [], { taxable: "0", cgst: "0", sgst: "0", igst: "0", total: "0" }],
    [
      "one GEMC line",
      [line("3", "719.27966", true)],
      { taxable: "2157.83898", cgst: "194.20551", sgst: "194.20551", igst: "0", total: "2546.25" },
    ],
    [
      "two GEMC lines keep 5 dp",
      [line("3", "719.27966", true), line("1", "100.00001", true)],
      { taxable: "2257.83899", cgst: "203.20551", sgst: "203.20551", igst: "0", total: "2664.25001" },
    ],
    // Per-line rounding: 0.05 + 0.05 cgst, not round(9 % of 1.00) = 0.09.
    [
      "sum of rounded lines, not tax on the summed taxable",
      [line("1", "0.5", false), line("1", "0.5", false)],
      { taxable: "1", cgst: "0.1", sgst: "0.1", igst: "0", total: "1.2" },
    ],
  ])("%s", (_name, lines, expected) => {
    expect(show(invoiceTotals(lines))).toEqual(expected);
  });
});
