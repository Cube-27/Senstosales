// Applied migrations; the highest version is the schema version (ARCHITECTURE §8.2, §13.3).
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { instant } from "../types.ts";

export const schemaMigration = sqliteTable("schema_migration", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: instant("applied_at").notNull(),
  appVersion: text("app_version").notNull(),
});
