import { describe, expect, it } from "vite-plus/test";

import { documentSupplier } from "../src/supplier.ts";

const profile = {
  name: "EXAMPLE WORKS",
  address: "Example Road",
  gstin: "TESTGSTIN01",
  contact: "0000-111",
  state: "Example State",
  stateCode: "00",
  invoiceDefaults: { description: "Makers of example parts", jurisdiction: "EXAMPLE CITY" },
};
const none = { supplierName: null, supplierAddress: null, supplierGstin: null, supplierContact: null };

describe("documentSupplier", () => {
  it("takes the profile, with the description and jurisdiction from its invoice defaults", () => {
    expect(documentSupplier(profile, none)).toEqual({
      name: "EXAMPLE WORKS",
      address: "Example Road",
      gstin: "TESTGSTIN01",
      contact: "0000-111",
      state: "Example State",
      stateCode: "00",
      description: "Makers of example parts",
      jurisdiction: "EXAMPLE CITY",
    });
  });

  it("prefers the document's own details, and a blank one falls back to the profile", () => {
    const snapshot = {
      supplierName: "EXAMPLE WORKS (UNIT 2)",
      supplierAddress: "",
      supplierGstin: null,
      supplierContact: "0000-222",
    };
    expect(documentSupplier(profile, snapshot)).toMatchObject({
      name: "EXAMPLE WORKS (UNIT 2)",
      address: "Example Road",
      gstin: "TESTGSTIN01",
      contact: "0000-222",
    });
  });

  it("has no description or jurisdiction when the invoice defaults lack them", () => {
    expect(documentSupplier({ ...profile, invoiceDefaults: {} }, none)).toMatchObject({
      description: null,
      jurisdiction: null,
    });
  });
});
