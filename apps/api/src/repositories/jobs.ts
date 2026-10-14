// Rows of `job` and `job_event` (ARCHITECTURE §7.3): reads, and the statements the worker and the jobs service
// commit.
import type { Db, Instant, Statement } from "@senstosales/db";
import { job, jobEvent } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";

import type { JobRow } from "../ports/jobs.ts";

export type JobEventRow = typeof jobEvent.$inferSelect;
export type JobProgress = JobRow["progress"];
type JobListQuery = z.output<(typeof routes)["jobs.list"]["query"]>;

const ACTIVE = ["queued", "running"] as const;

export const NO_PROGRESS: JobProgress = { total: 0, done: 0, skipped: 0, failed: 0, current: null };

/**
 * Queues a job unless one is queued or running. The check and the insert are one statement, so two starts cannot
 * both pass it (INV-98); the caller reads the row back to learn whether it was queued.
 */
export function queueIfIdle(db: Db, row: { id: string; type: JobRow["type"]; createdAt: Instant }): Statement {
  return db.build.run(sql`
    INSERT INTO job (id, type, status, created_at, cancel_requested, progress_json)
    SELECT ${row.id}, ${row.type}, 'queued', ${row.createdAt}, 0, ${JSON.stringify(NO_PROGRESS)}
    WHERE NOT EXISTS (SELECT 1 FROM job WHERE status IN ('queued', 'running'))`);
}

/** The running job, else the oldest queued one, else `null`. */
export async function findActiveJob(db: Db) {
  const [row] = await db.query(
    db.build
      .select({ id: job.id, type: job.type, status: job.status })
      .from(job)
      .where(inArray(job.status, ACTIVE))
      .orderBy(desc(eq(job.status, "running")), asc(job.createdAt))
      .limit(1),
  );
  return row ?? null;
}

export async function findJob(db: Db, id: string): Promise<JobRow | null> {
  const rows = await db.query(db.build.select().from(job).where(eq(job.id, id)).limit(1));
  return rows[0] ?? null;
}

/** Newest first unless a sort is given; ids break ties, as they sort in creation order. */
export async function listJobs(db: Db, query: JobListQuery): Promise<{ items: JobRow[]; total: number }> {
  const where = and(
    query.type === undefined ? undefined : eq(job.type, query.type),
    query.status === undefined ? undefined : eq(job.status, query.status),
  );
  const order = query.sort === undefined || query.dir === "desc" ? desc : asc;
  const [items, totals] = await Promise.all([
    db.query(
      db.build
        .select()
        .from(job)
        .where(where)
        .orderBy(order(job.createdAt), order(job.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
    ),
    db.query(db.build.select({ total: count() }).from(job).where(where)),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

/** In the order they were written. */
export function jobEvents(db: Db, jobId: string): Promise<JobEventRow[]> {
  return db.query(db.build.select().from(jobEvent).where(eq(jobEvent.jobId, jobId)).orderBy(asc(jobEvent.id)));
}

/** Claims a queued job. The partial unique index refuses it while another job runs. */
export function markRunning(db: Db, id: string, startedAt: Instant): Statement {
  return db.build
    .update(job)
    .set({ status: "running", startedAt })
    .where(and(eq(job.id, id), eq(job.status, "queued")));
}

export function setProgress(db: Db, id: string, progress: JobProgress): Statement {
  return db.build.update(job).set({ progress }).where(eq(job.id, id));
}

export function insertEvent(db: Db, event: JobEventRow): Statement {
  return db.build.insert(jobEvent).values(event);
}

export function finishJob(
  db: Db,
  id: string,
  end: { status: "done" | "failed" | "cancelled"; finishedAt: Instant; progress: JobProgress; error: string | null },
): Statement {
  return db.build.update(job).set(end).where(eq(job.id, id));
}

/** Sets the cancel flag of a queued or running job; a finished job is left as it is. */
export function requestCancel(db: Db, id: string): Statement {
  return db.build
    .update(job)
    .set({ cancelRequested: true })
    .where(and(eq(job.id, id), inArray(job.status, ACTIVE)));
}
