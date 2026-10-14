// The in-process Jobs adapter (SPEC-08 §4.1): a single-flight queue, so one job runs at a time in this process; the
// table's queue check and partial unique index hold it across processes (INV-98). The `job` table has no parameter
// column, so a job runs only in the process that queued it (EC-28).
import type { Jobs, JobStart } from "../../ports/jobs.ts";

export interface JobRunner extends Jobs {
  /** Settles when every job enqueued so far has finished. */
  idle(): Promise<void>;
}

/** `runJob` must not reject; the job worker service ends a failing job itself. */
export function createJobRunner(runJob: (id: string, start: JobStart) => Promise<void>): JobRunner {
  let chain = Promise.resolve();
  const held = new Set<string>();
  return {
    enqueue(id, start) {
      held.add(id);
      chain = chain.then(() => runJob(id, start)).finally(() => held.delete(id));
    },
    holds: (id) => held.has(id),
    idle: () => chain,
  };
}
