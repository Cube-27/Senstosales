// The export inventory (SPEC-13 §2, §4.1): one definition per kept export, recording what the legacy app wrote (A-2,
// INV-68, C16): file type and name, sheet, header text and order, column widths, styles and page setup. Services fill
// the rows; the goldens in `test/reports/golden` pin the output, row order included, for the synthetic dataset. No
// export has a flag column (INV-60).
import type ExcelJS from "exceljs";

import type { Column } from "../stream/sheet.ts";
import type { Sheet } from "../stream/xlsx.ts";

type Style = Partial<ExcelJS.Style>;

const thin = { style: "thin" } as const;
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** A4 landscape with every column on one page width, as both legacy workbook layouts print. */
const A4_FIT_WIDTH = {
  paperSize: 9,
  orientation: "landscape",
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
} as const satisfies Partial<ExcelJS.PageSetup>;

/**
 * The legacy generic list workbook, shared by the registers, the reconciliation report, export-selected and the
 * delivery tracker: one sheet named `Report`, a styled header row, then one row per record. Numbers have no number
 * format (General): quantities exact to 3 dp, amounts to 2 dp, or 5 on a GEMC PO (A-12); text, dates (`YYYY-MM-DD`)
 * and codes as text; a missing value is an empty cell. With no rows the header row is still written (EC-45).
 */
export const TABLE = {
  sheet: "Report",
  headerStyle: {
    font: { bold: true },
    border: box,
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD7E4BC" } },
  } satisfies Style,
  /** The header row repeats on each printed page. */
  pageSetup: {
    ...A4_FIT_WIDTH,
    printTitlesRow: "1:1",
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.3 },
  } satisfies Partial<ExcelJS.PageSetup>,
  oddFooter: "&CPage &P of &N",
} as const;

/** Legacy file-name cleaning for a document number: `..`, `/` and `\` become `_`, at most 50 characters. */
export const fileSafe = (text: string) => text.replaceAll("..", "_").replaceAll(/[/\\]/g, "_").slice(0, 50);

const col = (key: string, header: string, width: number): Column<string> => ({ key, header, width });

/** A list workbook in the {@link TABLE} layout; its headers are the legacy ones, snake_case keys included. */
const table = <A extends unknown[]>(fileName: (...args: A) => string, columns: readonly Column<string>[]) => ({
  kind: "table" as const,
  fileName,
  sheet: {
    name: TABLE.sheet,
    columns,
    pageSetup: TABLE.pageSetup,
    headerStyle: TABLE.headerStyle,
    oddFooter: TABLE.oddFooter,
  } satisfies Sheet<string>,
});

/** A CSV list: UTF-8 with a BOM, CRLF line ends, fields quoted only when they hold a comma, quote or line break. */
const csv = <A extends unknown[]>(fileName: (...args: A) => string, headers: Record<string, string>) => ({
  kind: "csv" as const,
  fileName,
  columns: Object.entries(headers).map(([key, header]) => ({ key, header })),
});

const RECONCILIATION_COLUMNS = [
  col("poNumber", "po_number", 12),
  col("poItemNo", "po_item_no", 12),
  col("poDate", "po_date", 12),
  col("description", "item_description", 60),
  col("ordQty", "ordered_qty", 13),
  col("dspQty", "total_dispatched", 18),
  // Accepted is the item's received quantity (A2-8, INV-09).
  col("rcdQty", "total_accepted", 16),
  col("rejQty", "total_rejected", 16),
  // The item's balance, the one clamped value (INV-61).
  col("balanceQty", "pending_qty", 13),
];

const calibri = { name: "Calibri", size: 11 };
const bold = { ...calibri, bold: true };
const center = { horizontal: "center", vertical: "middle", wrapText: true } as const;

/**
 * The summary workbooks' layout: one `Summary` sheet. Rows 1–7 are the supplier heading, row 9 the table header, then
 * one row per item, then the TOTAL row. A merged range carries its top-left cell's text and style across.
 */
const SUMMARY = {
  kind: "summary",
  sheet: "Summary",
  /** 1-based cells of the heading; each `text` names what fills it. */
  heading: [
    { cell: "A1", text: "Tel. No. <supplier contact>", style: "tel" },
    { cell: "A3", merge: "A3:I3", text: "<supplier name>", style: "company" },
    // The letterhead description from Settings (D-0298); empty when none is set (EC-41).
    { cell: "A4", merge: "A4:I4", text: "<supplier description>", style: "address" },
    { cell: "A5", merge: "A5:I5", text: "<supplier address>", style: "address" },
    { cell: "A6", merge: "A6:I6", text: "SUMMARY", style: "title" },
    { cell: "B7", text: "Date:", style: "dateLabel" },
    { cell: "C7", text: "<date DD-MM-YYYY>", style: "dateValue" },
  ],
  headerRow: 9,
  columns: [
    col("serial", "S.\nNo.", 5),
    // Repeated lines of the description are written once (case and spacing ignored).
    col("description", "Description", 39),
    // Quantity and unit as text: `10 NOS`; the item's ordered quantity, or the DC line's dispatched one.
    col("qty", "Quantity\nSet/Nos.", 11),
    // The DC line's packets; 0 on the pending summary, which has no DC line (EC-41).
    col("packets", "No of\npackets", 8),
    col("poNumber", "PO NO", 13),
    // The invoices' GEMC numbers, else the PO's. Lists are joined with `,`.
    col("gemcNumber", "GEMC  NO", 15),
    col("invoiceNumbers", "Invoice\nNo.", 11),
    col("dcNumbers", "Challan\nNo.", 11),
    // The pending item's dispatched quantity; on the daily dispatch summary, the department the DC went to.
    col("delivered", "Dispatch\nDelivered", 11),
  ],
  /** The one left-aligned column; every other cell is centred. */
  leftColumn: "description",
  /** `TOTAL` merged over A:B; the summed quantity and packets. */
  total: { label: "TOTAL" },
  styles: {
    tel: { font: calibri },
    company: { font: { ...bold, size: 16 }, alignment: { horizontal: "center" } },
    address: { font: { ...bold, size: 10 }, alignment: { horizontal: "center", wrapText: true } },
    title: { font: { ...bold, size: 14 }, alignment: { horizontal: "center" }, border: { top: thin, bottom: thin } },
    dateLabel: { font: bold, alignment: { horizontal: "right" } },
    dateValue: { font: bold, alignment: { horizontal: "left" } },
    th: { font: bold, border: box, alignment: center },
    cell: { font: calibri, border: box, alignment: center },
    cellLeft: { font: calibri, border: box, alignment: { ...center, horizontal: "left" } },
    totalLabel: { font: bold, border: box, alignment: { horizontal: "right", vertical: "middle" } },
    totalCell: { font: bold, border: box, alignment: { horizontal: "center", vertical: "middle" } },
  } satisfies Record<string, Style>,
  /** Centred; the print area ends at the TOTAL row. */
  pageSetup: {
    ...A4_FIT_WIDTH,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.3, footer: 0.3 },
  } satisfies Partial<ExcelJS.PageSetup>,
} as const;

type SummaryKey = (typeof SUMMARY.columns)[number]["key"];

/** What one summary workbook adds to the shared layout. */
export interface SummaryExtras {
  /** Columns of document numbers whose digit-only text is written as a number; `075` keeps its zero as text. */
  numberColumns: readonly SummaryKey[];
  /** The column of department codes, written as the DC writes its department. */
  departmentColumn: SummaryKey | null;
  /** A line under the TOTAL row, in `column`; `<…>` names a heading text, as in the heading. */
  footer: { column: SummaryKey; text: string; style: keyof typeof SUMMARY.styles } | null;
}

/** The pending-items workbook (legacy "Items Summary"): each PO item with a balance, PO number then item number. */
const PENDING = {
  ...SUMMARY,
  extras: { numberColumns: [], departmentColumn: null, footer: null } satisfies SummaryExtras,
  fileName: (range?: { from: string; to: string }) =>
    range === undefined ? "Items_Summary.xlsx" : `Items_Summary_${range.from}_to_${range.to}.xlsx`,
} as const;

/**
 * The daily dispatch summary (A-16 reversed, owner 2026-10-15): each DC line dated in the range, oldest DC first, as
 * the owner's summaries lay it out. Named after legacy's `Daily_Dispatch_<date>.xlsx`.
 */
const DISPATCH = {
  ...SUMMARY,
  // Numbers as numbers, and a sign-off under the GEMC column spaced as legacy's DC footer, bold as the date line.
  extras: {
    numberColumns: ["poNumber", "invoiceNumbers", "dcNumbers"],
    departmentColumn: "delivered",
    footer: { column: "gemcNumber", text: "                 For <supplier name>", style: "dateValue" },
  } satisfies SummaryExtras,
  fileName: ({ from, to }: { from: string; to: string }) =>
    from === to ? `Daily_Dispatch_${from}.xlsx` : `Daily_Dispatch_${from}_to_${to}.xlsx`,
} as const;

// Widths: legacy fitted each column to its longest value (header + 2, at most 60), which a streaming writer cannot
// know before the first row. Each column has the width that fit gives on ordinary values: header + 2 and at least
// 12, 30 for names, 60 for descriptions. Row orders are the legacy defaults.

/** Every kept export (SPEC-13 §2, ARCHITECTURE §11.2), the daily dispatch summary among them (A-16 reversed). */
export const EXPORTS = {
  // PO date, newest first.
  poRegister: table(
    () => "PO_Register.xlsx",
    [
      col("poNumber", "po_number", 12),
      col("poDate", "po_date", 12),
      // The install's supplier (A2-12, EC-44).
      col("supplierName", "supplier_name", 30),
      col("poValue", "po_value", 12),
      col("status", "po_status", 12),
      col("itemCount", "items_count", 13),
      col("ordQty", "total_qty", 12),
    ],
  ),
  // DC date, newest first.
  dcRegister: table(
    () => "DC_Register.xlsx",
    [
      col("number", "dc_number", 12),
      col("dcDate", "dc_date", 12),
      col("poNumber", "po_number", 12),
      col("consigneeName", "consignee_name", 30),
      col("itemCount", "item_count", 12),
      col("dspQty", "total_qty", 12),
    ],
  ),
  // Invoice date, newest first.
  invoiceRegister: table(
    () => "Invoice_Register.xlsx",
    [
      col("number", "invoice_number", 16),
      col("invoiceDate", "invoice_date", 14),
      col("poNumber", "po_number", 12),
      // Empty for a PO-direct invoice.
      col("dcNumber", "dc_number", 12),
      col("total", "total_amount", 14),
      col("taxable", "taxable_amount", 16),
      // CGST + SGST + IGST.
      col("tax", "total_tax", 12),
    ],
  ),
  pending: PENDING,
  dispatch: DISPATCH,
  // All POs dated in the range, or one PO's items (EC-42); PO date, newest first, a PO's items in item order.
  reconciliation: table(
    (poNumber?: string) =>
      poNumber === undefined ? "PO_Reconciliation_Report.xlsx" : `PO_Reconciliation_${fileSafe(poNumber)}.xlsx`,
    RECONCILIATION_COLUMNS,
  ),
  // The reconciliation rows of the selected POs (SPEC-13 §2, D-0100, EC-43); PO number, then item number.
  exportSelected: table(() => "PO_Reconciliation_Report.xlsx", RECONCILIATION_COLUMNS),
  /** The SPEC-12 guarantee-certificate workbook for the chosen DC, pinned by SPEC-12's goldens. */
  guaranteeCertificate: {
    kind: "document",
    document: "gc",
    fileName: (dcNumber: string) => `GC_${fileSafe(dcNumber)}.xlsx`,
  },
  // The screen's filters and sort (default: delivery date, newest first, D-0241); named after the IST date and
  // `HH:MM` of the export.
  deliveryTracker: table(
    (at: { date: string; time: string }) =>
      `Delivery_Tracker_${at.date.replaceAll("-", "")}_${at.time.replace(":", "")}.xlsx`,
    [
      col("poNumber", "PO Number", 12),
      col("materialCode", "Material Code", 15),
      col("description", "Material Desc", 60),
      // `L<lot no>`.
      col("lot", "Lot", 12),
      col("unit", "Unit", 12),
      col("delyDate", "Due Date", 12),
      col("entryAllowDate", "Entry Date", 12),
      col("ordQty", "Ord", 12),
      col("dspQty", "Dsp", 12),
      col("rcdQty", "Rcd", 12),
      col("balanceQty", "Bal", 12),
      col("rate", "Unit Rate", 12),
      // Balance × rate (D-0239).
      col("pendingValue", "Pending Value", 15),
      // `N days overdue`, `Due in N days`, `Due Today`.
      col("daysOverdue", "Days Overdue", 17),
    ],
  ),
  // Matches the DC list screen, DC date newest first; named after the PO when the list is filtered to one. Status
  // and Pending Qty: EC-39.
  dcList: csv((poNumber?: string) => `DC_List_Export_${poNumber === undefined ? "All" : fileSafe(poNumber)}.csv`, {
    number: "Record",
    dcDate: "Date",
    poNumber: "Contract",
    consigneeName: "Consignee",
    status: "Status",
    value: "Value",
    ordQty: "Ord Qty",
    dspQty: "Delivered Qty",
    pendingQty: "Pending Qty",
    rcdQty: "Received Qty",
  }),
  // Invoice date, newest first. Delivered Qty, Status and Pending Qty: EC-40.
  invoiceList: csv(() => "Invoice_List_Export.csv", {
    number: "Invoice #",
    invoiceDate: "Date",
    dcNumber: "Linked DCs",
    poNumber: "Linked POs",
    itemCount: "Items Count",
    dspQty: "Delivered Qty",
    total: "Value",
    status: "Status",
    pendingQty: "Pending Qty",
  }),
} as const;

export type ExportName = keyof typeof EXPORTS;
