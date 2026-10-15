// Backups (SPEC-21 §2, ARCHITECTURE §13.3, INV-103): the `backup` job copies the database to `daily-<date>.db` on the
// first launch of each day and on Backup now, then rotates the daily copies. Pre-upgrade copies (SPEC-07) and the
// safety copy a restore takes first have their own names and are never rotated away.
import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import type { routes } from "@senstosales/schemas";
import type { z } from "zod";

import type { BackupFiles } from "../ports/backups.ts";
import type { Clock } from "../ports/clock.ts";
import type { JobHandlers } from "../ports/jobs.ts";
import type { Logger } from "../ports/logger.ts";
import type { JobsService } from "./jobs.ts";

const KEEP_DAILY = 14;
const KEEP_MONTHLY = 12;

export type BackupKind = z.output<(typeof routes)["backups.list"]["response"]>[number]["kind"];

const NAMES: readonly [BackupKind, RegExp][] = [
  ["daily", /^daily-(\d{4}-\d{2}-\d{2})\.db$/],
  ["pre-upgrade", /^pre-upgrade-\d+-(\d{8}T\d{6}Z)\.db$/],
  ["safety", /^safety-(\d{8}T\d{6}Z)\.db$/],
];

/** A backup file's kind and its sortable date or stamp; `null` for any other file. */
export function parseBackupName(name: string): { kind: BackupKind; stamp: string } | null {
  for (const [kind, pattern] of NAMES) {
    const stamp = pattern.exec(name)?.[1];
    if (stamp !== undefined) return { kind, stamp: stamp.replaceAll("-", "") };
  }
  return null;
}

/** `2025-04-01T05:30:00.000Z` → `20250401T053000Z`: sortable and valid in a Windows file name. */
export const fileStamp = (now: Instant): string => now.replace(/[-:]|\.\d+/g, "");

export const dailyBackupName = (today: IsoDate): string => `daily-${today}.db`;

export const safetyBackupName = (now: Instant): string => `safety-${fileStamp(now)}.db`;

/** The daily backups rotation removes: all but the newest 14 and the newest of each of the 12 newest months that
 * have one (INV-103). Other files are never removed. */
export function planRotation(files: readonly string[]): string[] {
  const daily = files.filter((name) => parseBackupName(name)?.kind === "daily").toSorted((a, b) => b.localeCompare(a));
  const keep = new Set(daily.slice(0, KEEP_DAILY));
  const months = new Set<string>();
  for (const name of daily) {
    const month = name.slice(0, "daily-YYYY-MM".length);
    if (months.size < KEEP_MONTHLY && !months.has(month)) {
      months.add(month);
      keep.add(name);
    }
  }
  return daily.filter((name) => !keep.has(name)).toReversed();
}

interface BackupDeps {
  readonly clock: Clock;
  readonly backups: BackupFiles;
}

/** The `backup` job: one document, today's daily copy, made and then rotated. Backup now replaces today's copy. */
export function backupHandlers({ clock, backups }: BackupDeps): JobHandlers {
  return {
    backup: {
      documents: async () => {
        const name = dailyBackupName(clock.today());
        return [{ key: name, label: name }];
      },
      async process(name) {
        await backups.create(name);
        for (const old of planRotation(await backups.list())) await backups.delete(old);
        return { outcome: "done" };
      },
    },
  };
}

/**
 * Starts the `backup` job when today has no daily copy yet. Called once the server is up, so startup itself stays
 * read-only (C9). A job left queued or running by an earlier run (EC-28) blocks it; that, or any failure here, is logged and the
 * next launch tries again.
 */
export async function startDailyBackup({
  clock,
  backups,
  jobs,
  logger,
}: BackupDeps & { jobs: JobsService; logger: Logger }) {
  try {
    if ((await backups.list()).includes(dailyBackupName(clock.today()))) return;
    await jobs.start({ type: "backup" });
  } catch (err) {
    logger.warn({ error: String(err) }, "daily backup not started");
  }
}
