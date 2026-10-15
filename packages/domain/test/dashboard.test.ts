import { describe, expect, it } from "vite-plus/test";

import type { DashboardRange } from "../src/index.ts";
import { averageLeadTimeDays, pendingDispatchQty, rangeStart } from "../src/index.ts";
import { date, qty } from "./unwrap.ts";

// SPEC-10 §2: the legacy dashboard's period and lead time.
describe("rangeStart", () => {
  it.each<[DashboardRange, string, string | null]>([
    ["month", "2025-06-17", "2025-06-01"],
    ["month", "2025-06-01", "2025-06-01"],
    ["30d", "2025-06-17", "2025-05-18"],
    ["30d", "2025-03-01", "2025-01-30"],
    ["all", "2025-06-17", null],
  ])("%s on %s -> %s", (range, today, expected) => {
    expect(rangeStart(range, date(today))).toBe(expected);
  });
});

describe("averageLeadTimeDays", () => {
  const po = (poDate: string, firstSrvDate: string) => ({ poDate: date(poDate), firstSrvDate: date(firstSrvDate) });

  it.each([
    ["no POs", [], null],
    ["one PO, 10 days", [po("2025-04-01", "2025-04-11")], 10],
    ["10 and 11 days -> 10.5 rounds up", [po("2025-04-01", "2025-04-11"), po("2025-04-01", "2025-04-12")], 11],
    [
      "10, 10 and 11 days -> 10.33",
      [po("2025-04-01", "2025-04-11"), po("2025-05-01", "2025-05-11"), po("2025-04-01", "2025-04-12")],
      10,
    ],
    ["same day counts as 0", [po("2025-04-01", "2025-04-01"), po("2025-04-01", "2025-04-05")], 2],
    ["an SRV before the PO date is left out", [po("2025-04-10", "2025-04-01"), po("2025-04-01", "2025-04-05")], 4],
    ["only SRVs before the PO date", [po("2025-04-10", "2025-04-01")], null],
  ])("%s -> %s", (_, pos, expected) => {
    expect(averageLeadTimeDays(pos)).toBe(expected);
  });
});

// A-22: the funnel's Pending Dispatch, in milli-units.
describe("pendingDispatchQty", () => {
  it.each([
    ["10", "4", 6000],
    ["4", "10", 0],
    ["10", "10", 0],
    ["0", "0", 0],
    ["2.5", "0.75", 1750],
  ])("ordered %s, dispatched %s -> %i", (ordQty, dspQty, expected) => {
    expect(pendingDispatchQty({ ordQty: qty(ordQty), dspQty: qty(dspQty) })).toBe(expected);
  });
});
