// Reading page cells into parse results: one error builder and the page number formats (comma grouping removed), so
// every parser reports failures the same way (SPEC-06 §4.4).
import { parseMoney, parseQty } from "@senstosales/domain";
import type { Money, Qty } from "@senstosales/domain";

import type { ParseError, ParseResult } from "./types.ts";

export const fail = (code: ParseError["code"], message: string, location?: string): ParseResult<never> => ({
  ok: false,
  error: location === undefined ? { code, message } : { code, message, location },
});

/** `where` names the cell in the message; `location` defaults to it. */
export function readQty(text: string, where: string, location = where): ParseResult<Qty> {
  const qty = parseQty(text.replaceAll(",", ""));
  return qty.ok ? qty : fail("bad-quantity", `${where} is not a quantity: "${text}"`, location);
}

export function readMoney(text: string, where: string, location = where): ParseResult<Money> {
  const money = parseMoney(text.replaceAll(",", ""));
  return money.ok ? money : fail("bad-number", `${where} is not an amount: "${text}"`, location);
}
