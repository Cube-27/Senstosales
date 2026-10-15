// GEMC (ARCHITECTURE §6.4, A-12, A2-3). A GEMC PO's item rates arrive GST-inclusive; the stored net rate is
// always derived from that source rate, never from a stored net (INV-17).
import type { Money } from "./units.ts";

/** A GST-inclusive GEMC rate as received (INV-17). A net rate is plain `Money`, so it cannot be divided again. */
export type GemcSourceRate = Money & { readonly __gemcSource: true };

/** Marks a rate read from the GST-inclusive source (BHEL page, manual GEMC entry or the stored source column). */
export const gemcSourceRate = (rate: Money): GemcSourceRate => rate as GemcSourceRate;

// INV-19's `\s*[-:/]?\s*` written as `\s*(?:[-:/]\s*)?`: the same matches, without quadratic backtracking on a
// long run of spaces.
const GEMC_NUMBER = /\bGEMC\s*(?:[-:/]\s*)?([A-Z0-9][A-Z0-9-]*)/i;

/** INV-19: the legacy REMARKS pattern; `"GEMC- 5116"` -> `"5116"`, no match -> `null`. */
export function extractGemcNumber(remarks: string): string | null {
  return GEMC_NUMBER.exec(remarks)?.[1] ?? null;
}

/**
 * A2-3: a PO's GEMC number: the one entered, else the one its remarks name, as a BHEL page's are read; `null` for a
 * non-GEMC PO. `(" ", "GEMC- 5116") -> "5116"`.
 */
export function gemcNumberOf(entered: string | null, remarks: string | null): string | null {
  return entered?.trim() || (remarks === null ? null : extractGemcNumber(remarks));
}

/**
 * INV-16: `round5(source / 1.18)` = `source × 50 / 59` on 1e-5 units: `848.75 -> 719.27966`, `118 -> 100`.
 * Split as `source = 59q + r` so the product stays a safe integer; 59 is odd, so there is never an exact tie.
 */
export function gemcNetRate(source: GemcSourceRate): Money {
  const abs = Math.abs(source);
  const r50 = (abs % 59) * 50;
  const rounded = Math.floor(abs / 59) * 50 + Math.floor(r50 / 59) + (r50 % 59 >= 30 ? 1 : 0);
  return (source < 0 ? -rounded : rounded) as Money;
}
