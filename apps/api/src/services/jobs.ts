// Start, list, read and cancel background jobs (SPEC-08 §2, INV-98). The worker behind the Jobs port runs them.
import type { Db } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";

import { ConflictError, NotFoundError } from "../errors.ts";
import type { JobRow, Jobs, JobStart } from "../ports/jobs.ts";
import type { JobEventRow } from "../repositories/jobs.ts";
import { findJob, jobEvents, listJobs, requestCancel } from "../repositories/jobs.ts";

export interface JobsDeps {
  readonly db: Db;
  readonly jobs: Jobs;
}

export function jobsService({ db, jobs }: JobsDeps) {
  async function load(id: string): Promise<JobRow> {
    const row = await findJob(db, id);
    if (row === null) throw new NotFoundError("job-not-found", "This job was not found.");
    return row;
  }

  return {
    async start(start: JobStart): Promise<JobRow> {
      const row = await jobs.enqueue(start);
      if (row === null) {
        throw new ConflictError("job-running", "Another job is running. Wait for it to finish, or cancel it.");
      }
      return row;
    },

    list: (query: Parameters<typeof listJobs>[1]) => listJobs(db, query),

    async detail(id: string): Promise<{ job: JobRow; events: JobEventRow[] }> {
      return { job: await load(id), events: await jobEvents(db, id) };
    },

    /** The worker stops after the document in progress. A finished job is returned as it is. */
    async cancel(id: string): Promise<JobRow> {
      await load(id);
      await new WriteBatch(db).add(requestCancel(db, id)).commit();
      return load(id);
    },
  };
}

export type JobsService = ReturnType<typeof jobsService>;
