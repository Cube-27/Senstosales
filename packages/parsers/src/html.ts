// Page reading (SPEC-06 §4.1). The only module that touches HTML: it turns a page into plain cell text, and nothing
// in it is evaluated or fetched (C17). Everything else in the parser works on that text.
import { load } from "cheerio";

/** Each `<table>` of a page (nested ones as their own entries), as its rows of cleaned cell text. */
export type Page = string[][][];

/** UTF-8, with U+FFFD for bytes that are not; never throws. */
export const decodePage = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes);

/** `&nbsp;` is a space; runs of whitespace become one space; trimmed. */
const clean = (text: string): string => text.replaceAll(" ", " ").replace(/\s+/g, " ").trim();

export function loadPage(html: string): Page {
  const $ = load(html);
  $("script, style").remove();
  $.root()
    .find("*")
    .addBack()
    .contents()
    .filter((_, node) => node.type === "comment")
    .remove();
  return $("table")
    .toArray()
    .map((table) =>
      $(table)
        .find("tr")
        .filter((_, tr) => $(tr).closest("table")[0] === table)
        .toArray()
        .map((tr) =>
          $(tr)
            .children("td, th")
            .toArray()
            .map((cell) => clean($(cell).text())),
        ),
    );
}

/**
 * The value of the first cell whose whole text matches `label`: the cell to its right unless that is itself a label,
 * otherwise the cell below. An occurrence with a value wins over an earlier empty one.
 */
export function findByLabel(
  page: Page,
  label: RegExp,
  isLabel: (text: string) => boolean,
): { label: string; value: string } | undefined {
  let empty: { label: string; value: string } | undefined;
  for (const rows of page) {
    for (const [r, row] of rows.entries()) {
      for (const [c, text] of row.entries()) {
        if (!label.test(text)) continue;
        const right = row[c + 1];
        const value = right !== undefined && !isLabel(right) ? right : (rows[r + 1]?.[c] ?? "");
        if (value !== "") return { label: text, value };
        empty ??= { label: text, value };
      }
    }
  }
  return empty;
}

/** Each column's index: the first header cell its pattern matches; a column the header lacks is left out. */
export function mapColumnsByHeader<K extends string>(
  header: readonly string[],
  columns: Record<K, RegExp>,
): Partial<Record<K, number>> {
  const map: Partial<Record<K, number>> = {};
  for (const [key, pattern] of Object.entries(columns) as [K, RegExp][]) {
    const index = header.findIndex((text) => pattern.test(text));
    if (index !== -1) map[key] = index;
  }
  return map;
}
