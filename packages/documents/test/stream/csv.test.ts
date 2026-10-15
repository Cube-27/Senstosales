import { describe, expect, it } from "vite-plus/test";

import type { Row } from "../../src/index.ts";
import { csvChunks } from "../../src/index.ts";
import type { Key } from "./rows.ts";
import { collect, COLUMNS, of, source } from "./rows.ts";

const BOM = "\uFEFF";
/** The CSV text after its BOM; a missing BOM fails the test (D-0287). */
async function csv(...rows: Row<Key>[]) {
  const text = (await collect(csvChunks(COLUMNS, of(...rows)))).join("");
  expect(text.slice(0, 1)).toBe(BOM);
  return text.slice(1);
}

describe("csvChunks", () => {
  it("starts with a UTF-8 BOM, as the legacy CSV writer did (D-0287)", async () => {
    expect((await collect(csvChunks(COLUMNS, of()))).join("")).toBe(`${BOM}Doc No,Note,Qty\r\n`);
  });

  it("writes the header and one CRLF line per row in column order", async () => {
    expect(await csv({ qty: 2, note: "plain", number: "DOC-1" }, { number: "DOC-2", note: null, qty: null })).toBe(
      "Doc No,Note,Qty\r\nDOC-1,plain,2\r\nDOC-2,,\r\n",
    );
  });

  it("quotes text holding a comma, quote or line break", async () => {
    expect(await csv({ number: "A,B", note: 'say "hi"', qty: 1 }, { number: "X", note: "two\nlines", qty: 1 })).toBe(
      'Doc No,Note,Qty\r\n"A,B","say ""hi""",1\r\nX,"two\nlines",1\r\n',
    );
  });

  // INV-94: text starting with =, +, - or @ gets a leading '; numbers never do.
  it.each([
    ["=1+1", "'=1+1"],
    ["+91", "'+91"],
    ["-2", "'-2"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ['=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ["a=b", "a=b"],
    [" =1", " =1"],
  ])("writes text %j as %s", async (text, cell) => {
    expect(await csv({ number: text, note: null, qty: null })).toBe(`Doc No,Note,Qty\r\n${cell},,\r\n`);
  });

  it("writes negative and fractional numbers as plain numbers", async () => {
    expect(await csv({ number: "N", note: null, qty: -1.5 }, { number: "Z", note: null, qty: 0 })).toBe(
      "Doc No,Note,Qty\r\nN,,-1.5\r\nZ,,0\r\n",
    );
  });

  it("pulls rows only as its output is read (INV-99)", async () => {
    const { rows, state } = source(10_000);
    const chunks = csvChunks(COLUMNS, rows);
    expect((await chunks.next()).value).toBe(`${BOM}Doc No,Note,Qty\r\n`);
    expect(state.read).toBe(0);
    expect((await chunks.next()).value).toBe("DOC-1,synthetic note 1 63z,1.5\r\n");
    expect(state.read).toBe(1);
    await chunks.return(undefined);
    expect(state.closed).toBe(true);
  });

  it("streams 10k rows with no row cap (INV-99)", async () => {
    const lines = (await collect(csvChunks(COLUMNS, source(10_000).rows))).join("").split("\r\n");
    expect(lines.length).toBe(10_002);
    expect(lines.at(-2)).toBe("DOC-10000,synthetic note 10000 1b5be8,10000.5");
    expect(lines.at(-1)).toBe("");
  });

  it("passes a source error to the reader", async () => {
    const { rows } = source(5, { at: 3, error: new Error("page failed") });
    await expect(collect(csvChunks(COLUMNS, rows))).rejects.toThrow("page failed");
  });
});
