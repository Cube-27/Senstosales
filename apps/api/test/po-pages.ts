// Synthetic BHEL PO pages in the layout `packages/parsers` reads (SPEC-06): a label/value header table and an item
// table with one lot per item. Synthetic values only (C1).

export interface PageItem {
  readonly no: number;
  readonly code?: string;
  readonly ord?: string;
  readonly rate?: string;
  readonly rcd?: string;
  readonly rej?: string;
}

export interface PageSpec {
  readonly number?: string;
  /** `DD/MM/YYYY`, as on the page. */
  readonly date: string;
  readonly amend?: number;
  readonly remarks?: string;
  readonly items: readonly PageItem[];
}

const COLUMNS = ["PO ITM", "MATERIAL CODE", "UNIT", "PO RATE", "ORD QTY", "RCD QTY", "REJ QTY"];
const LOT_COLUMNS = ["LOT NO", "DELY QTY", "DELY DATE", "ENTRY ALLOW DATE", "DEST CODE"];

const tr = (cells: readonly string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

const itemRow = (item: PageItem) => {
  const ord = item.ord ?? "10.000";
  return tr([
    String(item.no),
    item.code ?? `SYN-${item.no}`,
    "NOS",
    item.rate ?? "100.00",
    ord,
    item.rcd ?? "0.000",
    item.rej ?? "0.000",
    "1",
    ord,
    "30/06/2025",
    "15/07/2025",
    "11",
  ]);
};

export function poPage({ number = "4500001", date, amend = 0, remarks = "Synthetic order", items }: PageSpec): string {
  const header = tr(["PURCHASE ORDER", number, "PO DATE", date, "AMEND NO", String(amend), "REMARKS", remarks]);
  return `<html><body><table>${header}</table><table>${tr([...COLUMNS, ...LOT_COLUMNS])}${items
    .map(itemRow)
    .join("")}</table></body></html>`;
}
