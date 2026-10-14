// Synthetic BHEL SRV pages in a layout `packages/parsers` reads (SPEC-06): one table, one row per SRV item, every SRV
// of one PO. Synthetic values only (C1).

export interface SrvRow {
  readonly srv: string;
  /** `DD/MM/YYYY`, as on the page. */
  readonly date: string;
  readonly item: number;
  readonly lot?: number;
  readonly srvItem?: number;
  readonly code?: string;
  /** Omitted: the item's PO quantity column is absent from the page when every row omits it. */
  readonly ord?: string;
  readonly rcd?: string;
  readonly accepted?: string;
  readonly rej?: string;
  readonly challan?: string;
  readonly invoice?: string;
}

const tr = (cells: readonly string[], tag = "td") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;

/** An SRV page of PO `po`; the ORD QTY column is printed only when a row gives `ord`. */
export function srvPage(po: string, rows: readonly SrvRow[]): string {
  const withOrd = rows.some((row) => row.ord !== undefined);
  const header = ["PO NO", "SRV NO", "SRV DATE", "PO ITM", "LOT NO", "SRV ITM", "MATERIAL CODE"];
  const tail = ["RECVD QTY", "ACPT QTY", "REJ QTY", "CHALLAN NO", "INV NO"];
  const body = rows.map((row) =>
    tr([
      po,
      row.srv,
      row.date,
      String(row.item),
      String(row.lot ?? 1),
      String(row.srvItem ?? 1),
      row.code ?? `SYN-${row.item}`,
      ...(withOrd ? [row.ord ?? ""] : []),
      row.rcd ?? "4.000",
      row.accepted ?? row.rcd ?? "4.000",
      row.rej ?? "0.000",
      row.challan ?? "",
      row.invoice ?? "",
    ]),
  );
  const columns = [...header, ...(withOrd ? ["ORD QTY"] : []), ...tail];
  return `<html><body><table>${tr(columns, "th")}${body.join("")}</table></body></html>`;
}
