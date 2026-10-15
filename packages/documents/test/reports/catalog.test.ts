// SPEC-13 PR 1: the catalog and the legacy-derived goldens agree on everything the catalog records (file name, sheet,
// headers and order, widths, styles, page setup), every kept export has both, and none has a flag column (INV-60).
// The goldens are hand-written from the legacy visible output (C16); PR 3–5 compare the real exports with them.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { EXPORTS, fileSafe, TABLE } from "../../src/reports/catalog.ts";
import { NOW_IST, RANGE } from "./dataset.ts";

type Cell = string | number | null | { v: string | number; s: string };

interface XlsxGolden {
  fileName: string;
  sheet: string;
  widths: number[];
  pageSetup: Record<string, unknown>;
  oddFooter: string | null;
  styles: Record<string, unknown>;
  merges: string[];
  rows: Cell[][];
}

const files = new Map<string, string>();
const read = (file: string) => {
  const text = files.get(file) ?? readFileSync(new URL(`golden/${file}`, import.meta.url), "utf8");
  files.set(file, text);
  return text;
};
const golden = (file: string) => JSON.parse(read(file)) as XlsxGolden;
const text = (cell: Cell | undefined) => (cell !== null && typeof cell === "object" ? cell.v : cell);

const { pending, dcList, invoiceList, reconciliation, deliveryTracker } = EXPORTS;

/** Each table export's goldens, with the file name its synthetic export gets. */
const TABLE_GOLDENS = [
  { name: "poRegister", file: "po-register.json", fileName: EXPORTS.poRegister.fileName() },
  { name: "dcRegister", file: "dc-register.json", fileName: EXPORTS.dcRegister.fileName() },
  { name: "invoiceRegister", file: "invoice-register.json", fileName: EXPORTS.invoiceRegister.fileName() },
  { name: "reconciliation", file: "reconciliation.json", fileName: reconciliation.fileName() },
  { name: "reconciliation", file: "reconciliation-one-po.json", fileName: reconciliation.fileName("4500101") },
  { name: "exportSelected", file: "export-selected.json", fileName: EXPORTS.exportSelected.fileName() },
  { name: "deliveryTracker", file: "delivery-tracker.json", fileName: deliveryTracker.fileName(NOW_IST) },
] as const;

const CSV_GOLDENS = [
  { name: "dcList", file: "dc-list.csv" },
  { name: "invoiceList", file: "invoice-list.csv" },
] as const;

describe("export inventory", () => {
  it("has a golden for every export SPEC-13 §2 keeps, and no daily-dispatch (A-16)", () => {
    const goldens = Object.fromEntries(
      Object.keys(EXPORTS).map((name) => [
        name,
        [...TABLE_GOLDENS, ...CSV_GOLDENS].filter((g) => g.name === name).map((g) => g.file),
      ]),
    );
    expect(goldens).toEqual({
      poRegister: ["po-register.json"],
      dcRegister: ["dc-register.json"],
      invoiceRegister: ["invoice-register.json"],
      // Tested on its own below.
      pending: [],
      reconciliation: ["reconciliation.json", "reconciliation-one-po.json"],
      exportSelected: ["export-selected.json"],
      // SPEC-12's goldens.
      guaranteeCertificate: [],
      deliveryTracker: ["delivery-tracker.json"],
      dcList: ["dc-list.csv"],
      invoiceList: ["invoice-list.csv"],
    });
    expect(EXPORTS.guaranteeCertificate).toMatchObject({ kind: "document", document: "gc" });
  });

  it("has no flag column (INV-60)", () => {
    const headers = Object.values(EXPORTS).flatMap((e) => {
      if (e.kind === "table") return e.sheet.columns.map((c) => c.header);
      return e.kind === "document" ? [] : e.columns.map((c) => c.header);
    });
    expect(headers).toHaveLength(80);
    expect(headers.filter((h) => /flag|issue|mismatch/i.test(h))).toEqual([]);
  });
});

describe("file names", () => {
  it.each([
    [EXPORTS.poRegister.fileName(), "PO_Register.xlsx"],
    [EXPORTS.dcRegister.fileName(), "DC_Register.xlsx"],
    [EXPORTS.invoiceRegister.fileName(), "Invoice_Register.xlsx"],
    [pending.fileName(), "Items_Summary.xlsx"],
    [pending.fileName({ from: "2025-04-01", to: "2025-04-30" }), "Items_Summary_2025-04-01_to_2025-04-30.xlsx"],
    [reconciliation.fileName(), "PO_Reconciliation_Report.xlsx"],
    [reconciliation.fileName("4500999"), "PO_Reconciliation_4500999.xlsx"],
    [EXPORTS.exportSelected.fileName(), "PO_Reconciliation_Report.xlsx"],
    [EXPORTS.guaranteeCertificate.fileName("12"), "GC_12.xlsx"],
    [deliveryTracker.fileName({ date: "2025-12-31", time: "09:05" }), "Delivery_Tracker_20251231_0905.xlsx"],
    [dcList.fileName(), "DC_List_Export_All.csv"],
    [dcList.fileName("4500999"), "DC_List_Export_4500999.csv"],
    [invoiceList.fileName(), "Invoice_List_Export.csv"],
  ])("%s", (actual, expected) => {
    expect(actual).toBe(expected);
  });

  it("cleans a document number as legacy did: `..`, `/` and `\\` become `_`, at most 50 characters", () => {
    expect(fileSafe("A/1..2\\3")).toBe("A_1_2_3");
    expect(fileSafe("9".repeat(60))).toBe("9".repeat(50));
    expect(EXPORTS.guaranteeCertificate.fileName("../x")).toBe("GC___x.xlsx");
  });
});

describe("table goldens", () => {
  it.each(TABLE_GOLDENS)("$file matches the $name entry", ({ name, file, fileName }) => {
    const { sheet } = EXPORTS[name];
    const g = golden(file);
    expect(g.fileName).toBe(fileName);
    expect(g.sheet).toBe(sheet.name);
    expect(g.widths).toEqual(sheet.columns.map((c) => c.width));
    expect(g.pageSetup).toEqual(sheet.pageSetup);
    expect(g.oddFooter).toBe(TABLE.oddFooter);
    expect(g.styles).toEqual({ header: TABLE.headerStyle });
    expect(g.rows[0]).toEqual(sheet.columns.map((c) => ({ v: c.header, s: "header" })));
    for (const row of g.rows.slice(1)) expect(row).toHaveLength(sheet.columns.length);
  });

  it("lists only open lots in the tracker: C10 is Closed (D-0238)", () => {
    const lots = golden("delivery-tracker.json")
      .rows.slice(1)
      .map((row) => `${text(row[0])} ${text(row[1])} ${text(row[3])}`);
    expect(lots).toEqual(["4500102 M-210 L1", "4500101 M-110 L2", "4500101 M-120 L1", "4500101 M-110 L1"]);
  });

  it("an empty export is the bare Report sheet: no header row, no page setup (EC-45)", () => {
    expect(golden("po-register-empty.json")).toEqual({
      fileName: "PO_Register.xlsx",
      sheet: "Report",
      widths: [],
      pageSetup: {},
      oddFooter: null,
      styles: {},
      merges: [],
      rows: [],
    });
  });

  it("writes numbers rounded to 2 dp and never as text", () => {
    const numbers = TABLE_GOLDENS.flatMap(({ file }) => golden(file).rows.slice(1).flat()).filter(
      (cell) => typeof cell === "number",
    );
    expect(numbers.filter((n) => Number(n.toFixed(TABLE.decimals)) !== n)).toEqual([]);
    expect(golden("dc-register.json").rows[1]).toEqual(["103", "2025-05-28", "4500102", "Example Works Unit", 1, 1.25]);
  });
});

describe("pending golden", () => {
  const g = golden("pending.json");
  const cell = (address: string) => g.rows[Number(address.slice(1)) - 1]?.[address.charCodeAt(0) - 65];

  it("matches the pending entry's file name, sheet, widths, styles and page setup", () => {
    expect(g.fileName).toBe(pending.fileName(RANGE));
    expect(g.sheet).toBe(pending.sheet);
    expect(g.widths).toEqual(pending.columns.map((c) => c.width));
    expect(g.styles).toEqual(pending.styles);
    expect(g.pageSetup).toEqual({ ...pending.pageSetup, printArea: "A1:I12" });
  });

  it("has the heading cells and merges, the table header on row 9 and TOTAL merged over A:B", () => {
    for (const h of pending.heading) expect(cell(h.cell)).toMatchObject({ s: h.style });
    expect(text(cell("A6"))).toBe("SUMMARY");
    expect(text(cell("B7"))).toBe("Date:");
    expect(g.rows[pending.headerRow - 1]).toEqual(pending.columns.map((c) => ({ v: c.header, s: "th" })));
    const last = g.rows.length;
    expect(text(cell(`A${last}`))).toBe(pending.total.label);
    expect(g.merges).toEqual([...pending.heading.flatMap((h) => ("merge" in h ? [h.merge] : [])), `A${last}:B${last}`]);
  });
});

describe("CSV goldens", () => {
  it.each(CSV_GOLDENS)("$file: BOM, CRLF lines, the $name headers in order", ({ name, file }) => {
    const csv = read(file);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const lines = csv.slice(1, -2).split("\r\n");
    expect(lines[0]).toBe(EXPORTS[name].columns.map((c) => c.header).join(","));
    for (const line of lines) expect(line.split(",")).toHaveLength(EXPORTS[name].columns.length);
  });

  it("prefixes formula-looking text with ' (INV-94)", () => {
    expect(read("dc-list.csv").split("\r\n")[2]).toBe("102,2025-05-10,4500101,'+Example Store,Pending,300,10,3,1,6");
  });
});
