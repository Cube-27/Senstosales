// Item and PO status (ARCHITECTURE §6.11). The one place status is derived (INV-64); the UI leads with quantities and
// shows status as a badge (INV-65).
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

/** INV-64 (A-9): over active items only; a PO with no active item is Closed (A2-13, EC-06). */
export function poStatus(itemStatuses: readonly ItemStatus[]): PoStatus {
  const active = itemStatuses.filter((s) => s !== "Cancelled");
  if (active.every((s) => s === "Closed")) return "Closed";
  if (active.every((s) => s !== "Pending")) return "Delivered";
  return "Pending";
}
