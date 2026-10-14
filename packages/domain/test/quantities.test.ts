import { describe, expect, it } from "vite-plus/test";

import type { ItemQuantityInput, PoTotalsItem, Qty } from "../src/index.ts";
import { computeItemQuantities, computePoTotals } from "../src/index.ts";
import { qty } from "./unwrap.ts";

const qtys = (...ss: string[]): Qty[] => ss.map(qty);

const item = (over: Partial<ItemQuantityInput>): ItemQuantityInput => ({
  ordQty: qty("10"),
  cancelled: false,
  dcDispatch: [],
  directInvoiceQty: [],
  dcInvoiceQty: [],
  manualDispatchedQty: qty("0"),
  rcdQty: qty("0"),
  ...over,
});

describe("INV-03: dsp = DC dispatch + PO-direct invoice + manual; DC-sourced invoice not added", () => {
  it.each([
    [
      "DC 4 + its invoice 4 + PO-direct 3 -> 7",
      item({ dcDispatch: qtys("4"), dcInvoiceQty: qtys("4"), directInvoiceQty: qtys("3") }),
      7000,
    ],
    ["nothing dispatched -> 0", item({}), 0],
    ["two DCs 2.5 + 1.25 -> 3.75", item({ dcDispatch: qtys("2.5", "1.25") }), 3750],
    ["PO-direct only 0.1 + 0.2 -> 0.3", item({ directInvoiceQty: qtys("0.1", "0.2") }), 300],
    ["DC 4 + manual 1.5 -> 5.5", item({ dcDispatch: qtys("4"), manualDispatchedQty: qty("1.5") }), 5500],
  ])("%s", (_, input, expected) => {
    expect(computeItemQuantities(input).dspQty).toBe(expected);
  });
});

describe("INV-04: balance = max(0, ord − max(rcd, dsp)); rejected never used", () => {
  it.each([
    ["(ord 10, dsp 4, rcd 6) -> 4", item({ dcDispatch: qtys("4"), rcdQty: qty("6") }), 4000],
    ["(ord 10, dsp 6, rcd 4) -> 4", item({ dcDispatch: qtys("6"), rcdQty: qty("4") }), 4000],
    ["(ord 10, dsp 12, rcd 0) -> 0", item({ dcDispatch: qtys("12") }), 0],
    ["(ord 10, dsp 10, rcd 10, rej 3) -> 0", item({ dcDispatch: qtys("10"), rcdQty: qty("10") }), 0],
    ["(ord 10, dsp 0, rcd 0) -> 10", item({}), 10000],
    ["(ord 10, dsp 9.999) -> 0.001", item({ dcDispatch: qtys("9.999") }), 1],
  ])("%s", (_, input, expected) => {
    expect(computeItemQuantities(input).balanceQty).toBe(expected);
  });
});

describe("INV-05: uninvoiced = ord − all invoice qty; may be negative", () => {
  it.each([
    ["(ord 10, invoiced 12) -> −2", item({ directInvoiceQty: qtys("12") }), -2000],
    ["(ord 10, DC-sourced 4 + PO-direct 3) -> 3", item({ dcInvoiceQty: qtys("4"), directInvoiceQty: qtys("3") }), 3000],
    ["(ord 10, no invoice, DC 4) -> 10", item({ dcDispatch: qtys("4") }), 10000],
    ["(ord 10, DC-sourced 10) -> 0", item({ dcInvoiceQty: qtys("10") }), 0],
  ])("%s", (_, input, expected) => {
    expect(computeItemQuantities(input).uninvoicedQty).toBe(expected);
  });
});

describe("INV-07: cancelled item has balance 0 and is excluded from header totals", () => {
  it("cancelled (ord 10, dsp 0) -> balance 0", () => {
    expect(computeItemQuantities(item({ cancelled: true })).balanceQty).toBe(0);
  });

  type Line = { ord: string; dsp?: string; rcd?: string; rej?: string; balance?: string };
  const line = (cancelled: boolean, { ord, dsp = "0", rcd = "0", rej = "0", balance = "0" }: Line): PoTotalsItem => ({
    cancelled,
    ordQty: qty(ord),
    dspQty: qty(dsp),
    rcdQty: qty(rcd),
    rejQty: qty(rej),
    balanceQty: qty(balance),
  });

  it.each([
    [
      "ord 10 active + ord 5 cancelled -> ordered 10",
      [line(false, { ord: "10", balance: "10" }), line(true, { ord: "5", dsp: "2", rcd: "1", rej: "1" })],
      { ordQty: 10000, dspQty: 0, rcdQty: 0, rejQty: 0, balanceQty: 10000 },
    ],
    [
      "two active items sum every column",
      [
        line(false, { ord: "10", dsp: "4", rcd: "6", rej: "1", balance: "4" }),
        line(false, { ord: "2.5", dsp: "1.25", balance: "1.25" }),
      ],
      { ordQty: 12500, dspQty: 5250, rcdQty: 6000, rejQty: 1000, balanceQty: 5250 },
    ],
    [
      "all cancelled -> zeros",
      [line(true, { ord: "5", dsp: "5", rcd: "5" })],
      { ordQty: 0, dspQty: 0, rcdQty: 0, rejQty: 0, balanceQty: 0 },
    ],
    ["no items -> zeros", [], { ordQty: 0, dspQty: 0, rcdQty: 0, rejQty: 0, balanceQty: 0 }],
  ])("%s", (_, items, expected) => {
    expect(computePoTotals(items)).toEqual(expected);
  });
});

describe("INV-08: manual dispatched qty adds to dsp and so to balance; never changes ord", () => {
  it("(ord 10, DC 0, manual 4) -> dsp 4, balance 6, uninvoiced 10", () => {
    expect(computeItemQuantities(item({ manualDispatchedQty: qty("4") }))).toEqual({
      dspQty: 4000,
      balanceQty: 6000,
      uninvoicedQty: 10000,
    });
  });
});
