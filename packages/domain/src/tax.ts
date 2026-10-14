// Invoice tax (ARCHITECTURE §6.5, A2-4): CGST + SGST from the GST percentages copied onto the invoice, IGST 0 in v1
// (EC-07). Each amount is rounded once from its exact value: 5 dp on a GEMC PO (A-12, INV-18), else 2 dp (INV-41).
import type { Result } from "./result.ts";
import { parseMoney, roundToMoney, type Money, type Qty } from "./units.ts";

/** A GST percentage in 1e-5 units, like Money: `9` % -> `900000` (SPEC-03 §9). */
export type GstPct = number & { readonly __brand: "GstPct" };

export const parsePct = (s: string): Result<GstPct> => parseMoney(s) as Result<Money> as Result<GstPct>;

export type LineTaxInput = { qty: Qty; rate: Money; cgstPct: GstPct; sgstPct: GstPct; gemc: boolean };

export type LineTax = { taxable: Money; cgst: Money; sgst: Money; igst: Money; total: Money };

/** INV-41, INV-18: `3 × 719.27966, 9 % + 9 %, GEMC -> taxable 2157.83898, cgst 194.20551`. */
export function invoiceLineTax({ qty, rate, cgstPct, sgstPct, gemc }: LineTaxInput): LineTax {
  const dp = gemc ? 5 : 2;
  // milli-units × 1e-5 units = 1e-8 units.
  const taxable = roundToMoney(BigInt(qty) * BigInt(rate), 8, dp);
  // 1e-5 units × 1e-5 percent / 100 = 1e-12 units.
  const tax = (p: GstPct): Money => roundToMoney(BigInt(taxable) * BigInt(p), 12, dp);
  const cgst = tax(cgstPct);
  const sgst = tax(sgstPct);
  const igst = 0 as Money;
  return { taxable, cgst, sgst, igst, total: (taxable + cgst + sgst + igst) as Money };
}

/** INV-41: header totals are the sums of the lines. */
export function invoiceTotals(lines: readonly LineTax[]): LineTax {
  const sum = (key: keyof LineTax): Money => lines.reduce((total, l) => total + l[key], 0) as Money;
  return { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total") };
}
