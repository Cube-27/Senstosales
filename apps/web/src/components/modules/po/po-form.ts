// The legacy manual PO form's values, its checks and the body it sends (SPEC-16 §2, SPEC-10 §2). Amounts are typed
// text until saved; a GEMC item's rate is the GST-inclusive one and the API stores the net derived from it (INV-20).
import type { IsoDate, Money, Qty } from "@senstosales/domain";
import { moneyToString, qtyValue, sumMoney } from "@senstosales/domain";
import type { RouteInput, RouteOutput } from "@senstosales/schemas";
import { fmtDate, parseDateInput } from "@senstosales/schemas/formatters";

import { moneyOf } from "../../../lib/search.ts";
import { blankToNull } from "../../../lib/text.ts";
import { type RawField, rawValue, withRawValues } from "./header-fields.ts";

type Detail = RouteOutput<"po.detail">;
type Body = RouteInput<"po.create">["body"];

/** The raw-header fields the form edits, in the legacy form's order. */
export const FORM_RAW_FIELDS = [
  "department",
  "supplierCode",
  "supplierName",
  "supplierGstin",
  "rcNo",
  "tinNo",
  "eccNo",
  "mpctNo",
  "ourRef",
  "inspectionAt",
  "consignee",
  "consigneeAddress",
] as const satisfies readonly RawField[];

type FormRawField = (typeof FORM_RAW_FIELDS)[number];

export interface FormItem {
  readonly poItemNo: number;
  readonly description: string;
  readonly materialCode: string;
  readonly unit: string;
  readonly ordQty: Qty;
  /** As typed; GST-inclusive on a GEMC PO. */
  readonly rate: string;
  /** The stored lots of an edited item, sent back unchanged; a new item has none (the API adds lot 1). */
  readonly lots: Body["items"][number]["lots"];
  readonly drawingNo: string | null;
}

export interface FormValues {
  readonly poNumber: string;
  readonly poDate: IsoDate | "";
  readonly orderType: string;
  readonly quotation: string;
  readonly gemcNumber: string;
  readonly gemcDate: IsoDate | "";
  readonly remarks: string;
  readonly raw: Record<FormRawField, string>;
  readonly items: FormItem[];
}

/** The form's raw-header fields, each read by `get`. */
const rawOf = (get: (field: FormRawField) => string) =>
  Object.fromEntries(FORM_RAW_FIELDS.map((field) => [field, get(field)])) as Record<FormRawField, string>;

/** A new PO: today's date, as legacy defaulted it, and no items. */
export const emptyForm = (today: IsoDate | ""): FormValues => ({
  poNumber: "",
  poDate: today,
  orderType: "",
  quotation: "",
  gemcNumber: "",
  gemcDate: "",
  remarks: "",
  raw: rawOf(() => ""),
  items: [],
});

/**
 * The next item number on the BHEL pattern (10, 20, …): ten past the largest in the form or ever stored on the PO,
 * cancelled and removed items included. The API matches items by number, so a reused number would take over the old
 * item's id and documents.
 */
export const nextItemNo = (items: readonly Pick<FormItem, "poItemNo">[], stored: readonly number[] = []): number =>
  Math.max(0, ...stored, ...items.map((i) => i.poItemNo)) + 10;

export const newItem = (items: readonly FormItem[], stored: readonly number[] = []): FormItem => ({
  poItemNo: nextItemNo(items, stored),
  description: "",
  materialCode: "",
  unit: "",
  ordQty: 0 as Qty,
  rate: "",
  lots: [],
  drawingNo: null,
});

/**
 * A stored PO as the form shows it for editing; rates are the GST-inclusive source rates (INV-17). Cancelled items
 * stay out: an item sent back would be restored (INV-48), and an amended-out item stays cancelled (INV-63).
 */
export function formFromDetail({ po, items }: Detail): FormValues {
  return {
    poNumber: po.poNumber,
    poDate: po.poDate ?? "",
    orderType: po.orderType ?? "",
    quotation: po.quotation ?? "",
    gemcNumber: po.gemcNumber ?? "",
    gemcDate: parseDateInput(rawValue(po.rawHeader, "gemcDate")) ?? "",
    remarks: po.remarks ?? "",
    raw: rawOf((field) => rawValue(po.rawHeader, field)),
    items: items
      .filter((item) => item.cancelledAt === null)
      .map((item) => ({
        poItemNo: item.poItemNo,
        description: item.description ?? "",
        materialCode: item.materialCode ?? "",
        unit: item.unit ?? "",
        ordQty: item.ordQty,
        rate: moneyToString(item.rateSource),
        lots: item.lots.map(({ lotNo, delyQty, delyDate, destCode }) => ({ lotNo, delyQty, delyDate, destCode })),
        drawingNo: item.drawingNo,
      })),
  };
}

/** A typed rate as money, or null when it is not an amount. */
export const rateOf = moneyOf;

/** An item's value, quantity × rate, as legacy showed it beside the line. */
export const itemValue = (item: Pick<FormItem, "ordQty" | "rate">): Money =>
  qtyValue(item.ordQty, rateOf(item.rate) ?? (0 as Money));

export const formTotal = (items: readonly FormItem[]): Money => sumMoney(items.map(itemValue));

/** The legacy form's checks before saving, in its words; `null` when the form may be saved. */
export function formError(values: FormValues): string | null {
  if (values.poNumber.trim() === "") return "PO Number is required";
  if (values.poDate === "") return "PO Date is required";
  const bad = values.items.findIndex(
    (i) =>
      i.description.trim() === "" ||
      i.materialCode.trim() === "" ||
      i.unit.trim() === "" ||
      i.ordQty <= 0 ||
      (rateOf(i.rate) ?? 0) <= 0,
  );
  if (bad < 0) return null;
  const item = values.items[bad]?.poItemNo ?? `#${bad + 1}`;
  return `Item ${item} has missing mandatory fields (Description, Code, Unit, Qty, Rate)`;
}

/** What an edit keeps from the stored PO: the enquiry and the raw-header labels the form does not show. */
export type Stored = Pick<Detail["po"], "enquiry" | "rawHeader">;

const NOTHING_STORED: Stored = { enquiry: null, rawHeader: {} };

/** The create or update body. */
export function formBody(values: FormValues, stored: Stored = NOTHING_STORED): Body {
  return {
    poNumber: values.poNumber.trim(),
    poDate: values.poDate === "" ? null : values.poDate,
    enquiry: stored.enquiry,
    quotation: blankToNull(values.quotation),
    orderType: blankToNull(values.orderType),
    gemcNumber: blankToNull(values.gemcNumber),
    remarks: blankToNull(values.remarks),
    rawHeader: withRawValues(stored.rawHeader, {
      ...values.raw,
      gemcDate: values.gemcDate === "" ? "" : fmtDate(values.gemcDate),
    }),
    items: values.items.map((item) => ({
      poItemNo: item.poItemNo,
      materialCode: blankToNull(item.materialCode),
      description: blankToNull(item.description),
      drawingNo: item.drawingNo,
      unit: blankToNull(item.unit),
      ordQty: item.ordQty,
      rateSource: rateOf(item.rate) ?? (0 as Money),
      lots: item.lots,
    })),
  };
}
