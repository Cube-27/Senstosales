import { describe, expect, it } from "vite-plus/test";

import { decodePage, findByLabel, loadPage, mapColumnsByHeader } from "../src/html.ts";

describe("decodePage", () => {
  it("decodes UTF-8 bytes", () => {
    expect(decodePage(new TextEncoder().encode("<td>Ø 12 – NOS</td>"))).toBe("<td>Ø 12 – NOS</td>");
  });

  it("replaces invalid bytes with U+FFFD instead of failing", () => {
    expect(decodePage(Uint8Array.of(0x3c, 0x62, 0x3e, 0xff, 0xfe, 0x3c))).toBe("<b>��<");
  });
});

describe("loadPage", () => {
  it("reads each table as rows of cell text, th and td alike", () => {
    const page = loadPage(
      "<table><tr><th>PO ITM</th><th>UNIT</th></tr><tr><td>10</td><td>NOS</td></tr></table>" +
        "<table><tr><td>REMARKS</td></tr></table>",
    );
    expect(page).toEqual([
      [
        ["PO ITM", "UNIT"],
        ["10", "NOS"],
      ],
      [["REMARKS"]],
    ]);
  });

  it("turns &nbsp; into spaces, collapses whitespace and trims", () => {
    const page = loadPage(
      "<table><tr><td>&nbsp;</td><td>&nbsp;NOS&nbsp;</td><td>HEX  BOLT\n M12&nbsp;X 40</td></tr></table>",
    );
    expect(page).toEqual([[["", "NOS", "HEX BOLT M12 X 40"]]]);
  });

  it("drops HTML comments, including a commented-out table", () => {
    const page = loadPage(
      "<!-- <table><tr><td>OLD</td></tr></table> --><table><tr><td>41<!-- x -->00</td></tr></table>",
    );
    expect(page).toEqual([[["4100"]]]);
  });

  it("gives a nested table its own rows, not its parent's", () => {
    const page = loadPage("<table><tr><td>A</td><td><table><tr><td>B</td><td>C</td></tr></table></td></tr></table>");
    expect(page).toEqual([[["A", "BC"]], [["B", "C"]]]);
  });

  it("never runs or reads script content (C17)", () => {
    expect(loadPage("<table><tr><td>X<script>throw 1</script></td></tr></table>")).toEqual([[["X"]]]);
  });

  it("returns no tables for a page without any", () => {
    expect(loadPage("not html at all <")).toEqual([]);
  });
});

describe("findByLabel", () => {
  const LABELS = [/^PO NO$/, /^PO DATE$/, /^RC NO$/, /^REMARKS$/];
  const isLabel = (text: string): boolean => LABELS.some((rx) => rx.test(text));
  const find = (html: string, label: RegExp) => findByLabel(loadPage(html), label, isLabel);

  it("reads the value from the cell to the right of the label", () => {
    expect(
      find("<table><tr><td>PO NO</td><td>41</td><td>PO DATE</td><td>05/04/2023</td></tr></table>", /^PO DATE$/),
    ).toEqual({
      label: "PO DATE",
      value: "05/04/2023",
    });
  });

  it("reads the value below when the next cell is another label", () => {
    const html = "<table><tr><td>PO NO</td><td>PO DATE</td></tr><tr><td>41</td><td>12-APR-24</td></tr></table>";
    expect(find(html, /^PO NO$/)).toEqual({ label: "PO NO", value: "41" });
    expect(find(html, /^PO DATE$/)).toEqual({ label: "PO DATE", value: "12-APR-24" });
  });

  it("reads the value below a label in the last column", () => {
    expect(find("<table><tr><td>REMARKS</td></tr><tr><td>Deliver in batches.</td></tr></table>", /^REMARKS$/)).toEqual({
      label: "REMARKS",
      value: "Deliver in batches.",
    });
  });

  it("keeps an empty value cell to the right as an empty value", () => {
    expect(find("<table><tr><td>RC NO</td><td>&nbsp;</td><td>PO NO</td><td>41</td></tr></table>", /^RC NO$/)).toEqual({
      label: "RC NO",
      value: "",
    });
  });

  it("gives an empty value when nothing is to the right or below", () => {
    expect(find("<table><tr><td>REMARKS</td></tr></table>", /^REMARKS$/)).toEqual({ label: "REMARKS", value: "" });
  });

  it("prefers the first occurrence that has a value", () => {
    const html =
      "<table><tr><td>REMARKS</td></tr><tr><td>&nbsp;</td></tr></table>" +
      "<table><tr><td>REMARKS</td></tr><tr><td>Second.</td></tr></table>" +
      "<table><tr><td>REMARKS</td></tr><tr><td>Third.</td></tr></table>";
    expect(find(html, /^REMARKS$/)).toEqual({ label: "REMARKS", value: "Second." });
  });

  it("matches the whole cell, not part of it", () => {
    expect(find("<table><tr><td>PO NO.</td><td>41</td></tr></table>", /^PO NO$/)).toBeUndefined();
  });

  it("is undefined when the label is not on the page", () => {
    expect(find("<table><tr><td>PO NO</td><td>41</td></tr></table>", /^REMARKS$/)).toBeUndefined();
  });
});

describe("mapColumnsByHeader", () => {
  it("maps each column to the index of the first header cell it matches", () => {
    const header = ["PO ITM", "MATERIAL CODE", "UNIT", "ORD QTY", "REJ QTY"];
    expect(mapColumnsByHeader(header, { itemNo: /^PO ITM$/, ordQty: /^ORD QTY$/, rejQty: /^REJ QTY$/ })).toEqual({
      itemNo: 0,
      ordQty: 3,
      rejQty: 4,
    });
  });

  it("leaves out a column the header does not have", () => {
    expect(mapColumnsByHeader(["PO ITM", "ORD QTY"], { itemNo: /^PO ITM$/, rejQty: /^REJ QTY$/ })).toEqual({
      itemNo: 0,
    });
  });
});
