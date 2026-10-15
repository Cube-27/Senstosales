// The committed templates (SPEC-12 §6): the embedded bytes are the files under templates/, and every value in them
// is a fixed legacy label or, in a supplier identity cell, a `{supplier.<field>}` placeholder. The lists below are
// the templates' entire text, so a review of this file is a review of what the templates say (C1, D-0010).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { templateBytes, type TemplateName } from "../src/templates.ts";
import { loadWorkbook, xlsxSnapshot } from "./xlsx-snapshot.ts";

const CONTENT: Record<TemplateName, Record<string, string>> = {
  dc: {
    B1: "Tel. No. {supplier.contact}",
    H1: "GSTIN: {supplier.gstin}",
    F3: "{supplier.name}",
    F4: "{supplier.description}",
    F5: "{supplier.address}",
    F7: "DELIVERY CHALLAN",
    H9: " Challan No. :",
    H10: " Date :",
    H11: " Our Ref :",
    B14: "Your Order No.  :",
    H14: "Amd. Date:",
    B15: "Goods Dispatched Delivered to: ",
    H17: "GST Invoice No: ",
    B20: "P.O.Sl. No.",
    C20: "Description",
    I20: "Quantity",
    C41: "Received the Goods in good condition",
    H41: "                 For {supplier.name}",
    C42: "E. & O.E.",
  },
  gc: {
    B1: "Tel. No. {supplier.contact}",
    F3: "{supplier.name}",
    F4: "{supplier.description}",
    F5: "{supplier.address}",
    F7: "GUARANTEE  CERTIFICATE",
    H9: "GC No. & Dt.: ",
    H10: " PO No. & Dt.: ",
    H11: " DC No. & Dt: ",
    B16: "P.O.Sl. No.",
    C16: "Description",
    J16: "Quantity",
    B27: "The goods supplied as above are guaranteed against manufacturing defects for 24 Month from delivery date. We undertake to replace or rectify the materials free of cost if any defects occur during this period.",
    H34: "                 For {supplier.name}",
  },
  invoice: {
    A1: "TAX INVOICE",
    O2: "Extra Copy",
    A3: "{supplier.name}\n{supplier.address}",
    I3: "Invoice No.",
    N3: "Dated",
    A4: "GSTIN/UIN: {supplier.gstin}",
    N4: "Mode/Terms of Payment",
    A5: "State Name :  {supplier.state}, Code : {supplier.stateCode}",
    A6: "Contact : {supplier.contact}",
    I6: "Challan No",
    N6: "Dated ",
    A7: "Buyer",
    I8: "Buyer's Order No.",
    N8: "Dated",
    A10: "GSTIN/UIN:",
    I10: "Despatch Document No.",
    N10: "SRV No",
    P10: "SRV Dt.",
    A11: "State Name :",
    A12: "Place of Supply :",
    I12: "Despatched through",
    N12: "Destination",
    I14: "Terms of Delivery",
    A15: "PO\nSL",
    B15: "Description of Goods",
    I15: "HSN/SAC",
    J15: "No of Pckt",
    K15: "Quantity",
    L15: "Rate",
    M15: "Qty",
    N15: "Taxable",
    O15: "Central Tax",
    Q15: "State Tax",
    S15: "Total",
    A16: "No.",
    M16: "Unit",
    N16: "Value",
    O16: "Rate",
    P16: "Amount",
    Q16: "Rate",
    R16: "Amount",
    S16: "Amount",
    B20: "Total",
    S21: "E. & O.E",
    N22: "Taxable",
    O22: "Central Tax",
    Q22: "State Tax",
    S22: "Total",
    A23: "Total:",
    N23: "Value",
    O23: "Rate",
    P23: "Amount",
    Q23: "Rate",
    R23: "Amount",
    S23: "Tax Amount",
    A28: "Declaration",
    Q28: "For {supplier.name}",
    A29: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    Q30: "Authorised Signatory",
    A31: "SUBJECT TO {supplier.jurisdiction} JURISDICTION",
    A32: "This is a Computer Generated Invoice",
  },
};

const NAMES = Object.keys(CONTENT) as TemplateName[];

/** Each sheet's name and its non-empty cell values. */
async function values(name: TemplateName): Promise<Array<[string, Record<string, unknown>]>> {
  const sheets = await xlsxSnapshot(templateBytes(name));
  return sheets.map((sheet) => [
    sheet.name,
    Object.fromEntries(
      Object.entries(sheet.cells).flatMap(([at, cell]) => (cell.value === null ? [] : [[at, cell.value]])),
    ),
  ]);
}

describe("templates", () => {
  it.each(NAMES)("%s: the embedded bytes are templates/%s.xlsx", (name) => {
    const file = readFileSync(new URL(`../templates/${name}.xlsx`, import.meta.url));
    expect(templateBytes(name)).toEqual(new Uint8Array(file));
  });

  it("dc: labels and placeholders only, and two empty sheets as in legacy", async () => {
    expect(await values("dc")).toEqual([
      ["Sheet1", CONTENT.dc],
      ["Sheet2", {}],
      ["Sheet3", {}],
    ]);
  });

  it("gc: labels and placeholders only, and two empty sheets as in legacy", async () => {
    expect(await values("gc")).toEqual([
      ["Sheet1", CONTENT.gc],
      ["Sheet2", {}],
      ["Sheet3", {}],
    ]);
  });

  it("invoice: labels and placeholders only, on a sheet not named after a document", async () => {
    expect(await values("invoice")).toEqual([["Sheet1", CONTENT.invoice]]);
  });

  it.each(NAMES)("%s: no author, company or other document property", async (name) => {
    const wb = await loadWorkbook(templateBytes(name));
    const { creator, lastModifiedBy, company, manager, title, subject, keywords, category, description } = wb;
    expect([creator, lastModifiedBy, company, manager, title, subject, keywords, category, description]).toEqual([
      "Unknown",
      "Unknown",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });
});
