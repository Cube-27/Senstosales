// xlsx → JSON for golden tests (SPEC-12 §4.2): what a printed document depends on, never the bytes. Cell values and
// types, styles, merges, column widths, row heights, print area, page breaks and page setup, per sheet in order.
// exceljs reads everything but page breaks, which come from the sheet XML.
import ExcelJS from "exceljs";
import { strFromU8, unzipSync } from "fflate";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface CellSnapshot {
  type: string;
  value: Json;
  style: Record<string, Json>;
}

export interface SheetSnapshot {
  name: string;
  state: string;
  cells: Record<string, CellSnapshot>;
  merges: string[];
  columns: Record<string, { width?: number; hidden?: true }>;
  rows: Record<string, { height?: number; hidden?: true }>;
  pageBreaks: { rows: number[]; columns: number[] };
  pageSetup: Record<string, Json>;
}

const PAGE_SETUP_KEYS = [
  "printArea",
  "printTitlesRow",
  "printTitlesColumn",
  "orientation",
  "paperSize",
  "fitToPage",
  "fitToWidth",
  "fitToHeight",
  "scale",
  "horizontalCentered",
  "verticalCentered",
  "margins",
] as const;

// exceljs ships `ValueType` as a plain object, without TypeScript's reverse mapping.
const TYPE_NAMES = new Map<number, string>(
  Object.entries(ExcelJS.ValueType).flatMap(([name, id]) => (typeof id === "number" ? [[id, name.toLowerCase()]] : [])),
);

/** `undefined`-free plain JSON, so absent and unset compare equal. */
const plain = (value: unknown): Json => JSON.parse(JSON.stringify(value ?? null));

/** The cell's style without the empty border and `none` fill that exceljs reports for "no border" and "no fill". */
function styleOf(cell: ExcelJS.Cell): Record<string, Json> {
  const { border, fill, ...rest } = cell.style;
  return plain({
    ...rest,
    ...(border && Object.keys(border).length > 0 ? { border } : {}),
    ...(fill && !(fill.type === "pattern" && fill.pattern === "none") ? { fill } : {}),
  }) as Record<string, Json>;
}

function cellValue(cell: ExcelJS.Cell): Json {
  const value = cell.value;
  if (value instanceof Date) return value.toISOString();
  if (cell.type === ExcelJS.ValueType.Merge) return null;
  if (cell.type === ExcelJS.ValueType.RichText) return cell.text;
  return plain(value);
}

function cellSnapshot(cell: ExcelJS.Cell): CellSnapshot | undefined {
  const style = styleOf(cell);
  const value = cellValue(cell);
  if (value === null && Object.keys(style).length === 0 && cell.type !== ExcelJS.ValueType.Merge) return undefined;
  return { type: TYPE_NAMES.get(cell.type) ?? String(cell.type), value, style };
}

function cells(ws: ExcelJS.Worksheet): Record<string, CellSnapshot> {
  const out: Record<string, CellSnapshot> = {};
  ws.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      const snapshot = cellSnapshot(cell);
      if (snapshot) out[cell.address] = snapshot;
    });
  });
  return out;
}

function columns(ws: ExcelJS.Worksheet): SheetSnapshot["columns"] {
  const out: SheetSnapshot["columns"] = {};
  for (let index = 1; index <= (ws.columns?.length ?? 0); index++) {
    const column = ws.getColumn(index);
    const entry = {
      ...(column.width === undefined ? {} : { width: column.width }),
      ...(column.hidden ? { hidden: true as const } : {}),
    };
    if (Object.keys(entry).length > 0) out[column.letter] = entry;
  }
  return out;
}

function rows(ws: ExcelJS.Worksheet): SheetSnapshot["rows"] {
  const out: SheetSnapshot["rows"] = {};
  ws.eachRow({ includeEmpty: true }, (row, number) => {
    const entry = {
      ...(row.height === undefined ? {} : { height: row.height }),
      ...(row.hidden ? { hidden: true as const } : {}),
    };
    if (Object.keys(entry).length > 0) out[String(number)] = entry;
  });
  return out;
}

function pageSetup(ws: ExcelJS.Worksheet): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const key of PAGE_SETUP_KEYS) {
    const value = ws.pageSetup[key];
    if (value !== undefined) out[key] = plain(value);
  }
  return out;
}

/** Page breaks per sheet name, read from `<rowBreaks>` and `<colBreaks>` in each sheet's XML part. */
function pageBreaks(bytes: Uint8Array): Map<string, SheetSnapshot["pageBreaks"]> {
  const zip = unzipSync(bytes);
  const text = (path: string): string => strFromU8(zip[path] ?? new Uint8Array());
  const targets = new Map(
    [...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [
      attribute(tag, "Id"),
      attribute(tag, "Target").replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );
  const breaks = (xml: string, tag: string): number[] =>
    [...(xml.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))?.[0] ?? "").matchAll(/<brk\b[^>]*>/g)].map(([brk]) =>
      Number(attribute(brk, "id")),
    );
  const out = new Map<string, SheetSnapshot["pageBreaks"]>();
  for (const [tag] of text("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const xml = text(targets.get(attribute(tag, "r:id")) ?? "");
    out.set(unescapeXml(attribute(tag, "name")), { rows: breaks(xml, "rowBreaks"), columns: breaks(xml, "colBreaks") });
  }
  return out;
}

const attribute = (tag: string, name: string): string => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "";

const unescapeXml = (value: string): string =>
  value.replace(
    /&(lt|gt|quot|apos|amp);/g,
    (_, entity: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[entity] ?? "",
  );

/** The workbook in these xlsx bytes. */
export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.slice().buffer);
  return wb;
}

/** The snapshot of an xlsx file: one entry per worksheet, in workbook order. */
export async function xlsxSnapshot(bytes: Uint8Array): Promise<SheetSnapshot[]> {
  const wb = await loadWorkbook(bytes);
  const breaks = pageBreaks(bytes);
  return wb.worksheets.map((ws) => ({
    name: ws.name,
    state: ws.state,
    cells: cells(ws),
    merges: [...(ws.model.merges ?? [])].toSorted(),
    columns: columns(ws),
    rows: rows(ws),
    pageBreaks: breaks.get(ws.name) ?? { rows: [], columns: [] },
    pageSetup: pageSetup(ws),
  }));
}
