import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { Qty, ReceiptInput, SrvLine } from "../src/index.ts";
import { computeReceipt, dateWinner } from "../src/index.ts";
import { date, qty } from "./unwrap.ts";

const optQty = (s: string | null): Qty | null => (s === null ? null : qty(s));

type LineRow = [srvDate: string, rcd: string | null, accepted: string | null, rej: string | null];

const line = ([srvDate, rcd, accepted, rej]: LineRow): SrvLine => ({
  srvDate: date(srvDate),
  rcdQty: optQty(rcd),
  acceptedQty: optQty(accepted),
  rejQty: optQty(rej),
});

const receipt = (poDate: string, poRcd: string, poRej: string | null, lines: LineRow[]): ReceiptInput => ({
  poDate: date(poDate),
  poRcdQty: qty(poRcd),
  poRejQty: optQty(poRej),
  srvLines: lines.map(line),
});

describe("INV-10: date winner", () => {
  it.each([
    ["2025-01-10", [], "po"],
    ["2025-01-10", ["2025-01-10"], "srv"],
    ["2025-01-10", ["2025-01-09"], "po"],
    ["2025-01-10", ["2025-01-11"], "srv"],
    ["2025-01-10", ["2025-01-09", "2025-01-11"], "srv"],
    ["2025-01-10", ["2025-01-11", "2025-01-09"], "srv"],
    ["2025-01-10", ["2025-01-08", "2025-01-09"], "po"],
    ["2025-01-10", ["2024-12-31"], "po"],
    ["2024-12-31", ["2025-01-01"], "srv"],
  ] as const)("po %s, srv %j -> %s", (poDate, srvDates, expected) => {
    expect(dateWinner(date(poDate), srvDates.map(date))).toBe(expected);
  });
});

describe("INV-11: SRV wins -> rcd = sum(rcd if non-zero, else accepted, else 0)", () => {
  it.each([
    [
      "SRV1 (rcd 0, accepted 5) + SRV2 (rcd 3)",
      [
        ["2025-01-10", "0", "5", null],
        ["2025-01-12", "3", null, null],
      ],
      8000,
    ],
    ["rcd beats accepted when non-zero", [["2025-01-10", "4", "2", null]], 4000],
    ["rcd absent -> accepted", [["2025-01-10", null, "2", null]], 2000],
    ["rcd 0, accepted absent -> 0", [["2025-01-10", "0", null, null]], 0],
    ["rcd and accepted absent -> 0", [["2025-01-10", null, null, "1"]], 0],
    ["rcd 0, accepted 0 -> 0", [["2025-01-10", "0", "0", null]], 0],
    [
      "fractional",
      [
        ["2025-01-10", "0.1", null, null],
        ["2025-01-11", "0.2", null, null],
      ],
      300,
    ],
    [
      "cumulative, not filtered by SRV date",
      [
        ["2025-01-05", "2", null, null],
        ["2025-01-12", "3", null, null],
      ],
      5000,
    ],
  ] satisfies [string, LineRow[], number][])("%s -> %i", (_, lines, expected) => {
    const { winner, rcd } = computeReceipt(receipt("2025-01-10", "9", "9", lines));
    expect({ winner, rcd }).toEqual({ winner: "srv", rcd: expected });
  });
});

describe("INV-12: rej = sum(SRV rej) when SRV wins, else the PO's rejected qty or 0", () => {
  it.each([
    ["SRV wins, one line", receipt("2025-01-10", "9", "7", [["2025-01-10", "5", null, "1"]]), 1000],
    [
      "SRV wins, summed with absent rej as 0",
      receipt("2025-01-10", "9", "7", [
        ["2025-01-10", "5", null, "1"],
        ["2025-01-11", "2", null, null],
        ["2025-01-09", "1", null, "0.5"],
      ]),
      1500,
    ],
    ["SRV wins, no rej anywhere", receipt("2025-01-10", "9", "7", [["2025-01-10", "5", null, null]]), 0],
    ["PO wins with its rejected qty", receipt("2025-01-10", "9", "2", []), 2000],
    ["PO wins without a rejected qty", receipt("2025-01-10", "9", null, []), 0],
    ["PO wins over an older SRV's rej", receipt("2025-01-10", "9", null, [["2025-01-09", "5", null, "3"]]), 0],
  ] as const)("%s -> %i", (_, input, expected) => {
    expect(computeReceipt(input).rej).toBe(expected);
  });
});

describe("INV-13: PO wins -> the PO document's own received and rejected values", () => {
  it.each([
    ["no SRV", receipt("2025-01-10", "6", "1", []), { winner: "po", rcd: 6000, rej: 1000 }],
    [
      "every SRV older than the PO",
      receipt("2025-01-10", "6", "1", [
        ["2025-01-08", "4", null, "2"],
        ["2025-01-09", "0", "3", null],
      ]),
      { winner: "po", rcd: 6000, rej: 1000 },
    ],
    ["PO received 0", receipt("2025-01-10", "0", null, []), { winner: "po", rcd: 0, rej: 0 }],
  ] as const)("%s -> %j", (_, input, expected) => {
    expect(computeReceipt(input)).toEqual(expected);
  });

  it("a PO win after deleting the last SRV restores the PO values", () => {
    const withSrv = receipt("2025-01-10", "6", "1", [["2025-01-11", "10", null, "2"]]);
    expect(computeReceipt(withSrv)).toEqual({ winner: "srv", rcd: 10000, rej: 2000 });
    expect(computeReceipt({ ...withSrv, srvLines: [] })).toEqual({ winner: "po", rcd: 6000, rej: 1000 });
  });
});

const isoDate = fc
  .record({
    y: fc.integer({ min: 2023, max: 2027 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ y, m, d }) => date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`));
const optMilli = fc.option(fc.integer({ min: 0, max: 1_000_000 }).map((n) => n as Qty));
const srvLine = fc.record({ srvDate: isoDate, rcdQty: optMilli, acceptedQty: optMilli, rejQty: optMilli });

describe("INV-15: input order never changes the result", () => {
  it("computeReceipt ignores the order of SRV lines", () => {
    fc.assert(
      fc.property(
        isoDate,
        fc
          .array(srvLine, { maxLength: 8 })
          .chain((lines) => fc.tuple(fc.constant(lines), fc.shuffledSubarray(lines, { minLength: lines.length }))),
        (poDate, [lines, shuffled]) => {
          const input = { poDate, poRcdQty: qty("6"), poRejQty: qty("1"), srvLines: lines };
          expect(computeReceipt({ ...input, srvLines: shuffled })).toEqual(computeReceipt(input));
        },
      ),
    );
  });
});
