// Exact units (ARCHITECTURE §6.1). Quantities are integer milli-units and money integer 1e-5 units (INV-01);
// decimal strings convert by string scaling, never through a float. Quantity comparisons go through `gte` and
// `gtTol` only (INV-02).
import type { Result } from "./result.ts";

export type Qty = number & { readonly __brand: "Qty" };
export type Money = number & { readonly __brand: "Money" };

const QTY_DP = 3;
const MONEY_DP = 5;

/** Quantity tolerance 0.001 (INV-02): one milli-unit. */
export const TOL = 1 as Qty;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

// More fractional digits than the unit holds is an error, never a silent rounding (SPEC-02 §9).
function parseScaled(s: string, dp: number): Result<number> {
  const m = DECIMAL.exec(s);
  if (!m) return { ok: false, error: `Not a decimal number: "${s}"` };
  const [, sign, int = "", frac = ""] = m;
  if (frac.length > dp) return { ok: false, error: `More than ${dp} decimal places: "${s}"` };
  const magnitude = Number(int + frac.padEnd(dp, "0"));
  if (!Number.isSafeInteger(magnitude)) return { ok: false, error: `Out of range: "${s}"` };
  return { ok: true, value: sign && magnitude !== 0 ? -magnitude : magnitude };
}

function scaledToString(n: number, dp: number): string {
  const digits = String(Math.abs(n)).padStart(dp + 1, "0");
  const frac = digits.slice(-dp).replace(/0+$/, "");
  return `${n < 0 ? "-" : ""}${digits.slice(0, -dp)}${frac ? `.${frac}` : ""}`;
}

/** INV-01: `"2.5"` -> `2500`. */
export const parseQty = (s: string): Result<Qty> => parseScaled(s, QTY_DP) as Result<Qty>;

/** INV-01: `"848.75"` -> `84875000`. */
export const parseMoney = (s: string): Result<Money> => parseScaled(s, MONEY_DP) as Result<Money>;

export const qtyToString = (q: Qty): string => scaledToString(q, QTY_DP);

export const moneyToString = (m: Money): string => scaledToString(m, MONEY_DP);

/** INV-01: exact integer sum; `0.1 + 0.2` -> `300`. */
export const sumQty = (qs: readonly Qty[]): Qty => qs.reduce((total, q) => total + q, 0) as Qty;

/** INV-02: `a >= b − 0.001`. */
export const gte = (a: Qty, b: Qty): boolean => a >= b - TOL;

/** INV-02: `a > b + 0.001`. */
export const gtTol = (a: Qty, b: Qty): boolean => a > b + TOL;

/** Rounds to 2 or 5 decimal places (A2-4), half away from zero on exact ties (SPEC-03 §9). */
export function roundMoney(m: Money, dp: 2 | 5): Money {
  const step = 10 ** (MONEY_DP - dp);
  const abs = Math.abs(m);
  const rest = abs % step;
  const rounded = abs - rest + (rest * 2 >= step ? step : 0);
  return (m < 0 && rounded !== 0 ? -rounded : rounded) as Money;
}
