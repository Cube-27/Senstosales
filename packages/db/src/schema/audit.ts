// One row per write batch, written in that batch. Kept forever: no API or job deletes from it (A-26, INV-83).
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { instant, ulid } from "../types.ts";

type Snapshot = Record<string, unknown>;

export const auditLog = sqliteTable("audit_log", {
  id: ulid("id").primaryKey(),
  at: instant("at").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  /** The changed values before and after; never a secret (INV-81). */
  before: text("before_json", { mode: "json" }).$type<Snapshot>(),
  after: text("after_json", { mode: "json" }).$type<Snapshot>(),
  jobId: ulid("job_id"),
});
