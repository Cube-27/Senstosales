// The invoice workbook against goldens derived from the legacy invoice download (SPEC-12 §4.2, INV-69). Inputs and
// goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the goldens against legacy output (H5).
import { describe, expect, it } from "vite-plus/test";

import { buildInvoiceWorkbook, invoiceFileName, type InvoiceDocument } from "../src/invoice.ts";
import { describeGoldens, readJson } from "./golden.ts";
import { xlsxSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

const input = (name: string): InvoiceDocument => readJson<InvoiceDocument>(`./inputs/${name}.json`);

async function build(doc: InvoiceDocument): Promise<SheetSnapshot> {
  const [sheet] = await xlsxSnapshot(await buildInvoiceWorkbook(doc));
  return sheet!;
}

describeGoldens<InvoiceDocument>({
  template: "invoice",
  names: ["invoice-1", "invoice-20", "invoice-21", "invoice-60"],
  build: buildInvoiceWorkbook,
  fileName: (doc) => invoiceFileName(doc.invoice.number),
});

describe("invoice workbook", () => {
  it("INV-18: formats a GEMC invoice's rates and amounts at 5 dp, others at 2", async () => {
    const one = input("invoice-1");
    const numFmt = async (isGemc: boolean) => {
      const sheet = await build({ ...one, po: { ...one.po, isGemc } });
      return ["L17", "N17", "S17", "S20", "S24"].map((at) => sheet.cells[at]?.style["numFmt"]);
    };
    expect([await numFmt(false), await numFmt(true)]).toEqual([
      Array(5).fill("#,##0.00"),
      Array(5).fill("#,##0.00000"),
    ]);
  });

  it.each([
    [1, [19], "A1:S32", 1],
    [2, [], "A1:S32", 1],
    [3, [], "A1:S32", 1],
    [4, [], "A1:S33", 0],
  ])("%i items: hidden rows %j, print area %s, fit to %i page high", async (count, hidden, printArea, fitToHeight) => {
    const one = input("invoice-1");
    const items = Array.from({ length: count }, (_, i) => ({ ...one.items[0]!, poItemNo: i + 1 }));
    const sheet = await build({ ...one, items });
    const hiddenRows = Object.entries(sheet.rows).flatMap(([row, d]) => (d.hidden ? [Number(row)] : []));
    expect(hiddenRows).toEqual(hidden);
    expect([sheet.pageSetup["printArea"], sheet.pageSetup["fitToHeight"]]).toEqual([printArea, fitToHeight]);
  });
});

describe("invoiceFileName: legacy Invoice_<number>.xlsx", () => {
  it.each([
    ["7", "Invoice_7.xlsx"],
    ["INV/20", "Invoice_INV_20.xlsx"],
    ["A\\B", "Invoice_A_B.xlsx"],
    ["1..2", "Invoice_1_2.xlsx"],
    ["12 A", "Invoice_invoice.xlsx"],
    ["7.1", "Invoice_invoice.xlsx"],
    ["x".repeat(120), `Invoice_${"x".repeat(100)}.xlsx`],
  ])("%s -> %s", (number, expected) => {
    expect(invoiceFileName(number)).toBe(expected);
  });
});
