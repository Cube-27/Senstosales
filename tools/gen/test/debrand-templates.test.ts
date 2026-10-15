import ExcelJS from "exceljs";
import { describe, expect, it } from "vite-plus/test";

import { debrand } from "../src/debrand-templates.ts";

/** A synthetic stand-in for a legacy template: identity, label, document data, metadata and a second sheet. */
function legacyLike(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Someone";
  wb.lastModifiedBy = "Someone Else";
  wb.company = "Example Traders";
  wb.created = new Date("2024-05-06T07:08:09Z");
  const ws = wb.addWorksheet("1234");
  ws.headerFooter.oddFooter = "Example Traders";
  ws.getColumn("B").width = 30;
  ws.getCell("A1").value = "Example Traders";
  ws.getCell("A2").value = "DELIVERY CHALLAN";
  ws.mergeCells("A3:B3");
  ws.getCell("A3").value = "Consignee: Example Unit";
  ws.getCell("A4").value = 1250.5;
  ws.getCell("A4").numFmt = "0.00";
  ws.getCell("A4").font = { bold: true };
  wb.addWorksheet("Sheet2").getCell("A1").value = "left over";
  return wb;
}

const PLAN = {
  labels: ["A2"],
  identity: { A1: "{supplier.name}" },
};

describe("debrand", () => {
  it("keeps labels, turns identity cells into placeholders and clears everything else", () => {
    const wb = legacyLike();
    debrand(wb, PLAN);
    const [ws, other] = wb.worksheets;
    expect(ws?.name).toBe("Sheet1");
    expect(ws?.getCell("A1").value).toBe("{supplier.name}");
    expect(ws?.getCell("A2").value).toBe("DELIVERY CHALLAN");
    expect(ws?.getCell("A3").value).toBe(null);
    expect(ws?.getCell("A4").value).toBe(null);
    expect(other?.getCell("A1").value).toBe(null);
  });

  it("keeps the layout: styles, number formats, merges and widths", () => {
    const wb = legacyLike();
    debrand(wb, PLAN);
    const ws = wb.worksheets[0];
    expect(ws?.getCell("A4").numFmt).toBe("0.00");
    expect(ws?.getCell("A4").font).toEqual({ bold: true });
    expect(ws?.model.merges).toEqual(["A3:B3"]);
    expect(ws?.getColumn("B").width).toBe(30);
  });

  it("drops document properties, their dates, and headers and footers", () => {
    const wb = legacyLike();
    debrand(wb, PLAN);
    expect([wb.creator, wb.lastModifiedBy, wb.company]).toEqual(["", "", ""]);
    expect(wb.worksheets[0]?.headerFooter).toEqual({});
    expect([wb.created.toISOString(), wb.modified.toISOString()]).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("refuses a plan naming a cell that is empty in the source", () => {
    expect(() => debrand(legacyLike(), { ...PLAN, labels: ["C9"] })).toThrow("C9: empty in the source template");
  });
});
