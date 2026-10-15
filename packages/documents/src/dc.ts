// The DC workbook (SPEC-12 §4.1): the de-branded template filled as the legacy DC download fills it, for any number
// of items (A-2, INV-69), laid out as the owner's DCs print (owner, 2026-10-15). Eight item rows fit the template;
// more are inserted before its last, blank, item row.
import type { IsoDate, Money } from "@senstosales/domain";
import { qtyValue, sumMoney } from "@senstosales/domain";
import { fmtDate, fmtPlain } from "@senstosales/schemas";
import ExcelJS from "exceljs";

import {
  consigneeLines,
  documentFileName,
  insertRows,
  put,
  setPortraitPage,
  writeItemRows,
  type ItemRow,
  type Value,
} from "./layout.ts";
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
    /** The user's notes, joined by blank lines; printed as the remarks after the dimension report. */
    remarks: string | null;
    /** The invoice the user filled in for the sheet to cite (EC-47). */
    invoiceNumber: string | null;
    invoiceDate: IsoDate | null;
  };
  po: { poNumber: string; poDate: IsoDate | null; isGemc: boolean };
  /** The invoice made from this DC, cited where the user filled in none. */
  invoice: { number: string; invoiceDate: IsoDate } | null;
  items: ReadonlyArray<ItemRow & { rate: Money }>;
}

const FIRST_ITEM_ROW = 21;
/** The template's bordered blank row under the items; rows for items past the eighth go in above it. */
const BLANK_ROW = 29;
const ITEM_SLOTS = BLANK_ROW - FIRST_ITEM_ROW;
const REMARKS_ROW = 31;
/** The template's remark rows for the user's notes, numbered 4 to 6, above the lot line. */
const NOTE_SLOTS = 3;
/** Legacy grows an item row by 18 points for each 95 characters of description. */
const LINE_HEIGHT = 18;

/** Legacy's department column held integers, so a number-only value prints as a number (`0456` -> 456). */
function departmentCell(departmentNo: string | null): Value {
  const number = departmentNo !== null && /^\d+$/.test(departmentNo) ? Number(departmentNo) : Number.NaN;
  return Number.isSafeInteger(number) ? number : departmentNo;
}

/** A DC or PO number of digits alone prints as a number, as the owner's DCs show it; `075` keeps its zero as text. */
const numberCell = (text: string): Value => (/^(0|[1-9]\d{0,14})$/.test(text) ? Number(text) : text);

type Cited = { number: string; date: string };

/** The invoice the sheet cites: the one the user filled in (EC-47), else the DC's own; no date prints none. */
function citedInvoice({ dc, invoice }: DcDocument): Cited {
  const own = dc.invoiceNumber === null ? invoice : null;
  const date = dc.invoiceDate ?? own?.invoiceDate ?? null;
  return { number: dc.invoiceNumber ?? own?.number ?? "", date: date === null ? "" : fmtDate(date) };
}

function writeHeader(ws: ExcelJS.Worksheet, { dc, po }: DcDocument, invoice: Cited): void {
  const [name, firstLine, rest] = consigneeLines(dc);
  const cells: Array<[string, Value]> = [
    ["B9", name],
    ["B10", firstLine],
    ["B11", rest],
    ["I9", numberCell(dc.number)],
    ["I10", fmtDate(dc.dcDate)],
    ["I11", dc.ourRef],
    ["D14", numberCell(po.poNumber)],
    ["F14", po.poDate === null ? "Date:" : `Date: ${fmtDate(po.poDate)}`],
    ["F15", departmentCell(dc.departmentNo)],
    ["I17", `${invoice.number}  Dt. ${invoice.date}`.trim()],
  ];
  for (const [address, value] of cells) put(ws, address, value);
}

/** The user's notes for remarks 4 to 6, notes past the sixth joined onto it; none prints legacy's blank TC line. */
function noteLines(remarks: string | null): string[] {
  const notes = (remarks ?? "")
    .split(/\n\s*\n/)
    .map((note) => note.trim())
    .filter((note) => note !== "");
  if (notes.length === 0) return ["TC No  dt.  Of"];
  if (notes.length <= NOTE_SLOTS) return notes;
  return [...notes.slice(0, NOTE_SLOTS - 1), notes.slice(NOTE_SLOTS - 1).join("  ")];
}

/**
 * The numbered remarks, the GC line (INV-36), the user's notes and the consignment value; returns the last row, the
 * template's signature block 10 and 11 rows down.
 */
function writeFooter(ws: ExcelJS.Worksheet, { dc, po, items }: DcDocument, invoice: Cited, at: number): number {
  const total = sumMoney(items.map((item) => qtyValue(item.dspQty, item.rate)));
  const notes = noteLines(dc.remarks).flatMap((note, i): Array<[number, string, Value]> => [
    [3 + i, "B", 4 + i],
    [3 + i, "C", note],
  ]);
  const cells: Array<[number, string, Value]> = [
    [0, "B", 1],
    [0, "C", `GST Bill No. ${invoice.number} Dt.${invoice.date}`],
    [1, "B", 2],
    [1, "C", `Guarantee Certificate No. ${dc.gcNumber}   Dt. ${fmtDate(dc.gcDate)}`],
    [2, "B", 3],
    [2, "C", `Dimension Report ${(dc.ourRef ?? "").trim()}`.trimEnd()],
    ...notes,
    [6, "C", "Lot No."],
    // No trailing zeros (`123900`, `2157.84`): GEMC at 5 dp, others at 2 (INV-18).
    [7, "C", `Consignment Value of BHEL PO ${fmtPlain(total, { gemc: po.isGemc })}`],
  ];
  for (const [offset, column, value] of cells) put(ws, `${column}${at + offset}`, value);
  return at + 11;
}

/** The DC as an xlsx file. Items print in PO item order, as legacy listed them. */
export async function buildDcWorkbook(doc: DcDocument): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBytes("dc").buffer);
  const ws = wb.getWorksheet("Sheet1");
  if (!ws) throw new Error("The DC template has no Sheet1");
  const items = doc.items.toSorted((a, b) => a.poItemNo - b.poItemNo);
  const extra = Math.max(0, items.length - ITEM_SLOTS);

  const invoice = citedInvoice(doc);
  fillSupplier(ws, doc.supplier);
  writeHeader(ws, doc, invoice);
  insertRows(ws, BLANK_ROW, extra, BLANK_ROW - 1);
  // Unused slots are hidden while the items fit; the blank row under the items always shows.
  for (let row = FIRST_ITEM_ROW; row <= BLANK_ROW + extra; row++) {
    ws.getRow(row).hidden = extra === 0 && row >= FIRST_ITEM_ROW + items.length && row < BLANK_ROW;
  }
  writeItemRows(ws, items, { firstRow: FIRST_ITEM_ROW, qtyColumn: "I", qtyGap: "  ", lineHeight: LINE_HEIGHT });
  const lastRow = writeFooter(ws, doc, invoice, REMARKS_ROW + extra);
  setPortraitPage(ws, lastRow, extra === 0 ? 1 : 0);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Legacy's DC download name; an unsafe number gives `DC_export.xlsx`. */
export const dcFileName = (number: string): string => documentFileName("DC", number, "export");
