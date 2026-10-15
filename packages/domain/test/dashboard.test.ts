import { describe, expect, it } from "vite-plus/test";

import type { DashboardRange } from "../src/index.ts";
import { averageLeadTimeDays, defaultReportRange, fyStartOf, pendingDispatchQty, rangeStart } from "../src/index.ts";
import { date, qty } from "./unwrap.ts";

// SPEC-10 §2: the legacy dashboard's period and lead time; the current FY is the default (owner, 2026-10-15).
describe("rangeStart", () => {
  it.each<[DashboardRange, string, string | null]>([
    ["fy", "2025-06-17", "2025-04-01"],
    ["fy", "2025-04-01", "2025-04-01"],
    ["fy", "2026-03-31", "2025-04-01"],
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

// INV-113: a report without a chosen period covers the current FY to today.
describe("defaultReportRange", () => {
  it.each([
    ["2025-06-01", { from: "2025-04-01", to: "2025-06-01" }],
    ["2026-03-31", { from: "2025-04-01", to: "2026-03-31" }],
    ["2026-04-01", { from: "2026-04-01", to: "2026-04-01" }],
  ])("%s -> %j", (today, expected) => {
    expect(defaultReportRange(date(today))).toEqual(expected);
  });
});

// INV-21: the first day of the date's FY.
describe("fyStartOf", () => {
  it.each([
    ["2025-03-31", "2024-04-01"],
    ["2025-04-01", "2025-04-01"],
    ["2025-12-31", "2025-04-01"],
  ])("%s -> %s", (day, expected) => {
    expect(fyStartOf(date(day))).toBe(expected);
  });
});

// A-22: the funnel's Pending Dispatch, in milli-units: ordered minus dispatched, clamped per item as the pending
// value is (owner, 2026-10-15); a cancelled item has nothing pending (INV-07).
describe("pendingDispatchQty", () => {
  const item = (ordQty: string, dspQty: string, cancelled = false) => ({
    ordQty: qty(ordQty),
    dspQty: qty(dspQty),
    cancelled,
  });

  it.each([
    ["one item", [item("10", "4")], 6000],
    ["over-dispatched", [item("4", "10")], 0],
    ["dispatched in full", [item("10", "10")], 0],
    ["nothing", [], 0],
    ["fractions", [item("2.5", "0.75")], 1750],
    // Over-dispatch on one item does not cancel another item's pending quantity: 6 + 0, not 14 - 12.
    ["clamped per item", [item("10", "4"), item("4", "8")], 6000],
    ["a cancelled item", [item("10", "4", true), item("3", "1")], 2000],
  ])("%s -> %i", (_, items, expected) => {
    expect(pendingDispatchQty(items)).toBe(expected);
  });
});
