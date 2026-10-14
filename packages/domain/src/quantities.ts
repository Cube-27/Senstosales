// Per-item quantities and PO header totals (ARCHITECTURE §6.2). Quantities are tracked per PO item only; nothing
// here takes lots, so nothing is ever allocated to one (INV-06).
import { sumQty, type Qty } from "./units.ts";

export type ItemQuantityInput = {
  ordQty: Qty;
  cancelled: boolean;
  /** Every DC line on the item. */
  dcDispatch: readonly Qty[];
  /** PO-direct invoice lines on the item. */
  directInvoiceQty: readonly Qty[];
  /** DC-sourced invoice lines on the item: counted as invoiced, never as dispatched (INV-03). */
  dcInvoiceQty: readonly Qty[];
  /** A-15, default 0. */
  manualDispatchedQty: Qty;
  /** The date-winner received quantity (§6.3); rejected quantity never enters these formulas (A-11). */
  rcdQty: Qty;
};

/** `uninvoicedQty` may be negative (INV-05). */
export type ItemQuantities = { dspQty: Qty; balanceQty: Qty; uninvoicedQty: Qty };

/** INV-03, INV-04, INV-05, INV-07, INV-08. */
export function computeItemQuantities(input: ItemQuantityInput): ItemQuantities {
  const directQty = sumQty(input.directInvoiceQty);
  const dspQty = (sumQty(input.dcDispatch) + directQty + input.manualDispatchedQty) as Qty;
  const balanceQty = (input.cancelled ? 0 : Math.max(0, input.ordQty - Math.max(input.rcdQty, dspQty))) as Qty;
  const uninvoicedQty = (input.ordQty - sumQty(input.dcInvoiceQty) - directQty) as Qty;
  return { dspQty, balanceQty, uninvoicedQty };
}

export type PoTotals = { ordQty: Qty; dspQty: Qty; rcdQty: Qty; rejQty: Qty; balanceQty: Qty };

export type PoTotalsItem = PoTotals & { cancelled: boolean };

/** INV-07: header totals are sums over active items; a cancelled item contributes 0. */
export function computePoTotals(items: readonly PoTotalsItem[]): PoTotals {
  const total = (key: keyof PoTotals): Qty => sumActive(items, (i) => i[key]);
  return {
    ordQty: total("ordQty"),
    dspQty: total("dspQty"),
    rcdQty: total("rcdQty"),
    rejQty: total("rejQty"),
    balanceQty: total("balanceQty"),
  };
}

/**
 * INV-05, INV-07: the PO's uninvoiced quantity shown on the PO list; the sum over active items, negative items
 * included (uninvoiced is displayed, never enforced).
 */
export function poUninvoicedQty(items: readonly { uninvoicedQty: Qty; cancelled: boolean }[]): Qty {
  return sumActive(items, (i) => i.uninvoicedQty);
}

/** INV-07: a cancelled item contributes 0 to a PO total. */
function sumActive<T extends { cancelled: boolean }>(items: readonly T[], qty: (item: T) => Qty): Qty {
  return sumQty(items.filter((i) => !i.cancelled).map(qty));
}
