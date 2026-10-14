// `POST /api/po/upload` (SPEC-08 §2): each BHEL PO file through the ingest service, one result per file.
import type { Handlers } from "../app.ts";
import type { PoIngestDeps } from "../services/po-ingest.ts";
import { uploadPoFiles } from "../services/po-ingest.ts";

export const poUploadRoutes = (deps: PoIngestDeps): Handlers => ({
  "po.upload": async ({ body }) => ({ results: await uploadPoFiles(deps, body.files) }),
});
