// Shapes every list and every error share (ARCHITECTURE §9, SPEC-04 §2). Lists take `page`, `pageSize`, `sort`,
// `dir` and typed filters and return `{ items, total }`; every error body is `{ code, message, details? }`.
import { z } from "zod";

import { zFy, zId, zIsoDate, zMoney } from "../primitives.ts";

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

export type ErrorBody = z.infer<typeof zErrorBody>;

/** The answer of a write that returns nothing else. */
export const zOk = z.strictObject({ ok: z.literal(true) });

/** A file download (Excel, CSV): the client reads the bytes and the `Content-Disposition` name, not JSON. */
export const zDownload = z.object({ fileName: z.string().min(1), bytes: z.instanceof(Uint8Array) });

/** `:id` in a path. */
export const zIdParams = z.object({ id: zId });

/** A count of rows or documents. */
export const zCount = z.int().nonnegative();

/** A linked document as a link and a popover row show it. */
export const zDocRef = z.object({ id: zId, number: z.string(), date: zIsoDate });

/** A DC or invoice reference carries its FY, since numbers restart each FY (INV-24). */
export const zFyDocRef = zDocRef.extend({ financialYear: zFy });

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

/** Date-range and value filters shared by the document lists (legacy list filter panels). */
export const zRangeFilters = {
  q: z.string().optional(),
  from: zIsoDate.optional(),
  to: zIsoDate.optional(),
  valueMin: zMoney.optional(),
  valueMax: zMoney.optional(),
};
