// The invoice workbook (SPEC-12 §4.1): the de-branded template filled as the legacy invoice download fills it, for any
// number of items (A-2, INV-69). Three item rows fit the template; more are inserted above its Total row.
import type { GstPct, IsoDate, Money, Qty } from "@senstosales/domain";
import { moneyToString, pctToString, qtyToString, sumMoney, sumQty } from "@senstosales/domain";
import { fmtAmountWords, fmtDate } from "@senstosales/schemas";
import ExcelJS from "exceljs";

import { documentFileName, insertRows, put } from "./layout.ts";
import { fillSupplier, type DocumentSupplier } from "./supplier.ts";
import { templateBytes } from "./templates.ts";

export interface InvoiceDocument {
  supplier: DocumentSupplier;
  invoice: {
    number: string;
    invoiceDate: IsoDate;
    buyerName: string | null;
    buyerAddress: string | null;
    buyerGstin: string | null;
    buyerState: string | null;
    placeOfSupply: string | null;
    buyersOrderDate: IsoDate | null;
    gemcNumber: string | null;
    gemcDate: IsoDate | null;
    paymentTerms: string | null;
    despatchDocNo: string | null;
    srvNo: string | null;
    srvDate: IsoDate | null;
    destination: string | null;
    cgstPct: GstPct;
    sgstPct: GstPct;
  };
  /** `isGemc` is the flag the amounts were rounded by (INV-18). */
  po: { poNumber: string; poDate: IsoDate | null; isGemc: boolean };
  /** The source DC; null on a PO-direct invoice. */
  dc: { number: string; dcDate: IsoDate } | null;
  items: ReadonlyArray<{
    poItemNo: number;
    description: string | null;
    unit: string | null;
    qty: Qty;
    rate: Money;
    taxable: Money;
    cgst: Money;
    sgst: Money;
    total: Money;
  }>;
}

const FIRST_ITEM_ROW = 17;
const TOTAL_ROW = 20;
const ITEM_SLOTS = TOTAL_ROW - FIRST_ITEM_ROW;
const LAST_ROW = 32;
/** Columns legacy formats as amounts on the item, Total and tax-summary rows: rate, taxable, CGST, SGST, total. */
const AMOUNT_COLUMNS = ["L", "N", "P", "R", "S"];

/** Number cells hold the exact decimal; formats do the rounding on screen, as legacy's float cells did. */
const amount = (m: Money): number => Number(moneyToString(m));
const quantity = (q: Qty): number => Number(qtyToString(q));
const percent = (p: GstPct): number => Number(pctToString(p));

/** `2025-03-20` -> `20-03-2025`, the GEMC date's format. */
const dashed = (d: IsoDate | null): string => (d === null ? "" : fmtDate(d).replaceAll("/", "-"));
const date = (d: IsoDate | null): string => (d === null ? "" : fmtDate(d));

function writeHeader(ws: ExcelJS.Worksheet, { invoice, po, dc }: InvoiceDocument): void {
  const cells: Array<[string, string | null]> = [
    ["K3", invoice.number],
    ["O3", date(invoice.invoiceDate)],
    ["I4", `GEMC:- ${(invoice.gemcNumber ?? "").trim()} Dt:-${dashed(invoice.gemcDate)}`.trim()],
    ["Q4", invoice.paymentTerms],
    ["K6", dc?.number ?? null],
    ["O6", date(dc?.dcDate ?? invoice.invoiceDate)],
    ["K8", po.poNumber],
    ["O8", date(invoice.buyersOrderDate ?? po.poDate)],
    ["L10", invoice.despatchDocNo],
    ["O10", invoice.srvNo],
    ["Q10", date(invoice.srvDate)],
    // Legacy stored no "despatched through"; every invoice printed its default.
    ["I13", "By Loading Vehicle"],
    ["P12", invoice.destination],
    ["A8", invoice.buyerName || "BUYER"],
    ["A9", invoice.buyerAddress],
    ["C10", invoice.buyerGstin],
    ["C11", invoice.buyerState],
    ["C12", invoice.placeOfSupply],
  ];
  for (const [address, value] of cells) put(ws, address, value);
}

/** Inserts the rows past the third item, styled as the last template item row, and returns the Total row. */
function prepareItemRows(ws: ExcelJS.Worksheet, count: number): number {
  const extra = Math.max(0, count - ITEM_SLOTS);
  const like = TOTAL_ROW - 1;
  insertRows(ws, TOTAL_ROW, extra, like);
  for (let row = TOTAL_ROW; row < TOTAL_ROW + extra; row++) ws.getRow(row).height = ws.getRow(like).height;
  // While the items fit, one blank item row stays visible under them and the rest are hidden.
  for (let row = FIRST_ITEM_ROW; row < TOTAL_ROW + extra; row++) {
    ws.getRow(row).hidden = extra === 0 && row > FIRST_ITEM_ROW + count;
  }
  return TOTAL_ROW + extra;
}

function setAmountFormat(ws: ExcelJS.Worksheet, row: number, numFmt: string): void {
  for (const column of AMOUNT_COLUMNS) {
    const cell = ws.getCell(`${column}${row}`);
    // A new object: cells of a template merge share one style, and the setter would change them all.
    cell.style = { ...cell.style, numFmt };
  }
}

/** The item rows, the Total row, the amount and tax in words and the tax summary. */
function writeItems(ws: ExcelJS.Worksheet, { invoice, po, items }: InvoiceDocument, totalRow: number): void {
  const numFmt = po.isGemc ? "#,##0.00000" : "#,##0.00";
  const cgstPct = percent(invoice.cgstPct);
  const sgstPct = percent(invoice.sgstPct);
  items.forEach((item, i) => {
    const row = FIRST_ITEM_ROW + i;
    const values: Array<[string, string | number]> = [
      ["A", item.poItemNo],
      ["B", item.description || "No Description"],
      // No column stores packets; legacy printed 1 for every item.
      ["J", 1],
      ["K", quantity(item.qty)],
      ["L", amount(item.rate)],
      ["M", item.unit || "NO"],
      ["N", amount(item.taxable)],
      ["O", cgstPct],
      ["P", amount(item.cgst)],
      ["Q", sgstPct],
      ["R", amount(item.sgst)],
      ["S", amount(item.total)],
    ];
    for (const [column, value] of values) put(ws, `${column}${row}`, value);
    setAmountFormat(ws, row, numFmt);
  });

  const sum = (key: "taxable" | "cgst" | "sgst" | "total"): Money => sumMoney(items.map((item) => item[key]));
  const [taxable, cgst, sgst, total] = [sum("taxable"), sum("cgst"), sum("sgst"), sum("total")];
  const taxRow = totalRow + 4;
  const cells: Array<[string, number, string | number]> = [
    ["B", totalRow, "Total"],
    ["J", totalRow, items.length],
    ["K", totalRow, quantity(sumQty(items.map((item) => item.qty)))],
    ["N", totalRow, amount(taxable)],
    ["P", totalRow, amount(cgst)],
    ["R", totalRow, amount(sgst)],
    ["S", totalRow, amount(total)],
    ["A", totalRow + 1, `Total Amount (In Words) :- ${fmtAmountWords(total)}`],
    ["N", taxRow, amount(taxable)],
    ["O", taxRow, cgstPct],
    ["P", taxRow, amount(cgst)],
    ["Q", taxRow, sgstPct],
    ["R", taxRow, amount(sgst)],
    ["S", taxRow, amount(sumMoney([cgst, sgst]))],
    ["A", totalRow + 6, `CGST (in words)  : ${fmtAmountWords(cgst)}`],
    ["A", totalRow + 7, `SGST (in words)  : ${fmtAmountWords(sgst)}`],
  ];
  for (const [column, row, value] of cells) put(ws, `${column}${row}`, value);
  setAmountFormat(ws, totalRow, numFmt);
  setAmountFormat(ws, taxRow, numFmt);
}

function setPage(ws: ExcelJS.Worksheet, lastRow: number, onePage: boolean): void {
  Object.assign(ws.pageSetup, {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: onePage ? 1 : 0,
    horizontalCentered: true,
    margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.25, header: 0.2, footer: 0.2 },
    printArea: `A1:S${lastRow}`,
  } satisfies Partial<ExcelJS.PageSetup>);
}

/** The invoice as an xlsx file. Items print in PO item order. */
export async function buildInvoiceWorkbook(doc: InvoiceDocument): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBytes("invoice").buffer);
  const ws = wb.getWorksheet("Sheet1");
  if (!ws) throw new Error("The invoice template has no Sheet1");
  const items = doc.items.toSorted((a, b) => a.poItemNo - b.poItemNo);

  fillSupplier(ws, doc.supplier);
  // Legacy set the supplier block in the font of the GSTIN line under it.
  ws.getCell("A3").font = structuredClone(ws.getCell("A4").font);
  writeHeader(ws, doc);
  const totalRow = prepareItemRows(ws, items.length);
  writeItems(ws, { ...doc, items }, totalRow);
  setPage(ws, LAST_ROW + totalRow - TOTAL_ROW, items.length <= ITEM_SLOTS);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Legacy's invoice download name; an unsafe number gives `Invoice_invoice.xlsx`. */
export const invoiceFileName = (number: string): string => documentFileName("Invoice", number, "invoice");
