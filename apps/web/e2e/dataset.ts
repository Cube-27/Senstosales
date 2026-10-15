// The synthetic e2e datasets (C1, ARCHITECTURE §14.3): reserved names only, loaded through the API as the app would
// write them. Screen specs add their POs, DCs and invoices here.

/** A supplier with no real name, GSTIN, address or person. */
export const SUPPLIER = {
  name: "Example Supplier",
  gstin: "TESTGSTIN0001",
  address: "1 Example Road",
  state: "Example State",
  stateCode: "99",
  contact: "Example Contact",
  email: "accounts@example.com",
  bhelSupplierCode: "TEST-001",
  bankDetails: { bank: "Example Bank" },
  invoiceDefaults: { terms: "Net 30" },
};

async function send(url: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
}

const onboarded = (url: string) => send(url, "/api/onboarding", { ...SUPPLIER, cgstPct: "9", sgstPct: "9" });

export const DATASETS = {
  /** A first run: no supplier yet, so the app asks for onboarding. */
  fresh: async (_url: string) => {},
  /** Onboarded with the synthetic supplier and the default GST rates; the password is still the default. */
  onboarded,
  /** The same, on a server of its own, so the POs a BHEL sync ingests stay out of the other specs. */
  "bhel-sync": onboarded,
  /** The same, on an API of its own: the document flow's numbers meet no other spec's data. */
  documents: onboarded,
} satisfies Record<string, (url: string) => Promise<void>>;

export type Dataset = keyof typeof DATASETS;
