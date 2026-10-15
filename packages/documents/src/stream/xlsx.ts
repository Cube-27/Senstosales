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
  /** With no rows, write the sheet bare: no header row, widths, page setup or footer (EC-45). */
  readonly bareWhenEmpty?: true;
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

/** The worksheet with the sheet's widths, page setup, footer and header row. */
function addSheet<K extends string>(workbook: ExcelJS.stream.xlsx.WorkbookWriter, sheet: Sheet<K>) {
  const worksheet = workbook.addWorksheet(sheet.name, {
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

async function write<K extends string>(sheet: Sheet<K>, rows: AsyncIterable<Row<K>>, out: PassThrough) {
  const closed = new Promise((resolve) => out.once("close", resolve));
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  const source = rows[Symbol.asyncIterator]();
  let next = await source.next();
  const worksheet = next.done && sheet.bareWhenEmpty ? workbook.addWorksheet(sheet.name) : addSheet(workbook, sheet);
  const formatted = sheet.columns.flatMap(({ key, numFmt }, i) => (numFmt === undefined ? [] : [{ key, numFmt, i }]));
  try {
    for (let written = 1; !next.done; written++) {
      const row = next.value;
      const added = worksheet.addRow(sheet.columns.map((c) => row[c.key]));
      for (const { key, numFmt, i } of formatted)
        if (typeof row[key] === "number") added.getCell(i + 1).numFmt = numFmt;
      added.commit();
      if (written % PACE === 0) await writable(out);
      if (out.destroyed) return;
      next = await source.next();
    }
  } finally {
    // As `for await` does: a source left part-read is closed.
    if (!next.done) await source.return?.();
  }
  worksheet.commit();
  const committed = workbook.commit();
  // A reader that stops during the commit destroys `out`, which then never finishes: stop waiting when it closes.
  // Its later failure, if any, has no reader left to receive it.
  committed.catch(() => {});
  await Promise.race([committed, closed]);
}

/** The workbook as chunks: a header row, then one row per source row. Stopping early closes the source. */
export async function* xlsxChunks<K extends string>(
  sheet: Sheet<K>,
  rows: AsyncIterable<Row<K>>,
): AsyncGenerator<Uint8Array> {
  const out = new PassThrough();
  const writing = write(sheet, rows, out).catch((error: unknown) =>
    out.destroy(error instanceof Error ? error : new Error(String(error))),
  );
  try {
    for await (const chunk of out) yield chunk;
  } finally {
    out.destroy();
    await writing;
  }
}
