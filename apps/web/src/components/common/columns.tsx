import type { Qty } from "@senstosales/domain";
import { fmtQty } from "@senstosales/schemas/formatters";

import type { Column } from "./DataTable.tsx";

/** A date column's width: `dd/mm/yyyy` and the sort arrow, uncut (UI-CELL). */
export const DATE_WIDTH = "116px";

const shown = (qty: Qty | null): string => (qty === null ? "" : fmtQty(qty));

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
    // A quantity wider than its column is cut; the title holds it in full.
    title: (row) => shown(value(row)),
    render: (row) => <span className="tabular-nums">{shown(value(row))}</span>,
  };
}
