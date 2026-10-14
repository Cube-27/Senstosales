// Start, list, read and cancel background jobs (SPEC-08 §2, INV-98). The Jobs adapter runs them.
import type { Db } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";

import { ConflictError, NotFoundError } from "../errors.ts";
import { newId } from "../ids.ts";
import type { Clock } from "../ports/clock.ts";
import type { Jobs, JobStart } from "../ports/jobs.ts";
import type { JobEventRow, JobRow } from "../repositories/jobs.ts";
import { findJob, finishJob, isActive, jobEvents, listJobs, queueIfIdle, requestCancel } from "../repositories/jobs.ts";

export function jobsService({ db, clock, jobs }: { db: Db; clock: Clock; jobs: Jobs }) {
  async function load(id: string): Promise<JobRow> {
    const row = await findJob(db, id);
    if (row === null) throw new NotFoundError("job-not-found", "This job was not found.");
    return row;
  }

  return {
    async start(start: JobStart): Promise<JobRow> {
      const id = newId();
      await new WriteBatch(db).add(queueIfIdle(db, { id, type: start.type, createdAt: clock.now() })).commit();
      const row = await findJob(db, id);
      if (row === null) {
        throw new ConflictError("job-running", "Another job is running. Wait for it to finish, or cancel it.");
      }
      jobs.enqueue(id, start);
      return row;
    },

    list: (query: Parameters<typeof listJobs>[1]) => listJobs(db, query),

    async detail(id: string): Promise<{ job: JobRow; events: JobEventRow[] }> {
      return { job: await load(id), events: await jobEvents(db, id) };
    },

    /**
     * The worker stops after the document in progress. A queued or running job that no worker holds, left by an
     * earlier run of the app (EC-28), ends at once, so a new job can start. A finished job is returned as it is.
     */
    async cancel(id: string): Promise<JobRow> {
      const row = await load(id);
      const batch = new WriteBatch(db).add(requestCancel(db, id));
      if (isActive(row) && !jobs.holds(id)) {
        const progress = { ...row.progress, current: null };
        batch.add(finishJob(db, id, { status: "cancelled", finishedAt: clock.now(), progress, error: null }));
      }
      await batch.commit();
      return load(id);
    },
  };
}

export type JobsService = ReturnType<typeof jobsService>;
