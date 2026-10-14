import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { zId, zIsoDate, zMoney, zPoId, zQty } from "../src/index.ts";

describe("zQty: decimal string on the wire <-> milli-units (C3)", () => {
  it.each([
    ["2.5", 2500],
    ["0", 0],
    ["0.001", 1],
    ["-2", -2000],
    ["1234567.891", 1234567891],
  ])("%j <-> %i", (wire, value) => {
    expect(z.decode(zQty, wire)).toBe(value);
    expect(z.encode(zQty, z.decode(zQty, wire))).toBe(wire);
  });

  it.each(["", "abc", "2.5000", "1e3", " 2", "2.", ".5", "+2", "9007199254740.992"])("rejects %j", (wire) => {
    expect(zQty.safeParse(wire).success).toBe(false);
  });

  it("rejects a number on the wire", () => {
    expect(zQty.safeParse(2.5).success).toBe(false);
  });

  it("refuses to encode a non-integer", () => {
    expect(() => z.encode(zQty, 2.5 as never)).toThrow();
  });
});

describe("zMoney: decimal string on the wire <-> 1e-5 units (C3)", () => {
  it.each([
    ["848.75", 84875000],
    ["719.27966", 71927966],
    ["0", 0],
    ["-0.00001", -1],
  ])("%j <-> %i", (wire, value) => {
    expect(z.decode(zMoney, wire)).toBe(value);
    expect(z.encode(zMoney, z.decode(zMoney, wire))).toBe(wire);
  });

  it.each(["", "848.755555", "1,000.00", "₹5", "NaN"])("rejects %j", (wire) => {
    expect(zMoney.safeParse(wire).success).toBe(false);
  });

  it("refuses to encode a non-integer", () => {
    expect(() => z.encode(zMoney, 848.75 as never)).toThrow();
  });
});

describe("zIsoDate: YYYY-MM-DD calendar dates", () => {
  it.each(["2024-02-29", "2025-04-30"])("accepts %j unchanged both ways", (wire) => {
    expect(z.decode(zIsoDate, wire)).toBe(wire);
    expect(z.encode(zIsoDate, z.decode(zIsoDate, wire))).toBe(wire);
  });

  it.each(["2025-02-29", "2025-04-31", "2025-4-30", "30-04-2025", "2025-04-30T00:00:00Z", ""])("rejects %j", (wire) => {
    expect(zIsoDate.safeParse(wire).success).toBe(false);
  });

  it("refuses to encode a non-date", () => {
    expect(() => z.encode(zIsoDate, "2025-02-30" as never)).toThrow();
  });
});

describe("zId: ULID", () => {
  it("accepts a ULID", () => {
    expect(zId.parse("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it.each(["", "01ARZ3NDEKTSV4RRFFQ69G5FA", "01ARZ3NDEKTSV4RRFFQ69G5FAVX", "01ARZ3NDEKTSV4RRFFQ69G5FAU"])(
    "rejects %j",
    (wire) => {
      expect(zId.safeParse(wire).success).toBe(false);
    },
  );
});

describe("zPoId: 1 to 10 digits (C17)", () => {
  it.each(["1", "4500012345"])("accepts %j", (wire) => {
    expect(zPoId.parse(wire)).toBe(wire);
  });

  it.each(["", "45000123456", "12a", " 12", "12/34", "../1", "-1"])("rejects %j", (wire) => {
    expect(zPoId.safeParse(wire).success).toBe(false);
  });
});
