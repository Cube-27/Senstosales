import { describe, expect, it } from "vite-plus/test";

import type { ItemStatus } from "../src/index.ts";
import { deliveryDue, moneyToString, pendingValueOfItems } from "../src/index.ts";
import { date, money, qty } from "./unwrap.ts";

// SPEC-10 §2: the legacy delivery tracker's buckets, with today 2025-06-01.
describe("deliveryDue", () => {
  const TODAY = date("2025-06-01");

  it.each<[string, ItemStatus, number, boolean, boolean, boolean, boolean]>([
    // delyDate, status, daysToDue, open, overdue, dueSoon, dueThisMonth
    ["2025-05-31", "Pending", -1, true, true, false, false],
    ["2025-05-31", "Delivered", -1, true, false, false, false],
    ["2025-06-01", "Pending", 0, true, false, true, true],
    ["2025-06-08", "Pending", 7, true, false, true, true],
    ["2025-06-09", "Pending", 8, true, false, false, true],
    ["2025-06-05", "Delivered", 4, true, false, false, true],
    ["2025-06-30", "Pending", 29, true, false, false, true],
    ["2025-07-01", "Pending", 30, true, false, false, false],
    ["2025-06-05", "Closed", 4, false, false, false, false],
    ["2025-05-01", "Cancelled", -31, false, false, false, false],
    ["2024-06-15", "Pending", -351, true, true, false, false],
  ])("%s %s -> days %i, open %s, overdue %s, soon %s, month %s", (dely, status, days, open, overdue, soon, month) => {
    expect(deliveryDue(date(dely), TODAY, status)).toEqual({
      daysToDue: days,
      open,
      overdue,
      dueSoon: soon,
      dueThisMonth: month,
    });
  });
});

describe("pendingValueOfItems", () => {
  const lot = (poItemId: string, balance: string, rate: string) => ({
    poItemId,
    balanceQty: qty(balance),
    rate: money(rate),
  });

  it.each([
    ["no lots", [], "0"],
    ["one item on two lots counts once", [lot("A", "6", "100"), lot("A", "6", "100"), lot("B", "3", "50")], "750"],
    ["a dispatched item adds nothing", [lot("A", "0", "100")], "0"],
    ["each item rounds to 5 dp", [lot("A", "0.001", "0.00500"), lot("B", "0.001", "0.00500")], "0.00002"],
  ])("%s -> %s", (_, lots, expected) => {
    expect(moneyToString(pendingValueOfItems(lots))).toBe(expected);
  });
});
