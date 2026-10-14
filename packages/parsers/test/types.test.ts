import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { zPoDocument, zSrvDocument, zSrvFile } from "../src/index.ts";

/** A valid PO document on the wire, overridden per case. */
const PO = {
  poNumber: "4100000999",
  poDate: "2024-04-05",
  enquiry: null,
  supplierCode: null,
  orderType: null,
  division: null,
  quotation: null,
  poStatusCode: null,
  amendNo: 0,
  poValue: null,
  rcNo: null,
  inspection: null,
  currency: null,
  netPoValue: null,
  remarks: null,
  gemcNumber: null,
  items: [
    {
      poItemNo: 10,
      materialCode: "SYN0001",
      description: "",
      drawingNo: null,
      unit: "NOS",
      ordQty: "5",
      rate: "12.5",
      rcdQty: "0",
      rejQty: null,
      lots: [
        {
          lotNo: 1,
          delyQty: "5",
          delyDate: null,
          entryAllowDate: null,
          entryAllowNote: null,
          destCode: null,
        },
      ],
    },
  ],
  rawHeader: {},
};

describe("zPoDocument", () => {
  it("decodes wire quantities, money and dates to exact units (C3)", () => {
    const po = z.decode(zPoDocument, { ...PO, poValue: "62.5" });
    expect(po.poValue).toBe(6250000);
    expect(po.items[0]?.ordQty).toBe(5000);
    expect(po.items[0]?.rate).toBe(1250000);
    expect(po.poDate).toBe("2024-04-05");
  });

  it.each([
    ["a PO number that is not 1-10 digits", { poNumber: "PO-1" }],
    ["a calendar date that does not exist", { poDate: "2024-02-30" }],
    ["no items", { items: [] }],
    ["a negative amendment number", { amendNo: -1 }],
    ["a field the type does not have", { gemcDate: "" }],
    ["a quantity with four decimals", { items: [{ ...PO.items[0], ordQty: "5.0001" }] }],
    ["a fractional item number", { items: [{ ...PO.items[0], poItemNo: 10.5 }] }],
  ])("rejects %s", (_, override) => {
    expect(zPoDocument.safeParse({ ...PO, ...override }).success).toBe(false);
  });
});

describe("zSrvDocument", () => {
  const SRV = {
    poNumber: "4100000999",
    srvNumber: "5000001",
    srvDate: "2024-05-02",
    rawHeader: { "SRV NO": "5000001" },
    items: [
      {
        poItemNo: 10,
        lotNo: 1,
        srvItemNo: 1,
        materialCode: "SYN0001",
        ordQty: "5",
        rcdQty: "5",
        acceptedQty: "4",
        rejQty: "1",
        challanNo: "17",
        challanDate: "2024-04-28",
        invoiceNo: null,
        invoiceDate: null,
      },
    ],
  };

  it("decodes an SRV with its item quantities in milli-units", () => {
    expect(z.decode(zSrvDocument, SRV).items[0]?.acceptedQty).toBe(4000);
  });

  it.each([
    ["an empty SRV number", { srvNumber: "" }],
    ["a missing SRV date", { srvDate: null }],
    ["no items", { items: [] }],
  ])("rejects %s", (_, override) => {
    expect(zSrvDocument.safeParse({ ...SRV, ...override }).success).toBe(false);
  });

  it("an SRV file holds the SRVs of one PO only", () => {
    const second = { ...SRV, srvNumber: "5000002" };
    expect(zSrvFile.safeParse([SRV, second]).success).toBe(true);
    expect(zSrvFile.safeParse([SRV, { ...second, poNumber: "4100000998" }]).success).toBe(false);
  });
});
