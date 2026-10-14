// Background jobs and their events (ARCHITECTURE §7.3).
import type { zJobStatus, zJobType } from "@senstosales/schemas";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { instant, ulid } from "../types.ts";

type JobProgress = { total: number; done: number; skipped: number; failed: number; current: string | null };

export const job = sqliteTable(
  "job",
  {
    id: ulid("id").primaryKey(),
    type: text("type").$type<(typeof zJobType.options)[number]>().notNull(),
    status: text("status").$type<(typeof zJobStatus.options)[number]>().notNull(),
    createdAt: instant("created_at").notNull(),
    startedAt: instant("started_at"),
    finishedAt: instant("finished_at"),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    /** Written per document; `current` is the document in progress. */
    progress: text("progress_json", { mode: "json" }).$type<JobProgress>().notNull(),
    error: text("error"),
    /** Counts, skipped and failed files, flags by type (§7.4); shaped by the job that writes it. */
    summary: text("summary_json", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  // Exactly one running job: a second start fails its batch (§7.3).
  (t) => [
    uniqueIndex("job_one_running_uq")
      .on(t.status)
      .where(sql`status = 'running'`),
  ],
);

export const jobEvent = sqliteTable("job_event", {
  id: ulid("id").primaryKey(),
  jobId: ulid("job_id")
    .notNull()
    .references(() => job.id),
  at: instant("at").notNull(),
  level: text("level").$type<"info" | "warn" | "error">().notNull(),
  documentKey: text("document_key"),
  message: text("message").notNull(),
});
