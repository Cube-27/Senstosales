// The guarantee-certificate workbook (SPEC-12 §4.1): the de-branded template filled as the legacy GC download fills
// it, for any number of items (A-2, INV-69). Eight item rows fit the template; more are inserted above its bottom row.
import { qtyToString, type IsoDate } from "@senstosales/domain";
import { fmtDate } from "@senstosales/schemas";
import ExcelJS from "exceljs";

import { consignee, type DcDocument } from "./dc.ts";
import { documentFileName, insertRows, put } from "./layout.ts";
import { fillSupplier, type DocumentSupplier } from "./supplier.ts";
import { templateBytes } from "./templates.ts";

/** The parts of a DC its certificate prints; a `DcDocument` is one. */
export interface GcDocument {
  supplier: DocumentSupplier;
  dc: Pick<DcDocument["dc"], "number" | "dcDate" | "gcNumber" | "gcDate" | "consigneeName" | "consigneeAddress">;
  po: Pick<DcDocument["po"], "poNumber" | "poDate">;
  items: ReadonlyArray<Pick<DcDocument["items"][number], "poItemNo" | "description" | "unit" | "dspQty">>;
}

const FIRST_ITEM_ROW = 17;
/** The template's bordered row under the items; rows for items past the eighth go in above it. */
const BOTTOM_ROW = 25;
const ITEM_SLOTS = BOTTOM_ROW - FIRST_ITEM_ROW;
const GUARANTEE_ROW = 27;
const SIGN_ROW = 34;
/** Legacy grows an item row by 17 points for each 95 characters of description. */
const CHARS_PER_LINE = 95;
const LINE_HEIGHT = 17;
// Legacy overwrote the template's text ("24 Month") with this.
const GUARANTEE =
  "The goods supplied as above are guaranteed against manufacturing defects for 24 Months from delivery date. " +
  "We undertake to replace or rectify the materials free of cost if any defects occur during this period.";

const numberAndDate = (number: string, date: IsoDate | null): string =>
  `${number}  dt. ${date === null ? "" : fmtDate(date)}`.trim();

function writeHeader(ws: ExcelJS.Worksheet, { dc, po }: GcDocument): void {
  put(ws, "B9", consignee(dc));
  put(ws, "I9", numberAndDate(dc.gcNumber, dc.gcDate));
  put(ws, "I10", numberAndDate(po.poNumber, po.poDate));
  put(ws, "I11", numberAndDate(dc.number, dc.dcDate));
}

function writeItems(ws: ExcelJS.Worksheet, items: GcDocument["items"]): void {
  const baseHeight = ws.getRow(FIRST_ITEM_ROW).height;
  items.forEach((item, i) => {
    const row = FIRST_ITEM_ROW + i;
    const description = item.description ?? "";
    put(ws, `B${row}`, item.poItemNo);
    put(ws, `C${row}`, description);
    put(ws, `J${row}`, `${qtyToString(item.dspQty)}  ${(item.unit || "NO").toUpperCase()}`);
    const lines = Math.floor([...description].length / CHARS_PER_LINE) + 1;
    ws.getRow(row).height = Math.max(baseHeight, lines * LINE_HEIGHT);
  });
}

function setPage(ws: ExcelJS.Worksheet, lastRow: number): void {
  Object.assign(ws.pageSetup, {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    printArea: `B1:J${lastRow}`,
  } satisfies Partial<ExcelJS.PageSetup>);
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
  writeItems(ws, items);
  put(ws, `B${GUARANTEE_ROW + extra}`, GUARANTEE);
  setPage(ws, SIGN_ROW + extra);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Legacy's GC download name; an unsafe number gives `GC_export.xlsx`. */
export const gcFileName = (number: string): string => documentFileName("GC", number, "export");
