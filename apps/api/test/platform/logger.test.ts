// SPEC-21 PR 4: pino JSON logs in `logs/`, one file per IST day, kept 14 days, with secrets, cookies and document
// bodies redacted (INV-106). Synthetic values only (C1).
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Instant } from "@senstosales/db";
import type { IsoDate } from "@senstosales/domain";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { createFileLogger } from "../../src/platform/node/logger.ts";
import type { Clock } from "../../src/ports/clock.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "senstosales-logs-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function clockAt(today: string): Clock & { set(day: string): void } {
  let day = today;
  return {
    today: () => day as IsoDate,
    now: () => `${day}T05:30:00.000Z` as Instant,
    set: (next) => void (day = next),
  };
}

const lines = async (name: string) =>
  (await readFile(join(dir, name), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe("INV-106 the file logger", () => {
  it("writes JSON lines with level, time and message to the day's file", async () => {
    const logger = createFileLogger({ dir, clock: clockAt("2025-06-01") });
    logger.info({ jobId: "J1" }, "job started");
    logger.close();

    expect(await lines("api-2025-06-01.log")).toEqual([
      { level: 30, time: "2025-06-01T05:30:00.000Z", jobId: "J1", msg: "job started" },
    ]);
  });

  it("redacts passwords, cookies, captchas, OTPs and document bodies, at the top level and one level down", async () => {
    const logger = createFileLogger({ dir, clock: clockAt("2025-06-01") });
    logger.warn(
      {
        password: "pw-secret",
        cookie: "sid=cookie-secret",
        html: "<table>body-secret</table>",
        body: { files: [{ html: "<table>upload-secret</table>" }] },
        headers: { cookie: "sid=header-secret", authorization: "Bearer token-secret", host: "127.0.0.1" },
        request: { password: "nested-secret", captcha: "captcha-secret", otp: "otp-secret" },
      },
      "request rejected",
    );
    logger.close();

    const text = await readFile(join(dir, "api-2025-06-01.log"), "utf8");
    expect(text).not.toMatch(/secret/);
    expect(await lines("api-2025-06-01.log")).toEqual([
      {
        level: 40,
        time: "2025-06-01T05:30:00.000Z",
        password: "[redacted]",
        cookie: "[redacted]",
        html: "[redacted]",
        body: "[redacted]",
        headers: { cookie: "[redacted]", authorization: "[redacted]", host: "127.0.0.1" },
        request: { password: "[redacted]", captcha: "[redacted]", otp: "[redacted]" },
        msg: "request rejected",
      },
    ]);
  });

  it("starts a new file when the day changes and keeps the newest 14 days", async () => {
    for (const day of ["2025-05-17", "2025-05-18", "2025-05-19", "2025-05-31"]) {
      await writeFile(join(dir, `api-${day}.log`), "");
    }
    await writeFile(join(dir, "shell.log"), "");
    const clock = clockAt("2025-05-31");
    const logger = createFileLogger({ dir, clock });
    logger.info({}, "before midnight");
    clock.set("2025-06-01");
    logger.info({}, "after midnight");
    logger.close();

    // 2025-06-01 and the 13 days before it: 2025-05-19 onwards.
    expect(await readdir(dir)).toEqual(["api-2025-05-19.log", "api-2025-05-31.log", "api-2025-06-01.log", "shell.log"]);
    expect((await lines("api-2025-05-31.log")).map((line) => line["msg"])).toEqual(["before midnight"]);
    expect((await lines("api-2025-06-01.log")).map((line) => line["msg"])).toEqual(["after midnight"]);
  });
});
