// Reconciliation issue rows (ARCHITECTURE §6.9, §8.2).
import type { Db, Instant } from "@senstosales/db";
import { reconciliationIssue } from "@senstosales/db";
import { count, eq, gte } from "drizzle-orm";

/** The fingerprints of the PO's stored flags, open or acknowledged. */
export const flagFingerprintsOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({ fingerprint: reconciliationIssue.fingerprint })
      .from(reconciliationIssue)
      .where(eq(reconciliationIssue.poId, poId)),
  );

/** How many flags of each type were opened at or after `since`, by type. */
export const flagCountsSince = (db: Db, since: Instant) =>
  db.query(
    db.build
      .select({ type: reconciliationIssue.type, count: count() })
      .from(reconciliationIssue)
      .where(gte(reconciliationIssue.openedAt, since))
      .groupBy(reconciliationIssue.type)
      .orderBy(reconciliationIssue.type),
  );
