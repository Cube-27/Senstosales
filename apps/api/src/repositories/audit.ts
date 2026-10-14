// The audit row each write batch carries (ARCHITECTURE §8.2): append-only, never a secret (INV-81, INV-83).
import { auditLog, type Db, type Statement } from "@senstosales/db";

export const insertAudit = (db: Db, entry: typeof auditLog.$inferInsert): Statement =>
  db.build.insert(auditLog).values(entry);
