// Wire codecs for the domain's exact units (SPEC-04 §4.2). Quantities and money cross the wire as decimal strings
// so no float ever touches them (C3); decoding and encoding go through the domain's parsers, never a second copy.
import type { Fy, GstPct, IsoDate, Money, Qty, Result } from "@senstosales/domain";
import {
  moneyToString,
  parseFy,
  parseIsoDate,
  parseMoney,
  parsePct,
  parseQty,
  pctToString,
  qtyToString,
} from "@senstosales/domain";
import { z } from "zod";

/** A wire string decoded by a domain parser; `isValue` guards what may be encoded back. */
function stringCodec<T>(
  parse: (s: string) => Result<T>,
  format: (value: T) => string,
  isValue: (v: unknown) => boolean,
) {
  return z.codec(z.string(), z.custom<T>(isValue), {
    decode: (wire, ctx) => {
      const r = parse(wire);
      if (r.ok) return r.value;
      ctx.issues.push({ code: "custom", message: r.error, input: wire });
      return z.NEVER;
    },
    encode: format,
  });
}

const isUnits = (v: unknown): boolean => Number.isSafeInteger(v);

/** `"2.5"` <-> `2500` milli-units (INV-01). */
export const zQty = stringCodec<Qty>(parseQty, qtyToString, isUnits);

/** `"848.75"` <-> `84875000` 1e-5 units (INV-01). */
export const zMoney = stringCodec<Money>(parseMoney, moneyToString, isUnits);

/** `"9"` <-> `900000` 1e-5 units; never negative (SPEC-03 §9). */
export const zGstPct = stringCodec<GstPct>(parsePct, pctToString, (v) => isUnits(v) && (v as number) >= 0);

/** A real `YYYY-MM-DD` calendar date, the same string on both sides (C3). */
export const zIsoDate = stringCodec<IsoDate>(
  parseIsoDate,
  (d) => d,
  (v) => typeof v === "string" && parseIsoDate(v).ok,
);

/** An instant (`*_at` columns), ISO-8601 UTC (ARCHITECTURE §8.1). */
export const zInstant = z.iso.datetime();

/** A financial-year label such as `"2024-25"`, the same string on both sides; computed only by the domain (C2). */
export const zFy = stringCodec<Fy>(
  parseFy,
  (fy) => fy,
  (v) => typeof v === "string" && parseFy(v).ok,
);

/** Label -> text pairs: a page's raw header, onboarding's bank and invoice defaults. */
export const zTextMap = z.record(z.string(), z.string());

/** Surrogate ids are ULIDs generated in services (C4). */
export const zId = z.ulid();

/** A BHEL PO id (C17). */
export const zPoId = z.string().regex(/^\d{1,10}$/);

/** A count of rows, documents or files. */
export const zCount = z.int().nonnegative();
