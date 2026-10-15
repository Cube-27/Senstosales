// The invoice create form's data (SPEC-18 §2): its values, the totals it shows and the body it sends. A DC-sourced
// invoice carries the DC's lines at the DC qty and PO rate, which the form cannot change (INV-29); a PO-direct one
// carries the lines the user gave a quantity, uninvoiced shown but not enforced (INV-05, INV-31).
import { invoiceLineTax, invoiceTotals, type IsoDate, type LineTax, type Qty, sumQty } from "@senstosales/domain";
import type { RouteOutput } from "@senstosales/schemas";

import { blankToNull } from "../../../lib/text.ts";

export type Preview = RouteOutput<"invoice.previewPo">;
type PreviewLine = Preview["lines"][number];

/** The header fields the form edits, as typed. */
export interface InvoiceFormValues {
  readonly number: string;
  readonly invoiceDate: IsoDate | "";
  readonly buyerName: string;
  readonly buyerAddress: string;
  readonly buyerGstin: string;
  readonly buyerState: string;
  readonly buyerStateCode: string;
  readonly gemcNumber: string;
  readonly gemcDate: IsoDate | "";
  readonly srvNo: string;
  readonly srvDate: IsoDate | "";
  readonly paymentTerms: string;
  readonly despatchDocNo: string;
  readonly transporter: string;
  readonly destination: string;
  readonly vehicleNo: string;
  readonly lrNo: string;
  readonly termsOfDelivery: string;
  /** PO-direct: the typed quantity per preview line, in its order. */
  readonly qty: readonly Qty[];
}

type TextKey = Exclude<keyof InvoiceFormValues, "number" | "invoiceDate" | "gemcDate" | "srvDate" | "qty">;

/** The form's start: the preview's header and no number (INV-27); PO-direct lines start at 0. */
export function formDefaults(preview: Preview | null, today: IsoDate | ""): InvoiceFormValues {
  const h = preview?.header;
  const text = (key: TextKey): string => h?.[key] ?? "";
  const date = (key: "gemcDate" | "srvDate"): IsoDate | "" => h?.[key] ?? "";
  return {
    number: "",
    invoiceDate: today,
    buyerName: text("buyerName"),
    buyerAddress: text("buyerAddress"),
    buyerGstin: text("buyerGstin"),
    buyerState: text("buyerState"),
    buyerStateCode: text("buyerStateCode"),
    gemcNumber: text("gemcNumber"),
    gemcDate: date("gemcDate"),
    srvNo: text("srvNo"),
    srvDate: date("srvDate"),
    paymentTerms: text("paymentTerms"),
    despatchDocNo: text("despatchDocNo"),
    transporter: text("transporter"),
    destination: text("destination"),
    vehicleNo: text("vehicleNo"),
    lrNo: text("lrNo"),
    termsOfDelivery: text("termsOfDelivery"),
    qty: (preview?.lines ?? []).map(() => sumQty([])),
  };
}

/** Each line's invoiced quantity: the DC's when DC-sourced (locked, INV-29), else the typed one. */
const lineQty = (line: PreviewLine, typed: Qty | undefined): Qty => line.qty ?? typed ?? sumQty([]);

/**
 * Each line's tax and the totals, from the one domain tax implementation (INV-41, C2): the totals the API stores on
 * save, never stored by the form.
 */
export function formTotals(preview: Preview | null, qty: readonly Qty[]): { lines: LineTax[]; totals: LineTax } {
  const lines =
    preview === null
      ? []
      : preview.lines.map((line, i) =>
          invoiceLineTax({
            qty: lineQty(line, qty[i]),
            rate: line.rate,
            cgstPct: preview.cgstPct,
            sgstPct: preview.sgstPct,
            gemc: preview.po.isGemc,
          }),
        );
  return { lines, totals: invoiceTotals(lines) };
}

/** The create body, or the legacy save check that refuses it, in its order and words. */
export function invoiceCreateBody(preview: Preview, v: InvoiceFormValues) {
  const number = v.number.trim();
  if (number === "" || v.buyerName.trim() === "") {
    return { error: "Please ensure Invoice Number and Buyer details are present." } as const;
  }
  if (v.invoiceDate === "") return { error: "Invoice date is required." } as const;
  const fields = {
    ...preview.header,
    number,
    invoiceDate: v.invoiceDate,
    buyerName: blankToNull(v.buyerName),
    buyerAddress: blankToNull(v.buyerAddress),
    buyerGstin: blankToNull(v.buyerGstin),
    buyerState: blankToNull(v.buyerState),
    buyerStateCode: blankToNull(v.buyerStateCode),
    gemcNumber: blankToNull(v.gemcNumber),
    gemcDate: v.gemcDate === "" ? null : v.gemcDate,
    srvNo: blankToNull(v.srvNo),
    srvDate: v.srvDate === "" ? null : v.srvDate,
    paymentTerms: blankToNull(v.paymentTerms),
    despatchDocNo: blankToNull(v.despatchDocNo),
    transporter: blankToNull(v.transporter),
    destination: blankToNull(v.destination),
    vehicleNo: blankToNull(v.vehicleNo),
    lrNo: blankToNull(v.lrNo),
    termsOfDelivery: blankToNull(v.termsOfDelivery),
  };
  if (preview.dc !== null) {
    // Exactly the DC's lines at the DC qty and PO rate (INV-28, INV-29).
    const lines = preview.lines.flatMap(({ dcItemId, qty, rate }) =>
      dcItemId === null || qty === null ? [] : [{ dcItemId, qty, rate }],
    );
    return { ...fields, kind: "dc", dcId: preview.dc.id, lines } as const;
  }
  const lines = preview.lines.flatMap((line, i) => {
    const qty = v.qty[i] ?? sumQty([]);
    return qty > 0 ? [{ poItemId: line.poItemId, qty }] : [];
  });
  if (lines.length === 0) return { error: "Enter quantity greater than zero for at least one PO item." } as const;
  return { ...fields, kind: "direct", poId: preview.po.id, lines } as const;
}
