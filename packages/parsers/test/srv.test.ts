import { describe, expect, it } from "vite-plus/test";

import { parseSrv } from "../src/index.ts";

/** The column layout of current BHEL SRV pages: no LOT NO and no MATERIAL CODE. Values are synthetic. */
const HEADER = [
  "DIV",
  "PO NO",
  "PO ITM",
  "SUB ITM",
  "PMIR NO",
  "SRV NO",
  "SRV ITM",
  "REV NO",
  "SRV DATE",
  "CHALLAN NO",
  "CHALLAN DATE",
  "TAX INV",
  "TAX INV DT",
  "FINANCE DT",
  "CNOTE NO.",
  "CNOTE DATE",
  "UNIT",
  "ORDER QTY",
  "CHALLAN QTY",
  "RECVD QTY",
  "ACCEPTED QTY",
  "REJ QTY",
];
const ROW = [
  "XYZ",
  "4100000999",
  "1",
  "0",
  "-",
  "5000001",
  "1",
  "0",
  "10/07/2023",
  "17",
  "01-JUL-23",
  "17",
  "01/07/2023",
  "20/07/2023",
  "880001",
  "05/07/2023",
  "NO",
  "10",
  "4.5",
  "4.5",
  "4",
  "0.5",
];

/** A table of the current layout: the header above, then each row as `ROW` with the given cells replaced by name. */
const page = (...rows: Record<string, string>[]): string => {
  const tr = (cells: string[], tag: string) => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  const body = rows
    .map((over) =>
      tr(
        ROW.map((cell, i) => over[HEADER[i] ?? ""] ?? cell),
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

const items = (html: string) => {
  const r = parseSrv(html);
  return r.ok ? r.value.srvs.flatMap((srv) => srv.items) : [];
};

describe("parseSrv", () => {
  it("reads every column of a current page as printed, quantities in milli-units", () => {
    const rawRow = Object.fromEntries(HEADER.map((h, i) => [h, ROW[i]]));
    expect(parseSrv(page({}))).toEqual({
      ok: true,
      value: {
        srvs: [
          {
            poNumber: "4100000999",
            srvNumber: "5000001",
            srvDate: "2023-07-10",
            rawHeader: rawRow,
            items: [
              {
                rowNo: 1,
                division: "XYZ",
                poItemNo: 1,
                subItemNo: "0",
                pmirNo: "-",
                srvItemNo: 1,
                revNo: "0",
                lotNo: null,
                materialCode: null,
                challanNo: "17",
                challanDate: "2023-07-01",
                invoiceNo: "17",
                invoiceDate: "2023-07-01",
                financeDate: "2023-07-20",
                cnoteNo: "880001",
                cnoteDate: "2023-07-05",
                unit: "NO",
                ordQty: 10000,
                challanQty: 4500,
                rcdQty: 4500,
                acceptedQty: 4000,
                rejQty: 500,
                rawRow,
              },
            ],
          },
        ],
        failed: [],
      },
    });
  });

  it("reads LOT NO and MATERIAL CODE where a page has them", () => {
    const html = page({})
      .replace("<th>REJ QTY</th>", "<th>REJ QTY</th><th>LOT NO</th><th>MATERIAL CODE</th>")
      .replace("<td>0.5</td></tr>", "<td>0.5</td><td>2</td><td>SYN0001</td></tr>");
    expect(items(html)[0]).toMatchObject({ lotNo: 2, materialCode: "SYN0001" });
  });

  it("keeps a PO ITM 0 row and rows whose keys repeat, numbering each SRV's rows in file order (A2-10)", () => {
    const html = page({ "PO ITM": "0" }, {}, { "CHALLAN NO": "18" }, { "SRV NO": "5000002" });
    const r = parseSrv(html);
    expect(
      r.ok && r.value.srvs.map((srv) => srv.items.map((i) => [i.rowNo, i.poItemNo, i.srvItemNo, i.challanNo])),
    ).toEqual([
      [
        [1, 0, 1, "17"],
        [2, 1, 1, "17"],
        [3, 1, 1, "18"],
      ],
      [[1, 1, 1, "17"]],
    ]);
  });

  it("keeps empty cells as null: received, rejected, ordered and the dates", () => {
    const html = page({ "RECVD QTY": "", "REJ QTY": "&nbsp;", "ORDER QTY": "", "FINANCE DT": "", "PMIR NO": "" });
    expect(items(html)[0]).toMatchObject({
      rcdQty: null,
      rejQty: null,
      ordQty: null,
      acceptedQty: 4000,
      financeDate: null,
      pmirNo: null,
    });
  });

  it("reads comma-grouped quantities", () => {
    expect(items(page({ "RECVD QTY": "1,250.500" }))[0]?.rcdQty).toBe(1250500);
  });

  it("reads the file's other SRVs when one of them has a row it cannot read", () => {
    const html = page(
      {},
      { "SRV NO": "5000002", "RECVD QTY": "N/A" },
      { "SRV NO": "5000002" },
      { "SRV NO": "5000003" },
    );
    const r = parseSrv(html);
    expect(r.ok && r.value.srvs.map((srv) => srv.srvNumber)).toEqual(["5000001", "5000003"]);
    expect(r.ok && r.value.failed).toEqual([
      {
        srvNumber: "5000002",
        error: { code: "bad-quantity", message: 'RECVD QTY is not a quantity: "N/A"', location: "row 3, RECVD QTY" },
      },
    ]);
  });

  it("drops an SRV whose later row cannot be read, with the rows read before it", () => {
    const r = parseSrv(page({}, { "SRV DATE": "" }, { "SRV NO": "5000002" }));
    expect(r.ok && r.value.srvs.map((srv) => srv.srvNumber)).toEqual(["5000002"]);
    expect(r.ok && r.value.failed.map((f) => [f.srvNumber, f.error.location])).toEqual([
      ["5000001", "row 3, SRV DATE"],
    ]);
  });

  it("fails the file when none of its SRVs can be read, with the first SRV's error", () => {
    expect(failure(page({ "PO ITM": "" }, { "SRV NO": "5000002", "SRV ITM": "x" }))).toEqual({
      code: "missing-field",
      location: "row 2, PO ITM",
    });
  });

  it("skips rows with fewer than 5 cells or an SRV number without digits, such as a totals row", () => {
    const totals = HEADER.map((h) => (h === "SRV NO" ? "-" : h === "DIV" ? "TOTAL" : "")).map((c) => `<td>${c}</td>`);
    const html = page({}).replace(
      "</table>",
      `<tr>${totals.join("")}</tr><tr><td colspan='22'>End of report</td></tr></table>`,
    );
    expect(items(html)).toHaveLength(1);
  });

  it("finds the SRV table among other tables and matches headers case-insensitively", () => {
    const html = `<table><tr><td>SRV DETAILS</td></tr></table>${page({}).replace("SRV NO", "Srv No")}`;
    const r = parseSrv(html);
    expect(r.ok && r.value.srvs[0].srvNumber).toBe("5000001");
  });

  it.each([
    [
      "a page without an SRV table",
      "<table><tr><th>PO NO</th></tr><tr><td>1</td></tr></table>",
      "no-srv-table",
      undefined,
    ],
    ["an SRV table without rows", page().replace(/<tr><td>.*<\/table>/, "</table>"), "no-srv-table", undefined],
    ["an empty PO number", page({ "PO NO": "" }), "missing-field", "row 2, PO NO"],
    ["a PO number that is not 1-10 digits", page({ "PO NO": "41-0999" }), "bad-po-number", "row 2, PO NO"],
    ["an empty SRV date", page({ "SRV DATE": "" }), "missing-field", "row 2, SRV DATE"],
    ["an SRV date in no page format", page({ "SRV DATE": "2023-07-10" }), "bad-date", "row 2, SRV DATE"],
    ["an empty PO item number", page({ "PO ITM": "" }), "missing-field", "row 2, PO ITM"],
    ["a fractional SRV item number", page({ "SRV ITM": "1.5" }), "bad-number", "row 2, SRV ITM"],
    ["a PO item number past 2^53", page({ "PO ITM": "9007199254740993" }), "bad-number", "row 2, PO ITM"],
    ["a received quantity that is not a number", page({ "RECVD QTY": "N/A" }), "bad-quantity", "row 2, RECVD QTY"],
    ["a rejected quantity with four decimals", page({ "REJ QTY": "0.0005" }), "bad-quantity", "row 2, REJ QTY"],
    ["a challan date that is not a date", page({ "CHALLAN DATE": "32/07/23" }), "bad-date", "row 2, CHALLAN DATE"],
    ["a finance date that is not a date", page({ "FINANCE DT": "soon" }), "bad-date", "row 2, FINANCE DT"],
  ])("fails on %s", (_, html, code, location) => {
    expect(failure(html)).toEqual({ code, location });
  });

  it("fails an SRV of a second PO in the file, and reads the first", () => {
    const r = parseSrv(page({}, { "PO NO": "4100000998", "SRV NO": "5000002" }));
    expect(r.ok && r.value.failed.map((f) => [f.srvNumber, f.error.code, f.error.location])).toEqual([
      ["5000002", "mixed-po-numbers", "row 3, PO NO"],
    ]);
  });

  it("keeps an SRV table whose rows only have <td> header cells", () => {
    const html = page({}).replaceAll("<th>", "<td>").replaceAll("</th>", "</td>");
    expect(parseSrv(html).ok).toBe(true);
  });
});
