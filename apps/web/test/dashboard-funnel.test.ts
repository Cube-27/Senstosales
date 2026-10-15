import { zQty } from "@senstosales/schemas";
import { describe, expect, it } from "vite-plus/test";

import { pendingDispatch, sharePct } from "../src/components/modules/dashboard/funnel.ts";

describe("funnel display (SPEC-15 PR 4)", () => {
  it.each([
    [0, 0, 0, "0.0%"],
    [500, 1000, 50, "50.0%"],
    [1, 3, 33.3, "33.3%"],
    [2, 3, 66.7, "66.7%"],
    [1500, 1000, 100, "100.0%"],
    [-5, 1000, 0, "0.0%"],
  ])("%i of %i -> %s / %s", (part, whole, width, text) => {
    expect(sharePct(part, whole)).toEqual({ width, text });
  });

  it.each([
    ["10", "4", 6_000],
    ["4", "10", 0],
  ])("pending dispatch of %s ordered, %s dispatched = %i milli-units", (ordered, dispatched, expected) => {
    expect(pendingDispatch({ ordQty: zQty.decode(ordered), dspQty: zQty.decode(dispatched) })).toBe(expected);
  });
});
