import { describe, expect, it } from "vite-plus/test";

import { defaultGc } from "../src/index.ts";
import { date } from "./unwrap.ts";

// INV-26: a blank GC number defaults to the DC number and a blank GC date to the DC date (spec §9, A2-5).
describe("INV-26: defaultGc", () => {
  const dc = { dcNumber: "344", dcDate: date("2025-06-10") };

  it.each([
    ["both omitted", {}, { gcNumber: "344", gcDate: "2025-06-10" }],
    ["both null", { gcNumber: null, gcDate: null }, { gcNumber: "344", gcDate: "2025-06-10" }],
    ["empty number", { gcNumber: "" }, { gcNumber: "344", gcDate: "2025-06-10" }],
    ["whitespace number", { gcNumber: "  \t" }, { gcNumber: "344", gcDate: "2025-06-10" }],
    ["number given", { gcNumber: "GC-9" }, { gcNumber: "GC-9", gcDate: "2025-06-10" }],
    ["date given", { gcDate: date("2025-06-12") }, { gcNumber: "344", gcDate: "2025-06-12" }],
    ["both given", { gcNumber: "77", gcDate: date("2025-07-01") }, { gcNumber: "77", gcDate: "2025-07-01" }],
    // A given number is kept as typed, as legacy does.
    ["number with spaces", { gcNumber: " 77 " }, { gcNumber: " 77 ", gcDate: "2025-06-10" }],
  ])("%s", (_name, gc, expected) => {
    expect(defaultGc({ ...dc, ...gc })).toEqual(expected);
  });
});
