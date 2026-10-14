// Shapes every list and every error share (ARCHITECTURE §9, SPEC-04 §2). Lists take `page`, `pageSize`, `sort`,
// `dir` and typed filters and return `{ items, total }`; every error body is `{ code, message, details? }`.
import { z } from "zod";

/** The legacy pager's page sizes; 10 is its default. */
const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * A list's query string. `sortKeys` is that list's allowlist, so an unknown sort column is a 400 (SPEC-10 §4.2).
 * Build each list's schema once, as a module constant, not per request.
 */
export function zListQuery<const S extends readonly [string, ...string[]], F extends z.ZodRawShape>(
  sortKeys: S,
  filters: F,
) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().pipe(z.literal(PAGE_SIZES)).default(10),
    sort: z.enum(sortKeys).optional(),
    dir: z.enum(["asc", "desc"]).default("asc"),
    ...filters,
  });
}

/** One page of a list and the total row count across all pages. */
export const zPaged = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.int().nonnegative() });

/** Every API error. `message` is plain language for the user (C11); `details` never carries a secret (INV-81). */
export const zErrorBody = z.strictObject({
  code: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
