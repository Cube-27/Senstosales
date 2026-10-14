import type { Result } from "./result.ts";

export type IsoDate = string & { readonly __brand: "IsoDate" };
export const parseIsoDate = (_s: string): Result<IsoDate> => ({ ok: false, error: "todo" });
export const compareIsoDate = (_a: IsoDate, _b: IsoDate): -1 | 0 | 1 => 0;
