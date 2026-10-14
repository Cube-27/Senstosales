// The Jobs port (ARCHITECTURE §4.1, §7.3): runs queued jobs one at a time (INV-98). A job works through a list of
// documents with the handler of its type. The adapter now is the in-process runner (`platform/node/job-runner.ts`);
// a Durable Object later.
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

/** What `POST /api/jobs` names: the type and its parameters. */
export type JobStart = z.output<(typeof routes)["jobs.start"]["body"]>;
type JobType = JobStart["type"];

export interface Jobs {
  /** Runs the queued job `id` when the worker is free. */
  enqueue(id: string, start: JobStart): void;
  /** Whether this adapter will run, or is running, job `id`. A queued or running row it does not hold was left by an
   * earlier process (EC-28). */
  holds(id: string): boolean;
}

/** One document of a job: `key` is what the handler processes, `label` what the user sees as `current` and on its
 * events (a file name for a folder import). */
export interface JobDocument {
  readonly key: string;
  readonly label: string;
}

/** One document's outcome. Skipped and failed ones become job events with the reason. */
export type DocumentResult =
  | { readonly outcome: "done" }
  | { readonly outcome: "skipped" | "failed"; readonly reason: string };

/** What a finished job keeps in its row (ARCHITECTURE §7.4); shaped by the job type. */
export type JobSummary = Record<string, unknown>;

/** The work of one job type. A throw from `documents` or `process` fails the whole job. */
export interface JobHandler<S extends JobStart = JobStart> {
  /** The documents to work through, in order. */
  documents(start: S, jobId: string): Promise<readonly JobDocument[]>;
  process(key: string, start: S, jobId: string): Promise<DocumentResult>;
  /** Runs once the job has ended, however it ended, with its events and progress committed; returns the summary. */
  finish?(start: S, jobId: string): Promise<JobSummary | null>;
}

export type JobHandlers = { [T in JobType]?: JobHandler<Extract<JobStart, { type: T }>> };
