// The Logger port over pino (SPEC-21 §2, ARCHITECTURE §10.4, INV-106): JSON lines in `logs/api-<date>.log`, one file
// per IST day, the newest 14 days kept. Passwords, cookies, captchas, OTPs and document bodies are redacted by key,
// at the top level and one level down. Writes are synchronous: the volume is small and nothing is lost on exit.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { pino } from "pino";

import type { Clock } from "../../ports/clock.ts";
import type { Logger } from "../../ports/logger.ts";

const KEEP_DAYS = 14;
const FILE = /^api-(\d{4}-\d{2}-\d{2})\.log$/;
const DAY_MS = 86_400_000;

const SECRET_KEYS = ["password", "cookie", "authorization", "captcha", "captchaPng", "otp", "html", "body"];
const REDACT = SECRET_KEYS.flatMap((key) => [key, `*.${key}`]);

/** The date `days` before `date`: `2025-06-01`, 13 → `2025-05-19`. */
const daysBefore = (date: string, days: number): string =>
  new Date(Date.parse(date) - days * DAY_MS).toISOString().slice(0, 10);

/** Deletes the day files older than the newest 14 days up to `today`. Other files are left alone. */
function prune(dir: string, today: string): void {
  const oldest = daysBefore(today, KEEP_DAYS - 1);
  for (const name of readdirSync(dir)) {
    const day = FILE.exec(name)?.[1];
    if (day !== undefined && day < oldest) rmSync(join(dir, name), { force: true });
  }
}

/** A pino destination that writes to the current day's file, opening the next one (and pruning) when the day
 * changes. */
function dailyFiles(dir: string, clock: Clock) {
  let day: string | undefined;
  let file: ReturnType<typeof pino.destination> | undefined;
  return {
    write(line: string): void {
      const today = clock.today();
      if (today !== day || file === undefined) {
        file?.end();
        day = today;
        file = pino.destination({ dest: join(dir, `api-${today}.log`), sync: true, mkdir: true });
        prune(dir, today);
      }
      file.write(line);
    },
    close(): void {
      file?.end();
      file = undefined;
    },
  };
}

export function createFileLogger({ dir, clock }: { dir: string; clock: Clock }): Logger & { close(): void } {
  const files = dailyFiles(dir, clock);
  const logger = pino(
    {
      base: null,
      timestamp: () => `,"time":"${clock.now()}"`,
      redact: { paths: REDACT, censor: "[redacted]" },
    },
    files,
  );
  return {
    debug: (fields, message) => logger.debug(fields, message),
    info: (fields, message) => logger.info(fields, message),
    warn: (fields, message) => logger.warn(fields, message),
    error: (fields, message) => logger.error(fields, message),
    close: () => files.close(),
  };
}
