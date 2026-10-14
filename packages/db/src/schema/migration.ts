// Applied migrations; `PRAGMA user_version` mirrors the highest version (ARCHITECTURE §8.3).
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { instant } from "../types.ts";

export const schemaMigration = sqliteTable("schema_migration", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: instant("applied_at").notNull(),
  appVersion: text("app_version").notNull(),
});
