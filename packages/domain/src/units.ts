import type { Result } from "./result.ts";

export type Qty = number & { readonly __brand: "Qty" };
export type Money = number & { readonly __brand: "Money" };
export const TOL = 0 as Qty;
export const parseQty = (_s: string): Result<Qty> => ({ ok: false, error: "todo" });
export const parseMoney = (_s: string): Result<Money> => ({ ok: false, error: "todo" });
export const qtyToString = (_q: Qty): string => "";
export const moneyToString = (_m: Money): string => "";
export const sumQty = (_qs: readonly Qty[]): Qty => 0 as Qty;
export const gte = (_a: Qty, _b: Qty): boolean => false;
export const gtTol = (_a: Qty, _b: Qty): boolean => false;
export const roundMoney = (m: Money, _dp: 2 | 5): Money => m;
