// The audit row every write batch carries (ARCHITECTURE §8.2). The actor is always the one user (INV-80); `before`
// and `after` hold changed values and never a secret (INV-81).
import type { Db, Instant, Statement } from "@senstosales/db";
import type { SQL } from "drizzle-orm";

import { newId } from "../ids.ts";
import { insertAudit, listAudit } from "../repositories/audit.ts";

/** The one user (INV-80): every audit row's actor and the login's username. */
export const ACTOR = "admin";

export interface AuditEntry {
  readonly action: string;
  readonly entityType: string;
  /** SQL when the id is resolved inside the batch. */
  readonly entityId: string | SQL<string>;
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
  /** The job whose document made the change. */
  readonly jobId?: string;
}

export const audit = (db: Db, at: Instant, entry: AuditEntry): Statement =>
  insertAudit(db, { id: newId(), at, actor: ACTOR, ...entry });

/** The ledger: the audit log read-only; no route updates, deletes or prunes it (INV-83). */
export const auditService = ({ db }: { db: Db }) => ({
  list: (query: Parameters<typeof listAudit>[1]) => listAudit(db, query),
});

export type AuditService = ReturnType<typeof auditService>;
