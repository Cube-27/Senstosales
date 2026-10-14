// The in-process worker behind the Jobs port (SPEC-08 §4.1, ARCHITECTURE §7.3): one job at a time (the queue check
// and the partial unique index in the table, plus a single-flight loop here), progress written per document, cancel
// honoured between documents. The `job` table has no parameter column, so a job's parameters stay in memory and a job
// runs only in the process that queued it.
import type { Db, Statement } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";

import { newId } from "../../ids.ts";
import type { Clock } from "../../ports/clock.ts";
import type { DocumentResult, JobHandler, JobHandlers, Jobs, JobStart } from "../../ports/jobs.ts";
import type { Logger } from "../../ports/logger.ts";
import type { JobProgress } from "../../repositories/jobs.ts";
import {
  findJob,
  finishJob,
  insertEvent,
  markRunning,
  NO_PROGRESS,
  queueIfIdle,
  setProgress,
} from "../../repositories/jobs.ts";

export interface JobRunnerDeps {
  readonly db: Db;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly handlers: JobHandlers;
}

export interface JobRunner extends Jobs {
  /** Settles when the worker has no job left to run. */
  idle(): Promise<void>;
}

/** A job's end as the worker reports it: `error` is shown to the user on the job. */
type End = { status: "done" | "cancelled"; error: null } | { status: "failed"; error: string };

const NO_HANDLER = "This kind of job is not available yet.";

export function createJobRunner(deps: JobRunnerDeps): JobRunner {
  const { db, clock, logger } = deps;
  const queued = new Map<string, JobStart>();
  let running = false;
  let drained = Promise.resolve();

  const commit = (...statements: Statement[]) =>
    statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();

  /** Works through the queue; `running` is cleared in the same step that finds it empty, so no wake is lost. */
  async function drain(): Promise<void> {
    try {
      for (let next = queued.entries().next(); !next.done; next = queued.entries().next()) {
        const [id, start] = next.value;
        queued.delete(id);
        await runSafely(id, start);
      }
    } finally {
      running = false;
    }
  }

  async function runSafely(id: string, start: JobStart): Promise<void> {
    const state = { progress: NO_PROGRESS };
    const end = await run(id, start, state).catch((err: unknown): End => {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { jobId: id, type: start.type, error, stack: err instanceof Error ? err.stack : undefined },
        "job failed",
      );
      return { status: "failed", error };
    });
    try {
      await commit(
        finishJob(db, id, { ...end, finishedAt: clock.now(), progress: { ...state.progress, current: null } }),
      );
    } catch (err) {
      logger.error({ jobId: id, error: String(err) }, "job could not be finished");
    }
  }

  /** Runs the job's documents, keeping `state.progress` current so a failure can still record how far it got. */
  async function run(id: string, start: JobStart, state: { progress: JobProgress }): Promise<End> {
    await commit(markRunning(db, id, clock.now()));
    // `JobHandlers` pairs each type with its handler; indexing by a union type loses that pairing.
    const handler = deps.handlers[start.type] as JobHandler | undefined;
    if (handler === undefined) return { status: "failed", error: NO_HANDLER };
    const documents = await handler.documents(start, id);
    state.progress = { ...NO_PROGRESS, total: documents.length, current: documents[0] ?? null };
    await commit(setProgress(db, id, state.progress));
    for (const [i, document] of documents.entries()) {
      if ((await findJob(db, id))?.cancelRequested) return { status: "cancelled", error: null };
      const result = await handler.process(document, start, id);
      const { progress } = state;
      state.progress = {
        ...progress,
        [result.outcome]: progress[result.outcome] + 1,
        current: documents[i + 1] ?? null,
      };
      const event = result.outcome === "done" ? [] : [insertEvent(db, eventFor(id, document, result))];
      await commit(setProgress(db, id, state.progress), ...event);
    }
    return { status: "done", error: null };
  }

  function eventFor(jobId: string, documentKey: string, result: Extract<DocumentResult, { reason: string }>) {
    const level = result.outcome === "skipped" ? ("warn" as const) : ("error" as const);
    return { id: newId(), jobId, at: clock.now(), level, documentKey, message: result.reason };
  }

  return {
    async enqueue(start) {
      const id = newId();
      await commit(queueIfIdle(db, { id, type: start.type, createdAt: clock.now() }));
      const row = await findJob(db, id);
      if (row === null) return null;
      queued.set(id, start);
      if (!running) {
        running = true;
        drained = drain();
      }
      return row;
    },
    idle: () => drained,
  };
}
