// Cell and row helpers implementing the legacy documents' layout as the goldens show it (SPEC-12 §4.1).
import { qtyToString, type Qty } from "@senstosales/domain";
import type ExcelJS from "exceljs";

export type Value = string | number | null;

/** Text cells are left empty rather than holding "" (D-0304). */
export function put(ws: ExcelJS.Worksheet, address: string, value: Value): void {
  ws.getCell(address).value = value === "" ? null : value;
}

/**
 * Sets style fields on one cell. Cells can share a style object (a template merge's cells do), and exceljs setters
 * mutate it in place, so the cell gets its own deep copy first.
 */
export function restyle(cell: ExcelJS.Cell, patch: Partial<ExcelJS.Style>): void {
  cell.style = structuredClone({ ...cell.style, ...patch });
}

// Reports name their files by `fileSafe` (reports/catalog.ts): a different legacy rule, with no fallback.
const FILE_NAME_SAFE = /^[\p{L}\p{N}_-]+$/u;

/**
 * Legacy's download name `<prefix>_<number>.xlsx`: path characters become `_`, anything else unsafe gives `fallback`;
 * at most 100 characters.
 */
export function documentFileName(prefix: string, number: string, fallback: string): string {
  const name = number.replace(/\.\.|[/\\]/g, "_");
  return `${prefix}_${FILE_NAME_SAFE.test(name) ? [...name].slice(0, 100).join("") : fallback}.xlsx`;
}

interface Range {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

function parseRange(ws: ExcelJS.Worksheet, range: string): Range {
  const [from = "", to = from] = range.split(":");
  const topLeft = ws.getCell(from).fullAddress;
  const bottomRight = ws.getCell(to).fullAddress;
  return { top: topLeft.row, left: topLeft.col, bottom: bottomRight.row, right: bottomRight.col };
}

const merge = (ws: ExcelJS.Worksheet, { top, left, bottom, right }: Range): void =>
  ws.mergeCellsWithoutStyle(top, left, bottom, right);

/**
 * Inserts `count` rows before row `at`: the rows from `at` down move with their values, styles and merges, and each
 * new row repeats the styles and merges of row `like`. Row heights and hidden flags stay with the row number, as the
 * legacy writer left them; callers set the rows they fill.
 */
export function insertRows(ws: ExcelJS.Worksheet, at: number, count: number, like: number): void {
  if (count <= 0) return;
  const merges = ws.model.merges.map((range) => parseRange(ws, range));
  if (merges.some((m) => m.top < at && m.bottom >= at)) throw new Error(`A merge spans row ${at}`);
  const moving = merges.filter((m) => m.top >= at);
  const repeated = merges.filter((m) => m.top === like && m.bottom === like);
  const width = ws.columnCount;
  const cellsOf = (row: number) =>
    Array.from({ length: width }, (_, i) => {
      const cell = ws.getCell(row, i + 1);
      return { value: cell.isMerged && cell.master !== cell ? null : cell.value, style: cell.style };
    });
  const below = Array.from({ length: ws.rowCount - at + 1 }, (_, i) => cellsOf(at + i));
  const blank = cellsOf(like).map(({ style }) => ({ value: null, style }));

  for (const m of moving) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
  const write = (row: number, cells: ReturnType<typeof cellsOf>) =>
    cells.forEach(({ value, style }, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = value;
      // A copy: exceljs style setters mutate the object, which must not reach other cells.
      cell.style = structuredClone(style);
    });
  below.forEach((cells, i) => write(at + count + i, cells));
  for (let row = at; row < at + count; row++) write(row, blank);

  for (const m of moving) merge(ws, { ...m, top: m.top + count, bottom: m.bottom + count });
  for (let row = at; row < at + count; row++) for (const m of repeated) merge(ws, { ...m, top: row, bottom: row });
}

type Consignee = { consigneeName: string | null; consigneeAddress: string | null };

/** The consignee's name, then its address lines, blanks dropped. */
function consigneeParts(dc: Consignee): string[] {
  const address = (dc.consigneeAddress ?? "").split(/\r?\n/).map((line) => line.trim());
  return [(dc.consigneeName ?? "").trim(), ...address].filter((line) => line !== "");
}

/** The consignee block the GC prints in one cell: its lines; `Consignee` when empty. */
export function consignee(dc: Consignee): string {
  const lines = consigneeParts(dc);
  return lines.length > 0 ? lines.join("\n") : "Consignee";
}

/**
 * The consignee over the DC's three rows, as the owner's DCs print it: the first line (`Consignee` when empty), the
 * second, then the rest joined by `, `.
 */
export function consigneeLines(dc: Consignee): [string, string, string] {
  const [first = "Consignee", second = "", ...rest] = consigneeParts(dc);
  return [first, second, rest.join(", ")];
}

export interface ItemRow {
  poItemNo: number;
  description: string | null;
  unit: string | null;
  dspQty: Qty;
}

/** Legacy grows an item row by `lineHeight` points for each 95 characters of description. */
const CHARS_PER_LINE = 95;

interface ItemLayout {
  firstRow: number;
  qtyColumn: string;
  /** Between the quantity and the unit: two spaces on the DC, one on the GC, as the owner's documents print them. */
  qtyGap: string;
  lineHeight: number;
}

/**
 * The DC and GC item rows from `firstRow` down: PO item number in B, description in C, `<qty><gap><UNIT>` (upper-cased,
 * `NO` when missing) in `qtyColumn`; each row at least as high as the first.
 */
export function writeItemRows(
  ws: ExcelJS.Worksheet,
  items: readonly ItemRow[],
  { firstRow, qtyColumn, qtyGap, lineHeight }: ItemLayout,
): void {
  const baseHeight = ws.getRow(firstRow).height;
  items.forEach((item, i) => {
    const row = firstRow + i;
    const description = item.description ?? "";
    put(ws, `B${row}`, item.poItemNo);
    put(ws, `C${row}`, description);
    put(ws, `${qtyColumn}${row}`, `${qtyToString(item.dspQty)}${qtyGap}${(item.unit || "NO").toUpperCase()}`);
    const lines = Math.floor([...description].length / CHARS_PER_LINE) + 1;
    ws.getRow(row).height = Math.max(baseHeight, lines * lineHeight);
  });
}

/** The DC and GC page: A4 portrait, one page wide, centred, printing B:J down to `lastRow`. */
export function setPortraitPage(ws: ExcelJS.Worksheet, lastRow: number, fitToHeight: 0 | 1): void {
  Object.assign(ws.pageSetup, {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    printArea: `B1:J${lastRow}`,
  } satisfies Partial<ExcelJS.PageSetup>);
}
