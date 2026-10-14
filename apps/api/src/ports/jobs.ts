// The Jobs port (ARCHITECTURE §4.1, §7.3): background jobs, one at a time (INV-98). A job works through a list of
// documents; the worker writes progress per document and honours cancel between documents. The adapter now is the
// in-process worker over the `job` table (`platform/node/job-runner.ts`); a Durable Object later.
import type { job } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

export type JobRow = typeof job.$inferSelect;

/** What `POST /api/jobs` names: the type and its parameters. */
export type JobStart = z.output<(typeof routes)["jobs.start"]["body"]>;
export type JobType = JobStart["type"];

export interface Jobs {
  /** Queues a job and runs it when the worker is free. `null` when a job is already queued or running. */
  enqueue(start: JobStart): Promise<JobRow | null>;
}

/** One document's outcome. Skipped and failed ones become job events with the reason. */
export type DocumentResult =
  | { readonly outcome: "done" }
  | { readonly outcome: "skipped" | "failed"; readonly reason: string };

/** The work of one job type. A throw from either method fails the whole job. */
export interface JobHandler<S extends JobStart = JobStart> {
  /** The documents to work through, in order; each key is shown as `current` and on its events. */
  documents(start: S, jobId: string): Promise<readonly string[]>;
  process(document: string, start: S, jobId: string): Promise<DocumentResult>;
}

export type JobHandlers = { [T in JobType]?: JobHandler<Extract<JobStart, { type: T }>> };
