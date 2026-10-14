import { describe, expect, it } from "vite-plus/test";

import { parsePageDate } from "../src/dates.ts";

describe("parsePageDate (SPEC-06 §2)", () => {
  it.each([
    ["DD/MM/YYYY", "05/04/2023", "2023-04-05"],
    ["DD/MM/YYYY, end of year", "31/12/2024", "2024-12-31"],
    ["DD-MON-YY", "12-APR-24", "2024-04-12"],
    ["DD-MON-YY, lower-case month", "03-sep-24", "2024-09-03"],
    ["DD-MON-YY, leap day", "29-FEB-24", "2024-02-29"],
    ["DD/MM/YY", "15/07/23", "2023-07-15"],
    ["a one-digit day and month", "5/4/2023", "2023-04-05"],
    ["two-digit years are 20YY", "01/01/99", "2099-01-01"],
    ["surrounding spaces", " 30-JUN-24 ", "2024-06-30"],
  ])("%s: %s -> %s", (_, text, iso) => {
    expect(parsePageDate(text)).toEqual({ ok: true, value: iso });
  });

  it.each([
    ["an empty cell", ""],
    ["a date that does not exist", "31/02/2024"],
    ["a non-leap 29 February", "29-FEB-23"],
    ["an unknown month", "12-ABC-24"],
    ["month 13", "01/13/2024"],
    ["a three-digit year", "01/01/202"],
    ["ISO input (not a page format)", "2024-04-12"],
    ["DD-MM-YYYY (not a page format)", "12-04-2024"],
    ["DD-MON-YYYY (not a page format)", "12-APR-2024"],
    ["trailing text", "12-APR-24 10:00"],
    ["free text", "PO Short Closed"],
  ])("rejects %s: %j", (_, text) => {
    expect(parsePageDate(text)).toEqual({ ok: false, error: `Not a page date: "${text}"` });
  });
});
