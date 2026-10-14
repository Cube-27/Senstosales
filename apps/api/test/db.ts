import type { Instant } from "@senstosales/db";
import { applyMigrations, planMigrations, readSchemaVersion } from "@senstosales/db";
import { openNodeDb, type NodeDb } from "@senstosales/db/node";

/** A database at `path` migrated to the latest schema version; the caller closes it. */
export async function migratedDb(path = ":memory:"): Promise<NodeDb> {
  const db = openNodeDb(path);
  await applyMigrations(db, planMigrations(await readSchemaVersion(db)), {
    appVersion: "0.1.0",
    appliedAt: "2025-04-01T05:30:00.000Z" as Instant,
  });
  return db;
}
