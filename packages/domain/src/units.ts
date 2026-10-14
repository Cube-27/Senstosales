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

/**
 * Rounds the exact value `n × 10^-exp` to `dp` decimal places, half away from zero on exact ties (D-0021), and
 * returns it as Money. `n` is a bigint so products of two units never pass through a lossy float; a result past
 * 2^53 units throws rather than lose precision (D-0022).
 */
export function roundToMoney(n: bigint, exp: number, dp: 2 | 5): Money {
  const step = 10n ** BigInt(exp - dp);
  const abs = n < 0n ? -n : n;
  const rounded = (abs / step + ((abs % step) * 2n >= step ? 1n : 0n)) * 10n ** BigInt(MONEY_DP - dp);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`Amount out of range: ${n}e-${exp}`);
  return (n < 0n && rounded !== 0n ? -Number(rounded) : Number(rounded)) as Money;
}

/** Rounds to 2 or 5 decimal places (A2-4), half away from zero on exact ties (SPEC-03 §9). */
export const roundMoney = (m: Money, dp: 2 | 5): Money => roundToMoney(BigInt(m), MONEY_DP, dp);
