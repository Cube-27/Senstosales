// Health (INV-105): what the shell and the support screen read to know which build and schema are running and whether
// a job is busy.
import type { Db } from "@senstosales/db";
import { readSchemaVersion } from "@senstosales/db";

import { findActiveJob } from "../repositories/jobs.ts";

export interface HealthDeps {
  /** The app version from the `VERSION` file, as stamped into `package.json` (INV-105). */
  readonly version: string;
  readonly db: Db;
}

export async function getHealth({ version, db }: HealthDeps) {
  return { version, schemaVersion: await readSchemaVersion(db), job: await findActiveJob(db) };
}
