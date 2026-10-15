import { type RouteOutput, zGstPct } from "@senstosales/schemas";
import { describe, expect, it } from "vite-plus/test";

import {
  onboardingBody,
  settingsBody,
  supplierBody,
  toForm,
  zOnboardingForm,
  zSettingsForm,
} from "../src/components/modules/settings/profile.ts";

const SUPPLIER: RouteOutput<"supplier.get"> = {
  id: "01J0000000000000000000000S",
  name: "Example Fabricators",
  gstin: null,
  address: "1 Test Road, Example Town",
  state: "Maharashtra",
  stateCode: "27",
  contact: "+91 90000 00000",
  email: null,
  bhelSupplierCode: "S-0001",
  bankDetails: { bank: "Example Bank" },
  invoiceDefaults: { description: "Makers of test parts", jurisdiction: "Example Town" },
};

const SETTINGS: RouteOutput<"settings.get"> = {
  cgstPct: zGstPct.decode("9"),
  sgstPct: zGstPct.decode("2.5"),
  preferences: { currency: "USD", other: "kept" },
};

describe("settings form model (SPEC-15 PR 3)", () => {
  it("shows the stored profile, rates and System Defaults; blanks for missing values, legacy defaults for unsaved preferences", () => {
    expect(toForm(SUPPLIER, SETTINGS)).toEqual({
      supplier: {
        name: "Example Fabricators",
        contact: "+91 90000 00000",
        email: "",
        gstin: "",
        address: "1 Test Road, Example Town",
        description: "Makers of test parts",
        state: "Maharashtra",
        stateCode: "27",
        jurisdiction: "Example Town",
        placeOfSupply: "",
        hsn: "",
      },
      rates: { cgstPct: "9", sgstPct: "2.5" },
      defaults: { currency: "USD", fyCycle: "APR_MAR", igstPct: "18" },
    });
  });

  it("a stored select value it does not offer shows the default", () => {
    const settings = { ...SETTINGS, preferences: { fiscal_year_cycle: "weekly" } };
    expect(toForm(SUPPLIER, settings).defaults.fyCycle).toBe("APR_MAR");
  });

  it("a rate that is not a non-negative decimal is refused at the field", () => {
    const form = { ...toForm(SUPPLIER, SETTINGS), rates: { cgstPct: "nine", sgstPct: "-1" } };
    const result = zSettingsForm.safeParse(form);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["rates.cgstPct", 'Not a decimal number: "nine"'],
      ["rates.sgstPct", 'Negative percentage: "-1"'],
    ]);
  });

  it("the supplier body keeps the fields the page does not show and stores blanks as no value", () => {
    const { id: _id, ...stored } = SUPPLIER;
    const fields = {
      ...toForm(SUPPLIER, SETTINGS).supplier,
      contact: "  ",
      gstin: "TESTGSTIN0001",
      description: "",
      stateCode: " ",
      placeOfSupply: "Example City",
      hsn: " 0000 ",
    };
    expect(supplierBody(stored, fields)).toEqual({
      name: "Example Fabricators",
      gstin: "TESTGSTIN0001",
      address: "1 Test Road, Example Town",
      state: "Maharashtra",
      stateCode: null,
      contact: null,
      email: null,
      bhelSupplierCode: "S-0001",
      bankDetails: { bank: "Example Bank" },
      // The documents' and new invoices' defaults are invoiceDefaults keys; a blank one is removed.
      invoiceDefaults: { jurisdiction: "Example Town", placeOfSupply: "Example City", hsn: "0000" },
    });
  });

  it("the settings body writes the rates and System Defaults over the other preferences", () => {
    const form = zSettingsForm.parse({
      ...toForm(SUPPLIER, SETTINGS),
      rates: { cgstPct: "6", sgstPct: "6" },
      defaults: { currency: "INR", fyCycle: "JAN_DEC", igstPct: "12" },
    });
    expect(settingsBody(SETTINGS, form)).toEqual({
      cgstPct: 600000,
      sgstPct: 600000,
      preferences: { currency: "INR", other: "kept", fiscal_year_cycle: "JAN_DEC", igst_pct: "12" },
    });
  });

  it("the onboarding body is a new supplier with the two rates", () => {
    const form = zOnboardingForm.parse({
      supplier: {
        name: "Example Works",
        contact: "",
        email: "a@example.com",
        gstin: "",
        address: "",
        description: "Tag",
        state: "Example State",
        stateCode: "00",
        jurisdiction: "",
        placeOfSupply: "",
        hsn: "",
      },
      rates: { cgstPct: "9", sgstPct: "9" },
    });
    expect(onboardingBody(form)).toEqual({
      name: "Example Works",
      gstin: null,
      address: null,
      state: "Example State",
      stateCode: "00",
      contact: null,
      email: "a@example.com",
      bhelSupplierCode: null,
      bankDetails: {},
      invoiceDefaults: { description: "Tag" },
      cgstPct: 900000,
      sgstPct: 900000,
    });
  });
});
