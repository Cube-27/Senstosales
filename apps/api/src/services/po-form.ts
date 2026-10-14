// The legacy manual PO form (`/po/create`, SPEC-10 §2): its checks, and the PO values it stands for. Legacy stored
// the form through PO ingest, and so does this (`storePoStatements`); the form's rate is GST-inclusive on a GEMC PO
// and ingest derives the net from it (INV-17, INV-20).
import type { IsoDate, Qty } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { fieldError as invalid } from "../errors.ts";
import type { itemsOfPo, lotsOfPo } from "../repositories/po-list.ts";
import type { PoValues } from "./po-ingest.ts";

export type PoForm = z.output<(typeof routes)["po.create"]["body"]>;

/** What an edit keeps from the stored PO because the form has no field for it. */
export interface Kept {
  readonly header: Pick<PoValues, "amendNo" | "poValue" | "netPoValue"> & { readonly bhelStatusCode: string | null };
  readonly items: Awaited<ReturnType<typeof itemsOfPo>>;
  readonly lots: Awaited<ReturnType<typeof lotsOfPo>>;
}

/** A new PO keeps nothing. */
export const NOTHING_KEPT: Kept = {
  header: { amendNo: 0, poValue: null, netPoValue: null, bhelStatusCode: null },
  items: [],
  lots: [],
};

/** The checks of the legacy form, as 400s: a PO date, at least one item, each item once with qty and rate above 0. */
export function checkForm(form: PoForm): IsoDate {
  if (form.poDate === null) throw invalid("no-po-date", "poDate", "Enter the PO date.");
  if (form.items.length === 0) throw invalid("no-items", "items", "Add at least one item.");
  const seen = new Set<number>();
  form.items.forEach((item, i) => {
    if (seen.has(item.poItemNo)) {
      throw invalid("duplicate-item", `items.${i}.poItemNo`, `Item ${item.poItemNo} is entered twice.`);
    }
    seen.add(item.poItemNo);
    if (item.ordQty <= 0) {
      throw invalid("qty-not-positive", `items.${i}.ordQty`, "Ordered quantity must be more than zero.");
    }
    if (item.rateSource <= 0)
      throw invalid("rate-not-positive", `items.${i}.rateSource`, "Rate must be more than zero.");
  });
  return form.poDate;
}

/**
 * The PO the form describes. The PO document's received and rejected quantities and a lot's entry-allow date are
 * not on the form, so an edit keeps the stored ones. An item sent without lots gets the legacy default: lot 1 of the
 * ordered quantity, due on the PO date.
 */
export function formValues(form: PoForm, poDate: IsoDate, kept: Kept): PoValues {
  const storedItem = new Map(kept.items.map((item) => [item.poItemNo, item]));
  const storedLot = new Map(kept.lots.map((lot) => [`${lot.poItemId}/${lot.lotNo}`, lot]));
  return {
    poNumber: form.poNumber,
    poDate,
    enquiry: form.enquiry,
    quotation: form.quotation,
    orderType: form.orderType,
    remarks: form.remarks,
    // A blank GEMC number field is not a GEMC PO.
    gemcNumber: form.gemcNumber?.trim() || null,
    rawHeader: form.rawHeader,
    poStatusCode: kept.header.bhelStatusCode,
    amendNo: kept.header.amendNo,
    poValue: kept.header.poValue,
    netPoValue: kept.header.netPoValue,
    items: form.items.map((item) => {
      const stored = storedItem.get(item.poItemNo);
      const lots =
        item.lots.length > 0 ? item.lots : [{ lotNo: 1, delyQty: item.ordQty, delyDate: poDate, destCode: null }];
      return {
        poItemNo: item.poItemNo,
        materialCode: item.materialCode,
        description: item.description,
        drawingNo: item.drawingNo,
        unit: item.unit,
        ordQty: item.ordQty,
        rate: item.rateSource,
        rcdQty: stored?.poRcdQty ?? (0 as Qty),
        rejQty: stored?.poRejQty ?? null,
        lots: lots.map((lot) => {
          const old = stored && storedLot.get(`${stored.id}/${lot.lotNo}`);
          return { ...lot, entryAllowDate: old?.entryAllowDate ?? null, entryAllowNote: old?.entryAllowNote ?? null };
        }),
      };
    }),
  };
}

type Audited = Pick<
  PoForm,
  "poNumber" | "poDate" | "enquiry" | "quotation" | "orderType" | "gemcNumber" | "remarks"
> & {
  readonly items: readonly Pick<PoForm["items"][number], "poItemNo" | "materialCode" | "ordQty" | "rateSource">[];
};

/** The form's fields of a PO, from the form or the stored rows, as an audit row's before or after (INV-81). */
export const formAudit = (form: Audited) => ({
  poNumber: form.poNumber,
  poDate: form.poDate,
  enquiry: form.enquiry,
  quotation: form.quotation,
  orderType: form.orderType,
  gemcNumber: form.gemcNumber,
  remarks: form.remarks,
  items: form.items.map(({ poItemNo, materialCode, ordQty, rateSource }) => ({
    poItemNo,
    materialCode,
    ordQty,
    rateSource,
  })),
});
