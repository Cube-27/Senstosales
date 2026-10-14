import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { zFy, zGstPct, zId, zInstant, zIsoDate, zMoney, zPoId, zQty } from "../src/index.ts";

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

describe("zGstPct: decimal string on the wire <-> 1e-5 units", () => {
  it.each([
    ["9", 900000],
    ["2.5", 250000],
    ["0", 0],
  ])("%j <-> %i", (wire, value) => {
    expect(z.decode(zGstPct, wire)).toBe(value);
    expect(z.encode(zGstPct, z.decode(zGstPct, wire))).toBe(wire);
  });

  it.each(["", "9%", "-9", "9.000001"])("rejects %j", (wire) => {
    expect(zGstPct.safeParse(wire).success).toBe(false);
  });

  it("refuses to encode a non-integer", () => {
    expect(() => z.encode(zGstPct, 9.5 as never)).toThrow();
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

describe("zInstant: ISO-8601 UTC", () => {
  it.each(["2026-10-14T17:21:06Z", "2026-10-14T17:21:06.123Z"])("accepts %j", (wire) => {
    expect(zInstant.parse(wire)).toBe(wire);
  });

  it.each(["2026-10-14", "2026-10-14T17:21:06", "2026-10-14T22:51:06+05:30", ""])("rejects %j", (wire) => {
    expect(zInstant.safeParse(wire).success).toBe(false);
  });
});

describe("zFy: financial year label", () => {
  it("accepts the domain's label", () => {
    expect(zFy.parse("2024-25")).toBe("2024-25");
  });

  it.each(["2024", "2024-2025", "24-25", ""])("rejects %j", (wire) => {
    expect(zFy.safeParse(wire).success).toBe(false);
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
