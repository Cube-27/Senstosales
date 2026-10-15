// The DC workbook against goldens derived from the legacy DC download (SPEC-12 §4.2, INV-69): every value, merge,
// row height and page-setup field, and each cell's style taken from the template row the legacy writer copies it
// from. Inputs and goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the goldens against legacy output (H5).
import { parseMoney, parseQty, type Result } from "@senstosales/domain";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vite-plus/test";

import { buildDcWorkbook, dcFileName, type DcDocument } from "../src/dc.ts";
import { insertRows } from "../src/layout.ts";
import { describeGoldens, readInput } from "./golden.ts";
import { xlsxSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const input = readInput<DcDocument>;

async function build(doc: DcDocument): Promise<SheetSnapshot[]> {
  return xlsxSnapshot(await buildDcWorkbook(doc));
}

describeGoldens<DcDocument>({
  template: "dc",
  names: ["dc-1", "dc-20", "dc-21", "dc-60"],
  build: buildDcWorkbook,
  fileName: (doc) => dcFileName(doc.dc.number),
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

  it.each([
    ["0456", 456],
    ["D-4", "D-4"],
    ["12345678901234567", "12345678901234567"],
  ])("department %s prints as %j", async (departmentNo, expected) => {
    const one = input("dc-1");
    const [sheet] = await build({ ...one, dc: { ...one.dc, departmentNo } });
    expect(sheet!.cells["F15"]?.value).toBe(expected);
  });
});

describe("insertRows", () => {
  it("refuses to insert inside a merge", () => {
    const ws = new ExcelJS.Workbook().addWorksheet("Sheet1");
    ws.mergeCells("B2:B5");
    expect(() => insertRows(ws, 3, 1, 2)).toThrow("A merge spans row 3");
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
    ["x".repeat(99) + "𝐀x", `DC_${"x".repeat(99)}𝐀.xlsx`],
  ])("%s -> %s", (number, expected) => {
    expect(dcFileName(number)).toBe(expected);
  });
});
