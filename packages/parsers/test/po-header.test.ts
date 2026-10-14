import { describe, expect, it } from "vite-plus/test";

import { loadPage } from "../src/html.ts";
import { parsePoHeader } from "../src/po/header.ts";

const header = (html: string) => parsePoHeader(loadPage(html));

/** A label|value page (era 1) with the two fields every PO needs, plus `rows`. */
const page = (rows: string, poNumber = "4100000999", poDate = "05/04/2023"): string =>
  `<table><tr><td>PURCHASE ORDER</td><td>${poNumber}</td><td>PO DATE</td><td>${poDate}</td></tr>${rows}</table>`;

describe("parsePoHeader", () => {
  it("reads every header field of a minimal page, absent ones as null", () => {
    expect(header(page(""))).toEqual({
      ok: true,
      value: {
        poNumber: "4100000999",
        poDate: "2023-04-05",
        enquiry: null,
        supplierCode: null,
        orderType: null,
        division: null,
        quotation: null,
        poStatusCode: null,
        amendNo: 0,
        poValue: null,
        rcNo: null,
        inspection: null,
        currency: null,
        netPoValue: null,
        remarks: null,
        gemcNumber: null,
        rawHeader: { "PURCHASE ORDER": "4100000999", "PO DATE": "05/04/2023" },
      },
    });
  });

  it("reads comma-grouped money exactly (C3)", () => {
    const r = header(
      page("<tr><td>PO-VALUE</td><td>NET PO VAL</td></tr><tr><td>1,34,105.13</td><td>40,244.05</td></tr>"),
    );
    expect(r.ok && [r.value.poValue, r.value.netPoValue]).toEqual([13410513000, 4024405000]);
  });

  it("takes the GEMC number from the remarks (INV-19)", () => {
    const r = header(page("<tr><td>REMARKS</td></tr><tr><td>Against GEMC: 5116-A dated 01-APR-24</td></tr>"));
    expect(r.ok && [r.value.remarks, r.value.gemcNumber]).toEqual(["Against GEMC: 5116-A dated 01-APR-24", "5116-A"]);
  });

  it("keeps the label as printed in the raw header", () => {
    const html =
      "<table><tr><td>PURCHASE ORDER NO.</td><td>4100000999</td><td>PO DATE</td><td>12-APR-24</td></tr>" +
      "<tr><td>ENQ NO</td><td>E-1</td><td>ENQUIRY DATE</td><td>01-MAR-24</td></tr></table>";
    const r = header(html);
    expect(r.ok && [r.value.poNumber, r.value.enquiry, r.value.rawHeader]).toEqual([
      "4100000999",
      "E-1",
      { "PURCHASE ORDER NO.": "4100000999", "PO DATE": "12-APR-24", "ENQ NO": "E-1", "ENQUIRY DATE": "01-MAR-24" },
    ]);
  });

  it("reads an empty amendment number as 0", () => {
    const r = header(page("<tr><td>AMEND NO</td><td>&nbsp;</td></tr>"));
    expect(r.ok && r.value.amendNo).toBe(0);
  });

  it.each([
    [
      "no PURCHASE ORDER label",
      "<table><tr><td>PO DATE</td><td>05/04/2023</td></tr></table>",
      "missing-field",
      "PURCHASE ORDER",
    ],
    ["an empty PO number", page("", ""), "missing-field", "PURCHASE ORDER"],
    ["a PO number that is not 1-10 digits", page("", "4100-0999"), "bad-po-number", "PURCHASE ORDER"],
    ["an empty PO date", page("", "4100000999", "&nbsp;"), "missing-field", "PO DATE"],
    ["a PO date in no page format", page("", "4100000999", "2023-04-05"), "bad-date", "PO DATE"],
    ["a PO value that is not a number", page("<tr><td>PO-VALUE</td><td>N/A</td></tr>"), "bad-number", "PO-VALUE"],
    [
      "a net value with six decimals",
      page("<tr><td>NET PO VAL</td><td>1.123456</td></tr>"),
      "bad-number",
      "NET PO VAL",
    ],
    ["a fractional amendment number", page("<tr><td>AMEND NO</td><td>1.5</td></tr>"), "bad-number", "AMEND NO"],
  ])("fails on %s", (_, html, code, location) => {
    const r = header(html);
    expect(r.ok ? undefined : { code: r.error.code, location: r.error.location }).toEqual({ code, location });
  });

  it("names the field and the text in the message", () => {
    expect(header(page("", "4100000999", "31/02/2023"))).toEqual({
      ok: false,
      error: { code: "bad-date", message: 'PO DATE is not a date: "31/02/2023"', location: "PO DATE" },
    });
  });
});
