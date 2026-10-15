// The DC workbook against goldens derived from the legacy DC download (SPEC-12 §4.2, INV-69): every value, merge,
// row height and page-setup field, and each cell's style taken from the template row the legacy writer copies it
// from. Inputs and goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the goldens against legacy output (H5).
import { readFileSync } from "node:fs";

import { parseMoney, parseQty, type Result } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import { buildDcWorkbook, dcFileName, type DcDocument } from "../src/dc.ts";
import { templateBytes } from "../src/templates.ts";
import { xlsxSnapshot, type CellSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

interface Golden {
  fileName: string;
  pageSetup: SheetSnapshot["pageSetup"];
  /** `[first, last, templateFirst, templateLast]`: output rows `first..last` carry the styles of those template rows. */
  styleRows: Array<[number, number, number, number]>;
  merges: string[];
  rows: SheetSnapshot["rows"];
  values: Record<string, unknown>;
}

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
const input = (name: string): DcDocument => read<DcDocument>(`./inputs/${name}.json`);

async function build(doc: DcDocument): Promise<SheetSnapshot[]> {
  return xlsxSnapshot(await buildDcWorkbook(doc));
}

const values = (sheet: SheetSnapshot): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(sheet.cells).flatMap(([at, cell]) => (cell.value === null ? [] : [[at, cell.value]])),
  );

const rowOf = (address: string): number => Number(address.replace(/^[A-Z]+/, ""));
const columnOf = (address: string): string => address.replace(/\d+$/, "");

/** Each output cell's expected style: the template cell in the same column of the row the golden maps it to. */
function expectedStyles(
  template: SheetSnapshot,
  styleRows: Golden["styleRows"],
): Record<string, CellSnapshot["style"]> {
  const out: Record<string, CellSnapshot["style"]> = {};
  for (const [first, last, templateFirst, templateLast] of styleRows) {
    for (let row = first; row <= last; row++) {
      const source = templateFirst === templateLast ? templateFirst : templateFirst + row - first;
      for (const [at, cell] of Object.entries(template.cells)) {
        if (rowOf(at) === source) out[`${columnOf(at)}${row}`] = cell.style;
      }
    }
  }
  return out;
}

const styles = (sheet: SheetSnapshot): Record<string, CellSnapshot["style"]> =>
  Object.fromEntries(Object.entries(sheet.cells).map(([at, cell]) => [at, cell.style]));

describe("DC workbook goldens", async () => {
  const [template, ...emptySheets] = await xlsxSnapshot(templateBytes("dc"));

  describe.each(["dc-1", "dc-20", "dc-21", "dc-60"])("%s", async (name) => {
    const golden = read<Golden>(`./golden/${name}.json`);
    const doc = input(name);
    const [sheet, ...rest] = await build(doc);

    it("has the golden's values", () => expect(values(sheet!)).toEqual(golden.values));
    it("has the golden's merges", () => expect(sheet!.merges).toEqual(golden.merges));
    it("has the golden's row heights and hidden rows", () => expect(sheet!.rows).toEqual(golden.rows));
    it("has the golden's page setup and no manual page break", () => {
      expect(sheet!.pageSetup).toEqual(golden.pageSetup);
      expect(sheet!.pageBreaks).toEqual({ rows: [], columns: [] });
    });
    it("styles each row as the template row the golden names", () => {
      expect(styles(sheet!)).toEqual(expectedStyles(template!, golden.styleRows));
    });
    it("keeps the template's column widths and its two empty sheets", () => {
      expect([sheet!.name, sheet!.columns]).toEqual([template!.name, template!.columns]);
      expect(rest).toEqual(emptySheets);
    });
    it("is named as the golden", () => expect(dcFileName(doc.dc.number)).toBe(golden.fileName));
  });
});

describe("DC workbook", () => {
  it("INV-36: carries the GC line in its footer", async () => {
    const [sheet] = await build(input("dc-1"));
    expect(sheet!.cells["C32"]?.value).toBe("Guarantee Certificate No. 7   Dt. 03/06/2025");
  });

  it("INV-18: prints a GEMC consignment value at 5 dp, others at 2", async () => {
    const one = input("dc-1");
    const item = { ...one.items[0]!, dspQty: unwrap(parseQty("3")), rate: unwrap(parseMoney("719.27966")) };
    const value = async (isGemc: boolean) =>
      (await build({ ...one, po: { ...one.po, isGemc }, items: [item] }))[0]!.cells["C38"]?.value;
    expect([await value(false), await value(true)]).toEqual([
      "Consignment Value of BHEL PO 2157.84",
      "Consignment Value of BHEL PO 2157.83898",
    ]);
  });

  it.each([
    [8, [19, 30], "B1:J42", 1],
    [9, [19], "B1:J43", 0],
  ])("%i items: hidden rows %j, print area %s, fit to %i page high", async (count, hidden, printArea, fitToHeight) => {
    const one = input("dc-1");
    const items = Array.from({ length: count }, (_, i) => ({ ...one.items[0]!, poItemNo: i + 1 }));
    const [sheet] = await build({ ...one, items });
    const hiddenRows = Object.entries(sheet!.rows).flatMap(([row, d]) => (d.hidden ? [Number(row)] : []));
    expect(hiddenRows).toEqual(hidden);
    expect([sheet!.pageSetup["printArea"], sheet!.pageSetup["fitToHeight"]]).toEqual([printArea, fitToHeight]);
  });
});

describe("dcFileName: legacy DC_<number>.xlsx", () => {
  it.each([
    ["7", "DC_7.xlsx"],
    ["DC/20", "DC_DC_20.xlsx"],
    ["A\\B", "DC_A_B.xlsx"],
    ["1..2", "DC_1_2.xlsx"],
    ["DC-7_a", "DC_DC-7_a.xlsx"],
    ["12 A", "DC_export.xlsx"],
    ["7.1", "DC_export.xlsx"],
    ["x".repeat(120), `DC_${"x".repeat(100)}.xlsx`],
  ])("%s -> %s", (number, expected) => {
    expect(dcFileName(number)).toBe(expected);
  });
});
