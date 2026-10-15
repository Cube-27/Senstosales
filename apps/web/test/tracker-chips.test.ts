import type { IsoDate } from "@senstosales/domain";
import { describe, expect, it } from "vite-plus/test";

import {
  anyFilter,
  CHIPS,
  isActive,
  toggleChip,
  toggleStatus,
} from "../src/components/modules/delivery-tracker/chips.ts";
import type { TrackerSearch } from "../src/components/modules/delivery-tracker/search.ts";

const TODAY = "2025-12-28" as IsoDate;
const BASE: TrackerSearch = { page: 1, pageSize: 10, dir: "asc" };
const chip = (id: string) => {
  const found = CHIPS.find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("tracker smart chips", () => {
  it.each([
    ["today", "2025-12-28", "2025-12-28"],
    ["tomorrow", "2025-12-29", "2025-12-29"],
    ["this-week", "2025-12-28", "2026-01-04"],
    ["next-week", "2026-01-04", "2026-01-11"],
  ])("%s sets the due range %s to %s and clears the status card", (id, dueFrom, dueTo) => {
    expect(toggleChip(chip(id), { ...BASE, status: "overdue" }, TODAY)).toEqual({ dueFrom, dueTo, status: undefined });
  });

  it("is on exactly when the URL holds its range, and pressing it again clears the range", () => {
    const search = { ...BASE, dueFrom: "2025-12-28" as IsoDate, dueTo: "2026-01-04" as IsoDate };
    expect(CHIPS.filter((c) => isActive(c, search, TODAY)).map((c) => c.id)).toEqual(["this-week"]);
    expect(toggleChip(chip("this-week"), search, TODAY)).toEqual({ dueFrom: undefined, dueTo: undefined });
  });

  it("a value chip sets the lot value floor and leaves the dates alone", () => {
    expect(toggleChip(chip("high-value"), { ...BASE, valueMax: "5" }, TODAY)).toEqual({
      valueMin: "100000",
      valueMax: undefined,
    });
    expect(toggleChip(chip("critical-value"), { ...BASE, valueMin: "1000000" }, TODAY)).toEqual({
      valueMin: undefined,
      valueMax: undefined,
    });
  });

  it("a status card toggles its status and clears the due range", () => {
    const search = { ...BASE, status: "due-soon" as const, dueFrom: TODAY };
    expect(toggleStatus("due-soon", search)).toEqual({ status: undefined, dueFrom: undefined, dueTo: undefined });
    expect(toggleStatus("overdue", search)).toEqual({ status: "overdue", dueFrom: undefined, dueTo: undefined });
  });

  it("knows when any filter is set", () => {
    expect([anyFilter(BASE), anyFilter({ ...BASE, sort: "delyDate" }), anyFilter({ ...BASE, q: "x" })]).toEqual([
      false,
      false,
      true,
    ]);
  });
});
