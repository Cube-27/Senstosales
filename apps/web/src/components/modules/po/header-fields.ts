// The PO header fields the PO page and the manual PO form show by label (SPEC-06 §4.2, SPEC-10 §2). Fields without a
// column of their own live in the PO's raw header, keyed by the label as the BHEL page prints it; the form writes
// the first label of each field, so a manual PO reads back like a parsed one. Fields the BHEL page never has (Our
// Ref, Supplier GSTIN, GEMC Date, Consignee) are keyed by the legacy form's own label.

import { normalLabel as normal, rawLookup } from "../../../lib/raw-header.ts";

/** A raw-header field: the labels the page may print for it, the first one being the one the form writes. */
export const RAW_FIELDS = {
  supplierName: ["SUPP NAME M/S"],
  supplierCode: ["SUPP CODE"],
  supplierGstin: ["SUPP GSTIN"],
  phone: ["PHONE NO", "PHONE"],
  email: ["EMAIL"],
  ourRef: ["OUR REF"],
  department: ["DVN"],
  enquiryDate: ["ENQ DATE", "ENQUIRY DATE"],
  quotationDate: ["QUOT-DATE", "QUOT DATE"],
  rcNo: ["RC NO"],
  gemcDate: ["GEMC DATE"],
  fobValue: ["FOB VALUE"],
  tinNo: ["TIN NO"],
  eccNo: ["ECC NO"],
  mpctNo: ["MPCT NO"],
  currency: ["CURRENCY"],
  exRate: ["EX RATE"],
  inspectionBy: ["INSPECTION BY"],
  inspectionAt: ["INSPECTION AT", "INSPECTION AT BHEL"],
  consignee: ["CONSIGNEE"],
  consigneeAddress: ["CONSIGNEE ADDRESS"],
  issuerName: ["NAME"],
  designation: ["DESIGNATION"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type RawField = keyof typeof RAW_FIELDS;

/** The field's text in a raw header, or `""` when the page has none. */
export const rawValue = (raw: Readonly<Record<string, string>>, field: RawField): string =>
  rawLookup(raw, RAW_FIELDS[field]);

/**
 * A raw header with `values` set under each field's first label. Labels of the same field printed another way are
 * replaced; every other label the page had is kept.
 */
export function withRawValues(
  raw: Readonly<Record<string, string>>,
  values: Partial<Record<RawField, string>>,
): Record<string, string> {
  const fields = Object.keys(values).filter((f): f is RawField => f in RAW_FIELDS);
  const replaced = new Set(fields.flatMap((f) => RAW_FIELDS[f].map(normal)));
  const kept = Object.entries(raw).filter(([label]) => !replaced.has(normal(label)));
  const set = fields.flatMap((f) => {
    const value = values[f]?.trim() ?? "";
    return value === "" ? [] : [[RAW_FIELDS[f][0], value] as const];
  });
  return Object.fromEntries([...kept, ...set]);
}
