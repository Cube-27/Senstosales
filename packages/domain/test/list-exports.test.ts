import { describe, expect, it } from "vite-plus/test";

import { dcListProgress, dcListTotals, invoiceListProgress } from "../src/index.ts";
import { money, qty } from "./unwrap.ts";

// EC-38: the DC list's totals over its lines.
describe("dcListTotals", () => {
  const line = (ord: string, dsp: string, rcd: string, rate: string) => ({
    ordQty: qty(ord),
    dspQty: qty(dsp),
    rcdQty: qty(rcd),
    rate: money(rate),
  });

  it.each([
    // DC 101 of the report dataset: items A10 and A20.
    ["two lines", [line("10", "6", "6", "100"), line("5", "5", "4", "20")], ["15", "11", "10", "700"]],
    // GEMC net rate with 5 dp: 1.25 × 400.12345 = 500.15431 (qtyValue rounds to 5 dp).
    ["a fractional value", [line("2.5", "1.25", "0", "400.12345")], ["2.5", "1.25", "0", "500.15431"]],
    ["no lines", [], ["0", "0", "0", "0"]],
  ] as const)("%s", (_, lines, [ord, dsp, rcd, value]) => {
    expect(dcListTotals(lines)).toEqual({ ordQty: qty(ord), dspQty: qty(dsp), rcdQty: qty(rcd), value: money(value) });
  });
});

// EC-39: the DC list CSV's Status and Pending Qty, as the legacy export computed them.
describe("dcListProgress", () => {
  const line = (ord: string, dsp: string, onAllDcs: string) => ({
    ordQty: qty(ord),
    dspQty: qty(dsp),
    itemDspOnAllDcs: qty(onAllDcs),
  });

  it.each([
    // The EC-39 example: 3 of item 10 (ordered 10, 9 on all DCs; a PO-direct invoice of 1 does not count).
    ["one line, part dispatched", [line("10", "3", "9")], "Pending", "1"],
    ["two lines (DC 101 of the dataset)", [line("10", "6", "9"), line("5", "5", "5")], "Pending", "1"],
    ["dispatched in full", [line("4", "4", "4")], "Delivered", "0"],
    ["within the 0.001 tolerance", [line("4", "3.999", "3.999")], "Delivered", "0.001"],
    ["just outside it", [line("4", "3.998", "3.998")], "Pending", "0.002"],
    ["over-dispatched: pending never below 0", [line("4", "6", "7")], "Delivered", "0"],
    ["no lines", [], "Delivered", "0"],
  ] as const)("%s -> %s, pending %s", (_, lines, status, pending) => {
    expect(dcListProgress(lines)).toEqual({ status, pendingQty: qty(pending) });
  });
});

// EC-40: the invoice list CSV's Delivered Qty, Status and Pending Qty.
describe("invoiceListProgress", () => {
  it.each([
    // The EC-40 example: invoice 5 from DC 3 (dispatched 4); an SRV against challan 3 received 3.
    ["DC-sourced, part received", "4", "4", "3", "4", "Delivered", "1"],
    ["DC-sourced, DC dispatched less than invoiced", "5", "4", "0", "4", "Pending", "5"],
    ["PO-direct, nothing received", "4", null, "0", "4", "Delivered", "4"],
    ["PO-direct, received in full", "4", null, "4", "4", "Delivered", "0"],
    ["received more than invoiced: pending never below 0", "2", "2", "3", "2", "Delivered", "0"],
  ] as const)("%s", (_, invoiceQty, dcDsp, received, delivered, status, pending) => {
    expect(
      invoiceListProgress({
        invoiceQty: qty(invoiceQty),
        sourceDcDspQty: dcDsp === null ? null : qty(dcDsp),
        receivedQty: qty(received),
      }),
    ).toEqual({ deliveredQty: qty(delivered), status, pendingQty: qty(pending) });
  });
});
