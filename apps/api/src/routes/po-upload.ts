// `POST /api/po/upload` (SPEC-08 §2): each BHEL PO file through the ingest service, one result per file.
import type { Handlers } from "../app.ts";
import type { PoIngestService } from "../services/po-ingest.ts";

export const poUploadRoutes = (poIngest: PoIngestService): Handlers => ({
  "po.upload": async ({ body }) => ({ results: await poIngest.upload(body.files) }),
});
