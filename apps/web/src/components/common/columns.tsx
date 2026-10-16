import type { Qty } from "@senstosales/domain";
import { fmtQty } from "@senstosales/schemas/formatters";

import type { Column } from "./DataTable.tsx";

/** A date column's width: `dd/mm/yyyy` and the sort arrow, uncut (UI-CELL). */
export const DATE_WIDTH = "116px";

/** A right-aligned quantity column, as every list and item table shows one; a missing quantity shows empty. */
export function qtyColumn<R>(
  key: string,
  header: string,
  value: (row: R) => Qty | null,
  { sortable = false, width = "90px" }: { readonly sortable?: boolean; readonly width?: string } = {},
): Column<R> {
  return {
    key,
    header,
    width,
    align: "right",
    sortable,
    render: (row) => {
      const qty = value(row);
      return <span className="tabular-nums">{qty === null ? "" : fmtQty(qty)}</span>;
    },
  };
}
