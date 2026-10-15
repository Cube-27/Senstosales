// The startup upgrade gate (SPEC-07 §4.2, ARCHITECTURE §13.3, C9, INV-82): the only write startup may make. An
// up-to-date database is only read. An older one is backed up first, then its pending migrations run as one batch,
// so a failure leaves it as it was. A newer one is refused (`planMigrations` throws).
import { join } from "node:path";

import { applyMigrations, type Instant, planMigrations, readSchemaVersion } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";

import { fileStamp } from "../../services/backup.ts";

export interface UpgradeOptions {
  readonly backupsDir: string;
  /** Stamped into `schema_migration`. */
  readonly appVersion: string;
  readonly now: Instant;
}

/** Brings the database to this build's schema version. Throws an `Error` with a plain message for the shell. */
export async function upgradeGate(db: NodeDb, { backupsDir, appVersion, now }: UpgradeOptions): Promise<void> {
  const version = await readSchemaVersion(db);
  const plan = planMigrations(version);
  if (plan.length === 0) return;

  const backup = join(backupsDir, `pre-upgrade-${version}-${fileStamp(now)}.db`);
  try {
    await db.backupTo(backup);
  } catch (err) {
    throw new Error("SenstoSales could not back up its data, so it did not upgrade it. Nothing was changed.", {
      cause: err,
    });
  }
  try {
    await applyMigrations(db, plan, { appVersion, appliedAt: now });
  } catch (err) {
    throw new Error(`SenstoSales could not upgrade its data. Nothing was changed. A copy is in ${backup}.`, {
      cause: err,
    });
  }
}
