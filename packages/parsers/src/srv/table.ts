// The SRV table and its rows (SPEC-06 §2). A table is an SRV table when its first row has an SRV-number header;
// columns are found by header text, so both page layouts read the same way. The header vocabulary is the legacy
// parser's.
import { parseQty } from "@senstosales/domain";
import type { IsoDate, Qty } from "@senstosales/domain";
import { zPoId } from "@senstosales/schemas";

import { parsePageDate } from "../dates.ts";
import { mapColumnsByHeader } from "../html.ts";
import type { Page } from "../html.ts";
import type { ParseError, ParseResult, SrvDocument } from "../types.ts";

/** Column -> header pattern. */
const HEADERS = {
  poNumber: /^(?:PO NO|PO NUMBER|PURCHASE ORDER)$/i,
  srvNumber: /^SRV (?:NO|NUMBER)$/i,
  srvDate: /^(?:SRV DATE|DATE|RECEIPT DATE)$/i,
  poItemNo: /^(?:PO ITM|PO ITEM|ITEM NO)$/i,
  lotNo: /^LOT(?: NO)?$/i,
  srvItemNo: /^SRV (?:ITM|ITEM NO)$/i,
  materialCode: /^MATERIAL CODE$/i,
  ordQty: /^(?:ORD|ORDER|PO) QTY$/i,
  rcdQty: /^(?:RECVD|RECEIVED|RECD) QTY$/i,
  acceptedQty: /^(?:ACPT QTY|ACCEPTED(?: QTY)?)$/i,
  rejQty: /^(?:REJ QTY|REJECTED(?: QTY)?)$/i,
  challanNo: /^CHALLAN (?:NO|NUMBER)$/i,
  challanDate: /^(?:CHALLAN DATE|CHALLAN DT|CHL DT)$/i,
  invoiceNo: /^(?:INV NO|INVOICE NO|INVOICE NUMBER|TAX INV)$/i,
  invoiceDate: /^(?:INV DATE|INVOICE DATE|INVOICE DT|TAX INV DT)$/i,
} satisfies Record<string, RegExp>;
type Column = keyof typeof HEADERS;

/** The location of a column the table lacks. */
const NAMES: Record<Column, string> = {
  poNumber: "PO NO",
  srvNumber: "SRV NO",
  srvDate: "SRV DATE",
  poItemNo: "PO ITM",
  lotNo: "LOT NO",
  srvItemNo: "SRV ITM",
  materialCode: "MATERIAL CODE",
  ordQty: "ORD QTY",
  rcdQty: "RECVD QTY",
  acceptedQty: "ACPT QTY",
  rejQty: "REJ QTY",
  challanNo: "CHALLAN NO",
  challanDate: "CHALLAN DATE",
  invoiceNo: "INV NO",
  invoiceDate: "INV DATE",
};

export type SrvTable = { header: string[]; columns: Partial<Record<Column, number>>; rows: string[][] };

/** Every table whose first row has an SRV-number header. */
export const srvTables = (page: Page): SrvTable[] =>
  page.flatMap(([header, ...rows]) => {
    if (!header) return [];
    const columns = mapColumnsByHeader(header, HEADERS);
    return columns.srvNumber === undefined ? [] : [{ header, columns, rows }];
  });

export type SrvItem = SrvDocument["items"][number];
export type SrvRow = Pick<SrvDocument, "poNumber" | "srvNumber" | "srvDate"> & { item: SrvItem };

/** The column header as printed, or its name when the table lacks it. */
function columnLabel(table: SrvTable, column: Column): string {
  const index = table.columns[column];
  return (index === undefined ? undefined : table.header[index]) ?? NAMES[column];
}

/** A cell reader for one row; `rowNo` counts the header as row 1. */
const cellsOf = (table: SrvTable, row: string[], rowNo: number) => ({
  /** The cell's text; "" when the table lacks the column. */
  text(column: Column): string {
    const index = table.columns[column];
    return index === undefined ? "" : (row[index] ?? "");
  },
  /** An error at this row and column; the message reads "<column> <detail>". */
  fail(code: ParseError["code"], column: Column, detail: string): ParseResult<never> {
    const label = columnLabel(table, column);
    return { ok: false, error: { code, message: `${label} ${detail}`, location: `row ${rowNo}, ${label}` } };
  },
});
type Cells = ReturnType<typeof cellsOf>;

/** Legacy skips rows with fewer than 5 cells and rows whose SRV number has no digit (totals, notes). */
export const isDataRow = (table: SrvTable, row: string[]): boolean =>
  row.length >= 5 && /\d/.test(row[table.columns.srvNumber ?? -1] ?? "");

/** One data row; `filePo` is the PO number of the file's earlier rows, which this row must share. */
export function readRow(table: SrvTable, row: string[], rowNo: number, filePo?: string): ParseResult<SrvRow> {
  const cells = cellsOf(table, row, rowNo);
  const ids = readIds(cells, filePo);
  if (!ids.ok) return ids;
  const keys = readKeys(cells);
  if (!keys.ok) return keys;
  const quantities = readQuantities(cells);
  if (!quantities.ok) return quantities;
  const challanDate = optionalDate(cells, "challanDate");
  if (!challanDate.ok) return challanDate;
  const invoiceDate = optionalDate(cells, "invoiceDate");
  if (!invoiceDate.ok) return invoiceDate;
  const item: SrvItem = {
    ...keys.value,
    materialCode: cells.text("materialCode") || null,
    ...quantities.value,
    challanNo: cells.text("challanNo") || null,
    challanDate: challanDate.value,
    invoiceNo: cells.text("invoiceNo") || null,
    invoiceDate: invoiceDate.value,
  };
  return { ok: true, value: { ...ids.value, item } };
}

function readIds(cells: Cells, filePo: string | undefined): ParseResult<Omit<SrvRow, "item">> {
  const number = cells.text("poNumber");
  if (number === "") return cells.fail("missing-field", "poNumber", `is empty`);
  const poNumber = zPoId.safeParse(number);
  if (!poNumber.success) {
    return cells.fail("bad-po-number", "poNumber", `is not a PO number: "${number}"`);
  }
  if (filePo !== undefined && poNumber.data !== filePo) {
    return cells.fail("mixed-po-numbers", "poNumber", `is ${number}, but the file is of PO ${filePo}`);
  }
  const date = cells.text("srvDate");
  if (date === "") return cells.fail("missing-field", "srvDate", `is empty`);
  const srvDate = parsePageDate(date);
  if (!srvDate.ok) return cells.fail("bad-date", "srvDate", `is not a date: "${date}"`);
  return { ok: true, value: { poNumber: poNumber.data, srvNumber: cells.text("srvNumber"), srvDate: srvDate.value } };
}

function readKeys(cells: Cells): ParseResult<Pick<SrvItem, "poItemNo" | "lotNo" | "srvItemNo">> {
  const poItemNo = itemNo(cells, "poItemNo");
  if (!poItemNo.ok) return poItemNo;
  const lotNo = itemNo(cells, "lotNo");
  if (!lotNo.ok) return lotNo;
  const srvItemNo = itemNo(cells, "srvItemNo");
  if (!srvItemNo.ok) return srvItemNo;
  return { ok: true, value: { poItemNo: poItemNo.value, lotNo: lotNo.value, srvItemNo: srvItemNo.value } };
}

function itemNo(cells: Cells, column: "poItemNo" | "lotNo" | "srvItemNo"): ParseResult<number> {
  const text = cells.text(column);
  if (text === "") return cells.fail("missing-field", column, `is empty`);
  const value = /^\d+$/.test(text) ? Number(text) : 0;
  return value > 0 ? { ok: true, value } : cells.fail("bad-number", column, `is not an item number: "${text}"`);
}

/** Received and rejected read an empty cell as 0, ordered and accepted as null (legacy). */
function readQuantities(cells: Cells): ParseResult<Pick<SrvItem, "ordQty" | "rcdQty" | "acceptedQty" | "rejQty">> {
  const ordQty = quantity(cells, "ordQty");
  if (!ordQty.ok) return ordQty;
  const rcdQty = quantity(cells, "rcdQty");
  if (!rcdQty.ok) return rcdQty;
  const acceptedQty = quantity(cells, "acceptedQty");
  if (!acceptedQty.ok) return acceptedQty;
  const rejQty = quantity(cells, "rejQty");
  if (!rejQty.ok) return rejQty;
  return {
    ok: true,
    value: {
      ordQty: ordQty.value,
      rcdQty: rcdQty.value ?? ZERO,
      acceptedQty: acceptedQty.value,
      rejQty: rejQty.value ?? ZERO,
    },
  };
}

const ZERO = 0 as Qty;

/** A non-negative quantity, comma grouping removed; an empty cell is null. */
function quantity(cells: Cells, column: "ordQty" | "rcdQty" | "acceptedQty" | "rejQty"): ParseResult<Qty | null> {
  const text = cells.text(column);
  if (text === "") return { ok: true, value: null };
  const qty = parseQty(text.replaceAll(",", ""));
  return qty.ok && qty.value >= 0 ? qty : cells.fail("bad-quantity", column, `is not a quantity: "${text}"`);
}

function optionalDate(cells: Cells, column: "challanDate" | "invoiceDate"): ParseResult<IsoDate | null> {
  const text = cells.text(column);
  if (text === "") return { ok: true, value: null };
  const date = parsePageDate(text);
  return date.ok ? date : cells.fail("bad-date", column, `is not a date: "${text}"`);
}
