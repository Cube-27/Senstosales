// What the export services share (SPEC-13 §4.2): a download's file name and chunks, written by the documents
// package's streaming writers from rows pulled as the client reads (INV-99).
import type { Column, GcDocument, Row, Sheet, SummaryHeading, SummaryTotal } from "@senstosales/documents";

/** The writers, loaded on the first export: exceljs would add most of a second to every start of the app. */
const writers = () => import("@senstosales/documents");

/** Each row through `f`; an undefined result drops the row. */
export async function* mapped<T, U>(rows: AsyncIterable<T>, f: (row: T) => U | undefined): AsyncGenerator<U> {
  for await (const row of rows) {
    const out = f(row);
    if (out !== undefined) yield out;
  }
}

/** A list workbook in its catalog layout, named `fileName`. */
export const xlsxFile = (fileName: string, sheet: Sheet<string>, rows: AsyncIterable<Row<string>>) => ({
  fileName,
  chunks: (async function* () {
    yield* (await writers()).xlsxChunks(sheet, rows);
  })(),
});

/** A CSV export with its catalog columns and file name. */
export const csvFile = (
  entry: { columns: readonly Pick<Column<string>, "key" | "header">[]; fileName: () => string },
  rows: AsyncIterable<Row<string>>,
) => ({
  fileName: entry.fileName(),
  chunks: (async function* () {
    yield* (await writers()).csvChunks(entry.columns, rows);
  })(),
});

/** The pending-items workbook, named `fileName`; `total` is read after the last row. */
export const summaryFile = (
  fileName: string,
  heading: SummaryHeading,
  rows: AsyncIterable<Row<string>>,
  total: () => SummaryTotal,
) => ({
  fileName,
  chunks: (async function* () {
    yield* (await writers()).summaryChunks(heading, rows, total);
  })(),
});

/** The SPEC-12 guarantee-certificate workbook, named `fileName`. */
export const gcFile = async (fileName: string, doc: GcDocument) => ({
  fileName,
  bytes: await (await writers()).buildGcWorkbook(doc),
});
