// Cell and row helpers implementing the legacy documents' layout as the goldens show it (SPEC-12 §4.1).
import type ExcelJS from "exceljs";

export type Value = string | number | null;

/** Text cells are left empty rather than holding "" (D-0304). */
export function put(ws: ExcelJS.Worksheet, address: string, value: Value): void {
  ws.getCell(address).value = value === "" ? null : value;
}

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
