import type { Money, Qty, Result } from "../src/index.ts";
import { parseMoney, parseQty } from "../src/index.ts";

/** Builds a test input from its literal string; a parse failure fails the test. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export const qty = (s: string): Qty => unwrap(parseQty(s));

export const money = (s: string): Money => unwrap(parseMoney(s));
