// Item and PO status (ARCHITECTURE §6.11), and the DC and invoice list rows' status (EC-39, EC-40). The one place
// status is derived (INV-64); the UI leads with quantities and shows status as a badge (INV-65).
import { gte, type Qty } from "./units.ts";

export type ItemStatus = "Pending" | "Delivered" | "Closed" | "Cancelled";
export type PoStatus = "Pending" | "Delivered" | "Closed";

export type ItemStatusInput = { ordQty: Qty; dspQty: Qty; rcdQty: Qty; cancelled: boolean };

/** INV-62, INV-63: Cancelled, else Closed (`rcd >= ord − tol`), else Delivered (`dsp >= ord − tol`), else Pending. */
export function itemStatus({ ordQty, dspQty, rcdQty, cancelled }: ItemStatusInput): ItemStatus {
  if (cancelled) return "Cancelled";
  if (gte(rcdQty, ordQty)) return "Closed";
  if (gte(dspQty, ordQty)) return "Delivered";
  return "Pending";
}

/**
 * INV-64 (A-9): over active items only, so Cancelled items are ignored and a PO with no active item is Closed
 * (A2-13, EC-06).
 */
export function poStatus(itemStatuses: readonly ItemStatus[]): PoStatus {
  if (itemStatuses.includes("Pending")) return "Pending";
  if (itemStatuses.includes("Delivered")) return "Delivered";
  return "Closed";
}

/** A DC or invoice list row's status, which only the list CSVs carry (EC-39, EC-40). */
export type ListStatus = "Delivered" | "Pending";

/** EC-39: a DC is Delivered when its dispatched total reaches its lines' ordered total, within the tolerance. */
export function dcListStatus(dispatched: Qty, ordered: Qty): ListStatus {
  return gte(dispatched, ordered) ? "Delivered" : "Pending";
}

/** EC-40: an invoice is Delivered when its delivered quantity reaches the invoice quantity (no tolerance stated). */
export function invoiceListStatus(delivered: Qty, invoiced: Qty): ListStatus {
  return delivered >= invoiced ? "Delivered" : "Pending";
}
