import { describe, expect, it } from "vite-plus/test";

import { parsePo } from "../src/index.ts";

const HEADER = "<table><tr><td>PURCHASE ORDER</td><td>4100000999</td><td>PO DATE</td><td>05/04/2023</td></tr></table>";
const COLUMNS = [
  "PO ITM",
  "MATERIAL CODE",
  "UNIT",
  "PO RATE",
  "ORD QTY",
  "RCD QTY",
  "LOT NO",
  "DELY QTY",
  "DELY DATE",
  "ENTRY ALLOW DATE",
  "DEST CODE",
];

const tr = (cells: readonly string[]): string => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
/** A PO page with one item table: `columns` as its header row, then `rows`. */
const page = (rows: readonly (readonly string[])[], columns: readonly string[] = COLUMNS): string =>
  `${HEADER}<table>${tr(columns)}${rows.map(tr).join("")}</table>`;
/** An item row in `COLUMNS` order. */
const item = (no: string, overrides: Partial<Record<(typeof COLUMNS)[number], string>> = {}): string[] => {
  const values: Record<string, string> = {
    "PO ITM": no,
    "MATERIAL CODE": `SYN${no}`,
    UNIT: "NOS",
    "PO RATE": "10.00",
    "ORD QTY": "5.000",
    "RCD QTY": "0.000",
    "LOT NO": "1",
    "DELY QTY": "5.000",
    "DELY DATE": "30/06/2023",
    "ENTRY ALLOW DATE": "15/07/2023",
    "DEST CODE": "11",
    ...overrides,
  };
  return COLUMNS.map((c) => values[c] ?? "");
};
/** A lot-only row in `COLUMNS` order. */
const lot = (lotNo: string, delyQty: string, entryAllow = "15/08/2023"): string[] => [
  "",
  "",
  "",
  "",
  "",
  "",
  lotNo,
  delyQty,
  "31/07/2023",
  entryAllow,
  "12",
];

const items = (html: string) => {
  const r = parsePo(html);
  return r.ok ? r.value.items : r.error;
};
const failure = (html: string) => {
  const r = parsePo(html);
  return r.ok ? undefined : { code: r.error.code, location: r.error.location };
};

describe("parsePo items", () => {
  it("reads an item row with its first lot, quantities and money exactly (C3)", () => {
    expect(items(page([item("10", { "PO RATE": "1,250.50", "ORD QTY": "1,000.500", "RCD QTY": "2.125" })]))).toEqual([
      {
        poItemNo: 10,
        materialCode: "SYN10",
        description: "",
        drawingNo: null,
        unit: "NOS",
        ordQty: 1000500,
        rate: 125050000,
        rcdQty: 2125,
        rejQty: null,
        lots: [
          {
            lotNo: 1,
            delyQty: 5000,
            delyDate: "2023-06-30",
            entryAllowDate: "2023-07-15",
            entryAllowNote: null,
            destCode: "11",
          },
        ],
      },
    ]);
  });

  it("reads REJ QTY when the page has the column, an empty cell as 0", () => {
    const columns = [...COLUMNS.slice(0, 6), "REJ QTY"];
    const r = items(page([["10", "SYN10", "NOS", "1", "5", "", ""]], columns));
    expect(Array.isArray(r) && r.map((i) => [i.rcdQty, i.rejQty, i.lots])).toEqual([[0, 0, []]]);
  });

  it("keeps a non-date ENTRY ALLOW DATE as the lot note (INV-46)", () => {
    const r = items(page([item("10", { "ENTRY ALLOW DATE": "PO Short Closed", "DEST CODE": "" })]));
    expect(Array.isArray(r) && r[0]?.lots).toEqual([
      {
        lotNo: 1,
        delyQty: 5000,
        delyDate: "2023-06-30",
        entryAllowDate: null,
        entryAllowNote: "PO Short Closed",
        destCode: null,
      },
    ]);
  });

  it("adds extra lot rows to the item above; a repeated lot number with a quantity replaces the lot", () => {
    const r = items(page([item("10"), lot("2", "3.000"), lot("2", "4.000", ""), lot("2", "0")]));
    expect(Array.isArray(r) && r[0]?.lots.map((l) => [l.lotNo, l.delyQty, l.entryAllowDate])).toEqual([
      [1, 5000, "2023-07-15"],
      [2, 4000, null],
    ]);
  });

  it("merges a repeated item row: a new lot is added and the larger ordered quantity kept", () => {
    const r = items(page([item("10"), item("10", { "ORD QTY": "8", "LOT NO": "2" }), item("10", { "ORD QTY": "6" })]));
    expect(Array.isArray(r) && r.map((i) => [i.poItemNo, i.ordQty, i.lots.map((l) => l.lotNo)])).toEqual([
      [10, 8000, [1, 2]],
    ]);
  });

  it("appends description rows to the item above, or to the item a 1-2 digit cell names", () => {
    const r = items(
      page([
        item("10"),
        item("20"),
        ["", "TERMINAL BOX"],
        ["", "10", "FLANGE GASKET DRG NO 3A120955"],
        ["", "10", "ASBESTOS FREE"],
        ["", "COVER"],
      ]),
    );
    expect(Array.isArray(r) && r.map((i) => [i.description, i.drawingNo])).toEqual([
      ["FLANGE GASKET DRG NO 3A120955 ASBESTOS FREE", "3A120955"],
      ["TERMINAL BOX COVER", null],
    ]);
  });

  it("joins every drawing number of 5+ characters in the description, sorted and distinct", () => {
    const r = items(page([item("10"), ["", "PLATE DRG. NO. B-7720 TO DRAWING: A1234/5 DRG B-7720 DRG 12"]]));
    expect(Array.isArray(r) && r[0]?.drawingNo).toBe("A1234/5, B-7720");
  });

  it("ends a drawing number before a run-in ITEM, VAR or REV; one followed by other text is not read", () => {
    const r = items(page([item("10"), ["", "DRG 3253020460ITEM(2) DRG 99887;"]]));
    expect(Array.isArray(r) && r[0]?.drawingNo).toBe("3253020460");
  });

  it("ignores rows before the first item and stops at a REMARKS or TOTAL VALUE row", () => {
    const r = items(page([["", "ORPHAN"], item("10"), ["", "TOTAL VALUE 50.00"], ["", "AFTER TOTAL"], item("20")]));
    expect(Array.isArray(r) && r.map((i) => [i.poItemNo, i.description])).toEqual([
      [10, ""],
      [20, ""],
    ]);
  });

  it("finds the item table by its MATERIAL CODE header row, whatever comes before it", () => {
    const html = `${HEADER}<table>${tr(["ITEM DETAILS"])}${tr(COLUMNS)}${tr(item("10"))}</table>`;
    const r = items(html);
    expect(Array.isArray(r) && r.map((i) => i.materialCode)).toEqual(["SYN10"]);
  });

  it.each([
    ["no item table", `${HEADER}<table><tr><td>REMARKS</td></tr></table>`, "no-item-table", undefined],
    ["an item table with no item rows", page([["", "TEXT"]]), "no-item-table", undefined],
    [
      "no PO RATE column",
      page(
        [],
        COLUMNS.filter((c) => c !== "PO RATE"),
      ),
      "missing-field",
      "PO RATE",
    ],
    ["an empty material code", page([item("10", { "MATERIAL CODE": "" })]), "missing-field", "item 10, MATERIAL CODE"],
    ["item number 0", page([item("0")]), "bad-number", "item 0, PO ITM"],
    ["an empty ordered quantity", page([item("10", { "ORD QTY": "" })]), "bad-quantity", "item 10, ORD QTY"],
    ["four decimals", page([item("10", { "RCD QTY": "1.0005" })]), "bad-quantity", "item 10, RCD QTY"],
    ["a rate that is not a number", page([item("10", { "PO RATE": "N/A" })]), "bad-number", "item 10, PO RATE"],
    ["a lot number that is not whole", page([item("10"), lot("2a", "1")]), "bad-number", "item 10, LOT NO"],
    ["an empty lot quantity", page([item("10", { "DELY QTY": "" })]), "bad-quantity", "item 10 lot 1, DELY QTY"],
    ["a bad delivery date", page([item("10", { "DELY DATE": "31/02/2023" })]), "bad-date", "item 10 lot 1, DELY DATE"],
  ])("fails on %s", (_, html, code, location) => {
    expect(failure(html)).toEqual({ code, location });
  });

  it("reports a header error before looking at items", () => {
    expect(failure("<table><tr><td>PO DATE</td><td>05/04/2023</td></tr></table>")).toEqual({
      code: "missing-field",
      location: "PURCHASE ORDER",
    });
  });

  it("names the item, column and text in the message", () => {
    expect(parsePo(page([item("10", { "ORD QTY": "five" })]))).toEqual({
      ok: false,
      error: {
        code: "bad-quantity",
        message: 'item 10, ORD QTY is not a quantity: "five"',
        location: "item 10, ORD QTY",
      },
    });
  });
});
