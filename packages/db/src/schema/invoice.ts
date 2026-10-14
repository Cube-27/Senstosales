// GST invoices and their lines (ARCHITECTURE §8.2). Tax amounts are computed by the domain at creation (INV-41) and
// only stored here. No cancel column: an invoice is deleted, never cancelled (INV-34).
import type { zInvoiceKind } from "@senstosales/schemas";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { fy, instant, isoDate, moneyU5, pctU5, qtyM, ulid } from "../types.ts";
import { dc, dcItem, supplierSnapshot } from "./dc.ts";
import { po, poItem } from "./po.ts";
import { supplierId } from "./supplier.ts";

const taxAmounts = () => ({
  taxable: moneyU5("taxable_u5").notNull(),
  cgst: moneyU5("cgst_u5").notNull(),
  sgst: moneyU5("sgst_u5").notNull(),
  igst: moneyU5("igst_u5").notNull(),
  total: moneyU5("total_u5").notNull(),
});

export const invoice = sqliteTable(
  "invoice",
  {
    id: ulid("id").primaryKey(),
    supplierId: supplierId(),
    /** One PO per invoice (INV-30). */
    poId: ulid("po_id")
      .notNull()
      .references(() => po.id),
    /** Set on a DC-sourced invoice, null on a PO-direct one. */
    dcId: ulid("dc_id").references(() => dc.id),
    kind: text("kind").$type<(typeof zInvoiceKind.options)[number]>().notNull(),
    number: text("number").notNull(),
    invoiceDate: isoDate("invoice_date").notNull(),
    financialYear: fy("financial_year").notNull(),
    buyerName: text("buyer_name"),
    buyerGstin: text("buyer_gstin"),
    buyerAddress: text("buyer_address"),
    buyerState: text("buyer_state"),
    buyerStateCode: text("buyer_state_code"),
    placeOfSupply: text("place_of_supply"),
    buyersOrderDate: isoDate("buyers_order_date"),
    gemcNumber: text("gemc_number"),
    gemcDate: isoDate("gemc_date"),
    paymentTerms: text("payment_terms"),
    despatchDocNo: text("despatch_doc_no"),
    srvNo: text("srv_no"),
    srvDate: isoDate("srv_date"),
    vehicleNo: text("vehicle_no"),
    lrNo: text("lr_no"),
    transporter: text("transporter"),
    destination: text("destination"),
    termsOfDelivery: text("terms_of_delivery"),
    remarks: text("remarks"),
    ...supplierSnapshot(),
    /** Copied from settings at creation (A2-4). */
    cgstPct: pctU5("cgst_pct_u5").notNull(),
    sgstPct: pctU5("sgst_pct_u5").notNull(),
    ...taxAmounts(),
    version: integer("version").notNull().default(1),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    // INV-22: invoice numbers restart each FY, independently of DC numbers.
    uniqueIndex("invoice_supplier_number_fy_uq").on(t.supplierId, t.number, t.financialYear),
    // INV-28: a DC has at most one invoice. Many PO-direct invoices may share a null dc_id.
    uniqueIndex("invoice_dc_id_uq").on(t.dcId),
  ],
);

/** An invoice line; qty and rate never change after save (INV-33). */
export const invoiceItem = sqliteTable("invoice_item", {
  id: ulid("id").primaryKey(),
  supplierId: supplierId(),
  invoiceId: ulid("invoice_id")
    .notNull()
    .references(() => invoice.id),
  poItemId: ulid("po_item_id")
    .notNull()
    .references(() => poItem.id),
  /** Set on DC-sourced invoices only. */
  dcItemId: ulid("dc_item_id").references(() => dcItem.id),
  qty: qtyM("qty_m").notNull(),
  rate: moneyU5("rate_u5").notNull(),
  ...taxAmounts(),
});
