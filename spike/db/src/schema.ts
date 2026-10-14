// Synthetic schema that exercises the §8.1 conventions: ULID text ids, integer milli-units and 1e-5 money, text
// dates, a business-key unique index, a foreign key, a version column and a partial unique index (single running
// job). Not the SPEC-05 schema.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const po = sqliteTable(
  "po",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").notNull(),
    poNumber: text("po_number").notNull(),
    poDate: text("po_date").notNull(),
    poValueU5: integer("po_value_u5").notNull().default(0),
    version: integer("version").notNull().default(0),
  },
  (t) => [uniqueIndex("po_supplier_number_uq").on(t.supplierId, t.poNumber)],
);

export const poItem = sqliteTable(
  "po_item",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .references(() => po.id),
    poItemNo: integer("po_item_no").notNull(),
    ordQtyM: integer("ord_qty_m").notNull(),
    rateU5: integer("rate_u5").notNull(),
  },
  (t) => [uniqueIndex("po_item_po_no_uq").on(t.poId, t.poItemNo), index("po_item_po_idx").on(t.poId)],
);

export const job = sqliteTable(
  "job",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("job_single_running_uq").on(t.status).where(sql`status = 'running'`)],
);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
});
