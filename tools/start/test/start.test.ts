import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vite-plus/test";

import { start } from "../src/start.ts";

describe("pnpm start", () => {
  it("serves on loopback from a fresh data folder and exits 0 when stopped", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "sensto-start-"));
    const app = start({ ...process.env, SENSTO_DATA_DIR: dataDir });
    onTestFinished(async () => {
      app.stop();
      await app.exited;
      await rm(dataDir, { recursive: true, force: true });
    });

    const url = await app.url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${url}/api/health`)).status).toBe(200);

    app.stop();
    expect(await app.exited).toBe(0);
  });

  it("reports a failed start instead of an address", async () => {
    // LOCALAPPDATA unset and no SENSTO_DATA_DIR: the entry cannot find its data folder.
    const { SENSTO_DATA_DIR: _d, LOCALAPPDATA: _l, ...env } = process.env;
    const app = start(env);
    await expect(app.url).rejects.toThrow("The server stopped before it started.");
    expect(await app.exited).toBe(1);
  });
});
