// Background jobs and their events (ARCHITECTURE §7.3).
import { z } from "zod";

import { zJobStatus, zJobType } from "../enums.ts";
import { zCount, zId, zInstant } from "../primitives.ts";

export const zJob = z.object({
  id: zId,
  type: zJobType,
  status: zJobStatus,
  createdAt: zInstant,
  startedAt: zInstant.nullable(),
  finishedAt: zInstant.nullable(),
  cancelRequested: z.boolean(),
  /** Written per document; `current` is the document in progress. */
  progress: z.object({ total: zCount, done: zCount, skipped: zCount, failed: zCount, current: z.string().nullable() }),
  error: z.string().nullable(),
  /** Counts, skipped and failed files, flags by type (§7.4); shaped by the job that writes it. */
  summary: z.record(z.string(), z.unknown()).nullable(),
});

export const zJobEvent = z.object({
  id: zId,
  jobId: zId,
  at: zInstant,
  level: z.enum(["info", "warn", "error"]),
  documentKey: z.string().nullable(),
  message: z.string(),
});
