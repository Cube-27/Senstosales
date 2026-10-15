import { Readable } from "node:stream";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vite-plus/test";

import type { Row, Sheet } from "../../src/index.ts";
import { xlsxChunks } from "../../src/index.ts";
import type { Key } from "./rows.ts";
import { collect, COLUMNS, of, settle, source } from "./rows.ts";

const SHEET: Sheet<Key> = { name: "Register", columns: COLUMNS, pageSetup: { orientation: "landscape" } };

async function read(chunks: AsyncIterable<Uint8Array>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(chunks));
  const sheet = workbook.getWorksheet("Register");
  if (sheet === undefined) throw new Error("no Register sheet");
  return sheet;
}

describe("xlsxChunks", () => {
  it("writes the header row, then each row in column order with widths and number formats", async () => {
    const sheet = await read(
      xlsxChunks(SHEET, of({ qty: 2.5, note: "plain", number: "DOC-1" }, { number: "DOC-2", note: null, qty: null })),
    );
    expect(sheet.getSheetValues()).toEqual([
      undefined,
      [undefined, "Doc No", "Note", "Qty"],
      [undefined, "DOC-1", "plain", 2.5],
      [undefined, "DOC-2"],
    ]);
    expect([1, 2, 3].map((n) => sheet.getColumn(n).width)).toEqual([12, 30, 10]);
    expect(sheet.getCell("C2").numFmt).toBe("0.000");
    expect(sheet.getCell("A2").numFmt).toBeUndefined();
    expect(sheet.getCell("C1").numFmt).toBeUndefined();
    expect(sheet.pageSetup.orientation).toBe("landscape");
  });

  // INV-94: text is a string cell, never a formula, and keeps its text unprefixed.
  it.each(["=1+1", "+91", "-2", "@SUM(A1)", '=HYPERLINK("x")'])("writes text %j as a string cell", async (text) => {
    const cell = (await read(xlsxChunks(SHEET, of({ number: text, note: null, qty: -1 })))).getCell("A2");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe(text);
    expect(cell.formula).toBeUndefined();
  });

  it("keeps a negative number numeric", async () => {
    const cell = (await read(xlsxChunks(SHEET, of({ number: "N", note: null, qty: -1.5 })))).getCell("C2");
    expect(cell.type).toBe(ExcelJS.ValueType.Number);
    expect(cell.value).toBe(-1.5);
  });

  it("streams 10k rows with no row cap (INV-99)", async () => {
    const sheet = await read(xlsxChunks(SHEET, source(10_000).rows));
    expect(sheet.rowCount).toBe(10_001);
    expect(sheet.getRow(10_001).values).toEqual([undefined, "DOC-10000", "synthetic note 10000 1b5be8", 10_000.5]);
  });

  // INV-99: memory stays flat because the writer stops pulling rows while its output is not read.
  it("stops pulling rows while the reader is not reading", async () => {
    const { rows, state } = source(10_000);
    const chunks = xlsxChunks(SHEET, rows);
    const first = await chunks.next();
    expect(first.done).toBe(false);
    const stalledAt = await settle(() => state.read);
    expect(stalledAt).toBeLessThan(10_000);
    const rest = await collect({ [Symbol.asyncIterator]: () => chunks });
    expect(rest.length).toBeGreaterThan(0);
    expect(state.read).toBe(10_000);
  });

  it("passes a source error to the reader", async () => {
    const { rows } = source(500, { at: 300, error: new Error("page failed") });
    await expect(collect(xlsxChunks(SHEET, rows))).rejects.toThrow("page failed");
  });

  it("styles the header cells and writes the odd-page footer when the sheet has them", async () => {
    const thin = { style: "thin" } as const;
    const headerStyle = {
      font: { bold: true },
      border: { top: thin, left: thin, bottom: thin, right: thin },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD7E4BC" } },
    } as const;
    const sheet = await read(
      xlsxChunks({ ...SHEET, headerStyle, oddFooter: "&CPage &P of &N" }, of({ number: "N", note: null, qty: 1 })),
    );
    expect(["A1", "B1", "C1"].map((a) => sheet.getCell(a).style)).toEqual([headerStyle, headerStyle, headerStyle]);
    expect(sheet.getCell("A2").style).toEqual({});
    expect(sheet.headerFooter.oddFooter).toBe("&CPage &P of &N");
  });

  // EC-45: with no rows the legacy list workbook is the bare sheet.
  it("writes a bare sheet with no rows when the sheet asks for it", async () => {
    const sheet = await read(xlsxChunks({ ...SHEET, bareWhenEmpty: true, oddFooter: "&CPage" }, of()));
    expect(sheet.rowCount).toBe(0);
    expect(sheet.columns).toBeNull();
    expect(sheet.pageSetup.orientation).toBe("portrait");
    expect(sheet.headerFooter?.oddFooter).toBeUndefined();
  });

  it("writes the header row with no rows otherwise", async () => {
    const sheet = await read(xlsxChunks(SHEET, of()));
    expect(sheet.getSheetValues()).toEqual([undefined, [undefined, "Doc No", "Note", "Qty"]]);
  });

  it("closes the source when writing the first row fails", async () => {
    let closed = false;
    async function* rows(): AsyncGenerator<Row<Key>> {
      try {
        yield {
          get number(): string {
            throw new Error("bad row");
          },
          note: null,
          qty: 1,
        };
        yield { number: "N", note: null, qty: 2 };
      } finally {
        closed = true;
      }
    }
    await expect(collect(xlsxChunks(SHEET, rows()))).rejects.toThrow("bad row");
    expect(closed).toBe(true);
  });

  it("closes the source when the reader stops early", async () => {
    const { rows, state } = source(10_000);
    const chunks = xlsxChunks(SHEET, rows);
    await chunks.next();
    await chunks.return(undefined);
    expect(state.closed).toBe(true);
    expect(state.read).toBeLessThan(10_000);
  });
});
