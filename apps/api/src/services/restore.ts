// List and restore backups (SPEC-21 §2, ARCHITECTURE §13.3). A restore is refused while a job runs, takes a safety
// copy of the current data first, then copies the chosen backup into the live database. The desktop shell reloads
// the app afterwards (SPEC-20).
import type { Db } from "@senstosales/db";
import { WriteBatch } from "@senstosales/db";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import { AppError, ConflictError, NotFoundError, OperationFailedError } from "../errors.ts";
import type { BackupFiles } from "../ports/backups.ts";
import type { Clock } from "../ports/clock.ts";
import type { Logger } from "../ports/logger.ts";
import { activeJobs, cancelOrphan, findActiveJob } from "../repositories/jobs.ts";
import { parseBackupName, safetyBackupName } from "./backup.ts";
import type { SupplierRef } from "./supplier.ts";

type Backup = z.output<(typeof routes)["backups.list"]["response"]>[number];

export interface RestoreDeps {
  readonly db: Db;
  readonly clock: Clock;
  readonly backups: BackupFiles;
  readonly logger: Logger;
  /** Forgotten after a restore: the restored data may hold another supplier, or none (N-RESTORE). */
  readonly supplierId: SupplierRef;
}

export function restoreService({ db, clock, backups, logger, supplierId }: RestoreDeps) {
  /** The backups, newest first. */
  async function list(): Promise<Backup[]> {
    const parsed = (await backups.list()).flatMap((name) => {
      const backup = parseBackupName(name);
      return backup === null ? [] : [{ name, ...backup }];
    });
    return parsed.toSorted((a, b) => (a.stamp < b.stamp ? 1 : -1)).map(({ name, kind }) => ({ name, kind }));
  }

  /** A job row the backup holds as queued or running has no process to run it (EC-28): it ends as cancelled. */
  async function endRestoredJobs(): Promise<void> {
    const finishedAt = clock.now();
    const rows = await activeJobs(db);
    await rows.reduce((batch, row) => batch.add(cancelOrphan(db, row, finishedAt)), new WriteBatch(db)).commit();
  }

  /** Logs `err` and returns the error the user sees. */
  function failed(err: unknown, message: string): OperationFailedError {
    logger.error({ error: String(err), stack: err instanceof Error ? err.stack : undefined }, "restore failed");
    return new OperationFailedError("restore-failed", message);
  }

  async function restore(name: string): Promise<{ restored: string; safety: string }> {
    if ((await findActiveJob(db)) !== null) {
      throw new ConflictError("job-running", "A job is running. Wait for it to finish, then restore.");
    }
    if (parseBackupName(name) === null || !(await backups.list()).includes(name)) {
      throw new NotFoundError("backup-not-found", "This backup was not found.");
    }
    const safety = safetyBackupName(clock.now());
    try {
      await backups.create(safety);
    } catch (err) {
      throw failed(
        err,
        "SenstoSales could not save a copy of your current data, so it did not restore. Nothing was changed.",
      );
    }
    try {
      await backups.restore(name);
      supplierId.forget();
      await endRestoredJobs();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw failed(err, `The restore did not finish. Your data from before the restore is saved as backup ${safety}.`);
    }
    return { restored: name, safety };
  }

  return { list, restore };
}

export type RestoreService = ReturnType<typeof restoreService>;
