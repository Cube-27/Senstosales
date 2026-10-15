// Makes the de-branded document templates (SPEC-12 §2) from the legacy ones, locally and once: the layout (styles,
// number formats, merges, sizes, print setup) and the fixed labels stay, supplier identity cells become
// `{supplier.<field>}` placeholders, and every other value, the document properties and the headers and footers are
// dropped. The legacy files never enter the repo (C1); the output is reviewed before it is committed.
// Usage: SENSTO_LEGACY_TEMPLATES_DIR=<folder with the legacy templates> node tools/gen/src/debrand-templates.ts
import { join } from "node:path";

import ExcelJS from "exceljs";

import { TEMPLATES_DIR } from "./templates.ts";

export interface TemplatePlan {
  /** Cells of the content sheet whose text is a fixed label, kept as it is. */
  labels: readonly string[];
  /** Supplier identity cells of the content sheet and the placeholder text each one gets. */
  identity: Readonly<Record<string, string>>;
}

/** Cell addresses from space-separated lists. */
const cells = (...lists: string[]): string[] => lists.flatMap((list) => list.split(" "));

const FOR_SUPPLIER = "                 For {supplier.name}";
const LETTERHEAD = {
  B1: "Tel. No. {supplier.contact}",
  F3: "{supplier.name}",
  F4: "{supplier.description}",
  F5: "{supplier.address}",
};

/** Per output file: the legacy source and its plan. Cell addresses are the legacy layout. */
export const PLANS: Readonly<Record<string, { source: string; plan: TemplatePlan }>> = {
  "dc.xlsx": {
    source: "DC_sample_template.xlsx",
    plan: {
      labels: cells("F7 H9 H10 H11 B14 H14 B15 H17 B20 C20 I20 C41 C42"),
      identity: { ...LETTERHEAD, H1: "GSTIN: {supplier.gstin}", H41: FOR_SUPPLIER },
    },
  },
  "gc.xlsx": {
    source: "GC_sample_template.xlsx",
    plan: {
      labels: cells("F7 H9 H10 H11 B16 C16 J16 B27"),
      identity: { ...LETTERHEAD, H34: FOR_SUPPLIER },
    },
  },
  "invoice.xlsx": {
    source: "GST_INV_sample_template.xlsx",
    plan: {
      // Title, header labels, the item table's two header rows, totals and tax-summary labels, declaration.
      labels: cells(
        "A1 O2 I3 N3 N4 I6 N6 A7 I8 N8 A10 I10 N10 P10 A11 A12 I12 N12 I14",
        "A15 B15 I15 J15 K15 L15 M15 N15 O15 Q15 S15 A16 M16 N16 O16 P16 Q16 R16 S16",
        "B20 S21 N22 O22 Q22 S22 A23 N23 O23 P23 Q23 R23 S23 A28 A29 Q30 A32",
      ),
      identity: {
        A3: "{supplier.name}\n{supplier.address}",
        A4: "GSTIN/UIN: {supplier.gstin}",
        A5: "State Name :  {supplier.state}, Code : {supplier.stateCode}",
        A6: "Contact : {supplier.contact}",
        Q28: "For {supplier.name}",
        A31: "SUBJECT TO {supplier.jurisdiction} JURISDICTION",
      },
    },
  },
};

const DOCUMENT_PROPERTIES = [
  "creator",
  "lastModifiedBy",
  "company",
  "manager",
  "title",
  "subject",
  "keywords",
  "category",
  "description",
] as const;

// The source's created and modified times are its history; a fixed date carries none.
const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

/** De-brands the workbook in place by its plan; a plan cell that is empty in the source is a plan error. */
export function debrand(wb: ExcelJS.Workbook, plan: TemplatePlan): void {
  const [content, ...others] = wb.worksheets;
  if (!content) throw new Error("the template has no worksheet");
  for (const address of [...plan.labels, ...Object.keys(plan.identity)]) {
    if (content.getCell(address).value == null) throw new Error(`${address}: empty in the source template`);
  }
  const keep = new Set(plan.labels);
  clearValues(content, (address) => keep.has(address) || address in plan.identity);
  for (const [address, text] of Object.entries(plan.identity)) content.getCell(address).value = text;
  for (const ws of others) clearValues(ws, () => false);
  content.name = "Sheet1";
  for (const ws of wb.worksheets) ws.headerFooter = {};
  for (const key of DOCUMENT_PROPERTIES) wb[key] = "";
  wb.created = wb.modified = FIXED_DATE;
}

function clearValues(ws: ExcelJS.Worksheet, kept: (address: string) => boolean): void {
  ws.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.type !== ExcelJS.ValueType.Merge && !kept(cell.address)) cell.value = null;
    });
  });
}

if (import.meta.main) {
  const legacyDir = process.env["SENSTO_LEGACY_TEMPLATES_DIR"];
  if (!legacyDir) {
    process.stderr.write("Set SENSTO_LEGACY_TEMPLATES_DIR to the folder holding the legacy templates.\n");
    process.exit(1);
  }
  await Promise.all(
    Object.entries(PLANS).map(async ([output, { source, plan }]) => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(join(legacyDir, source));
      debrand(wb, plan);
      await wb.xlsx.writeFile(join(TEMPLATES_DIR, output));
    }),
  );
}
