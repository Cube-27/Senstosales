// Folder import (SPEC-08 §2, ARCHITECTURE §7.4, A-6): the web side reads the chosen folder and stages its files
// through `POST /api/jobs/staging`; a `po.import-folder` or `srv.import-folder` job then ingests the staged files one
// by one through the upload's ingest service, each file its own batch (INV-50). Older files are skipped and broken
// ones fail, each as a job event (INV-44); the other files still commit. Staged files live in `Storage` under
// `staging/<stagingId>/<kind>/`, keyed by the server, never by a request (C17), and are deleted once the job ends. The
// job's summary adds the flags the import raised, by type, to the worker's counts and skipped and failed files.
import type { RouteInput, RouteOutput } from "@senstosales/schemas";
import { z } from "zod";

import { newId } from "../ids.ts";
import type { DocumentResult, JobDocument, JobHandler, JobHandlers, JobStart, JobSummary } from "../ports/jobs.ts";
import { flagCountsSince } from "../repositories/flags.ts";
import { findJob } from "../repositories/jobs.ts";
import type { FileResult, UploadFile } from "./po-ingest.ts";
import { ingestPoFile } from "./po-ingest.ts";
import { ingestSrvFile } from "./srv-ingest.ts";
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
    "srv.import-folder": folderImportHandler(deps, "srv", ingestSrvFile),
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

    /** Deletes the staged files and adds the flags the import opened, by type. */
    async finish({ stagingId }, jobId): Promise<JobSummary> {
      for (const key of await storage.list(folderOf(stagingId, kind))) await storage.delete(key);
      // One job runs at a time (INV-98), so the flags opened since it started are the import's own, bar any a user
      // raised meanwhile.
      const startedAt = (await findJob(deps.db, jobId))?.startedAt ?? null;
      const flags = startedAt === null ? [] : await flagCountsSince(deps.db, startedAt);
      return { flags: Object.fromEntries(flags.map((f) => [f.type, f.count])) };
    },
  };
}
