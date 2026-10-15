// The node runtime (SPEC-07 §4.2): the data directory, the upgraded database and every service over the node
// adapters, with the in-process job runner. The server serves it over HTTP; the corpus import (SPEC-09) calls the
// services directly, so both run the same wiring.
import { openNodeDb, type NodeDb } from "@senstosales/db/node";

import type { Logger } from "../../ports/logger.ts";
import { folderImportHandlers } from "../../services/folder-import.ts";
import { createServices, type Services } from "../../services/index.ts";
import { jobWorker } from "../../services/job-worker.ts";
import { recomputeAllHandlers } from "../../services/recompute.ts";
import { createClock } from "./clock.ts";
import { prepareDataDir } from "./data-dir.ts";
import { createJobRunner, type JobRunner } from "./job-runner.ts";
import { upgradeGate } from "./startup.ts";
import { createFsStorage } from "./storage-fs.ts";

export interface RuntimeOptions {
  readonly dataDir: string;
  /** Stamped into `schema_migration` by an upgrade. */
  readonly version: string;
  readonly logger: Logger;
}

export interface Runtime {
  readonly db: NodeDb;
  readonly services: Services;
  readonly jobs: JobRunner;
}

/** Opens the database in `dataDir`, upgrading it first if it is older (C9), and builds the services. The caller
 * closes `db`. */
export async function openRuntime({ dataDir, version, logger }: RuntimeOptions): Promise<Runtime> {
  const paths = await prepareDataDir(dataDir);
  const clock = createClock();
  const db = openNodeDb(paths.db);
  try {
    await upgradeGate(db, { backupsDir: paths.backups, appVersion: version, now: clock.now() });
  } catch (err) {
    db.close();
    throw err;
  }
  // The scrape and backup handlers arrive with their PRs (SPEC-19, SPEC-21); until then a start fails plainly. Jobs
  // run only when a user starts one, never at startup (C9).
  const storage = createFsStorage(dataDir);
  const handlers = { ...folderImportHandlers({ db, clock, storage }), ...recomputeAllHandlers({ db, clock }) };
  const jobs = createJobRunner(jobWorker({ db, clock, logger, handlers }));
  return { db, services: createServices({ db, clock, jobs, storage }), jobs };
}
