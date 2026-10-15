// The pending-items workbook (legacy "Items Summary", SPEC-13 §2), streamed (INV-99): the catalog's heading, the
// table header, one row per pending item as it arrives, then the TOTAL row and a print area ending at it.
import type ExcelJS from "exceljs";

import { EXPORTS } from "../reports/catalog.ts";
import type { Row } from "./sheet.ts";
import { workbookChunks } from "./xlsx.ts";

const SUMMARY = EXPORTS.pending;
type Key = (typeof SUMMARY.columns)[number]["key"];
type Style = keyof typeof SUMMARY.styles;

/** The texts the catalog's heading names in `<…>`, keyed by that name. */
export type SummaryHeading = Record<string, string>;

/** The TOTAL row's quantity (with the unit when every row has the same one) and packets. */
export interface SummaryTotal {
  readonly qty: string | number;
  readonly packets: number;
}

/** The last column's letter: the table has fewer than 27 columns. */
const LAST_COLUMN = String.fromCodePoint(64 + SUMMARY.columns.length);

/** A styled cell; an empty string is a styled blank, as legacy's writer stored it. */
function put(cell: ExcelJS.Cell, value: string | number, style: Style) {
  cell.value = value === "" ? null : value;
  cell.style = SUMMARY.styles[style];
}

/**
 * exceljs's streaming writer leaves out the sheet's print options, so `horizontalCentered` would be lost. They go
 * just before the page margins, where the sheet XML expects them. Pinned by the pending golden.
 */
function writeCentred(ws: ExcelJS.Worksheet) {
  const writer = ws as unknown as { _writePageMargins(): void; _write(xml: string): void };
  const margins = writer._writePageMargins.bind(writer);
  writer._writePageMargins = () => {
    writer._write('<printOptions horizontalCentered="1"/>');
    margins();
  };
}

function writeHeading(ws: ExcelJS.Worksheet, heading: SummaryHeading) {
  for (const { cell, text, style, ...rest } of SUMMARY.heading) {
    if ("merge" in rest) ws.mergeCells(rest.merge);
    put(
      ws.getCell(cell),
      text.replaceAll(/<([^>]+)>/g, (_, name: string) => heading[name] ?? ""),
      style,
    );
  }
  const header = ws.getRow(SUMMARY.headerRow);
  SUMMARY.columns.forEach((c, i) => put(header.getCell(i + 1), c.header, "th"));
  for (let r = 1; r <= SUMMARY.headerRow; r++) ws.getRow(r).commit();
}

function writeTotal(ws: ExcelJS.Worksheet, r: number, total: SummaryTotal) {
  const [from, to] = SUMMARY.total.merge.split(":");
  ws.mergeCells(`${from}${r}:${to}${r}`);
  const row = ws.getRow(r);
  put(row.getCell(1), SUMMARY.total.label, "totalLabel");
  put(row.getCell(3), total.qty, "totalCell");
  put(row.getCell(4), total.packets, "totalCell");
  for (let c = 5; c <= SUMMARY.columns.length; c++) put(row.getCell(c), "", "totalCell");
  row.commit();
}

/**
 * The workbook as chunks. `total` is read once the rows are done, so the caller can add them up as they pass. Every
 * cell of a row is written, an empty string for a missing value, as legacy did.
 */
export function summaryChunks(
  heading: SummaryHeading,
  rows: AsyncIterable<Row<Key>>,
  total: () => SummaryTotal,
): AsyncGenerator<Uint8Array> {
  return workbookChunks(async (workbook, pace) => {
    const ws = workbook.addWorksheet(SUMMARY.sheet, { pageSetup: SUMMARY.pageSetup });
    writeCentred(ws);
    ws.columns = SUMMARY.columns.map((c) => ({ width: c.width }));
    writeHeading(ws, heading);
    let r = SUMMARY.headerRow;
    for await (const values of rows) {
      r += 1;
      const row = ws.getRow(r);
      SUMMARY.columns.forEach((c, i) =>
        put(row.getCell(i + 1), values[c.key] ?? "", c.key === SUMMARY.leftColumn ? "cellLeft" : "cell"),
      );
      row.commit();
      if (await pace()) return;
    }
    r += 1;
    writeTotal(ws, r, total());
    ws.pageSetup.printArea = `A1:${LAST_COLUMN}${r}`;
    ws.commit();
  });
}
