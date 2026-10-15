// The invoice workbook against goldens derived from the legacy invoice download (SPEC-12 §4.2, INV-69). Inputs and
// goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the goldens against legacy output (H5).
import type { Qty } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import { buildInvoiceWorkbook, invoiceFileName, type InvoiceDocument } from "../src/invoice.ts";
import { describeGoldens, readInput } from "./golden.ts";
import { xlsxSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

const input = readInput<InvoiceDocument>;

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

  it("prints each line's HSN and packets, totals the packets, and shows a fractional quantity exactly", async () => {
    const one = input("invoice-1");
    const item = one.items[0]!;
    const items = [
      { ...item, poItemNo: 1, hsn: "0000", packets: 3, qty: 12_345 as Qty },
      { ...item, poItemNo: 2, hsn: null, packets: null },
    ];
    const sheet = await build({ ...one, items });
    const cells = (row: number) => ["I", "J", "K"].map((column) => sheet.cells[`${column}${row}`]?.value ?? null);
    // A line without packets prints legacy's 1.
    expect([cells(17), cells(18), cells(20)]).toEqual([
      ["0000", 3, 12.345],
      [null, 1, 1],
      [null, 4, 13.345],
    ]);
    // General, Excel's default, reads back as no number format.
    expect(["K17", "K18", "K20"].map((at) => sheet.cells[at]?.style["numFmt"])).toEqual(Array(3).fill(undefined));
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

// The sanitising rule is the DC's (dc.test.ts); the invoice has its own prefix and fallback.
describe("invoiceFileName: legacy Invoice_<number>.xlsx", () => {
  it.each([
    ["INV/20", "Invoice_INV_20.xlsx"],
    ["12 A", "Invoice_invoice.xlsx"],
  ])("%s -> %s", (number, expected) => {
    expect(invoiceFileName(number)).toBe(expected);
  });
});
