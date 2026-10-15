// The SRV table and its rows (SPEC-06 §2). A table is an SRV table when its first row has an SRV-number header;
// columns are found by header text, so every page layout reads the same way. The header vocabulary is the legacy
// parser's. Every cell is kept as printed: BHEL's document is the source of truth, so an odd row (PO ITM 0, a repeated
// key) is stored and flagged downstream, never refused (A2-10).
import type { IsoDate, Qty } from "@senstosales/domain";
import { parseQty } from "@senstosales/domain";
import { zPoId } from "@senstosales/schemas";

import { parsePageDate } from "../dates.ts";
import { mapColumnsByHeader } from "../html.ts";
import type { Page } from "../html.ts";
import type { ParseError, ParseResult, SrvDocument } from "../types.ts";

/** Column -> header pattern. */
const HEADERS = {
  division: /^(?:DIV|DIV CODE|DIVISION)$/i,
  poNumber: /^(?:PO NO|PO NUMBER|PURCHASE ORDER)$/i,
  poItemNo: /^(?:PO ITM|PO ITEM|ITEM NO)$/i,
  subItemNo: /^SUB (?:ITM|ITEM)$/i,
  pmirNo: /^PMIR(?: NO)?$/i,
  srvNumber: /^SRV (?:NO|NUMBER)$/i,
  srvItemNo: /^SRV (?:ITM|ITEM NO)$/i,
  revNo: /^(?:REV NO|REVISION)$/i,
  srvDate: /^(?:SRV DATE|DATE|RECEIPT DATE)$/i,
  lotNo: /^LOT(?: NO)?$/i,
  materialCode: /^MATERIAL CODE$/i,
  challanNo: /^CHALLAN (?:NO|NUMBER)$/i,
  challanDate: /^(?:CHALLAN DATE|CHALLAN DT|CHL DT)$/i,
  invoiceNo: /^(?:INV NO|INVOICE NO|INVOICE NUMBER|TAX INV)$/i,
  invoiceDate: /^(?:INV DATE|INVOICE DATE|INVOICE DT|TAX INV DT)$/i,
  financeDate: /^FINANCE (?:DT|DATE)$/i,
  cnoteNo: /^CNOTE(?: NO\.?)?$/i,
  cnoteDate: /^CNOTE (?:DT|DATE)$/i,
  unit: /^(?:UNIT|UOM)$/i,
  ordQty: /^(?:ORD|ORDER|PO) QTY$/i,
  challanQty: /^CHALLAN (?:QTY|QUANTITY)$/i,
  rcdQty: /^(?:RECVD|RECEIVED|RECD) QTY$/i,
  acceptedQty: /^(?:ACPT QTY|ACCEPTED(?: QTY)?)$/i,
  rejQty: /^(?:REJ QTY|REJECTED(?: QTY)?)$/i,
} satisfies Record<string, RegExp>;
type Column = keyof typeof HEADERS;

const TEXT_COLUMNS = [
  "division",
  "subItemNo",
  "pmirNo",
  "revNo",
  "materialCode",
  "challanNo",
  "invoiceNo",
  "cnoteNo",
  "unit",
] as const;
const DATE_COLUMNS = ["challanDate", "invoiceDate", "financeDate", "cnoteDate"] as const;
const QTY_COLUMNS = ["ordQty", "challanQty", "rcdQty", "acceptedQty", "rejQty"] as const;

/** The location of a required column the table lacks. */
const NAMES: Partial<Record<Column, string>> = {
  poNumber: "PO NO",
  srvDate: "SRV DATE",
  poItemNo: "PO ITM",
  srvItemNo: "SRV ITM",
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
/** A row's item, without its place in the SRV, which the caller counts. */
export type SrvRowItem = Omit<SrvItem, "rowNo">;
export type SrvRow = Pick<SrvDocument, "poNumber" | "srvNumber" | "srvDate"> & { item: SrvRowItem };

/** The column header as printed, or its name when the table lacks it. */
function columnLabel(table: SrvTable, column: Column): string {
  const index = table.columns[column];
  return (index === undefined ? undefined : table.header[index]) ?? NAMES[column] ?? column;
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

/** The SRV number of a data row. */
export const srvNumberOf = (table: SrvTable, row: string[]): string => row[table.columns.srvNumber ?? -1] ?? "";

/** One data row; `filePo` is the PO number of the file's earlier rows, which this row must share. */
export function readRow(table: SrvTable, row: string[], rowNo: number, filePo?: string): ParseResult<SrvRow> {
  const cells = cellsOf(table, row, rowNo);
  const ids = readIds(cells, filePo);
  if (!ids.ok) return ids;
  const keys = readKeys(cells);
  if (!keys.ok) return keys;
  const quantities = readEach(cells, QTY_COLUMNS, quantity);
  if (!quantities.ok) return quantities;
  const dates = readEach(cells, DATE_COLUMNS, optionalDate);
  if (!dates.ok) return dates;
  const text = Object.fromEntries(TEXT_COLUMNS.map((column) => [column, cells.text(column) || null])) as Record<
    (typeof TEXT_COLUMNS)[number],
    string | null
  >;
  const rawRow = Object.fromEntries(table.header.map((label, i) => [label, row[i] ?? ""]));
  const item: SrvRowItem = { ...keys.value, ...text, ...quantities.value, ...dates.value, rawRow };
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

/** PO ITM and SRV ITM are required; LOT NO is optional (current pages have none). 0 is kept as printed. */
function readKeys(cells: Cells): ParseResult<Pick<SrvItem, "poItemNo" | "lotNo" | "srvItemNo">> {
  const poItemNo = itemNo(cells, "poItemNo");
  if (!poItemNo.ok) return poItemNo;
  const srvItemNo = itemNo(cells, "srvItemNo");
  if (!srvItemNo.ok) return srvItemNo;
  const lotNo = cells.text("lotNo") === "" ? { ok: true as const, value: null } : itemNo(cells, "lotNo");
  if (!lotNo.ok) return lotNo;
  return { ok: true, value: { poItemNo: poItemNo.value, lotNo: lotNo.value, srvItemNo: srvItemNo.value } };
}

function itemNo(cells: Cells, column: "poItemNo" | "lotNo" | "srvItemNo"): ParseResult<number> {
  const text = cells.text(column);
  if (text === "") return cells.fail("missing-field", column, `is empty`);
  // A number past 2^53 would be read rounded and could match another item.
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
    ? { ok: true, value: Number(text) }
    : cells.fail("bad-number", column, `is not an item number: "${text}"`);
}

/** Each of `columns` read by `read`, or the first failure. */
function readEach<C extends Column, T>(
  cells: Cells,
  columns: readonly C[],
  read: (cells: Cells, column: C) => ParseResult<T>,
): ParseResult<Record<C, T>> {
  const values: Partial<Record<C, T>> = {};
  for (const column of columns) {
    const value = read(cells, column);
    if (!value.ok) return value;
    values[column] = value.value;
  }
  return { ok: true, value: values as Record<C, T> };
}

/** A non-negative quantity, comma grouping removed; an empty cell is null, as printed. */
function quantity(cells: Cells, column: (typeof QTY_COLUMNS)[number]): ParseResult<Qty | null> {
  const text = cells.text(column);
  if (text === "") return { ok: true, value: null };
  const qty = parseQty(text.replaceAll(",", ""));
  return qty.ok && qty.value >= 0 ? qty : cells.fail("bad-quantity", column, `is not a quantity: "${text}"`);
}

function optionalDate(cells: Cells, column: (typeof DATE_COLUMNS)[number]): ParseResult<IsoDate | null> {
  const text = cells.text(column);
  if (text === "") return { ok: true, value: null };
  const date = parsePageDate(text);
  return date.ok ? date : cells.fail("bad-date", column, `is not a date: "${text}"`);
}
