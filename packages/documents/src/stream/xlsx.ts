// Streaming xlsx writer (SPEC-13 §4.2): an exceljs WorkbookWriter whose zip output is read as chunks, pulling rows
// only as fast as the chunks are read (INV-99). exceljs writes to a Node-style stream; `readable-stream` provides one
// without a runtime module (C12).
import ExcelJS from "exceljs";
import { PassThrough } from "readable-stream";

import type { Column, Row } from "./sheet.ts";

export interface Sheet<K extends string> {
  readonly name: string;
  readonly columns: readonly Column<K>[];
  readonly pageSetup?: Partial<ExcelJS.PageSetup>;
  /** The style of every header cell. */
  readonly headerStyle?: Partial<ExcelJS.Style>;
  /** The footer of odd (all) printed pages, in Excel's `&C`/`&P` codes. */
  readonly oddFooter?: string;
}

/**
 * Rows written between turns of the event loop. exceljs hands the sheet XML to an asynchronous deflate without
 * backpressure, so a source that never waits (node:sqlite resolves at once) would buffer the whole sheet; yielding
 * every 50 rows kept the heap flat from 50k to 400k rows when measured.
 */
const PACE = 50;

/** Resolves when `out` can take more output, or has closed because its reader stopped. */
function writable(out: PassThrough): Promise<void> {
  return new Promise((resolve) => {
    if (!out.writableNeedDrain) {
      setImmediate(resolve);
      return;
    }
    const done = () => {
      out.off("drain", done).off("close", done);
      resolve();
    };
    out.once("drain", done).once("close", done);
  });
}

/** A page setup's print-option flags and their sheet XML attributes. */
const PRINT_OPTIONS = [
  ["horizontalCentered", "horizontalCentered"],
  ["verticalCentered", "verticalCentered"],
  ["showGridLines", "gridLines"],
  ["showRowColHeaders", "headings"],
] as const;

/**
 * A worksheet of a streaming workbook. exceljs's streaming writer leaves out the page setup's print options
 * (centring, grid lines, headings), so they are written here, just before the page margins, where the sheet XML
 * expects them.
 */
export function addStreamedSheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  name: string,
  options: Partial<ExcelJS.AddWorksheetOptions> = {},
) {
  const worksheet = workbook.addWorksheet(name, options);
  const set = PRINT_OPTIONS.filter(([key]) => options.pageSetup?.[key] === true);
  if (set.length > 0) {
    const writer = worksheet as unknown as { _writePageMargins(): void; _write(xml: string): void };
    const margins = writer._writePageMargins.bind(writer);
    writer._writePageMargins = () => {
      const attributes = set.map(([, attribute]) => `${attribute}="1"`).join(" ");
      writer._write(`<printOptions ${attributes}/>`);
      margins();
    };
  }
  return worksheet;
}

/** The worksheet with the sheet's widths, page setup, footer and header row. */
function addSheet<K extends string>(workbook: ExcelJS.stream.xlsx.WorkbookWriter, sheet: Sheet<K>) {
  const worksheet = addStreamedSheet(workbook, sheet.name, {
    ...(sheet.pageSetup ? { pageSetup: sheet.pageSetup } : {}),
    ...(sheet.oddFooter === undefined ? {} : { headerFooter: { oddFooter: sheet.oddFooter } }),
  });
  worksheet.columns = sheet.columns.map((c) => ({ width: c.width }));
  const header = worksheet.addRow(sheet.columns.map((c) => c.header));
  const { headerStyle } = sheet;
  if (headerStyle) header.eachCell((cell) => (cell.style = headerStyle));
  header.commit();
  return worksheet;
}

/** Waits between rows: every {@link PACE} rows until `out` can take more. True once the reader has stopped. */
export type Pace = () => Promise<boolean>;

/** A streaming workbook's content: worksheets added and committed, or left as they are once `pace` says stop. */
export type Fill = (workbook: ExcelJS.stream.xlsx.WorkbookWriter, pace: Pace) => Promise<void>;

async function write(fill: Fill, out: PassThrough) {
  const closed = new Promise((resolve) => out.once("close", resolve));
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  let written = 0;
  await fill(workbook, async () => {
    written += 1;
    if (written % PACE === 0) await writable(out);
    return out.destroyed;
  });
  if (out.destroyed) return;
  const committed = workbook.commit();
  // A reader that stops during the commit destroys `out`, which then never finishes: stop waiting when it closes.
  // Its later failure, if any, has no reader left to receive it.
  committed.catch(() => {});
  await Promise.race([committed, closed]);
}

/** The workbook `fill` writes, as chunks, pulled only as fast as they are read (INV-99). */
export async function* workbookChunks(fill: Fill): AsyncGenerator<Uint8Array> {
  const out = new PassThrough();
  const writing = write(fill, out).catch((error: unknown) =>
    out.destroy(error instanceof Error ? error : new Error(String(error))),
  );
  try {
    for await (const chunk of out) yield chunk;
  } finally {
    out.destroy();
    await writing;
  }
}

/** The workbook as chunks: a header row, then one row per source row. Stopping early closes the source. */
export function xlsxChunks<K extends string>(sheet: Sheet<K>, rows: AsyncIterable<Row<K>>): AsyncGenerator<Uint8Array> {
  return workbookChunks(async (workbook, pace) => {
    const worksheet = addSheet(workbook, sheet);
    const formatted = sheet.columns.flatMap(({ key, numFmt }, i) => (numFmt === undefined ? [] : [{ key, numFmt, i }]));
    for await (const row of rows) {
      const added = worksheet.addRow(sheet.columns.map((c) => row[c.key]));
      for (const { key, numFmt, i } of formatted)
        if (typeof row[key] === "number") added.getCell(i + 1).numFmt = numFmt;
      added.commit();
      if (await pace()) return;
    }
    worksheet.commit();
  });
}
