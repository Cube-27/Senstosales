// The settings form (SPEC-15 §2): the supplier profile, the GST rates and the legacy System Defaults selects, as the
// form edits them (text) and as the API takes them. The form state is derived from the server value and never stored
// elsewhere (§4.1). Rates are validated by the shared `zGstPct` codec, the one parser of percentages (C3).
import { INVOICE_DEFAULTS, type RouteOutput, zGstPct } from "@senstosales/schemas";
import { z } from "zod";

type Supplier = RouteOutput<"supplier.get">;
type Settings = RouteOutput<"settings.get">;

/** The legacy System Defaults selects. They change no calculation (FY is April-March, IGST is 0, A2-4); they are
 * kept as the settings-page preferences they always were. */
const zCurrency = z.enum(["INR", "USD"]);
const zFyCycle = z.enum(["APR_MAR", "JAN_DEC"]);
export const CURRENCY_LABELS: Record<z.infer<typeof zCurrency>, string> = {
  INR: "INR - Indian Rupee",
  USD: "USD - US Dollar",
};
export const FY_CYCLE_LABELS: Record<z.infer<typeof zFyCycle>, string> = {
  APR_MAR: "April - March (India)",
  JAN_DEC: "January - December",
};

/** Preference keys, and the values legacy showed when one was never saved. */
const PREF = { currency: "currency", fyCycle: "fiscal_year_cycle", igstPct: "igst_pct" } as const;
const PREF_DEFAULT = { currency: "INR", fyCycle: "APR_MAR", igstPct: "18" } as const;

const zText = z.string();

/** The supplier profile fields of the legacy Supplier Profile section, in its order, then the fields the documents
 * print or new invoices start from (owner, 2026-10-15). */
export const zSupplierFields = z.object({
  name: zText,
  contact: zText,
  email: zText,
  gstin: zText,
  address: zText,
  description: zText,
  state: zText,
  stateCode: zText,
  jurisdiction: zText,
  placeOfSupply: zText,
  hsn: zText,
});

/** The profile fields stored as `invoiceDefaults` keys rather than supplier columns. */
const DEFAULT_FIELDS = ["description", "jurisdiction", "placeOfSupply", "hsn"] as const;

export const zRates = z.object({ cgstPct: zGstPct, sgstPct: zGstPct });

export const zSettingsForm = z.object({
  supplier: zSupplierFields,
  rates: zRates,
  defaults: z.object({ currency: zCurrency, fyCycle: zFyCycle, igstPct: zGstPct }),
});

export type SettingsFormInput = z.input<typeof zSettingsForm>;
export type SettingsFormOutput = z.output<typeof zSettingsForm>;

/** Onboarding asks the same profile fields and the two rates (INV-78). */
export const zOnboardingForm = zSettingsForm.pick({ supplier: true, rates: true });
export type OnboardingFormInput = z.input<typeof zOnboardingForm>;
export type OnboardingFormOutput = z.output<typeof zOnboardingForm>;

/** The supplier and rate fields' API paths as the form's (the `invoiceDefaults` keys are fields of their own);
 * onboarding and settings both write them. */
export const SUPPLIER_SERVER_FIELDS = {
  name: "supplier.name",
  contact: "supplier.contact",
  email: "supplier.email",
  gstin: "supplier.gstin",
  address: "supplier.address",
  state: "supplier.state",
  stateCode: "supplier.stateCode",
  "invoiceDefaults.description": "supplier.description",
  "invoiceDefaults.jurisdiction": "supplier.jurisdiction",
  "invoiceDefaults.placeOfSupply": "supplier.placeOfSupply",
  "invoiceDefaults.hsn": "supplier.hsn",
  cgstPct: "rates.cgstPct",
  sgstPct: "rates.sgstPct",
} as const;

export const EMPTY_ONBOARDING: OnboardingFormInput = {
  supplier: {
    name: "",
    contact: "",
    email: "",
    gstin: "",
    address: "",
    description: "",
    state: "",
    stateCode: "",
    jurisdiction: "",
    placeOfSupply: "",
    hsn: "",
  },
  rates: { cgstPct: "9", sgstPct: "9" },
};

const pref = (settings: Settings, key: keyof typeof PREF): string =>
  settings.preferences[PREF[key]] ?? PREF_DEFAULT[key];

/** The `invoiceDefaults` fields as the form edits them. */
const defaultFields = (stored: Readonly<Record<string, string>>) =>
  Object.fromEntries(DEFAULT_FIELDS.map((field) => [field, stored[INVOICE_DEFAULTS[field]] ?? ""])) as Record<
    (typeof DEFAULT_FIELDS)[number],
    string
  >;

/** The form's values for what the server holds. */
export function toForm(supplier: Supplier, settings: Settings): SettingsFormInput {
  return {
    supplier: {
      name: supplier.name,
      contact: supplier.contact ?? "",
      email: supplier.email ?? "",
      gstin: supplier.gstin ?? "",
      address: supplier.address ?? "",
      ...defaultFields(supplier.invoiceDefaults),
      state: supplier.state ?? "",
      stateCode: supplier.stateCode ?? "",
    },
    rates: { cgstPct: z.encode(zGstPct, settings.cgstPct), sgstPct: z.encode(zGstPct, settings.sgstPct) },
    defaults: {
      // A stored value the select does not offer shows as legacy did: the default.
      currency: zCurrency.catch(PREF_DEFAULT.currency).parse(pref(settings, "currency")),
      fyCycle: zFyCycle.catch(PREF_DEFAULT.fyCycle).parse(pref(settings, "fyCycle")),
      igstPct: pref(settings, "igstPct"),
    },
  };
}

const orNull = (text: string): string | null => (text.trim() === "" ? null : text);

/** The supplier body: the edited fields over the stored record, a blank field stored as no value. The letterhead
 * description, jurisdiction, place of supply and HSN are `invoiceDefaults` keys (D-0298); a blank one is removed. */
export function supplierBody(stored: Omit<Supplier, "id">, fields: z.output<typeof zSupplierFields>) {
  const invoiceDefaults: Record<string, string> = { ...stored.invoiceDefaults };
  for (const field of DEFAULT_FIELDS) {
    const value = orNull(fields[field].trim());
    if (value === null) delete invoiceDefaults[INVOICE_DEFAULTS[field]];
    else invoiceDefaults[INVOICE_DEFAULTS[field]] = value;
  }
  return {
    ...stored,
    name: fields.name,
    contact: orNull(fields.contact),
    email: orNull(fields.email),
    gstin: orNull(fields.gstin),
    address: orNull(fields.address),
    state: orNull(fields.state),
    stateCode: orNull(fields.stateCode),
    invoiceDefaults,
  };
}

/** The settings body: the rates and the System Defaults over the other stored preferences. */
export function settingsBody(stored: Settings, form: SettingsFormOutput): Settings {
  return {
    cgstPct: form.rates.cgstPct,
    sgstPct: form.rates.sgstPct,
    preferences: {
      ...stored.preferences,
      [PREF.currency]: form.defaults.currency,
      [PREF.fyCycle]: form.defaults.fyCycle,
      [PREF.igstPct]: z.encode(zGstPct, form.defaults.igstPct),
    },
  };
}

/** The onboarding body: a new supplier from the profile fields and the two rates. */
export function onboardingBody({ supplier, rates }: OnboardingFormOutput) {
  const empty = { state: null, stateCode: null, bhelSupplierCode: null, bankDetails: {}, invoiceDefaults: {} };
  return {
    ...supplierBody({ ...empty, name: "", contact: null, email: null, gstin: null, address: null }, supplier),
    ...rates,
  };
}
