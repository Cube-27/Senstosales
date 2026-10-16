// The DC workbook against goldens derived from the legacy DC download (SPEC-12 §4.2, INV-69): every value, merge,
// row height and page-setup field, and each cell's style taken from the template row the legacy writer copies it
// from. Inputs and goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the goldens against legacy output (H5).
import { parseMoney, parseQty, type IsoDate } from "@senstosales/domain";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vite-plus/test";

import { buildDcWorkbook, dcFileName, type DcDocument } from "../src/dc.ts";
import { insertRows } from "../src/layout.ts";
import { describeGoldens, readInput, unwrap } from "./golden.ts";
import { xlsxSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

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

  it("prints the consignee over three rows: the name, the first address line, then the rest", async () => {
    const [sheet] = await build(input("dc-1"));
    expect(["B9", "B10", "B11"].map((at) => sheet!.cells[at]?.value)).toEqual([
      "The Example Manager (Stores)",
      "Example Unit",
      "Example Road, Example City - 000000",
    ]);
  });

  it.each([
    ["75", "4500000001", 75, 4500000001],
    ["075", "45-1", "075", "45-1"],
  ])("DC %s and PO %s print as %j and %j", async (number, poNumber, dcCell, poCell) => {
    const one = input("dc-1");
    const [sheet] = await build({ ...one, dc: { ...one.dc, number }, po: { ...one.po, poNumber } });
    expect([sheet!.cells["I9"]?.value, sheet!.cells["D14"]?.value]).toEqual([dcCell, poCell]);
  });

  it.each([
    ["0456", 456],
    ["1234567890123456", "1234567890123456"],
    ["45-A", "45-A"],
  ])("department %s prints as %j: a number only up to the 15 digits Excel holds", async (departmentNo, cell) => {
    const one = input("dc-1");
    const [sheet] = await build({ ...one, dc: { ...one.dc, departmentNo } });
    expect(sheet!.cells["F15"]?.value).toBe(cell);
  });

  it("EC-47: prints the invoice number and date the user filled in, else the DC's own invoice's", async () => {
    const one = input("dc-1");
    const cells = async (doc: DcDocument) => {
      const [sheet] = await build(doc);
      return [sheet!.cells["I17"]?.value, sheet!.cells["C31"]?.value];
    };
    expect(await cells(one)).toEqual(["INV-7  Dt. 04/06/2025", "GST Bill No. INV-7 Dt.04/06/2025"]);
    const filled = { ...one, dc: { ...one.dc, invoiceNumber: "75", invoiceDate: "2025-06-09" as IsoDate } };
    expect(await cells(filled)).toEqual(["75  Dt. 09/06/2025", "GST Bill No. 75 Dt.09/06/2025"]);
    expect(await cells({ ...one, invoice: null })).toEqual(["Dt.", "GST Bill No.  Dt."]);
  });

  it("prints the DC's notes as remarks 4 to 6, the rest joined onto the sixth, in place of the blank TC line", async () => {
    const one = input("dc-1");
    // The DC form saves its notes joined by blank lines.
    const remarks = ["TC No 1 dt.01-01-2025 Of Example Lab", "TC No 2", "Lot No. 9", "Extra"].join("\n\n");
    const [sheet] = await build({ ...one, dc: { ...one.dc, remarks } });
    const rows = [34, 35, 36, 37].map((row) => [sheet!.cells[`B${row}`]?.value, sheet!.cells[`C${row}`]?.value]);
    expect(rows).toEqual([
      [4, "TC No 1 dt.01-01-2025 Of Example Lab"],
      [5, "TC No 2"],
      [6, "Lot No. 9  Extra"],
      [null, "Lot No."],
    ]);
  });

  it("prints the consignment value at 2 dp, a GEMC PO's net value too, as the owner's DCs show it", async () => {
    const one = input("dc-1");
    // A GEMC PO's net rate: 3 × 719.27966 = 2157.83898.
    const item = { ...one.items[0]!, dspQty: unwrap(parseQty("3")), rate: unwrap(parseMoney("719.27966")) };
    expect((await build({ ...one, items: [item] }))[0]!.cells["C38"]?.value).toBe(
      "Consignment Value of BHEL PO 2157.84",
    );
    // No trailing zeros: 1 × 123900 prints `123900`.
    const whole = { ...item, dspQty: unwrap(parseQty("1")), rate: unwrap(parseMoney("123900")) };
    expect((await build({ ...one, items: [whole] }))[0]!.cells["C38"]?.value).toBe(
      "Consignment Value of BHEL PO 123900",
    );
  });

  it("leaves the consignee, Dimension Report and TC lines blank when they are not filled in", async () => {
    const one = input("dc-1");
    const empty = { ...one.dc, consigneeName: null, consigneeAddress: null, ourRef: " ", remarks: null };
    const [sheet] = await build({ ...one, dc: empty });
    const cells = ["B9", "B10", "B11", "B33", "C33", "B34", "C34", "C37"].map((at) => sheet!.cells[at]?.value ?? null);
    expect(cells).toEqual([null, null, null, null, null, null, null, "Lot No."]);
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
