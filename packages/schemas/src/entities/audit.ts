// One `audit_log` row per write batch; read-only through the API and kept forever (INV-83).
import { z } from "zod";

import { zId, zInstant } from "../primitives.ts";

const zSnapshot = z.record(z.string(), z.unknown()).nullable();

export const zAuditEntry = z.object({
  id: zId,
  at: zInstant,
  actor: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  /** The changed values before and after; never a secret (INV-81). */
  before: zSnapshot,
  after: zSnapshot,
  jobId: zId.nullable(),
});
