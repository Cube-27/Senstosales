// Raw BHEL HTML recorded before parsing, so a parser fix can re-parse without re-scraping (ARCHITECTURE §7.3).
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { instant, isoDate, ulid } from "../types.ts";
import { supplierId } from "./supplier.ts";

export const sourceDocument = sqliteTable("source_document", {
  id: ulid("id").primaryKey(),
  supplierId: supplierId(),
  kind: text("kind").$type<"po" | "srv">().notNull(),
  key: text("key").notNull(),
  /** A `Storage` key such as `html/po/<po>.html`; never a filesystem path (C17). */
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  docDate: isoDate("doc_date"),
  ingestedAt: instant("ingested_at").notNull(),
  jobId: ulid("job_id"),
});
