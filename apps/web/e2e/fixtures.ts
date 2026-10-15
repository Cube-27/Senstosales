// The e2e harness (SPEC-14 §2): each worker starts the API on a new temp data folder, serving the built SPA
// (apps/web/dist), loads the synthetic dataset through the API, and stops it afterwards. Tests use `baseURL`.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base } from "@playwright/test";

import { DATASETS, type Dataset } from "./dataset.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MAIN = join(REPO, "apps", "api", "src", "platform", "node", "main.ts");
const START_TIMEOUT_MS = 60_000;

interface Server {
  readonly url: string;
  readonly child: ChildProcess;
  readonly dataDir: string;
}

/** Starts the API's node entry on `dataDir` and resolves once it prints `SENSTO_PORT=<n>`. */
function startApi(dataDir: string): Promise<Server> {
  const child = spawn(process.execPath, [MAIN], {
    cwd: REPO,
    env: { ...process.env, SENSTO_DATA_DIR: dataDir },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return new Promise((done, fail) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => fail(new Error(`the API did not start in time: ${err}`)), START_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      const port = /SENSTO_PORT=(\d+)/.exec(out)?.[1];
      if (!port) return;
      clearTimeout(timer);
      done({ url: `http://127.0.0.1:${port}`, child, dataDir });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`the API exited (${code}) before it started: ${err}`));
    });
  });
}

/** Closing stdin stops the API (SPEC-07 §4.2); the folder goes once it has exited. */
async function stopApi({ child, dataDir }: Server): Promise<void> {
  if (child.exitCode === null) {
    const exited = new Promise((done) => child.once("exit", done));
    child.stdin?.end();
    await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
}

export const test = base.extend<object, { dataset: Dataset; server: Server }>({
  /** Which synthetic state the API starts in; `test.use({ dataset: "fresh" })` for a first run. */
  dataset: ["onboarded", { scope: "worker", option: true }],
  server: [
    async ({ dataset }, use) => {
      const server = await startApi(await mkdtemp(join(tmpdir(), "sensto-e2e-")));
      try {
        await DATASETS[dataset](server.url);
        await use(server);
      } finally {
        await stopApi(server);
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ server }, use) => {
    await use(server.url);
  },
});

export { expect } from "@playwright/test";
