// A PO, its items and their delivery lots (ARCHITECTURE §8.2). Status and quantity totals are derived columns: the
// domain computes them and only service batches write them (§8.1, C2).
import type { ItemStatus, PoStatus, Qty } from "@senstosales/domain";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { instant, isoDate, moneyU5, qtyM, ulid } from "../types.ts";
import { supplierId } from "./supplier.ts";

export const po = sqliteTable(
  "po",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    poNumber: text("po_number").notNull(),
    poDate: isoDate("po_date"),
    buyerId: ulid("buyer_id"),
    enquiry: text("enquiry"),
    quotation: text("quotation"),
    orderType: text("order_type"),
    bhelStatusCode: text("bhel_status_code"),
    amendNo: integer("amend_no").notNull(),
    poValue: moneyU5("po_value_u5"),
    netPoValue: moneyU5("net_po_value_u5"),
    isGemc: integer("is_gemc", { mode: "boolean" }).notNull(),
    gemcNumber: text("gemc_number"),
    remarks: text("remarks"),
    /** Label -> text as on the PO page (SPEC-06 §4.2). */
    rawHeader: text("raw_header_json", { mode: "json" }).$type<Record<string, string>>().notNull(),
    status: text("status").$type<PoStatus>().notNull(),
    /** INV-07: sums over active items. */
    ordQty: qtyM("ord_qty_m").notNull(),
    dspQty: qtyM("dsp_qty_m").notNull(),
    rcdQty: qtyM("rcd_qty_m").notNull(),
    rejQty: qtyM("rej_qty_m").notNull(),
    balanceQty: qtyM("balance_qty_m").notNull(),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("po_supplier_po_number_uq").on(t.supplierId, t.poNumber)],
);

export const poItem = sqliteTable(
  "po_item",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    poId: ulid("po_id")
      .notNull()
      .references(() => po.id),
    poItemNo: integer("po_item_no").notNull(),
    materialCode: text("material_code"),
    description: text("description"),
    drawingNo: text("drawing_no"),
    unit: text("unit"),
    ordQty: qtyM("ord_qty_m").notNull(),
    /** GST-inclusive on a GEMC PO; `rate_u5` is the net, always re-derived from it (INV-17). */
    rateSource: moneyU5("rate_source_u5").notNull(),
    rate: moneyU5("rate_u5").notNull(),
    /** The PO document's received and rejected, kept apart from the derived ones (INV-13). */
    poRcdQty: qtyM("po_rcd_qty_m").notNull(),
    poRejQty: qtyM("po_rej_qty_m"),
    /** Set when an amendment removed the item (A-13). */
    cancelledAt: instant("cancelled_at"),
    manualDispatchedQty: qtyM("manual_dispatched_qty_m")
      .notNull()
      .default(0 as Qty),
    manualNote: text("manual_note"),
    manualSetAt: instant("manual_set_at"),
    dspQty: qtyM("dsp_qty_m").notNull(),
    rcdQty: qtyM("rcd_qty_m").notNull(),
    rejQty: qtyM("rej_qty_m").notNull(),
    balanceQty: qtyM("balance_qty_m").notNull(),
    uninvoicedQty: qtyM("uninvoiced_qty_m").notNull(),
    status: text("status").$type<ItemStatus>().notNull(),
  },
  (t) => [
    uniqueIndex("po_item_po_item_no_uq").on(t.poId, t.poItemNo),
    // A-15: one item-level manual dispatched quantity, never negative.
    check("po_item_manual_dispatched_qty_m_check", sql`${t.manualDispatchedQty} >= 0`),
  ],
);

/** A delivery schedule row; planning only (spec §3). */
export const poLot = sqliteTable("po_lot", {
  id: ulid("id").primaryKey(),
  supplierId: supplierId(),
  poItemId: ulid("po_item_id")
    .notNull()
    .references(() => poItem.id),
  lotNo: integer("lot_no").notNull(),
  delyQty: qtyM("dely_qty_m").notNull(),
  delyDate: isoDate("dely_date"),
  entryAllowDate: isoDate("entry_allow_date"),
  /** Entry-allow text that is not a date (INV-46). */
  entryAllowNote: text("entry_allow_note"),
  destCode: text("dest_code"),
});
