// What the export services share (SPEC-13 §4.2): a download's file name and chunks, written by the documents
// package's writers from rows pulled as the client reads (INV-99).
import type {
  Column,
  GcDocument,
  Row,
  Sheet,
  SummaryExtras,
  SummaryHeading,
  SummaryTotal,
} from "@senstosales/documents";

/** The writers, loaded on the first export: exceljs would add most of a second to every start of the app. */
const writers = () => import("@senstosales/documents");

type Writers = Awaited<ReturnType<typeof writers>>;

/** Each row through `f`; an undefined result drops the row. */
export async function* mapped<T, U>(rows: AsyncIterable<T>, f: (row: T) => U | undefined): AsyncGenerator<U> {
  for await (const row of rows) {
    const out = f(row);
    if (out !== undefined) yield out;
  }
}

/** A download named `fileName` whose chunks `write` streams once the writers have loaded. */
const streamed = (fileName: string, write: (w: Writers) => AsyncIterable<Uint8Array | string>) => ({
  fileName,
  chunks: (async function* () {
    yield* write(await writers());
  })(),
});

/** A list workbook in its catalog layout, named by the entry unless `fileName` is given. */
export const xlsxFile = (
  entry: { sheet: Sheet<string>; fileName: () => string },
  rows: AsyncIterable<Row<string>>,
  fileName = entry.fileName(),
) => streamed(fileName, (w) => w.xlsxChunks(entry.sheet, rows));

/** A CSV export with its catalog columns and file name. */
export const csvFile = (
  entry: { columns: readonly Pick<Column<string>, "key" | "header">[]; fileName: () => string },
  rows: AsyncIterable<Row<string>>,
) => streamed(entry.fileName(), (w) => w.csvChunks(entry.columns, rows));

/** A summary workbook with `extras`, named `fileName`; `total` is read after the last row. */
export const summaryFile = (
  extras: SummaryExtras,
  fileName: string,
  heading: SummaryHeading,
  rows: AsyncIterable<Row<string>>,
  total: () => SummaryTotal,
) => streamed(fileName, (w) => w.summaryChunks(extras, heading, rows, total));

type SupplierArgs = Parameters<Writers["documentSupplier"]>;

/** The SPEC-12 guarantee-certificate workbook, named `fileName`, with the supplier as the DC prints it. */
export async function gcFile(
  fileName: string,
  {
    profile,
    ...doc
  }: Omit<GcDocument, "supplier" | "dc"> & { profile: SupplierArgs[0]; dc: GcDocument["dc"] & SupplierArgs[1] },
) {
  const { buildGcWorkbook, documentSupplier } = await writers();
  return { fileName, bytes: await buildGcWorkbook({ ...doc, supplier: documentSupplier(profile, doc.dc) }) };
}
