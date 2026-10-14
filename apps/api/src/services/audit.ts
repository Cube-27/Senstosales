// The audit row every write batch carries (ARCHITECTURE §8.2). The actor is always the one user (INV-80); `before`
// and `after` hold changed values and never a secret (INV-81).
import type { Db, Instant, Statement } from "@senstosales/db";
import type { SQL } from "drizzle-orm";

import { newId } from "../ids.ts";
import { insertAudit } from "../repositories/audit.ts";

const ACTOR = "admin";

export interface AuditEntry {
  readonly action: string;
  readonly entityType: string;
  /** SQL when the id is resolved inside the batch. */
  readonly entityId: string | SQL<string>;
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
}

export const audit = (db: Db, at: Instant, entry: AuditEntry): Statement =>
  insertAudit(db, { id: newId(), at, actor: ACTOR, ...entry });
