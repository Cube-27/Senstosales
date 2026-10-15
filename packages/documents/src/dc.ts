// The DC workbook (SPEC-12 §4.1): the de-branded template filled as the legacy DC download fills it, for any number
// of items (A-2, INV-69). Eight item rows fit the template; more are inserted before its last, blank, item row.
import type { IsoDate, Money, Qty } from "@senstosales/domain";
import { qtyToString, qtyValue, sumMoney } from "@senstosales/domain";
import { fmtDate, fmtFixed } from "@senstosales/schemas";
import ExcelJS from "exceljs";

import { documentFileName, insertRows, put, type Value } from "./layout.ts";
import { fillSupplier, type DocumentSupplier } from "./supplier.ts";
import { templateBytes } from "./templates.ts";

export interface DcDocument {
  supplier: DocumentSupplier;
  dc: {
    number: string;
    dcDate: IsoDate;
    gcNumber: string;
    gcDate: IsoDate;
    ourRef: string | null;
    departmentNo: string | null;
    consigneeName: string | null;
    consigneeAddress: string | null;
  };
  po: { poNumber: string; poDate: IsoDate | null; isGemc: boolean };
  /** The invoice made from this DC; legacy prints its number only (EC-47). */
  invoiceNumber: string | null;
  items: ReadonlyArray<{
    poItemNo: number;
    description: string | null;
    unit: string | null;
    dspQty: Qty;
    rate: Money;
  }>;
}

const FIRST_ITEM_ROW = 21;
/** The template's bordered blank row under the items; rows for items past the eighth go in above it. */
const BLANK_ROW = 29;
const ITEM_SLOTS = BLANK_ROW - FIRST_ITEM_ROW;
const REMARKS_ROW = 31;
/** Legacy grows an item row by 18 points for each 95 characters of description. */
const CHARS_PER_LINE = 95;
const LINE_HEIGHT = 18;

/** Legacy's department column held integers, so a number-only value prints as a number (`0456` -> 456). */
function departmentCell(departmentNo: string | null): Value {
  const number = departmentNo !== null && /^\d+$/.test(departmentNo) ? Number(departmentNo) : Number.NaN;
  return Number.isSafeInteger(number) ? number : departmentNo;
}

function consignee({ consigneeName, consigneeAddress }: DcDocument["dc"]): string {
  const address = (consigneeAddress ?? "").split(/\r?\n/).map((line) => line.trim());
  const lines = [(consigneeName ?? "").trim(), ...address].filter((line) => line !== "");
  return lines.length > 0 ? lines.join("\n") : "Consignee";
}

function writeHeader(ws: ExcelJS.Worksheet, { dc, po, invoiceNumber }: DcDocument): void {
  put(ws, "B9", consignee(dc));
  put(ws, "I9", dc.number);
  put(ws, "I10", fmtDate(dc.dcDate));
  put(ws, "I11", dc.ourRef);
  put(ws, "D14", po.poNumber);
  put(ws, "F14", po.poDate === null ? "Date:" : `Date: ${fmtDate(po.poDate)}`);
  put(ws, "F15", departmentCell(dc.departmentNo));
  put(ws, "I17", invoiceNumber === null ? "Dt." : `${invoiceNumber}  Dt.`);
}

function writeItems(ws: ExcelJS.Worksheet, items: DcDocument["items"]): void {
  const baseHeight = ws.getRow(FIRST_ITEM_ROW).height;
  items.forEach((item, i) => {
    const row = FIRST_ITEM_ROW + i;
    const description = item.description ?? "";
    put(ws, `B${row}`, item.poItemNo);
    put(ws, `C${row}`, description);
    put(ws, `I${row}`, `${qtyToString(item.dspQty)}  ${(item.unit || "NO").toUpperCase()}`);
    const lines = Math.floor([...description].length / CHARS_PER_LINE) + 1;
    ws.getRow(row).height = Math.max(baseHeight, lines * LINE_HEIGHT);
  });
}

/**
 * The numbered remarks, the GC line (INV-36) and the consignment value; returns the last row, the template's
 * signature block 10 and 11 rows down.
 */
function writeFooter(ws: ExcelJS.Worksheet, { dc, po, invoiceNumber, items }: DcDocument, at: number): number {
  const total = sumMoney(items.map((item) => qtyValue(item.dspQty, item.rate)));
  const cells: Array<[number, string, Value]> = [
    [0, "B", 1],
    [0, "C", `GST Bill No. ${invoiceNumber ?? ""} Dt.`],
    [1, "B", 2],
    [1, "C", `Guarantee Certificate No. ${dc.gcNumber}   Dt. ${fmtDate(dc.gcDate)}`],
    [2, "B", 3],
    [2, "C", `Dimension Report ${(dc.ourRef ?? "").trim()}`.trimEnd()],
    [3, "B", 4],
    [3, "C", "TC No  dt.  Of"],
    [6, "C", "Lot No."],
    [7, "C", `Consignment Value of BHEL PO ${fmtFixed(total, { gemc: po.isGemc })}`],
  ];
  for (const [offset, column, value] of cells) put(ws, `${column}${at + offset}`, value);
  return at + 11;
}

function setPage(ws: ExcelJS.Worksheet, lastRow: number, onePage: boolean): void {
  Object.assign(ws.pageSetup, {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: onePage ? 1 : 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    printArea: `B1:J${lastRow}`,
  } satisfies Partial<ExcelJS.PageSetup>);
}

/** The DC as an xlsx file. Items print in PO item order, as legacy listed them. */
export async function buildDcWorkbook(doc: DcDocument): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBytes("dc").buffer);
  const ws = wb.getWorksheet("Sheet1");
  if (!ws) throw new Error("The DC template has no Sheet1");
  const items = doc.items.toSorted((a, b) => a.poItemNo - b.poItemNo);
  const extra = Math.max(0, items.length - ITEM_SLOTS);

  fillSupplier(ws, doc.supplier);
  writeHeader(ws, doc);
  insertRows(ws, BLANK_ROW, extra, BLANK_ROW - 1);
  // Unused slots are hidden while the items fit; the blank row under the items always shows.
  for (let row = FIRST_ITEM_ROW; row <= BLANK_ROW + extra; row++) {
    ws.getRow(row).hidden = extra === 0 && row >= FIRST_ITEM_ROW + items.length && row < BLANK_ROW;
  }
  writeItems(ws, items);
  const lastRow = writeFooter(ws, doc, REMARKS_ROW + extra);
  setPage(ws, lastRow, extra === 0);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Legacy's DC download name; an unsafe number gives `DC_export.xlsx`. */
export const dcFileName = (number: string): string => documentFileName("DC", number, "export");
