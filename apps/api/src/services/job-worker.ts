// Runs one queued job (SPEC-08 §4.1, ARCHITECTURE §7.3, INV-98): progress is written per document, skipped and
// failed documents become job events with their reason, and cancel is honoured between documents. Once the job ends,
// its summary is kept in the row (§7.4): the counts, the skipped and failed documents with their reasons, and what the
// handler's `finish` adds. The Jobs adapter decides when a job runs.
import type { Db, Statement } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";

import { newId } from "../ids.ts";
import type { Clock } from "../ports/clock.ts";
import type { DocumentResult, JobHandler, JobHandlers, JobStart, JobSummary } from "../ports/jobs.ts";
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

/** A skipped or failed document as the summary lists it. */
type Issue = { document: string; reason: string };

/** How a job ended; `error` is shown to the user on the job. */
type End = { status: "done" | "cancelled"; error: null } | { status: "failed"; error: string };

const NO_HANDLER = "This kind of job is not available yet.";

/** `runJob(id, start)` never rejects: a failure ends the job as `failed` and is logged. */
export function jobWorker(deps: { db: Db; clock: Clock; logger: Logger; handlers: JobHandlers }) {
  const { db, clock, logger } = deps;
  const commit = (...statements: Statement[]) =>
    statements.reduce((batch, s) => batch.add(s), new WriteBatch(db)).commit();

  return async function runJob(id: string, start: JobStart): Promise<void> {
    // `JobHandlers` pairs each type with its handler; indexing by a union type loses that pairing.
    const handler = deps.handlers[start.type] as JobHandler | undefined;
    let progress = NO_PROGRESS;
    const issues: { skipped: Issue[]; failed: Issue[] } = { skipped: [], failed: [] };
    // `progress` and `issues` follow only committed batches, so a failed job keeps what the database holds.
    const write = async (next: JobProgress, ...rest: Statement[]) => {
      await commit(setProgress(db, id, next), ...rest);
      progress = next;
    };

    async function run(): Promise<End> {
      await commit(markRunning(db, id, clock.now()));
      if (handler === undefined) return { status: "failed", error: NO_HANDLER };
      const documents = await handler.documents(start, id);
      await write({ ...NO_PROGRESS, total: documents.length, current: documents[0]?.label ?? null });
      for (const [i, document] of documents.entries()) {
        if (await isCancelRequested(db, id)) return { status: "cancelled", error: null };
        const result = await handler.process(document.key, start, id);
        const counted = {
          ...progress,
          [result.outcome]: progress[result.outcome] + 1,
          current: documents[i + 1]?.label ?? null,
        };
        if (result.outcome === "done") {
          await write(counted);
        } else {
          await write(counted, insertEvent(db, eventFor(document.label, result)));
          issues[result.outcome].push({ document: document.label, reason: result.reason });
        }
      }
      return { status: "done", error: null };
    }

    /** Logs `err` and returns its message. */
    function logFailure(err: unknown, message: string): string {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        { jobId: id, type: start.type, error, stack: err instanceof Error ? err.stack : undefined },
        message,
      );
      return error;
    }

    /** `null` for a job with no handler; a `finish` that throws leaves its part out. */
    async function summarize(): Promise<JobSummary | null> {
      if (handler === undefined) return null;
      let extra: JobSummary = {};
      try {
        extra = (await handler.finish?.(start, id)) ?? {};
      } catch (err) {
        logFailure(err, "job summary failed");
      }
      const { total, done, skipped, failed } = progress;
      return {
        total,
        done,
        skipped,
        failed,
        skippedDocuments: issues.skipped,
        failedDocuments: issues.failed,
        ...extra,
      };
    }

    function eventFor(documentKey: string, result: Extract<DocumentResult, { reason: string }>) {
      const level = result.outcome === "skipped" ? ("warn" as const) : ("error" as const);
      return { id: newId(), jobId: id, at: clock.now(), level, documentKey, message: result.reason };
    }

    const end = await run().catch((err: unknown): End => ({ status: "failed", error: logFailure(err, "job failed") }));
    const summary = await summarize();
    try {
      const finished = { ...end, finishedAt: clock.now(), progress: { ...progress, current: null }, summary };
      await commit(finishJob(db, id, finished));
    } catch (err) {
      logger.error({ jobId: id, error: String(err) }, "job could not be finished");
    }
  };
}
