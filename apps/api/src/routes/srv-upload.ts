// `POST /api/srv/upload` (SPEC-08 §2): each BHEL SRV file through the ingest service, one result per file.
import type { Handlers } from "../app.ts";
import type { SrvIngestService } from "../services/srv-ingest.ts";

export const srvUploadRoutes = (srvIngest: SrvIngestService): Handlers => ({
  "srv.upload": async ({ body }) => ({ results: await srvIngest.upload(body.files) }),
});
