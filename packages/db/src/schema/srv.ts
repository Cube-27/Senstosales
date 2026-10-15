// Stores receipt vouchers and their lines (ARCHITECTURE §8.2). The PO, PO item and document links are matched or
// resolved by service batches and recomputed on every SRV write (§6.10), so they carry no foreign key.
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { fy, isoDate, qtyM, ulid } from "../types.ts";
import { supplierId } from "./supplier.ts";

export const srv = sqliteTable(
  "srv",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    poNumber: text("po_number").notNull(),
    /** Null: the PO is not in the system ("PO not found", INV-40). */
    poId: ulid("po_id"),
    srvNumber: text("srv_number").notNull(),
    srvDate: isoDate("srv_date").notNull(),
    financialYear: fy("financial_year").notNull(),
    /** Label -> text as on the SRV page (SPEC-06 §4.2). */
    rawHeader: text("raw_header_json", { mode: "json" }).$type<Record<string, string>>().notNull(),
  },
  (t) => [
    uniqueIndex("srv_supplier_po_number_srv_number_uq").on(t.supplierId, t.poNumber, t.srvNumber),
    index("srv_po_id_idx").on(t.poId),
  ],
);

export const srvItem = sqliteTable(
  "srv_item",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    srvId: ulid("srv_id")
      .notNull()
      .references(() => srv.id),
    /** Null until matched to a PO item (INV-39). */
    poItemId: ulid("po_item_id"),
    /** The row's place in its SRV, from 1: the page's own keys may repeat (A2-10). */
    rowNo: integer("row_no").notNull(),
    materialCode: text("material_code"),
    poItemNo: integer("po_item_no").notNull(),
    /** The page's other columns, as printed; null where the page has no such column or an empty cell. */
    subItemNo: text("sub_item_no"),
    lotNo: integer("lot_no"),
    srvItemNo: integer("srv_item_no").notNull(),
    revNo: text("rev_no"),
    division: text("division"),
    pmirNo: text("pmir_no"),
    unit: text("unit"),
    ordQty: qtyM("ord_qty_m").notNull(),
    challanQty: qtyM("challan_qty_m"),
    // Nullable as the domain's SrvLine reads them: received falls back to accepted (INV-11).
    rcdQty: qtyM("rcd_qty_m"),
    acceptedQty: qtyM("accepted_qty_m"),
    rejQty: qtyM("rej_qty_m"),
    /** Raw text as on the SRV; the resolved links are separate (INV-38). */
    challanNo: text("challan_no"),
    challanDate: isoDate("challan_date"),
    invoiceNo: text("invoice_no"),
    invoiceDate: isoDate("invoice_date"),
    financeDate: isoDate("finance_date"),
    cnoteNo: text("cnote_no"),
    cnoteDate: isoDate("cnote_date"),
    /** Column header -> cell text of this row as printed; null on rows stored before schema version 4. */
    rawRow: text("raw_row_json", { mode: "json" }).$type<Record<string, string>>(),
    resolvedDcId: ulid("resolved_dc_id"),
    resolvedInvoiceId: ulid("resolved_invoice_id"),
  },
  // A DC or invoice delete clears the links that point at it (§6.10).
  (t) => [
    index("srv_item_srv_id_idx").on(t.srvId),
    index("srv_item_po_item_id_idx").on(t.poItemId),
    index("srv_item_resolved_dc_id_idx").on(t.resolvedDcId),
    index("srv_item_resolved_invoice_id_idx").on(t.resolvedInvoiceId),
  ],
);
