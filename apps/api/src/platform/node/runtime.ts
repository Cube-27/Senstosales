// The node runtime (SPEC-07 §4.2): the data directory, the upgraded database and every service over the node
// adapters, with the in-process job runner. The server serves it over HTTP; the corpus import (SPEC-09) calls the
// services directly, so both run the same wiring.
import { openNodeDb, type NodeDb } from "@senstosales/db/node";
import { createSessions, type Scraper } from "@senstosales/scraper";

import pkg from "../../../package.json" with { type: "json" };
import type { Logger } from "../../ports/logger.ts";
import { bhelScrapeHandlers } from "../../services/bhel-sync.ts";
import { backupHandlers, startDailyBackup } from "../../services/backup.ts";
import { folderImportHandlers } from "../../services/folder-import.ts";
import { createServices, type Services } from "../../services/index.ts";
import { jobWorker } from "../../services/job-worker.ts";
import { recomputeAllHandlers } from "../../services/recompute.ts";
import { restoreService, type RestoreService } from "../../services/restore.ts";
import { createBackupFiles } from "./backup-fs.ts";
import { createClock } from "./clock.ts";
import { prepareDataDir } from "./data-dir.ts";
import { createJobRunner, type JobRunner } from "./job-runner.ts";
import { upgradeGate } from "./startup.ts";
import { createFsStorage } from "./storage-fs.ts";

export interface RuntimeOptions {
  readonly dataDir: string;
  /** Stamped into `schema_migration` by an upgrade; this package's version unless given. */
  readonly version?: string;
  readonly logger: Logger;
  /** The BHEL portal adapter; without one, BHEL sync is not offered. */
  readonly scraper?: Scraper;
}

/** How often open scraper sessions are checked for the 15-minute idle close (INV-100). */
const IDLE_SWEEP_MS = 60_000;

export interface Runtime {
  readonly db: NodeDb;
  readonly services: Services;
  readonly jobs: JobRunner;
  /** At exit: closes every scraper session (INV-100), then `db`. */
  close(): Promise<void>;
  readonly restore: RestoreService;
  /** Starts today's backup unless it exists (SPEC-21). The caller runs it once the app serves, never during
   * startup (C9). */
  startDailyBackup(): Promise<void>;
}

/** Opens the database in `dataDir`, upgrading it first if it is older (C9), and builds the services. The caller
 * runs `close` (or closes `db` when it opened no scraper session). */
export async function openRuntime({
  dataDir,
  version = pkg.version,
  logger,
  scraper,
}: RuntimeOptions): Promise<Runtime> {
  const paths = await prepareDataDir(dataDir);
  const clock = createClock();
  const db = openNodeDb(paths.db);
  try {
    await upgradeGate(db, { backupsDir: paths.backups, appVersion: version, now: clock.now() });
  } catch (err) {
    db.close();
    throw err;
  }
  // Jobs run only when a user starts one or once the app serves (the daily backup), never at startup (C9).
  const storage = createFsStorage(dataDir);
  const bhel = scraper && { scraper, sessions: createSessions(clock) };
  const backups = createBackupFiles({ db, dataDir, storage, appVersion: version, now: clock.now });
  const handlers = {
    ...folderImportHandlers({ db, clock, storage }),
    ...recomputeAllHandlers({ db, clock }),
    ...(bhel && bhelScrapeHandlers({ db, clock, storage, ...bhel })),
    ...backupHandlers({ clock, backups }),
  };
  const jobs = createJobRunner(jobWorker({ db, clock, logger, handlers }));
  // `unref`: the sweep never keeps the process alive on its own.
  const sweep = bhel && setInterval(() => void bhel.sessions.closeIdle(), IDLE_SWEEP_MS).unref();
  const close = async () => {
    clearInterval(sweep);
    try {
      await bhel?.sessions.closeAll();
    } finally {
      db.close();
    }
  };
  const services = createServices({ db, clock, jobs, storage, ...(bhel && { bhel }) });
  return {
    db,
    services,
    jobs,
    close,
    restore: restoreService({ db, clock, backups, logger, supplierId: services.supplierId }),
    startDailyBackup: () => startDailyBackup({ clock, backups, jobs: services.jobs, logger }),
  };
}
