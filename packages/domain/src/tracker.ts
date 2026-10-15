// The delivery tracker's due rules (SPEC-10 §2), as the legacy tracker shows them (A-22). Quantities stay per item
// (INV-06): a lot row carries its item's status, so every lot of a dispatched item stops being due together.
import type { IsoDate } from "./dates.ts";
import { daysBetween } from "./dates.ts";
import type { ItemStatus } from "./status.ts";

/** "Due soon" runs from today to this many days ahead, both ends included. */
export const DUE_SOON_DAYS = 7;

export type DeliveryDue = {
  /** Days from today to the delivery date, negative when it has passed. */
  daysToDue: number;
  /** On the tracker at all: the item is not yet received in full (Pending or Delivered). */
  open: boolean;
  /** Past the date and not yet dispatched in full (Pending). */
  overdue: boolean;
  /** Within `DUE_SOON_DAYS` of today and not yet dispatched in full. */
  dueSoon: boolean;
  /** In today's calendar month and not yet received in full. */
  dueThisMonth: boolean;
};

/** `(2025-05-30, today 2025-06-01, Pending) -> daysToDue -2, overdue`; `Delivered` is never overdue. */
export function deliveryDue(delyDate: IsoDate, today: IsoDate, status: ItemStatus): DeliveryDue {
  const daysToDue = daysBetween(today, delyDate);
  const pending = status === "Pending";
  const open = pending || status === "Delivered";
  return {
    daysToDue,
    open,
    overdue: pending && daysToDue < 0,
    dueSoon: pending && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS,
    dueThisMonth: open && delyDate.slice(0, 7) === today.slice(0, 7),
  };
}
