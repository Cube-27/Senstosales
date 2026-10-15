// PO and item status as badges (A-9, INV-65): the stored status, coloured as the legacy PO screens coloured it.
import type { zItemStatus } from "@senstosales/schemas";
import type { z } from "zod";

import { type Status, StatusBadge } from "../../common/index.ts";

type ItemStatus = z.output<typeof zItemStatus>;

const BADGE: Record<ItemStatus, Status> = {
  Pending: "warning",
  Delivered: "success",
  Closed: "success",
  Cancelled: "error",
};

/** A PO's or an item's status; an amended-out item shows Cancelled (INV-63). */
export function StatusCell({ status }: { readonly status: ItemStatus }) {
  return (
    <StatusBadge status={BADGE[status]} size="sm">
      {status}
    </StatusBadge>
  );
}
