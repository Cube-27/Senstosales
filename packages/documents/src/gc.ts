// The guarantee-certificate workbook (SPEC-12 §4.1): the de-branded template filled as the legacy GC download fills
// it, for any number of items (A-2, INV-69). Eight item rows fit the template; more are inserted above its bottom row.
import type { IsoDate } from "@senstosales/domain";
import { fmtDate } from "@senstosales/schemas";
import ExcelJS from "exceljs";

import type { DcDocument } from "./dc.ts";
import {
  consignee,
  documentFileName,
  insertRows,
  put,
  setPortraitPage,
  writeItemRows,
  type ItemRow,
} from "./layout.ts";
import { fillSupplier, type DocumentSupplier } from "./supplier.ts";
import { templateBytes } from "./templates.ts";

/** The parts of a DC its certificate prints; a `DcDocument` is one. */
export interface GcDocument {
  supplier: DocumentSupplier;
  dc: Pick<DcDocument["dc"], "number" | "dcDate" | "gcNumber" | "gcDate" | "consigneeName" | "consigneeAddress">;
  po: Pick<DcDocument["po"], "poNumber" | "poDate">;
  items: readonly ItemRow[];
}

const FIRST_ITEM_ROW = 17;
/** The template's bordered row under the items; rows for items past the eighth go in above it. */
const BOTTOM_ROW = 25;
const ITEM_SLOTS = BOTTOM_ROW - FIRST_ITEM_ROW;
const SIGN_ROW = 34;
/** Legacy grows an item row by 17 points for each 95 characters of description. */
const LINE_HEIGHT = 17;

const numberAndDate = (number: string, date: IsoDate | null): string =>
  `${number}  dt. ${date === null ? "" : fmtDate(date)}`.trim();

function writeHeader(ws: ExcelJS.Worksheet, { dc, po }: GcDocument): void {
  put(ws, "B9", consignee(dc));
  put(ws, "I9", numberAndDate(dc.gcNumber, dc.gcDate));
  put(ws, "I10", numberAndDate(po.poNumber, po.poDate));
  put(ws, "I11", numberAndDate(dc.number, dc.dcDate));
}

/** The GC as an xlsx file. Items print in PO item order, as legacy listed them. */
export async function buildGcWorkbook(doc: GcDocument): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBytes("gc").buffer);
  const ws = wb.getWorksheet("Sheet1");
  if (!ws) throw new Error("The GC template has no Sheet1");
  const items = doc.items.toSorted((a, b) => a.poItemNo - b.poItemNo);
  const extra = Math.max(0, items.length - ITEM_SLOTS);

  fillSupplier(ws, doc.supplier);
  writeHeader(ws, doc);
  insertRows(ws, BOTTOM_ROW, extra, BOTTOM_ROW - 1);
  // The guarantee text is the template's ("24 Month"), as the owner's GCs print it; it moves down with the rows.
  writeItemRows(ws, items, { firstRow: FIRST_ITEM_ROW, qtyColumn: "J", qtyGap: " ", lineHeight: LINE_HEIGHT });
  setPortraitPage(ws, SIGN_ROW + extra, 0);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Legacy's GC download name; an unsafe number gives `GC_export.xlsx`. */
export const gcFileName = (number: string): string => documentFileName("GC", number, "export");
