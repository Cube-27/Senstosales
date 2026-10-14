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
