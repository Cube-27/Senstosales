import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { parseSrv, zSrvFile } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/srv/", import.meta.url);
const NAMES = ["commented-older-table", "layout-a-single", "layout-b-two-srvs", "multi-item", "repeated-challan-fy"];

const HEADER = ["PO NO", "SRV NO", "SRV DATE", "PO ITM", "LOT NO", "SRV ITM", "RECVD QTY", "ACPT QTY", "REJ QTY"];
const ROW = ["4100000999", "5000001", "10/07/2023", "10", "1", "1", "4.000", "4.000", "0.000"];

/** A layout-A table: the header above, then each row as `ROW` with the given cells replaced. */
const page = (...rows: Record<number, string>[]): string => {
  const tr = (cells: string[], tag: string) => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  const body = rows
    .map((over) =>
      tr(
        ROW.map((cell, i) => over[i] ?? cell),
        "td",
      ),
    )
    .join("");
  return `<table>${tr(HEADER, "th")}${body}</table>`;
};

const failure = (html: string) => {
  const r = parseSrv(html);
  return r.ok ? undefined : { code: r.error.code, location: r.error.location };
};

describe("parseSrv: fixtures (SPEC-06 PR 4)", () => {
  it.each(NAMES)("%s matches the expected JSON", (name) => {
    const expected = zSrvFile.parse(JSON.parse(readFileSync(new URL(`${name}.expected.json`, FIXTURES), "utf8")));
    expect(parseSrv(readFileSync(new URL(`${name}.html`, FIXTURES), "utf8"))).toEqual({ ok: true, value: expected });
  });
});

describe("parseSrv", () => {
  it("reads a minimal row, absent columns as null and quantities in milli-units", () => {
    expect(parseSrv(page({}))).toEqual({
      ok: true,
      value: [
        {
          poNumber: "4100000999",
          srvNumber: "5000001",
          srvDate: "2023-07-10",
          rawHeader: Object.fromEntries(HEADER.map((h, i) => [h, ROW[i]])),
          items: [
            {
              poItemNo: 10,
              lotNo: 1,
              srvItemNo: 1,
              materialCode: null,
              ordQty: null,
              rcdQty: 4000,
              acceptedQty: 4000,
              rejQty: 0,
              challanNo: null,
              challanDate: null,
              invoiceNo: null,
              invoiceDate: null,
            },
          ],
        },
      ],
    });
  });

  it("fails a file with a duplicate (po item, lot, srv item) key in one SRV (A2-10, INV-50)", () => {
    expect(parseSrv(page({}, { 6: "1.000" }))).toEqual({
      ok: false,
      error: {
        code: "duplicate-srv-item-key",
        message: "SRV 5000001 has item 10, lot 1, SRV item 1 more than once",
        location: "row 3",
      },
    });
  });

  it("allows the same item key in different SRVs of the file", () => {
    const r = parseSrv(page({}, { 1: "5000002" }));
    expect(r.ok && r.value.map((srv) => [srv.srvNumber, srv.items.length])).toEqual([
      ["5000001", 1],
      ["5000002", 1],
    ]);
  });

  it("reads comma-grouped quantities and an empty received or rejected cell as 0 (legacy)", () => {
    const r = parseSrv(page({ 6: "1,250.500", 7: "&nbsp;", 8: "" }));
    expect(r.ok && r.value[0]?.items[0]).toMatchObject({ rcdQty: 1250500, acceptedQty: null, rejQty: 0 });
  });

  it("skips rows with fewer than 5 cells or an SRV number without digits, such as a totals row", () => {
    const html = page({}).replace(
      "</table>",
      "<tr><td>TOTAL</td><td>-</td><td></td><td></td><td></td><td></td><td>4.000</td><td></td><td></td></tr>" +
        "<tr><td colspan='9'>End of report</td></tr></table>",
    );
    const r = parseSrv(html);
    expect(r.ok && r.value.map((srv) => srv.items.length)).toEqual([1]);
  });

  it("finds the SRV table among other tables and matches headers case-insensitively", () => {
    const html = `<table><tr><td>SRV DETAILS</td></tr></table>${page({}).replace("SRV NO", "Srv No")}`;
    const r = parseSrv(html);
    expect(r.ok && r.value[0]?.srvNumber).toBe("5000001");
  });

  it.each([
    [
      "a page without an SRV table",
      "<table><tr><th>PO NO</th></tr><tr><td>1</td></tr></table>",
      "no-srv-table",
      undefined,
    ],
    ["an SRV table without rows", page().replace(/<tr><td>.*<\/table>/, "</table>"), "no-srv-table", undefined],
    ["an empty PO number", page({ 0: "" }), "missing-field", "row 2, PO NO"],
    ["a PO number that is not 1-10 digits", page({ 0: "41-0999" }), "bad-po-number", "row 2, PO NO"],
    ["rows of two POs", page({}, { 0: "4100000998", 1: "5000002" }), "mixed-po-numbers", "row 3, PO NO"],
    ["an empty SRV date", page({ 2: "" }), "missing-field", "row 2, SRV DATE"],
    ["an SRV date in no page format", page({ 2: "2023-07-10" }), "bad-date", "row 2, SRV DATE"],
    ["an empty PO item number", page({ 3: "" }), "missing-field", "row 2, PO ITM"],
    ["a fractional lot number", page({ 4: "1.5" }), "bad-number", "row 2, LOT NO"],
    ["a zero SRV item number", page({ 5: "0" }), "bad-number", "row 2, SRV ITM"],
    ["a received quantity that is not a number", page({ 6: "N/A" }), "bad-quantity", "row 2, RECVD QTY"],
    ["a rejected quantity with four decimals", page({ 8: "0.0005" }), "bad-quantity", "row 2, REJ QTY"],
  ])("fails on %s", (_, html, code, location) => {
    expect(failure(html)).toEqual({ code, location });
  });

  it("fails on a challan date that is not a date, and reads an empty one as null", () => {
    const html = (date: string) =>
      page({})
        .replace("<th>REJ QTY</th>", "<th>REJ QTY</th><th>CHALLAN DT</th>")
        .replace("<td>0.000</td></tr>", `<td>0.000</td><td>${date}</td></tr>`);
    expect(failure(html("32/07/23"))).toEqual({ code: "bad-date", location: "row 2, CHALLAN DT" });
    const r = parseSrv(html(""));
    expect(r.ok && r.value[0]?.items[0]?.challanDate).toBeNull();
  });

  it("keeps an SRV table whose rows only have <td> header cells", () => {
    const html = page({}).replaceAll("<th>", "<td>").replaceAll("</th>", "</td>");
    expect(parseSrv(html).ok).toBe(true);
  });
});
