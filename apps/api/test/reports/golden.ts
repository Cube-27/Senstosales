// Export tests against the SPEC-13 goldens (`packages/documents/test/reports/golden`, D-0284): read a golden, project
// an exported workbook onto the golden's shape.
import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { isDeepStrictEqual } from "node:util";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Style = Record<string, Json>;

/**
 * A cell: its value, or `{ v, s }` with the name of its style (`v` null for a styled blank, which is how a writer
 * stores an empty string); an unnamed style is shown whole, so it fails.
 */
export type GoldenCell = string | number | null | { v: string | number | null; s: string } | { v: Json; style: Style };

export interface WorkbookGolden {
  fileName: string;
  sheet: string;
  widths: number[];
  pageSetup: Record<string, Json>;
  oddFooter: string | null;
  styles: Record<string, Style>;
  merges: string[];
  rows: GoldenCell[][];
}

const GOLDEN = new URL("../../../../packages/documents/test/reports/golden/", import.meta.url);

/** A golden's text, exactly as committed (the CSV goldens are compared byte for byte). */
export const goldenText = (file: string) => readFileSync(new URL(file, GOLDEN), "utf8");

export const workbookGoldenFile = (file: string) => JSON.parse(goldenText(file)) as WorkbookGolden;

const plain = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;

/** The cell's style without the empty border and `none` fill exceljs reports for "none" (as `xlsxSnapshot`). */
function styleOf(cell: ExcelJS.Cell): Style {
  const { border, fill, ...rest } = cell.style;
  return plain({
    ...rest,
    ...(border && Object.keys(border).length > 0 ? { border } : {}),
    ...(fill && !(fill.type === "pattern" && fill.pattern === "none") ? { fill } : {}),
  }) as Style;
}

/** The page setup exceljs reads back from a sheet written with none, so reader-only keys compare as defaults. */
const readDefaults = (async () => {
  const blank = new ExcelJS.Workbook();
  blank.addWorksheet("x");
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await blank.xlsx.writeBuffer());
  // A sheet with print options reads back each one; those it leaves off are false.
  const printOptions = {
    showGridLines: false,
    showRowColHeaders: false,
    horizontalCentered: false,
    verticalCentered: false,
  };
  return { ...printOptions, ...(plain(read.worksheets[0]!.pageSetup) as Record<string, Json>) } as Record<string, Json>;
})();

/**
 * The page setup keys that differ from a blank sheet's, so a writer that omits a default and one that writes it
 * agree; the fit-to sizes are kept whenever fit-to-page is on, as the goldens record them.
 */
async function pageSetupOf(ws: ExcelJS.Worksheet): Promise<Record<string, Json>> {
  const defaults = await readDefaults;
  const setup = plain(ws.pageSetup) as Record<string, Json>;
  const fit = setup["fitToPage"] === true ? ["fitToWidth", "fitToHeight"] : [];
  return Object.fromEntries(
    Object.entries(setup).filter(([key, value]) => fit.includes(key) || !isDeepStrictEqual(value, defaults[key])),
  );
}

const byAddress = new Intl.Collator("en", { numeric: true }).compare;

function cellOf(cell: ExcelJS.Cell, styles: Record<string, Style>, used: Set<string>): GoldenCell {
  if (cell.type === ExcelJS.ValueType.Merge) return null;
  const style = styleOf(cell);
  const value = plain(cell.value);
  const scalar = typeof value === "string" || typeof value === "number" || value === null;
  if (Object.keys(style).length === 0 && scalar) return value;
  const name = Object.keys(styles).find((key) => isDeepStrictEqual(styles[key], style));
  if (name === undefined || !scalar) return { v: value, style };
  used.add(name);
  return { v: value, s: name };
}

/**
 * The first sheet of an exported workbook in the golden's shape. Each row runs to its last cell with a value or a
 * style; a merged cell other than the range's top-left is null, as is an empty unstyled cell.
 */
export async function workbookGolden(
  bytes: Uint8Array,
  fileName: string,
  styles: Record<string, Style>,
): Promise<WorkbookGolden> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.slice().buffer);
  const ws = wb.worksheets[0]!;
  const used = new Set<string>();
  const rows: GoldenCell[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = Array.from({ length: row.cellCount }, (_, c) => cellOf(row.getCell(c + 1), styles, used));
    while (cells.length > 0 && cells.at(-1) === null) cells.pop();
    rows.push(cells);
  }
  return {
    fileName,
    sheet: ws.name,
    widths: (ws.columns ?? []).map((c) => c.width ?? 0),
    pageSetup: await pageSetupOf(ws),
    oddFooter: ws.headerFooter?.oddFooter ?? null,
    styles: Object.fromEntries(Object.entries(styles).filter(([name]) => used.has(name))),
    merges: [...(ws.model.merges ?? [])].toSorted(byAddress),
    rows,
  };
}
