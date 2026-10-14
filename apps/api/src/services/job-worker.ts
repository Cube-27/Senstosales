// Runs one queued job (SPEC-08 §4.1, ARCHITECTURE §7.3, INV-98): progress is written per document, skipped and
// failed documents become job events with their reason, and cancel is honoured between documents. The Jobs adapter
// decides when a job runs.
import type { Db, Statement } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";

import { newId } from "../ids.ts";
import type { Clock } from "../ports/clock.ts";
import type { DocumentResult, JobHandler, JobHandlers, JobStart } from "../ports/jobs.ts";
import type { Logger } from "../ports/logger.ts";
import type { JobProgress } from "../repositories/jobs.ts";
import {
  finishJob,
  insertEvent,
  isCancelRequested,
  markRunning,
  NO_PROGRESS,
  setProgress,
} from "../repositories/jobs.ts";

/** How a job ended; `error` is shown to the user on the job. */
type End = { status: "done" | "cancelled"; error: null } | { status: "failed"; error: string };

const NO_HANDLER = "This kind of job is not available yet.";

/** `runJob(id, start)` never rejects: a failure ends the job as `failed` and is logged. */
export function jobWorker(deps: { db: Db; clock: Clock; logger: Logger; handlers: JobHandlers }) {
  const { db, clock, logger } = deps;
  const commit = (...statements: Statement[]) =>
    statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();

  return async function runJob(id: string, start: JobStart): Promise<void> {
    let progress = NO_PROGRESS;
    // `progress` follows only committed batches, so a failed job keeps the counts the database holds.
    const write = async (next: JobProgress, ...rest: Statement[]) => {
      await commit(setProgress(db, id, next), ...rest);
      progress = next;
    };

    async function run(): Promise<End> {
      await commit(markRunning(db, id, clock.now()));
      // `JobHandlers` pairs each type with its handler; indexing by a union type loses that pairing.
      const handler = deps.handlers[start.type] as JobHandler | undefined;
      if (handler === undefined) return { status: "failed", error: NO_HANDLER };
      const documents = await handler.documents(start, id);
      await write({ ...NO_PROGRESS, total: documents.length, current: documents[0] ?? null });
      for (const [i, document] of documents.entries()) {
        if (await isCancelRequested(db, id)) return { status: "cancelled", error: null };
        const result = await handler.process(document, start, id);
        const counted = {
          ...progress,
          [result.outcome]: progress[result.outcome] + 1,
          current: documents[i + 1] ?? null,
        };
        await write(counted, ...(result.outcome === "done" ? [] : [insertEvent(db, eventFor(document, result))]));
      }
      return { status: "done", error: null };
    }

    function eventFor(documentKey: string, result: Extract<DocumentResult, { reason: string }>) {
      const level = result.outcome === "skipped" ? ("warn" as const) : ("error" as const);
      return { id: newId(), jobId: id, at: clock.now(), level, documentKey, message: result.reason };
    }

    const end = await run().catch((err: unknown): End => {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { jobId: id, type: start.type, error, stack: err instanceof Error ? err.stack : undefined },
        "job failed",
      );
      return { status: "failed", error };
    });
    try {
      await commit(finishJob(db, id, { ...end, finishedAt: clock.now(), progress: { ...progress, current: null } }));
    } catch (err) {
      logger.error({ jobId: id, error: String(err) }, "job could not be finished");
    }
  };
}
