import { describe, expect, it } from "vite-plus/test";

import { matchSrvItem, resolveDocLink } from "../src/index.ts";
import { date } from "./unwrap.ts";

// Candidate DCs (or invoices: one key space per kind, INV-23). Numbers restart every FY (INV-22).
const docs = [
  { id: "dc-12-fy24", number: "12", date: date("2025-03-28") },
  { id: "dc-100-fy24", number: "100", date: date("2024-04-01") },
  { id: "dc-100-fy25", number: "100", date: date("2025-04-01") },
  { id: "dc-7-fy25", number: "7", date: date("2026-03-31") },
];

// INV-37: an SRV challan/invoice number links only to the document with that number in the SRV date's FY.
describe("INV-37: resolveDocLink", () => {
  it.each([
    ["100", "2024-07-15", "dc-100-fy24"],
    ["100", "2025-07-15", "dc-100-fy25"],
    ["100", "2026-04-01", null],
    ["12", "2025-03-31", "dc-12-fy24"],
    // EC-03: a March DC cited by an April SRV is in another FY, so it is not linked.
    ["12", "2025-04-03", null],
    ["7", "2025-04-01", "dc-7-fy25"],
    ["13", "2025-03-31", null],
    // Surrounding whitespace is trimmed, as legacy (SPEC-03 §4.2).
    [" 100\t", "2025-07-15", "dc-100-fy25"],
    // EC-16: other formatting differences are not normalised.
    ["007", "2025-07-15", null],
    ["DC-7", "2025-07-15", null],
    ["1 00", "2025-07-15", null],
    // No number on the SRV line: nothing to link.
    [null, "2025-07-15", null],
    ["", "2025-07-15", null],
    ["  ", "2025-07-15", null],
  ])("number %j on an SRV dated %s -> %s", (raw, srvDate, expected) => {
    expect(resolveDocLink(raw, date(srvDate), docs)).toBe(expected);
  });

  it("trims the candidate's number too", () => {
    const padded = [{ id: "dc-9", number: " 9 ", date: date("2025-05-01") }];
    expect(resolveDocLink("9", date("2025-06-01"), padded)).toBe("dc-9");
  });
});

const poItems = [
  { id: "item-10", materialCode: "M-100", poItemNo: 10 },
  { id: "item-20", materialCode: "M-200", poItemNo: 20 },
  { id: "item-30", materialCode: "M-200", poItemNo: 30 },
];

// INV-39: match by material code; when the code is on several items, the SRV row's PO item number decides (A2-7).
describe("INV-39: matchSrvItem", () => {
  it.each([
    ["M-100", 10, "item-10"],
    // The code is on one item: the code decides, whatever the item number says.
    ["M-100", 20, "item-10"],
    // The code is on several items: the PO item number decides.
    ["M-200", 20, "item-20"],
    ["M-200", 30, "item-30"],
    // EC-19: several items and no item number among them: unmatched, never a guess.
    ["M-200", 10, null],
    // EC-12: the code is on no item of the PO, even if the item number exists.
    ["9000001", 10, null],
    // Codes are compared exactly.
    ["m-100", 10, null],
  ])("material %j, PO item %i -> %s", (materialCode, poItemNo, expected) => {
    expect(matchSrvItem({ materialCode, poItemNo }, poItems)).toBe(expected);
  });
});
