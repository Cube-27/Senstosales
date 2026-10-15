// SPEC-21 PRs 1 and 2: the backup job, rotation on disk and restore, over a real data folder and the online backup
// API. Backups open and pass `PRAGMA integrity_check`; a restore round-trips; it is refused while a job runs and
// takes a safety copy first (INV-103). Synthetic values only (C1).
import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { job, LATEST_VERSION, readSchemaVersion, supplier } from "@senstosales/db";
import { openNodeDb, type NodeDb } from "@senstosales/db/node";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { BackupFiles } from "../../src/ports/backups.ts";
import { createBackupFiles } from "../../src/platform/node/backup-fs.ts";
import { prepareDataDir } from "../../src/platform/node/data-dir.ts";
import { createJobRunner, type JobRunner } from "../../src/platform/node/job-runner.ts";
import { createFsStorage } from "../../src/platform/node/storage-fs.ts";
import { jobsRoutes } from "../../src/routes/jobs.ts";
import { restoreRoutes } from "../../src/routes/restore.ts";
import { backupHandlers, startDailyBackup } from "../../src/services/backup.ts";
import { jobWorker } from "../../src/services/job-worker.ts";
import { jobsService } from "../../src/services/jobs.ts";
import { restoreService } from "../../src/services/restore.ts";
import { gate, json, memoryLogger, testApp } from "../helpers.ts";
import { fixedClock, NOW, SUPPLIER, supplierDb } from "../service-deps.ts";

const TODAY = "daily-2025-06-01.db";
const SAFETY = "safety-20250601T053000Z.db";

let tmp: string;
let backupsDir: string;
let db: NodeDb;
let runner: JobRunner;
const opened: NodeDb[] = [];

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-backup-"));
  const paths = await prepareDataDir(tmp);
  backupsDir = paths.backups;
  db = await supplierDb(paths.db);
});
afterEach(async () => {
  await runner?.idle();
  for (const copy of opened.splice(0)) copy.close();
  db.close();
  await rm(tmp, { recursive: true, force: true });
});

function harness(wrap: (files: BackupFiles) => BackupFiles = (files) => files) {
  const backups = wrap(
    createBackupFiles({ db, dataDir: tmp, storage: createFsStorage(tmp), appVersion: "0.1.0", now: () => NOW }),
  );
  const logger = memoryLogger();
  runner = createJobRunner(
    jobWorker({ db, clock: fixedClock, logger, handlers: backupHandlers({ clock: fixedClock, backups }) }),
  );
  const jobs = jobsService({ db, clock: fixedClock, jobs: runner });
  const restore = restoreService({ db, clock: fixedClock, backups, logger });
  const { send } = testApp({ ...jobsRoutes(jobs), ...restoreRoutes(restore) });
  const daily = () => startDailyBackup({ clock: fixedClock, backups, jobs, logger });
  return { send, daily, logger };
}

const openCopy = (name: string): NodeDb => {
  const copy = openNodeDb(join(backupsDir, name));
  opened.push(copy);
  return copy;
};

const supplierName = async (on: NodeDb) =>
  (await on.query(on.build.select({ name: supplier.name }).from(supplier)))[0]?.name;

const rename = (name: string) => db.batch([db.build.update(supplier).set({ name }).where(eq(supplier.id, SUPPLIER))]);

const backupNow = async (send: ReturnType<typeof harness>["send"]) => {
  const res = await send("/api/jobs", json("POST", { type: "backup" }));
  await runner.idle();
  return res;
};

const restore = (send: ReturnType<typeof harness>["send"], name: string) =>
  send("/api/backups/restore", json("POST", { name }));

describe("the backup job", () => {
  it("makes today's daily backup on first launch, which opens, passes integrity_check and holds the data", async () => {
    const { daily } = harness();
    await daily();
    await runner.idle();

    expect(await readdir(backupsDir)).toEqual([TODAY]);
    const copy = openCopy(TODAY);
    expect(await copy.query(copy.build.values(sql`PRAGMA integrity_check`))).toEqual([["ok"]]);
    expect(await supplierName(copy)).toBe("Example Supplier");
    const [row] = await db.query(db.build.select({ type: job.type, status: job.status }).from(job));
    expect(row).toEqual({ type: "backup", status: "done" });
  });

  it("does not start a second backup on a later launch the same day", async () => {
    const { daily } = harness();
    await daily();
    await runner.idle();
    await daily();
    await runner.idle();

    expect(await db.query(db.build.select({ id: job.id }).from(job))).toHaveLength(1);
  });

  it("skips the daily backup when a job left by an earlier run blocks it, and logs why (EC-28)", async () => {
    await db.batch([
      db.build.insert(job).values({
        id: "J1",
        type: "recompute-all",
        status: "running",
        createdAt: NOW,
        cancelRequested: false,
        progress: { total: 0, done: 0, skipped: 0, failed: 0, current: null },
      }),
    ]);
    const { daily, logger } = harness();
    await daily();

    expect(await readdir(backupsDir)).toEqual([]);
    expect(logger.lines.map((line) => line.message)).toEqual(["daily backup not started"]);
  });

  it("Backup now replaces today's copy with the current data", async () => {
    const { send } = harness();
    expect((await backupNow(send)).status).toBe(200);
    await rename("Renamed Supplier");
    await backupNow(send);

    expect(await readdir(backupsDir)).toEqual([TODAY]);
    expect(await supplierName(openCopy(TODAY))).toBe("Renamed Supplier");
  });

  it("rotates after the backup: 14 daily and the monthly copies stay, pre-upgrade copies survive", async () => {
    const old = [
      "daily-2025-04-30.db",
      ...Array.from({ length: 15 }, (_, i) => `daily-2025-05-${String(i + 10).padStart(2, "0")}.db`),
      "pre-upgrade-3-20250101T053000Z.db",
    ];
    for (const name of old) await writeFile(join(backupsDir, name), "");
    const { send } = harness();
    await backupNow(send);

    // Newest 14: 2025-05-12..24 and today; monthly: today (June), 2025-05-24 (May), 2025-04-30 (April).
    expect(await readdir(backupsDir)).toEqual([
      "daily-2025-04-30.db",
      ...Array.from({ length: 13 }, (_, i) => `daily-2025-05-${String(i + 12)}.db`),
      TODAY,
      "pre-upgrade-3-20250101T053000Z.db",
    ]);
  });
});

describe("restore", () => {
  it("lists the backups newest first, with their kind", async () => {
    for (const name of ["daily-2025-05-31.db", "pre-upgrade-2-20250530T053000Z.db", "notes.txt", SAFETY]) {
      await writeFile(join(backupsDir, name), "");
    }
    const { send } = harness();
    const res = await send("/api/backups");

    expect(await res.json()).toEqual([
      { name: SAFETY, kind: "safety" },
      { name: "daily-2025-05-31.db", kind: "daily" },
      { name: "pre-upgrade-2-20250530T053000Z.db", kind: "pre-upgrade" },
    ]);
  });

  it("round-trips: write, back up, change, restore, read the original; the safety copy holds the change", async () => {
    const { send } = harness();
    await backupNow(send);
    await rename("Changed Supplier");

    const res = await restore(send, TODAY);

    expect(await res.json()).toEqual({ restored: TODAY, safety: SAFETY });
    expect(await supplierName(db)).toBe("Example Supplier");
    expect(await supplierName(openCopy(SAFETY))).toBe("Changed Supplier");
  });

  it("ends the backup job the restored copy still shows as running, so a new job can start (EC-28)", async () => {
    const { send } = harness();
    await backupNow(send);
    await restore(send, TODAY);

    const rows = await db.query(db.build.select({ status: job.status, finishedAt: job.finishedAt }).from(job));
    expect(rows).toEqual([{ status: "cancelled", finishedAt: NOW }]);
    expect((await backupNow(send)).status).toBe(200);
  });

  it("is refused while a job runs, and changes nothing", async () => {
    const { send } = harness();
    await backupNow(send);
    const hold = gate();
    const slow = harness((files) => ({
      ...files,
      create: async (name) => {
        await hold.opened;
        return files.create(name);
      },
    }));
    await slow.send("/api/jobs", json("POST", { type: "backup" }));

    const res = await restore(slow.send, TODAY);
    hold.open();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "job-running",
      message: "A job is running. Wait for it to finish, then restore.",
    });
    await runner.idle();
    expect(await readdir(backupsDir)).toEqual([TODAY]);
  });

  it.each(["daily-2025-01-01.db", "../db/senstosales.db", "notes.txt"])("answers 404 to %s", async (name) => {
    await writeFile(join(backupsDir, "notes.txt"), "");
    const { send } = harness();
    const res = await restore(send, name);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "backup-not-found", message: "This backup was not found." });
  });

  it("upgrades a restored backup from an older schema version", async () => {
    const empty = openNodeDb(join(backupsDir, "pre-upgrade-0-20250101T053000Z.db"));
    await empty.query(empty.build.values(sql`PRAGMA user_version`));
    empty.close();
    const { send } = harness();

    expect((await restore(send, "pre-upgrade-0-20250101T053000Z.db")).status).toBe(200);
    expect(await readSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(await supplierName(db)).toBeUndefined();
  });

  it("refuses a backup from a newer version, or a damaged one, without touching the data", async () => {
    const { send } = harness();
    await backupNow(send);
    await copyFile(join(backupsDir, TODAY), join(backupsDir, "daily-2025-05-31.db"));
    const newer = openCopy("daily-2025-05-31.db");
    await newer.batch([newer.build.run(sql`UPDATE schema_migration SET version = version + 100`)]);
    await writeFile(join(backupsDir, "daily-2025-05-30.db"), "not a database");
    await rename("Current Supplier");

    const refused = [await restore(send, "daily-2025-05-31.db"), await restore(send, "daily-2025-05-30.db")];

    expect(await Promise.all(refused.map((res) => res.json()))).toEqual([
      {
        code: "backup-unusable",
        message: "This backup was made by a newer version of SenstoSales. Update the app first.",
      },
      { code: "backup-unusable", message: "This backup is damaged and cannot be restored. Choose another one." },
    ]);
    expect(refused.map((res) => res.status)).toEqual([400, 400]);
    expect(await supplierName(db)).toBe("Current Supplier");
  });

  it("says where the safety copy is when the copy fails part way", async () => {
    const { send } = harness((files) => ({
      ...files,
      restore: () => Promise.reject(new Error("disk full")),
    }));
    await backupNow(send);
    const res = await restore(send, TODAY);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      code: "restore-failed",
      message: `The restore did not finish. Your data from before the restore is saved as backup ${SAFETY}.`,
    });
    expect(await readdir(backupsDir)).toEqual([TODAY, SAFETY]);
  });
});
