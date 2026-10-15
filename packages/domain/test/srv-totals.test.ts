import { describe, expect, it } from "vite-plus/test";

import type { SrvTotals, SrvTotalsLine } from "../src/index.ts";
import { srvLineShown, srvTotals } from "../src/index.ts";
import { money, qty } from "./unwrap.ts";

type Row = [rcd: string | null, accepted: string | null, rej: string | null, item: [string, string, string] | null];

const line = ([rcd, accepted, rej, item]: Row): SrvTotalsLine => ({
  rcdQty: rcd === null ? null : qty(rcd),
  acceptedQty: accepted === null ? null : qty(accepted),
  rejQty: rej === null ? null : qty(rej),
  poItem: item === null ? null : { id: item[0], ordQty: qty(item[1]), rate: money(item[2]) },
});

describe("INV-09, INV-11, INV-12: one SRV line as shown", () => {
  it.each<[Row, Record<"rcdQty" | "acceptedQty" | "rejQty", number>]>([
    [["10", "7", "3", null], { rcdQty: 10000, acceptedQty: 7000, rejQty: 3000 }],
    [["0", "5", null, null], { rcdQty: 5000, acceptedQty: 5000, rejQty: 0 }],
    [[null, "2", "1", null], { rcdQty: 2000, acceptedQty: 2000, rejQty: 1000 }],
    [[null, null, null, null], { rcdQty: 0, acceptedQty: 0, rejQty: 0 }],
  ])("%j -> %j", (row, expected) => {
    expect(srvLineShown(line(row))).toEqual(expected);
  });
});

describe("INV-09, INV-11, INV-12: SRV list totals", () => {
  it.each<[string, Row[], Record<keyof SrvTotals, number>]>([
    ["no lines", [], { ordQty: 0, rcdQty: 0, acceptedQty: 0, rejQty: 0, value: 0 }],
    [
      // Accepted is the SRV's own ACCEPTED QTY (INV-09, A2-8 revised); value is received × the PO item's rate.
      "one matched line",
      [["10", "7", "3", ["I1", "12", "100.5"]]],
      { ordQty: 12000, rcdQty: 10000, acceptedQty: 7000, rejQty: 3000, value: 1005_00000 },
    ],
    [
      "two lines on one item count its ordered quantity once",
      [
        ["0", "5", null, ["I1", "12", "2"]],
        ["3", null, "1", ["I1", "12", "2"]],
        ["1", null, null, ["I2", "4", "0.5"]],
      ],
      { ordQty: 16000, rcdQty: 9000, acceptedQty: 5000, rejQty: 1000, value: 16_50000 },
    ],
    [
      "an unmatched line adds quantities but no ordered quantity or value",
      [["2", null, "0.5", null]],
      { ordQty: 0, rcdQty: 2000, acceptedQty: 0, rejQty: 500, value: 0 },
    ],
    [
      // 0.333 × 719.27966 = 239.52012678 -> 239.52013 (half away from zero at 5 dp).
      "value rounds each line to 5 dp",
      [["0.333", null, null, ["I1", "1", "719.27966"]]],
      { ordQty: 1000, rcdQty: 333, acceptedQty: 0, rejQty: 0, value: 239_52013 },
    ],
  ])("%s", (_, rows, expected) => {
    expect(srvTotals(rows.map(line))).toEqual(expected);
  });
});
