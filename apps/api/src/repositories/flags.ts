// Reconciliation issue rows (ARCHITECTURE §6.9, §8.2).
import type { Db } from "@senstosales/db";
import { reconciliationIssue } from "@senstosales/db";
import { eq } from "drizzle-orm";

/** The fingerprints of the PO's stored flags, open or acknowledged. */
export const flagFingerprintsOfPo = (db: Db, poId: string) =>
  db.query(
    db.build
      .select({ fingerprint: reconciliationIssue.fingerprint })
      .from(reconciliationIssue)
      .where(eq(reconciliationIssue.poId, poId)),
  );
