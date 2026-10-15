import type { Qty } from "@senstosales/domain";
import { fmtQty } from "@senstosales/schemas/formatters";

import type { Column } from "./DataTable.tsx";

/** A right-aligned quantity column, as every list and item table shows one. */
export function qtyColumn<R>(
  key: string,
  header: string,
  value: (row: R) => Qty,
  { sortable = false, width = "90px" }: { readonly sortable?: boolean; readonly width?: string } = {},
): Column<R> {
  return {
    key,
    header,
    width,
    align: "right",
    sortable,
    render: (row) => <span className="tabular-nums">{fmtQty(value(row))}</span>,
  };
}
