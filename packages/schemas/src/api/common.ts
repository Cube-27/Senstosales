// Shapes every list and every error share (ARCHITECTURE §9, SPEC-04 §2). Lists take `page`, `pageSize`, `sort`,
// `dir` and typed filters and return `{ items, total }`; every error body is `{ code, message, details? }`.
import { z } from "zod";

import { zPo, zPoItem } from "../entities/po.ts";
import { zCount, zFy, zId, zIsoDate, zMoney } from "../primitives.ts";

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
export const zPaged = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: zCount });

/** Every API error. `message` is plain language for the user (C11); `details` never carries a secret (INV-81). */
export const zErrorBody = z.strictObject({
  code: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorBody = z.infer<typeof zErrorBody>;

/** A list query without paging, for exports (INV-99). */
export const zUnpaged = <S extends z.ZodRawShape & { page: z.ZodType; pageSize: z.ZodType }>(
  query: z.ZodObject<S>,
): z.ZodObject<Omit<S, "page" | "pageSize">> =>
  // `omit` cannot type its mask against a generic shape; `S` has both keys by its bound.
  query.omit({ page: true, pageSize: true } as never) as unknown as z.ZodObject<Omit<S, "page" | "pageSize">>;

/**
 * A repeated query key (`types=po&types=dc`) as an array. One value arrives as a plain string; encoding gives the
 * array back for the client to repeat.
 */
export const zRepeated = <T extends z.ZodType<string, string>>(item: T) =>
  z.codec(z.union([z.string(), z.array(z.string())]), z.array(item), {
    // `T` reads and writes strings, so its input is a string; TypeScript cannot narrow a generic's input.
    decode: (wire) => [wire].flat() as z.input<T>[],
    encode: (values) => values as string[],
  });

/** The answer of a write that returns nothing else. */
export const zOk = z.strictObject({ ok: z.literal(true) });

/** A linked document as a link and a popover row show it. */
export const zDocRef = z.object({ id: zId, number: z.string(), date: zIsoDate });

/** A DC or invoice reference carries its FY, since numbers restart each FY (INV-24). */
export const zFyDocRef = zDocRef.extend({ financialYear: zFy });

/** A PO's linked documents, for the popovers and search previews (INV-73). */
export const zLinkedDocs = z.object({
  dcs: z.array(zFyDocRef),
  invoices: z.array(zFyDocRef),
  srvs: z.array(zDocRef),
});

/** The PO a DC or invoice belongs to; GEMC switches the rate display to 5 dp (A-12). */
export const zPoRef = zPo.pick({ id: true, poNumber: true, isGemc: true });

/** The PO item columns a document or report line shows. */
export const zItemInfo = zPoItem.pick({
  poItemNo: true,
  materialCode: true,
  description: true,
  drawingNo: true,
  unit: true,
  rate: true,
});

/** One BHEL HTML file, read by the browser and sent as JSON (INV-102); at most 10 MB each (INV-110). */
const zUploadFile = z.object({ name: z.string().min(1), html: z.string() });

export const zUploadBody = z.object({ files: z.array(zUploadFile).min(1) });

/** Per-file outcome of an upload: accepted, skipped as older (INV-42, INV-43) or failed with a reason (INV-50). */
export const zUploadResults = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["accepted", "skipped", "failed"]),
      reason: z.string().nullable(),
    }),
  ),
});

export const zDateRange = { from: zIsoDate.optional(), to: zIsoDate.optional() };

/** Text, date-range and value filters of the legacy list filter panels. */
export const zRangeFilters = {
  q: z.string().optional(),
  ...zDateRange,
  valueMin: zMoney.optional(),
  valueMax: zMoney.optional(),
};
