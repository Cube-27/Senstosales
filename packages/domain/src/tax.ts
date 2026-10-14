// Invoice tax (ARCHITECTURE §6.5, A2-4): CGST + SGST from the GST percentages copied onto the invoice, IGST 0 in v1
// (EC-07). Each amount is rounded once from its exact value: 5 dp on a GEMC PO (A-12, INV-18), else 2 dp (INV-41).
import { MONEY_DP, PCT_DP, QTY_DP, roundToMoney, sumMoney, type GstPct, type Money, type Qty } from "./units.ts";

export type LineTaxInput = { qty: Qty; rate: Money; cgstPct: GstPct; sgstPct: GstPct; gemc: boolean };

export type LineTax = { taxable: Money; cgst: Money; sgst: Money; igst: Money; total: Money };

/** INV-41, INV-18: `3 × 719.27966, 9 % + 9 %, GEMC -> taxable 2157.83898, cgst 194.20551`. */
export function invoiceLineTax({ qty, rate, cgstPct, sgstPct, gemc }: LineTaxInput): LineTax {
  const dp = gemc ? 5 : 2;
  const taxable = roundToMoney(BigInt(qty) * BigInt(rate), QTY_DP + MONEY_DP, dp);
  // Dividing by 100 adds two decimal places.
  const tax = (p: GstPct): Money => roundToMoney(BigInt(taxable) * BigInt(p), MONEY_DP + PCT_DP + 2, dp);
  const cgst = tax(cgstPct);
  const sgst = tax(sgstPct);
  const igst = 0 as Money;
  return { taxable, cgst, sgst, igst, total: (taxable + cgst + sgst + igst) as Money };
}

/** INV-41: header totals are the sums of the lines. */
export function invoiceTotals(lines: readonly LineTax[]): LineTax {
  const sum = (key: keyof LineTax): Money => sumMoney(lines.map((l) => l[key]));
  return { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total") };
}
