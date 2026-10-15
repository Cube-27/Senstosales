// Golden checks shared by the document workbooks (SPEC-12 §4.2, D-0299): a built workbook's `xlsx-snapshot` against a
// golden derived from the legacy writer: every value, merge, row height and page-setup field, and each cell's style
// taken from the template row the legacy writer copies it from, with the formats and fonts legacy set over it.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { templateBytes, type TemplateName } from "../src/templates.ts";
import { xlsxSnapshot, type CellSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

type Style = CellSnapshot["style"];

export interface Golden {
  fileName: string;
  pageSetup: SheetSnapshot["pageSetup"];
  /** `[first, last, templateFirst, templateLast]`: output rows `first..last` carry the styles of those template rows. */
  styleRows: Array<[number, number, number, number]>;
  /** `[first, last, columns, format]`: the number format legacy set on those columns of rows `first..last`. */
  numFmts?: Array<[number, number, string, string]>;
  /** Output cell -> template cell whose font legacy copied onto it. */
  fontFrom?: Record<string, string>;
  merges: string[];
  rows: SheetSnapshot["rows"];
  values: Record<string, unknown>;
}

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;

/** The synthetic document `inputs/<name>.json`. */
export const readInput = <Doc>(name: string): Doc => readJson<Doc>(`./inputs/${name}.json`);

const values = (sheet: SheetSnapshot): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(sheet.cells).flatMap(([at, cell]) => (cell.value === null ? [] : [[at, cell.value]])),
  );

const rowOf = (address: string): number => Number(address.replace(/^[A-Z]+/, ""));
const columnOf = (address: string): string => address.replace(/\d+$/, "");

/** Each output cell's expected style: the template cell in the same column of the row the golden maps it to. */
function expectedStyles(template: SheetSnapshot, golden: Golden): Record<string, Style> {
  const byRow = Map.groupBy(Object.entries(template.cells), ([at]) => rowOf(at));
  const out: Record<string, Style> = {};
  for (const [first, last, templateFirst, templateLast] of golden.styleRows) {
    for (let row = first; row <= last; row++) {
      const source = templateFirst === templateLast ? templateFirst : templateFirst + row - first;
      for (const [at, cell] of byRow.get(source) ?? []) out[`${columnOf(at)}${row}`] = cell.style;
    }
  }
  for (const [first, last, columns, numFmt] of golden.numFmts ?? []) {
    for (let row = first; row <= last; row++) {
      for (const column of columns) out[`${column}${row}`] = { ...out[`${column}${row}`], numFmt };
    }
  }
  for (const [at, from] of Object.entries(golden.fontFrom ?? {})) {
    out[at] = { ...out[at], font: template.cells[from]!.style["font"]! };
  }
  return out;
}

const styles = (sheet: SheetSnapshot): Record<string, Style> =>
  Object.fromEntries(Object.entries(sheet.cells).map(([at, cell]) => [at, cell.style]));

/**
 * One `describe` per golden: the workbook built from `inputs/<input(name)>.json` (by default `inputs/<name>.json`) against
 * `golden/<name>.json`.
 */
export function describeGoldens<Doc>({
  template,
  names,
  build,
  fileName,
  input = (name) => name,
}: {
  template: TemplateName;
  names: readonly string[];
  build: (doc: Doc) => Promise<Uint8Array>;
  fileName: (doc: Doc) => string;
  input?: (name: string) => string;
}): void {
  describe(`${template} workbook goldens`, async () => {
    const [templateSheet, ...otherSheets] = await xlsxSnapshot(templateBytes(template));

    describe.each(names)("%s", async (name) => {
      const golden = readJson<Golden>(`./golden/${name}.json`);
      const doc = readInput<Doc>(input(name));
      const [sheet, ...rest] = await xlsxSnapshot(await build(doc));

      it("has the golden's values", () => expect(values(sheet!)).toEqual(golden.values));
      it("has the golden's merges", () => expect(sheet!.merges).toEqual(golden.merges));
      it("has the golden's row heights and hidden rows", () => expect(sheet!.rows).toEqual(golden.rows));
      it("has the golden's page setup and no manual page break", () => {
        expect(sheet!.pageSetup).toEqual(golden.pageSetup);
        expect(sheet!.pageBreaks).toEqual({ rows: [], columns: [] });
      });
      it("styles each cell as the golden names", () => {
        expect(styles(sheet!)).toEqual(expectedStyles(templateSheet!, golden));
      });
      it("keeps the template's column widths and other sheets", () => {
        expect([sheet!.name, sheet!.columns]).toEqual([templateSheet!.name, templateSheet!.columns]);
        expect(rest).toEqual(otherSheets);
      });
      it("is named as the golden", () => expect(fileName(doc)).toBe(golden.fileName));
    });
  });
}
