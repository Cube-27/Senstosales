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

async function write<K extends string>(sheet: Sheet<K>, rows: AsyncIterable<Row<K>>, out: PassThrough) {
  const closed = new Promise((resolve) => out.once("close", resolve));
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out, useStyles: true });
  const worksheet = workbook.addWorksheet(sheet.name, sheet.pageSetup ? { pageSetup: sheet.pageSetup } : {});
  worksheet.columns = sheet.columns.map((c) => ({ width: c.width }));
  worksheet.addRow(sheet.columns.map((c) => c.header)).commit();
  let written = 0;
  for await (const row of rows) {
    const added = worksheet.addRow(sheet.columns.map((c) => row[c.key]));
    sheet.columns.forEach((c, i) => {
      if (c.numFmt !== undefined && typeof row[c.key] === "number") added.getCell(i + 1).numFmt = c.numFmt;
    });
    added.commit();
    written += 1;
    if (written % PACE === 0) await writable(out);
    if (out.destroyed) return;
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
