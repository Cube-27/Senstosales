import { mkdtemp, readdir, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vite-plus/test";

import { start } from "../src/start.ts";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "sensto-start-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function status(url: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    request(url, (res) => {
      res.resume();
      resolve(res.statusCode);
    })
      .on("error", reject)
      .end();
  });
}

describe("pnpm start", () => {
  it("serves on loopback from a fresh data folder and shuts down cleanly when stopped", async () => {
    const dataDir = join(tmp, "data");
    const app = start({ ...process.env, SENSTO_DATA_DIR: dataDir });
    onTestFinished(app.stop);

    const url = await app.url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await status(`${url}/api/health`)).toBe(200);

    app.stop();
    expect(await app.exited).toBe(0);
    // A clean exit waits for the startup backup job, so the day's copy is complete.
    expect((await readdir(join(dataDir, "backups"))).filter((name) => name.startsWith("daily-"))).toEqual([
      expect.stringMatching(/^daily-\d{4}-\d{2}-\d{2}\.db$/),
    ]);
  });

  it("reports a failed start instead of an address", async () => {
    // LOCALAPPDATA unset and no SENSTO_DATA_DIR: the entry cannot find its data folder.
    const { SENSTO_DATA_DIR: _d, LOCALAPPDATA: _l, ...env } = process.env;
    const app = start(env);
    await expect(app.url).rejects.toThrow("The server stopped before it started.");
    expect(await app.exited).toBe(1);
  });
});
