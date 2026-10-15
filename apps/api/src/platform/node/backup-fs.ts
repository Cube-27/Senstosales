// The BackupFiles port on the local file system (SPEC-21 §4): copies of the live database under `backups/` in the
// data directory, made and restored with SQLite's online backup API. Listing and deleting go through Storage, which
// refuses any name that could leave the folder (INV-96, C17).
import { rename } from "node:fs/promises";
import { join } from "node:path";

import { type Instant, LATEST_VERSION, readSchemaVersion } from "@senstosales/db";
import { openNodeDb, type NodeDb } from "@senstosales/db/node";
import { sql } from "drizzle-orm";

import { ValidationError } from "../../errors.ts";
import type { BackupFiles } from "../../ports/backups.ts";
import type { Storage } from "../../ports/storage.ts";
import { upgradeGate } from "./startup.ts";

const FOLDER = "backups";
const PLAIN_NAME = /^[\w.-]+$/;

export interface BackupFsDeps {
  readonly db: NodeDb;
  /** The data directory; Storage is rooted there too. */
  readonly dataDir: string;
  readonly storage: Storage;
  /** Stamped into `schema_migration` when a restored backup is upgraded. */
  readonly appVersion: string;
  readonly now: () => Instant;
}

const unusable = (message: string) => new ValidationError("backup-unusable", message);

/** Whether the copy at `path` is undamaged, and its schema version. */
async function inspect(path: string): Promise<{ ok: boolean; version: number }> {
  const copy = openNodeDb(path);
  try {
    const [row] = await copy.query(copy.build.values<[string]>(sql`PRAGMA integrity_check`));
    return { ok: row?.[0] === "ok", version: await readSchemaVersion(copy) };
  } finally {
    copy.close();
  }
}

export function createBackupFiles({ db, dataDir, storage, appVersion, now }: BackupFsDeps): BackupFiles {
  const pathOf = (name: string): string => {
    if (!PLAIN_NAME.test(name) || name.startsWith(".")) throw new Error(`Backup name not allowed: ${name}`);
    return join(dataDir, FOLDER, name);
  };

  return {
    list: async () => (await storage.list(`${FOLDER}/`)).map((key) => key.slice(FOLDER.length + 1)),

    async create(name) {
      const path = pathOf(name);
      await db.backupTo(`${path}.partial`);
      await rename(`${path}.partial`, path);
    },

    delete: (name) => storage.delete(`${FOLDER}/${name}`),

    async restore(name) {
      const path = pathOf(name);
      const { ok, version } = await inspect(path).catch(() => ({ ok: false, version: 0 }));
      if (!ok) throw unusable("This backup is damaged and cannot be restored. Choose another one.");
      if (version > LATEST_VERSION) {
        throw unusable("This backup was made by a newer version of SenstoSales. Update the app first.");
      }
      await db.restoreFrom(path);
      await upgradeGate(db, { backupsDir: join(dataDir, FOLDER), appVersion, now: now() });
    },
  };
}
