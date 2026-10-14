// Folder import (SPEC-08 §2, ARCHITECTURE §7.4, A-6): the web side reads the chosen folder and stages its files
// through `POST /api/jobs/staging`; a `po.import-folder` or `srv.import-folder` job then ingests the staged files one
// by one through the upload's ingest service, each file its own batch (INV-50). Older files are skipped and broken
// ones fail, each as a job event (INV-44); the other files still commit. Staged files live in `Storage` under
// `staging/<stagingId>/<kind>/`, keyed by the server, never by a request (C17), and are deleted once the job ends. The
// summary keeps the counts, the skipped and failed files with reasons, and the flags the import raised, by type.
import type { Db, Instant } from "@senstosales/db";
import { reconciliationIssue } from "@senstosales/db";
import type { RouteInput, RouteOutput } from "@senstosales/schemas";
import { count, gte } from "drizzle-orm";
import { z } from "zod";

import { newId } from "../ids.ts";
import type { DocumentResult, JobDocument, JobHandler, JobHandlers, JobStart, JobSummary } from "../ports/jobs.ts";
import { findJob, jobEvents } from "../repositories/jobs.ts";
import type { FileResult, UploadFile } from "./po-ingest.ts";
import { ingestPoFile } from "./po-ingest.ts";
import type { IngestContext, SourceDocumentDeps } from "./source-documents.ts";
import { ingestContext } from "./source-documents.ts";

type Kind = RouteInput<"jobs.stage">["body"]["kind"];
type IngestFile = (deps: SourceDocumentDeps, file: UploadFile, ctx: IngestContext) => Promise<FileResult>;

/** A staged file as stored: the name the folder gave it and its page. */
const zStagedFile = z.object({ name: z.string(), html: z.string() });

const folderOf = (stagingId: string, kind: Kind) => `staging/${stagingId}/${kind}/`;

export const folderImportService = (deps: SourceDocumentDeps) => ({
  /** Adds files to a staging area, a new one when `stagingId` is absent; answers how many files it now holds. */
  async stage(body: RouteInput<"jobs.stage">["body"]): Promise<RouteOutput<"jobs.stage">> {
    const stagingId = body.stagingId ?? newId();
    const folder = folderOf(stagingId, body.kind);
    // Ids count up in the order they are made (D-0163), so the job reads the files in the order they were staged.
    for (const { name, html } of body.files) {
      await deps.storage.put(`${folder}${newId()}.json`, new TextEncoder().encode(JSON.stringify({ name, html })));
    }
    return { stagingId, count: (await deps.storage.list(folder)).length };
  },
});

export type FolderImportService = ReturnType<typeof folderImportService>;

/** The handlers of both folder-import job types. */
export function folderImportHandlers(deps: SourceDocumentDeps): JobHandlers {
  return {
    "po.import-folder": folderImportHandler(deps, "po", ingestPoFile),
  };
}

type FolderStart = Extract<JobStart, { stagingId: string }>;

function folderImportHandler<S extends FolderStart>(
  deps: SourceDocumentDeps,
  kind: Kind,
  ingest: IngestFile,
): JobHandler<S> {
  const { storage } = deps;
  const read = async (key: string) => {
    const bytes = await storage.get(key);
    if (bytes === null) throw new Error("A staged file is missing. Upload the folder again.");
    return zStagedFile.parse(JSON.parse(new TextDecoder().decode(bytes)));
  };

  return {
    async documents({ stagingId }): Promise<JobDocument[]> {
      const keys = await storage.list(folderOf(stagingId, kind));
      if (keys.length === 0) throw new Error("No files were uploaded for this import. Choose the folder again.");
      const documents: JobDocument[] = [];
      for (const key of keys) documents.push({ key, label: (await read(key)).name });
      return documents;
    },

    async process(key, _start, jobId): Promise<DocumentResult> {
      const result = await ingest(deps, await read(key), await ingestContext(deps.db, jobId));
      return result.status === "accepted"
        ? { outcome: "done" }
        : { outcome: result.status, reason: result.reason ?? "" };
    },

    async finish({ stagingId }, jobId): Promise<JobSummary> {
      for (const key of await storage.list(folderOf(stagingId, kind))) await storage.delete(key);
      return summarize(deps.db, jobId);
    },
  };
}

/**
 * Counts, the skipped and failed files with their reasons (the job's events), and the flags opened since the job
 * started; one job runs at a time (INV-98), so those are the import's own, bar any a user raised meanwhile.
 */
async function summarize(db: Db, jobId: string): Promise<JobSummary> {
  const row = await findJob(db, jobId);
  if (row === null) throw new Error(`Job ${jobId} is missing.`);
  const { total, done, skipped, failed } = row.progress;
  const events = await jobEvents(db, jobId);
  const files = (level: "warn" | "error") =>
    events.filter((e) => e.level === level).map((e) => ({ file: e.documentKey, reason: e.message }));
  const flags = row.startedAt === null ? [] : await flagsSince(db, row.startedAt);
  return {
    total,
    done,
    skipped,
    failed,
    skippedFiles: files("warn"),
    failedFiles: files("error"),
    flags: Object.fromEntries(flags.map((f) => [f.type, f.count])),
  };
}

function flagsSince(db: Db, since: Instant) {
  return db.query(
    db.build
      .select({ type: reconciliationIssue.type, count: count() })
      .from(reconciliationIssue)
      .where(gte(reconciliationIssue.openedAt, since))
      .groupBy(reconciliationIssue.type)
      .orderBy(reconciliationIssue.type),
  );
}
