// Deviations (flags) and the audit ledger (SPEC-10). Acknowledging changes no business data (INV-59); the audit log
// is read-only (INV-83).
import { z } from "zod";

import { zFlag } from "../entities/flag.ts";
import { zFlagStatus, zFlagType } from "../enums.ts";
import { zCount, zId } from "../primitives.ts";
import { zDateRange, zListQuery } from "./common.ts";

export const zFlagListQuery = zListQuery(["openedAt", "type", "status", "poNumber"], {
  q: z.string().optional(),
  type: zFlagType.optional(),
  status: zFlagStatus.optional(),
  poId: zId.optional(),
});

export const zFlagRow = zFlag.extend({ poNumber: z.string() });

/** The open count for the dashboard and nav (INV-60), and open flags by type. */
export const zFlagStats = z.object({ open: zCount, openByType: z.record(zFlagType, zCount) });

export const zAcknowledgeBody = z.object({ note: z.string().nullable() });

export const zAuditListQuery = zListQuery(["at", "entityType", "action"], {
  q: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  ...zDateRange,
});
