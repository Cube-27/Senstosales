// The job API (SPEC-08 §2): start, list, detail with events, cancel, and the staging upload of a folder import.
import type { Handlers } from "../app.ts";
import type { FolderImportService } from "../services/folder-import.ts";
import type { JobsService } from "../services/jobs.ts";

export function jobsRoutes(jobs: JobsService) {
  return {
    "jobs.start": ({ body }) => jobs.start(body),
    "jobs.list": ({ query }) => jobs.list(query),
    "jobs.detail": ({ params }) => jobs.detail(params.id),
    "jobs.cancel": ({ params }) => jobs.cancel(params.id),
  } satisfies Handlers;
}

export const jobStagingRoutes = (folderImport: FolderImportService) =>
  ({ "jobs.stage": ({ body }) => folderImport.stage(body) }) satisfies Handlers;
