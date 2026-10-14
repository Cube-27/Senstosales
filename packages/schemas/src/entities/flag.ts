// A reconciliation issue (`reconciliation_issue`, ARCHITECTURE §6.9). Detection and the fingerprint belong to the
// domain and the service batch; the fingerprint is storage only and not in the shape.
import { FLAG_SCOPES } from "@senstosales/domain";
import { z } from "zod";

import { zFlagStatus, zFlagType } from "../enums.ts";
import { zId, zInstant } from "../primitives.ts";

export const zFlag = z.object({
  id: zId,
  type: zFlagType,
  scopeType: z.enum(FLAG_SCOPES),
  scopeId: zId,
  poId: zId,
  /** The domain's `FlagDetails`: quantities as decimal strings. */
  details: z.object({
    field: z.string(),
    expected: z.string().nullable(),
    actual: z.string(),
    docIds: z.array(zId).readonly(),
  }),
  status: zFlagStatus,
  note: z.string().nullable(),
  openedAt: zInstant,
  acknowledgedAt: zInstant.nullable(),
});
