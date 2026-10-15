// The export inventory (SPEC-13 §2, §4.1): one definition per kept export, recording what the legacy app wrote (A-2,
// INV-68, C16): file type and name, sheet, header text and order, column widths, styles and page setup. Services fill
// the rows; the goldens in `test/reports/golden` pin the output for the synthetic dataset. No export has a flag
// column (INV-60).
import type ExcelJS from "exceljs";

import type { Column } from "../stream/sheet.ts";

type Style = Partial<ExcelJS.Style>;

const thin = { style: "thin" } as const;
const box = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * The legacy generic list workbook, shared by the registers, the reconciliation report, export-selected and the
 * delivery tracker: one sheet named `Report`, a styled header row, then one row per record. Numbers are written
 * rounded to 2 dp with no number format (General); text, dates (`YYYY-MM-DD`) and codes as text; a missing value
 * is an empty cell. With no rows the workbook holds the empty `Report` sheet only: no header row, no page setup.
 */
export const TABLE = {
  sheet: "Report",
  decimals: 2,
  headerStyle: {
    font: { bold: true },
    border: box,
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD7E4BC" } },
  } satisfies Style,
  /** A4 landscape, every column on one page width, the header row repeated on each printed page. */
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.3 },
  } satisfies Partial<ExcelJS.PageSetup>,
  oddFooter: "&CPage &P of &N",
} as const;

/** Legacy file-name cleaning for a document number: `..`, `/` and `\` become `_`, at most 50 characters. */
export const fileSafe = (text: string) => text.replaceAll("..", "_").replaceAll(/[/\\]/g, "_").slice(0, 50);

/** A list workbook in the {@link TABLE} layout. Headers are the legacy ones, snake_case keys included. */
export interface TableExport {
  readonly kind: "table";
  readonly columns: readonly Column<string>[];
  /** Row order as legacy wrote it. */
  readonly order: string;
}

/** A CSV list: UTF-8 with a BOM, CRLF line ends, fields quoted only when they hold a comma, quote or line break. */
export interface CsvExport {
  readonly kind: "csv";
  readonly columns: readonly Pick<Column<string>, "key" | "header">[];
  readonly order: string;
}

const col = (key: string, header: string, width: number): Column<string> => ({ key, header, width });
const csvCol = (key: string, header: string) => ({ key, header });

const RECONCILIATION_COLUMNS = [
  col("poNumber", "po_number", 12),
  col("poItemNo", "po_item_no", 12),
  col("poDate", "po_date", 12),
  col("description", "item_description", 60),
  col("ordQty", "ordered_qty", 13),
  col("dspQty", "total_dispatched", 18),
  /** Accepted is the item's received quantity (A2-8, INV-09). */
  col("rcdQty", "total_accepted", 16),
  col("rejQty", "total_rejected", 16),
  /** The item's balance, the one clamped value (INV-61). */
  col("balanceQty", "pending_qty", 13),
] as const;

// Widths: legacy fitted each column to its longest value (header + 2, at most 60), which a streaming writer cannot
// know before the first row. Each column has the width that fit gives on ordinary values: header + 2 and at least
// 12, 30 for names, 60 for descriptions.

export const PO_REGISTER = {
  kind: "table",
  fileName: () => "PO_Register.xlsx",
  order: "PO date, newest first",
  columns: [
    col("poNumber", "po_number", 12),
    col("poDate", "po_date", 12),
    /** The install's supplier (A2-12, EC-44). */
    col("supplierName", "supplier_name", 30),
    col("poValue", "po_value", 12),
    col("status", "po_status", 12),
    col("itemCount", "items_count", 13),
    col("ordQty", "total_qty", 12),
  ],
} as const satisfies TableExport & { fileName: () => string };

export const DC_REGISTER = {
  kind: "table",
  fileName: () => "DC_Register.xlsx",
  order: "DC date, newest first",
  columns: [
    col("number", "dc_number", 12),
    col("dcDate", "dc_date", 12),
    col("poNumber", "po_number", 12),
    col("consigneeName", "consignee_name", 30),
    col("itemCount", "item_count", 12),
    col("dspQty", "total_qty", 12),
  ],
} as const satisfies TableExport & { fileName: () => string };

export const INVOICE_REGISTER = {
  kind: "table",
  fileName: () => "Invoice_Register.xlsx",
  order: "Invoice date, newest first",
  columns: [
    col("number", "invoice_number", 16),
    col("invoiceDate", "invoice_date", 14),
    col("poNumber", "po_number", 12),
    /** Empty for a PO-direct invoice. */
    col("dcNumber", "dc_number", 12),
    col("total", "total_amount", 14),
    col("taxable", "taxable_amount", 16),
    /** CGST + SGST + IGST. */
    col("tax", "total_tax", 12),
  ],
} as const satisfies TableExport & { fileName: () => string };

/** All POs dated in the range; one PO's items when a PO is chosen (EC-42). */
export const RECONCILIATION = {
  kind: "table",
  fileName: (poNumber?: string) =>
    poNumber === undefined ? "PO_Reconciliation_Report.xlsx" : `PO_Reconciliation_${fileSafe(poNumber)}.xlsx`,
  order: "PO date, newest first; a PO's items in item order",
  columns: RECONCILIATION_COLUMNS,
} as const satisfies TableExport & { fileName: (poNumber?: string) => string };

/** The reconciliation rows of the selected POs (SPEC-13 §2, D-0100, EC-43). */
export const EXPORT_SELECTED = {
  kind: "table",
  fileName: () => "PO_Reconciliation_Report.xlsx",
  order: "PO number, then item number",
  columns: RECONCILIATION_COLUMNS,
} as const satisfies TableExport & { fileName: () => string };

/** The screen's filters and sort apply; the file is named after the IST date and `HH:MM` of the export. */
export const DELIVERY_TRACKER = {
  kind: "table",
  fileName: (at: { date: string; time: string }) =>
    `Delivery_Tracker_${at.date.replaceAll("-", "")}_${at.time.replace(":", "")}.xlsx`,
  order: "the screen's sort (default: delivery date, newest first, D-0241)",
  columns: [
    col("poNumber", "PO Number", 12),
    col("materialCode", "Material Code", 15),
    col("description", "Material Desc", 60),
    /** `L<lot no>`. */
    col("lot", "Lot", 12),
    col("unit", "Unit", 12),
    col("delyDate", "Due Date", 12),
    col("entryAllowDate", "Entry Date", 12),
    col("ordQty", "Ord", 12),
    col("dspQty", "Dsp", 12),
    col("rcdQty", "Rcd", 12),
    col("balanceQty", "Bal", 12),
    col("rate", "Unit Rate", 12),
    /** Balance × rate (D-0239). */
    col("pendingValue", "Pending Value", 15),
    /** `N days overdue`, `Due in N days`, `Due Today`; empty without a delivery date. */
    col("daysOverdue", "Days Overdue", 17),
  ],
} as const satisfies TableExport & { fileName: (at: { date: string; time: string }) => string };

/** Matches the DC list screen; `poNumber` when the list is filtered to one PO. */
export const DC_LIST = {
  kind: "csv",
  fileName: (poNumber?: string) => `DC_List_Export_${poNumber === undefined ? "All" : fileSafe(poNumber)}.csv`,
  order: "DC date, newest first",
  columns: [
    csvCol("number", "Record"),
    csvCol("dcDate", "Date"),
    csvCol("poNumber", "Contract"),
    csvCol("consigneeName", "Consignee"),
    /** EC-39. */
    csvCol("status", "Status"),
    csvCol("value", "Value"),
    csvCol("ordQty", "Ord Qty"),
    csvCol("dspQty", "Delivered Qty"),
    /** EC-39. */
    csvCol("pendingQty", "Pending Qty"),
    csvCol("rcdQty", "Received Qty"),
  ],
} as const satisfies CsvExport & { fileName: (poNumber?: string) => string };

export const INVOICE_LIST = {
  kind: "csv",
  fileName: () => "Invoice_List_Export.csv",
  order: "Invoice date, newest first",
  columns: [
    csvCol("number", "Invoice #"),
    csvCol("invoiceDate", "Date"),
    csvCol("dcNumber", "Linked DCs"),
    csvCol("poNumber", "Linked POs"),
    csvCol("itemCount", "Items Count"),
    /** EC-40. */
    csvCol("dspQty", "Delivered Qty"),
    csvCol("total", "Value"),
    /** EC-40. */
    csvCol("status", "Status"),
    /** EC-40. */
    csvCol("pendingQty", "Pending Qty"),
  ],
} as const satisfies CsvExport & { fileName: () => string };

/** The SPEC-12 guarantee-certificate workbook for the chosen DC, pinned by SPEC-12's goldens. */
export const GUARANTEE_CERTIFICATE = {
  kind: "document",
  document: "gc",
  fileName: (dcNumber: string) => `GC_${fileSafe(dcNumber)}.xlsx`,
} as const;

const calibri = { name: "Calibri", size: 11 };
const bold = { ...calibri, bold: true };
const center = { horizontal: "center", vertical: "middle", wrapText: true } as const;

/**
 * The pending-items workbook (legacy "Items Summary"): one `Summary` sheet. Rows 1–7 are the supplier heading, row
 * 9 the table header, then one row per PO item with a balance, then the TOTAL row. A merged range carries its
 * top-left cell's text and style across.
 */
export const PENDING = {
  kind: "summary",
  fileName: (range?: { from: string; to: string }) =>
    range === undefined ? "Items_Summary.xlsx" : `Items_Summary_${range.from}_to_${range.to}.xlsx`,
  order: "PO number, then item number",
  sheet: "Summary",
  /** 1-based row numbers and cells of the heading; each `text` names what fills it. */
  heading: [
    { cell: "A1", text: "Tel. No. <supplier contact>", style: "tel" },
    { cell: "A3", merge: "A3:I3", text: "<supplier name>", style: "company" },
    /** No v1 column (EC-41): written empty. */
    { cell: "A4", merge: "A4:I4", text: "<supplier description>", style: "address" },
    { cell: "A5", merge: "A5:I5", text: "<supplier address>", style: "address" },
    { cell: "A6", merge: "A6:I6", text: "SUMMARY", style: "title" },
    { cell: "B7", text: "Date:", style: "dateLabel" },
    { cell: "C7", text: "<export date DD-MM-YYYY>", style: "dateValue" },
  ],
  headerRow: 9,
  columns: [
    { key: "serial", header: "S.\nNo.", width: 5 },
    /** Repeated lines of the description are written once (case and spacing ignored). */
    { key: "description", header: "Description", width: 39 },
    /** Ordered quantity and unit as text: `10 NOS`. */
    { key: "qty", header: "Quantity\nSet/Nos.", width: 11 },
    /** No v1 column (EC-41): 0. */
    { key: "packets", header: "No of\npackets", width: 8 },
    { key: "poNumber", header: "PO NO", width: 13 },
    /** The item's invoices' GEMC numbers, else the PO's. Lists are joined with `,`. */
    { key: "gemcNumber", header: "GEMC  NO", width: 15 },
    { key: "invoiceNumbers", header: "Invoice\nNo.", width: 11 },
    { key: "dcNumbers", header: "Challan\nNo.", width: 11 },
    { key: "dspQty", header: "Dispatch\nDelivered", width: 11 },
  ],
  /** `TOTAL` merged over A:B; the summed quantity (with the unit when every row has the same one) and packets. */
  total: { label: "TOTAL", merge: "A:B" },
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
  /** A4 landscape on one page width, centred; the print area ends at the TOTAL row. */
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.3, footer: 0.3 },
  } satisfies Partial<ExcelJS.PageSetup>,
} as const;

/** Every kept export (SPEC-13 §2, ARCHITECTURE §11.2). Daily-dispatch is dropped (A-16, INV-87). */
export const EXPORTS = {
  poRegister: PO_REGISTER,
  dcRegister: DC_REGISTER,
  invoiceRegister: INVOICE_REGISTER,
  pending: PENDING,
  reconciliation: RECONCILIATION,
  exportSelected: EXPORT_SELECTED,
  guaranteeCertificate: GUARANTEE_CERTIFICATE,
  deliveryTracker: DELIVERY_TRACKER,
  dcList: DC_LIST,
  invoiceList: INVOICE_LIST,
} as const;

export type ExportName = keyof typeof EXPORTS;
