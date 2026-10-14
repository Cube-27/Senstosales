// PO header fields, read by label (SPEC-06 §2). The label vocabulary is the legacy parser's; each pattern matches a
// whole cell, so a heading such as "PURCHASE ORDER DETAILS" is not a label.
import { extractGemcNumber, parseMoney } from "@senstosales/domain";
import type { Money } from "@senstosales/domain";
import { zPoId } from "@senstosales/schemas";

import { parsePageDate } from "../dates.ts";
import { findByLabel } from "../html.ts";
import type { LabelHit, Page } from "../html.ts";
import type { ParseError, ParseResult, PoDocument } from "../types.ts";

/** Canonical name -> label pattern. The name is the error location when the label is not on the page. */
const LABELS = {
  "PURCHASE ORDER": /^PURCHASE ORDER(?: NO\.?)?$/i,
  "PO DATE": /^PO DATE$/i,
  ENQUIRY: /^(?:ENQUIRY|ENQ)[ .:-]*(?:NO\.?)?$/i,
  "ENQ DATE": /^(?:ENQUIRY|ENQ)[ .:-]*DATE$/i,
  QUOTATION: /^QUOTATION$/i,
  "QUOT-DATE": /^QUOT[ -]+DATE$/i,
  "RC NO": /^R[. ]*C[. :-]*(?:NO\.?)?$/i,
  "ORD-TYPE": /^ORD-TYPE$/i,
  "PO STATUS": /^PO STATUS$/i,
  "INSPECTION BY": /^INSPECTION BY$/i,
  "INSPECTION AT": /^INSPECTION AT(?: BHEL)?$/i,
  CURRENCY: /^CURRENCY$/i,
  "EX RATE": /^EX RATE$/i,
  "SUPP NAME M/S": /^SUPP NAME M\/S$/i,
  "SUPP CODE": /^SUPP CODE$/i,
  "TIN NO": /^TIN NO$/i,
  "ECC NO": /^ECC NO$/i,
  "MPCT NO": /^MPCT NO$/i,
  DVN: /^DVN$/i,
  "AMEND NO": /^AMEND NO$/i,
  "PO-VALUE": /^PO-VALUE$/i,
  "NET PO VAL": /^NET PO VAL$/i,
  "FOB VALUE": /^FOB VALUE$/i,
  REMARKS: /^REMARKS$/i,
  NAME: /^NAME$/i,
  DESIGNATION: /^DESIGNATION$/i,
  "PHONE NO": /^PHONE NO$/i,
  PHONE: /^PHONE:?$/i,
  FAX: /^FAX:?$/i,
  EMAIL: /^EMAIL:?$/i,
} satisfies Record<string, RegExp>;
type Field = keyof typeof LABELS;

const PATTERNS = Object.values(LABELS);
const isLabel = (text: string): boolean => PATTERNS.some((pattern) => pattern.test(text));

type PoHeader = Omit<PoDocument, "items">;
type Found = Map<Field, LabelHit>;

export function parsePoHeader(page: Page): ParseResult<PoHeader> {
  const found: Found = new Map();
  for (const [field, pattern] of Object.entries(LABELS) as [Field, RegExp][]) {
    const hit = findByLabel(page, pattern, isLabel);
    if (hit) found.set(field, hit);
  }
  const ids = readIds(found);
  if (!ids.ok) return ids;
  const numbers = readNumbers(found);
  if (!numbers.ok) return numbers;
  const remarks = text(found, "REMARKS");
  return {
    ok: true,
    value: {
      ...ids.value,
      enquiry: text(found, "ENQUIRY"),
      supplierCode: text(found, "SUPP CODE"),
      orderType: text(found, "ORD-TYPE"),
      division: text(found, "DVN"),
      quotation: text(found, "QUOTATION"),
      poStatusCode: text(found, "PO STATUS"),
      ...numbers.value,
      rcNo: text(found, "RC NO"),
      inspection: text(found, "INSPECTION BY") ?? text(found, "INSPECTION AT"),
      currency: text(found, "CURRENCY"),
      remarks,
      gemcNumber: remarks === null ? null : extractGemcNumber(remarks),
      rawHeader: Object.fromEntries([...found.values()].map((hit) => [hit.label, hit.value])),
    },
  };
}

/** The field's text; an absent label or an empty cell is null. */
const text = (found: Found, field: Field): string | null => found.get(field)?.value || null;

/** The error located at the label as printed, or at the field's name when the page lacks it. */
const fail = (found: Found, code: ParseError["code"], field: Field, message: string): ParseResult<never> => ({
  ok: false,
  error: { code, message, location: found.get(field)?.label ?? field },
});

function readIds(found: Found): ParseResult<Pick<PoHeader, "poNumber" | "poDate">> {
  const number = text(found, "PURCHASE ORDER");
  if (number === null) return fail(found, "missing-field", "PURCHASE ORDER", "PURCHASE ORDER is missing");
  const poNumber = zPoId.safeParse(number);
  if (!poNumber.success) {
    return fail(found, "bad-po-number", "PURCHASE ORDER", `PURCHASE ORDER is not a PO number: "${number}"`);
  }
  const date = text(found, "PO DATE");
  if (date === null) return fail(found, "missing-field", "PO DATE", "PO DATE is missing");
  const poDate = parsePageDate(date);
  if (!poDate.ok) return fail(found, "bad-date", "PO DATE", `PO DATE is not a date: "${date}"`);
  return { ok: true, value: { poNumber: poNumber.data, poDate: poDate.value } };
}

/** Amounts and the amendment number, comma grouping removed; an empty amendment number is 0 (legacy). */
function readNumbers(found: Found): ParseResult<Pick<PoHeader, "amendNo" | "poValue" | "netPoValue">> {
  const amend = (text(found, "AMEND NO") ?? "0").replaceAll(",", "");
  if (!/^\d+$/.test(amend)) return fail(found, "bad-number", "AMEND NO", `AMEND NO is not a whole number: "${amend}"`);
  const poValue = readMoney(found, "PO-VALUE");
  if (!poValue.ok) return poValue;
  const netPoValue = readMoney(found, "NET PO VAL");
  if (!netPoValue.ok) return netPoValue;
  return { ok: true, value: { amendNo: Number(amend), poValue: poValue.value, netPoValue: netPoValue.value } };
}

function readMoney(found: Found, field: Field): ParseResult<Money | null> {
  const value = text(found, field);
  if (value === null) return { ok: true, value: null };
  const money = parseMoney(value.replaceAll(",", ""));
  return money.ok ? money : fail(found, "bad-number", field, `${field} is not an amount: "${value}"`);
}
