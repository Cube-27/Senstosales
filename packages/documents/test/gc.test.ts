// The GC workbook against goldens derived from the legacy GC download (SPEC-12 §4.2, INV-69). A GC is printed from its
// DC, so it is built from the DC inputs. Inputs and goldens are synthetic (C1, INV-75); SPEC-12 PR 2 confirms the
// goldens against legacy output (H5).
import { parseQty } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import { buildGcWorkbook, gcFileName, type GcDocument } from "../src/gc.ts";
import { describeGoldens, readInput, unwrap } from "./golden.ts";
import { xlsxSnapshot, type SheetSnapshot } from "./xlsx-snapshot.ts";

const one = readInput<GcDocument>("dc-1");

async function build(doc: GcDocument): Promise<SheetSnapshot> {
  const [sheet] = await xlsxSnapshot(await buildGcWorkbook(doc));
  return sheet!;
}

describeGoldens<GcDocument>({
  template: "gc",
  names: ["gc-1", "gc-20", "gc-21", "gc-60"],
  build: buildGcWorkbook,
  fileName: (doc) => gcFileName(doc.dc.number),
  input: (name) => name.replace("gc-", "dc-"),
});

describe("GC workbook", () => {
  it("prints the GC, PO and DC numbers with their dates, and only the number when a date is missing", async () => {
    const sheet = await build({ ...one, po: { ...one.po, poDate: null } });
    expect(["I9", "I10", "I11"].map((at) => sheet.cells[at]?.value)).toEqual([
      "7  dt. 03/06/2025",
      "4500000001  dt.",
      "7  dt. 03/06/2025",
    ]);
  });

  it.each([
    ["2.5", "nos", "2.5  NOS"],
    ["3", null, "3  NO"],
    ["0.125", "", "0.125  NO"],
  ])("quantity %s %j prints as %j", async (qty, unit, expected) => {
    const item = { ...one.items[0]!, dspQty: unwrap(parseQty(qty)), unit };
    const sheet = await build({ ...one, items: [item] });
    expect(sheet.cells["J17"]?.value).toBe(expected);
  });

  it.each([
    [8, "B1:J34", "B27", "H34"],
    [9, "B1:J35", "B28", "H35"],
  ])("%i items: print area %s, guarantee in %s, signature in %s", async (count, printArea, guarantee, sign) => {
    const items = Array.from({ length: count }, (_, i) => ({ ...one.items[0]!, poItemNo: i + 1 }));
    const sheet = await build({ ...one, items });
    expect(sheet.pageSetup["printArea"]).toBe(printArea);
    expect(String(sheet.cells[guarantee]?.value)).toMatch(/^The goods supplied as above are guaranteed/);
    expect(sheet.cells[sign]?.value).toBe("                 For EXAMPLE PRECISION WORKS");
  });
});

describe("gcFileName: legacy GC_<number>.xlsx", () => {
  it.each([
    ["7", "GC_7.xlsx"],
    ["DC/20", "GC_DC_20.xlsx"],
    ["12 A", "GC_export.xlsx"],
  ])("%s -> %s", (number, expected) => {
    expect(gcFileName(number)).toBe(expected);
  });
});
