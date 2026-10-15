// The snapshot tool (SPEC-12 §4.2): a synthetic workbook with every recorded feature snapshots to the expected JSON.
import ExcelJS from "exceljs";
import { describe, expect, it } from "vite-plus/test";

import { xlsxSnapshot } from "./xlsx-snapshot.ts";

const THIN = { style: "thin" } as const;
// exceljs's default font, which it writes on a styled cell that sets no font of its own.
const DEFAULT_FONT = { name: "Calibri", family: 2, scheme: "minor", size: 11, color: { theme: 1 } };

/** A synthetic one-sheet document plus an empty second sheet, as the legacy templates have. */
async function syntheticWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.25, header: 0.2, footer: 0.2 },
    },
  });
  ws.getColumn("A").width = 6.5;
  ws.getColumn("B").width = 40;
  ws.getColumn("C").hidden = true;
  ws.getRow(1).height = 30;
  ws.getCell("A3").value = "hidden row";
  ws.getRow(3).hidden = true;
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = "TAX INVOICE";
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getCell("A2").value = 12.5;
  ws.getCell("A2").numFmt = "0.00000";
  ws.getCell("A2").border = { top: THIN, bottom: THIN };
  ws.getCell("B2").value = { formula: "A2*2", result: 25 };
  ws.getCell("A4").value = true;
  ws.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  ws.getRow(2).addPageBreak();
  ws.pageSetup.printArea = "A1:B4";
  wb.addWorksheet("Sheet2", { state: "hidden" });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("xlsxSnapshot", () => {
  it("records values, styles, merges, sizes, print area, page breaks and page setup", async () => {
    const snapshot = await xlsxSnapshot(await syntheticWorkbook());
    expect(snapshot).toEqual([
      {
        name: "Sheet1",
        state: "visible",
        cells: {
          A1: {
            type: "string",
            value: "TAX INVOICE",
            style: {
              font: { name: "Arial", size: 14, bold: true },
              alignment: { horizontal: "center", vertical: "middle", wrapText: true },
            },
          },
          B1: {
            type: "merge",
            value: null,
            style: {
              font: { name: "Arial", size: 14, bold: true },
              alignment: { horizontal: "center", vertical: "middle", wrapText: true },
            },
          },
          A2: {
            type: "number",
            value: 12.5,
            style: {
              font: DEFAULT_FONT,
              numFmt: "0.00000",
              border: { top: { style: "thin" }, bottom: { style: "thin" } },
            },
          },
          B2: { type: "formula", value: { formula: "A2*2", result: 25 }, style: {} },
          A3: { type: "string", value: "hidden row", style: {} },
          A4: { type: "boolean", value: true, style: {} },
          B4: {
            type: "null",
            value: null,
            style: { font: DEFAULT_FONT, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } } },
          },
        },
        merges: ["A1:B1"],
        columns: { A: { size: 6.5 }, B: { size: 40 }, C: { size: 9, hidden: true } },
        rows: { "1": { size: 30 }, "3": { hidden: true } },
        pageBreaks: { rows: [2], columns: [] },
        pageSetup: {
          printArea: "A1:B4",
          printTitlesRow: null,
          printTitlesColumn: null,
          orientation: "landscape",
          paperSize: 9,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          scale: 100,
          horizontalCentered: true,
          verticalCentered: false,
          margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.25, header: 0.2, footer: 0.2 },
        },
      },
      {
        name: "Sheet2",
        state: "hidden",
        cells: {},
        merges: [],
        columns: {},
        rows: {},
        pageBreaks: { rows: [], columns: [] },
        pageSetup: {
          printArea: null,
          printTitlesRow: null,
          printTitlesColumn: null,
          orientation: "portrait",
          paperSize: null,
          fitToPage: false,
          fitToWidth: 1,
          fitToHeight: 1,
          scale: 100,
          horizontalCentered: false,
          verticalCentered: false,
          margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
        },
      },
    ]);
  });
});
