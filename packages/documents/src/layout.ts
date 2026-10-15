// Row helpers implementing the legacy documents' pagination as the goldens show it (SPEC-12 §4.1).
import type ExcelJS from "exceljs";

interface Range {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const LETTERS = /^([A-Z]+)(\d+)$/;

function column(letters: string): number {
  return [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
}

function parseRange(range: string): Range {
  const [from = "", to = from] = range.split(":");
  const [, l1 = "", r1 = ""] = LETTERS.exec(from) ?? [];
  const [, l2 = "", r2 = ""] = LETTERS.exec(to) ?? [];
  return { top: Number(r1), left: column(l1), bottom: Number(r2), right: column(l2) };
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
  const merges = ws.model.merges.map(parseRange);
  const moving = merges.filter((m) => m.top >= at);
  const repeated = merges.filter((m) => m.top === like && m.bottom === like);
  const width = ws.columnCount;
  const cellsOf = (row: number) =>
    Array.from({ length: width }, (_, i) => {
      const cell = ws.getCell(row, i + 1);
      return { value: cell.isMerged && cell.master !== cell ? null : cell.value, style: cell.style };
    });
  const below = Array.from({ length: ws.rowCount - at + 1 }, (_, i) => cellsOf(at + i));
  const template = cellsOf(like);

  for (const m of moving) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
  const write = (row: number, cells: ReturnType<typeof cellsOf>) =>
    cells.forEach(({ value, style }, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = value;
      cell.style = style;
    });
  below.forEach((cells, i) => write(at + count + i, cells));
  for (let row = at; row < at + count; row++)
    write(
      row,
      template.map(({ style }) => ({ value: null, style })),
    );

  for (const m of moving) merge(ws, { ...m, top: m.top + count, bottom: m.bottom + count });
  for (let row = at; row < at + count; row++) for (const m of repeated) merge(ws, { ...m, top: row, bottom: row });
}
