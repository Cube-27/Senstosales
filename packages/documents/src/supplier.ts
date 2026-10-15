// The supplier identity a document prints, filled into the templates' `{supplier.<field>}` placeholders (SPEC-12
// §1, D-0298). The description and jurisdiction have no supplier column; they are `invoiceDefaults` keys.
import { INVOICE_DEFAULTS } from "@senstosales/schemas";
import type ExcelJS from "exceljs";

export interface DocumentSupplier {
  name: string;
  address: string | null;
  gstin: string | null;
  contact: string | null;
  state: string | null;
  stateCode: string | null;
  /** The letterhead's second line on the DC and GC. */
  description: string | null;
  /** The invoice's "SUBJECT TO … JURISDICTION" city. */
  jurisdiction: string | null;
}

type SupplierProfile = Omit<DocumentSupplier, "description" | "jurisdiction"> & {
  invoiceDefaults: Readonly<Record<string, string>>;
};

interface SupplierSnapshot {
  supplierName: string | null;
  supplierAddress: string | null;
  supplierGstin: string | null;
  supplierContact: string | null;
}

/** A document's own supplier details where set, else the profile's, as legacy did (`a or b`: blank falls back). */
export function documentSupplier(profile: SupplierProfile, snapshot: SupplierSnapshot): DocumentSupplier {
  return {
    name: snapshot.supplierName || profile.name,
    address: snapshot.supplierAddress || profile.address,
    gstin: snapshot.supplierGstin || profile.gstin,
    contact: snapshot.supplierContact || profile.contact,
    state: profile.state,
    stateCode: profile.stateCode,
    description: profile.invoiceDefaults[INVOICE_DEFAULTS.description] ?? null,
    jurisdiction: profile.invoiceDefaults[INVOICE_DEFAULTS.jurisdiction] ?? null,
  };
}

const PLACEHOLDER = /\{supplier\.(\w+)\}/g;

/** Replaces every placeholder in the sheet; a cell left blank by a missing value becomes empty. */
export function fillSupplier(ws: ExcelJS.Worksheet, supplier: DocumentSupplier): void {
  const fields = new Map<string, string | null>(Object.entries(supplier));
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value !== "string" || !cell.value.includes("{supplier.")) return;
      const text = cell.value.replace(PLACEHOLDER, (_, field: string) => fields.get(field) ?? "").trimEnd();
      cell.value = text === "" ? null : text;
    });
  });
}
