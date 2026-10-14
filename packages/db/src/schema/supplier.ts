// The install's supplier, its settings and secret, and the BHEL units it sells to (ARCHITECTURE §8.2).
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { ulid } from "../types.ts";

type TextMap = Record<string, string>;

/** One per install (A2-12), created by onboarding; nothing identifying is seeded (INV-78). */
export const supplier = sqliteTable("supplier", {
  id: ulid("id").primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  address: text("address"),
  state: text("state"),
  stateCode: text("state_code"),
  contact: text("contact"),
  email: text("email"),
  bhelSupplierCode: text("bhel_supplier_code"),
  bankDetails: text("bank_details_json", { mode: "json" }).$type<TextMap>().notNull(),
  invoiceDefaults: text("invoice_defaults_json", { mode: "json" }).$type<TextMap>().notNull(),
});

/** The owning supplier, on every business table (ARCHITECTURE §8). */
export const supplierId = () =>
  ulid("supplier_id")
    .notNull()
    .references(() => supplier.id);

/** GST percentages and preferences; never auth state. */
export const settings = sqliteTable(
  "settings",
  { supplierId: supplierId(), key: text("key").notNull(), value: text("value").notNull() },
  (t) => [primaryKey({ columns: [t.supplierId, t.key] })],
);

/** The BHEL portal password; no read API returns it (INV-81). */
export const secret = sqliteTable(
  "secret",
  { supplierId: supplierId(), name: text("name").notNull(), value: text("value").notNull() },
  (t) => [primaryKey({ columns: [t.supplierId, t.name] })],
);

/** A BHEL unit: public unit data. */
export const buyer = sqliteTable("buyer", {
  id: ulid("id").primaryKey(),
  supplierId: supplierId(),
  unitName: text("unit_name").notNull(),
  state: text("state"),
  stateCode: text("state_code"),
  gstin: text("gstin"),
});
