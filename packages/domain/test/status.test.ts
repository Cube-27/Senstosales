import fc from "fast-check";
import { describe, expect, it } from "vite-plus/test";

import type { ItemStatus, ItemStatusInput, Qty } from "../src/index.ts";
import { itemStatus, poStatus } from "../src/index.ts";
import { qty } from "./unwrap.ts";

const active = (ord: string, dsp: string, rcd: string): ItemStatusInput => ({
  ordQty: qty(ord),
  dspQty: qty(dsp),
  rcdQty: qty(rcd),
  cancelled: false,
});

describe("INV-62: item status by tolerance; Closed over Delivered over Pending", () => {
  it.each([
    ["(10, 0, 0) -> Pending", active("10", "0", "0"), "Pending"],
    ["(10, 4, 0) -> Pending", active("10", "4", "0"), "Pending"],
    ["(10, 9.998, 0) -> Pending", active("10", "9.998", "0"), "Pending"],
    ["(10, 9.999, 0) -> Delivered", active("10", "9.999", "0"), "Delivered"],
    ["(10, 12, 0) -> Delivered", active("10", "12", "0"), "Delivered"],
    ["(10, 10, 9.998) -> Delivered", active("10", "10", "9.998"), "Delivered"],
    ["(10, 10, 10) -> Closed", active("10", "10", "10"), "Closed"],
    ["(10, 0, 10) -> Closed", active("10", "0", "10"), "Closed"],
    ["(10, 0, 9.999) -> Closed", active("10", "0", "9.999"), "Closed"],
  ])("%s", (_, input, expected) => {
    expect(itemStatus(input)).toBe(expected);
  });

  const order: Record<ItemStatus, number> = { Pending: 0, Delivered: 1, Closed: 2, Cancelled: 3 };
  const milli = fc.integer({ min: 0, max: 100_000 }) as fc.Arbitrary<Qty>;

  it("is monotone in dsp and rcd", () => {
    fc.assert(
      fc.property(milli, milli, milli, milli, milli, (ord, dsp, rcd, dDsp, dRcd) => {
        const base = itemStatus({ ordQty: ord, dspQty: dsp, rcdQty: rcd, cancelled: false });
        const more = itemStatus({
          ordQty: ord,
          dspQty: (dsp + dDsp) as Qty,
          rcdQty: (rcd + dRcd) as Qty,
          cancelled: false,
        });
        expect(order[more]).toBeGreaterThanOrEqual(order[base]);
      }),
    );
  });
});

describe("INV-63: an amended-out item is Cancelled regardless of quantities", () => {
  it.each([
    ["(10, 0, 0)", "10", "0", "0"],
    ["(10, 10, 0)", "10", "10", "0"],
    ["(10, 10, 10)", "10", "10", "10"],
  ])("cancelled %s -> Cancelled", (_, ord, dsp, rcd) => {
    expect(itemStatus({ ...active(ord, dsp, rcd), cancelled: true })).toBe("Cancelled");
  });
});

describe("INV-64: PO status from active item statuses, never from summed quantities", () => {
  it.each<[string, ItemStatus[], string]>([
    ["all Closed -> Closed", ["Closed", "Closed"], "Closed"],
    ["Delivered + Closed -> Delivered", ["Delivered", "Closed"], "Delivered"],
    ["all Delivered -> Delivered", ["Delivered", "Delivered"], "Delivered"],
    ["Pending + Closed -> Pending", ["Pending", "Closed"], "Pending"],
    ["Pending + Delivered -> Pending", ["Pending", "Delivered"], "Pending"],
    ["Closed + Cancelled -> Closed", ["Closed", "Cancelled"], "Closed"],
    ["Delivered + Cancelled -> Delivered", ["Delivered", "Cancelled"], "Delivered"],
    ["Pending + Cancelled -> Pending", ["Pending", "Cancelled"], "Pending"],
    ["all Cancelled -> Closed (A2-13, EC-06)", ["Cancelled", "Cancelled"], "Closed"],
    ["no items -> Closed (A2-13)", [], "Closed"],
  ])("%s", (_, statuses, expected) => {
    expect(poStatus(statuses)).toBe(expected);
  });

  it("items (10, dsp 20) and (10, dsp 0) -> Pending, though summed dsp 20 >= ord 20", () => {
    const statuses = [itemStatus(active("10", "20", "0")), itemStatus(active("10", "0", "0"))];
    expect(statuses).toEqual(["Delivered", "Pending"]);
    expect(poStatus(statuses)).toBe("Pending");
  });
});
