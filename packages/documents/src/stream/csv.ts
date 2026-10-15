// Streaming CSV writer (SPEC-13 §4.2): one chunk per line, a row pulled only when its line is read (INV-99).
import type { Cell, Column, Row } from "./sheet.ts";

/** INV-94: text a spreadsheet would read as a formula gets a leading `'`; numbers are never prefixed. */
const safe = (text: string) => (/^[=+\-@]/.test(text) ? `'${text}` : text);

/** RFC 4180 quoting: a field holding a comma, quote or line break is quoted, its quotes doubled. */
const quoted = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

function field(cell: Cell): string {
  if (cell === null) return "";
  return typeof cell === "number" ? String(cell) : quoted(safe(cell));
}

const line = (fields: readonly string[]) => `${fields.join(",")}\r\n`;

/** The header line, then one CRLF-terminated line per row in column order. */
export async function* csvChunks<K extends string>(
  columns: readonly Column<K>[],
  rows: AsyncIterable<Row<K>>,
): AsyncGenerator<string> {
  yield line(columns.map((c) => quoted(c.header)));
  for await (const row of rows) yield line(columns.map((c) => field(row[c.key])));
}
