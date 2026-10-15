// The DC and invoice lists' derived columns, as the legacy lists and their CSV exports computed them (SPEC-11 §2,
// SPEC-13 §2, INV-68). The spec defines none of them, so they follow the legacy formulas (C18; EC-38, EC-39, EC-40).
import type { ListStatus } from "./status.ts";
import { dcListStatus, invoiceListStatus } from "./status.ts";
import type { Money, Qty } from "./units.ts";
import { qtyValue, sumMoney, sumQty } from "./units.ts";

/**
 * A DC's list totals over its lines: each line's PO item ordered and received quantities (EC-38), its dispatched
 * quantity, and dispatched × the PO item's rate.
 */
export function dcListTotals(lines: readonly { ordQty: Qty; dspQty: Qty; rcdQty: Qty; rate: Money }[]) {
  const sum = (key: "ordQty" | "dspQty" | "rcdQty") => sumQty(lines.map((line) => line[key]));
  return {
    ordQty: sum("ordQty"),
    dspQty: sum("dspQty"),
    rcdQty: sum("rcdQty"),
    value: sumMoney(lines.map((line) => qtyValue(line.dspQty, line.rate))),
  };
}

export type ListProgress = { status: ListStatus; pendingQty: Qty };

const atLeastZero = (q: number) => Math.max(0, q) as Qty;

/** One DC line: its PO item's ordered quantity, the line's dispatch and the item's dispatch on every DC. */
export type DcListLine = { ordQty: Qty; dspQty: Qty; itemDspOnAllDcs: Qty };

/**
 * EC-39: Delivered when the DC's dispatched total reaches its lines' ordered total (within the 0.001 tolerance);
 * Pending Qty is that ordered total less each line item's dispatch on all DCs, at least 0. PO-direct invoices and
 * manual quantities do not count, as in legacy.
 */
export function dcListProgress(lines: readonly DcListLine[]): ListProgress {
  const ordered = sumQty(lines.map((line) => line.ordQty));
  const dispatched = sumQty(lines.map((line) => line.dspQty));
  return {
    status: dcListStatus(dispatched, ordered),
    pendingQty: atLeastZero(ordered - sumQty(lines.map((line) => line.itemDspOnAllDcs))),
  };
}

export type InvoiceListInput = {
  invoiceQty: Qty;
  /** The source DC's dispatched total; null for a PO-direct invoice. */
  sourceDcDspQty: Qty | null;
  /** SRV received quantity resolved to the source DC, or to the invoice when PO-direct (INV-37). */
  receivedQty: Qty;
};

/**
 * EC-40: Delivered Qty is the source DC's dispatched total, or the invoice quantity when PO-direct; Delivered when
 * it reaches the invoice quantity; Pending Qty is the invoice quantity less the received quantity, at least 0.
 */
export function invoiceListProgress({
  invoiceQty,
  sourceDcDspQty,
  receivedQty,
}: InvoiceListInput): ListProgress & { deliveredQty: Qty } {
  const deliveredQty = sourceDcDspQty ?? invoiceQty;
  return {
    deliveredQty,
    status: invoiceListStatus(deliveredQty, invoiceQty),
    pendingQty: atLeastZero(invoiceQty - receivedQty),
  };
}
