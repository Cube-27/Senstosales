// Delivery challans and their lines (ARCHITECTURE §8.2). No cancel column: a DC is deleted, never cancelled (INV-34).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { fy, instant, isoDate, qtyM, ulid } from "../types.ts";
import { po, poItem } from "./po.ts";
import { supplierId, supplierSnapshot } from "./supplier.ts";

export const dc = sqliteTable(
  "dc",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    poId: ulid("po_id")
      .notNull()
      .references(() => po.id),
    number: text("number").notNull(),
    dcDate: isoDate("dc_date").notNull(),
    financialYear: fy("financial_year").notNull(),
    gcNumber: text("gc_number").notNull(),
    gcDate: isoDate("gc_date").notNull(),
    ourRef: text("our_ref"),
    departmentNo: text("department_no"),
    consigneeName: text("consignee_name"),
    consigneeGstin: text("consignee_gstin"),
    consigneeAddress: text("consignee_address"),
    inspectionCompany: text("inspection_company"),
    ewayBillNo: text("eway_bill_no"),
    vehicleNo: text("vehicle_no"),
    lrNo: text("lr_no"),
    transporter: text("transporter"),
    modeOfTransport: text("mode_of_transport"),
    remarks: text("remarks"),
    ...supplierSnapshot(),
    version: integer("version").notNull().default(1),
    createdAt: instant("created_at").notNull(),
    /** The invoice the DC sheet cites, filled in by the user (EC-47). */
    invoiceNumber: text("invoice_number"),
    invoiceDate: isoDate("invoice_date"),
  },
  (t) => [
    // INV-22: DC numbers restart each FY. INV-26: so do GC numbers, independently of DC numbers.
    uniqueIndex("dc_supplier_number_fy_uq").on(t.supplierId, t.number, t.financialYear),
    uniqueIndex("dc_supplier_gc_number_fy_uq").on(t.supplierId, t.gcNumber, t.financialYear),
    index("dc_po_id_idx").on(t.poId),
  ],
);

/** A DC line; its quantity never changes after save (INV-33). */
export const dcItem = sqliteTable(
  "dc_item",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    dcId: ulid("dc_id")
      .notNull()
      .references(() => dc.id),
    poItemId: ulid("po_item_id")
      .notNull()
      .references(() => poItem.id),
    dspQty: qtyM("dsp_qty_m").notNull(),
    createdAt: instant("created_at").notNull(),
    packets: integer("packets"),
  },
  (t) => [index("dc_item_dc_id_idx").on(t.dcId), index("dc_item_po_item_id_idx").on(t.poItemId)],
);
