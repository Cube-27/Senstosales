// SPEC-20 PR 1: the sidecar build. Both layouts (the SEA and the `--fallback` node + bundle) start from a fresh data
// folder, print the port line, serve the embedded SPA and `/api/health` on 127.0.0.1 only (C10), and exit when stdin
// closes.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { LATEST_VERSION } from "@senstosales/db";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vite-plus/test";

import { buildSidecar, type Sidecar, spawnArgs } from "../src/build-sidecar.ts";

const INDEX = "<!doctype html><title>app</title><div id=root></div>";
const APP_JS = "console.log(1);";

let tmp: string;
const built = new Map<Sidecar["kind"], Sidecar>();

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-sidecar-"));
  const web = join(tmp, "web");
  await mkdir(join(web, "assets"), { recursive: true });
  await writeFile(join(web, "index.html"), INDEX);
  await writeFile(join(web, "assets", "app.js"), APP_JS);
  for (const kind of ["sea", "fallback"] as const) {
    built.set(kind, await buildSidecar({ kind, web, outDir: join(tmp, kind) }));
  }
}, 300_000);

afterAll(async () => {
  // Windows holds an exe briefly after its process exits.
  await rm(tmp, { recursive: true, force: true, maxRetries: 10 });
});

const apiVersion = async (): Promise<string> =>
  (
    JSON.parse(await readFile(join(import.meta.dirname, "../../../apps/api/package.json"), "utf8")) as {
      version: string;
    }
  ).version;

/** Whether a TCP connection to `host:port` is refused. */
const refused = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });

describe.each(["sea", "fallback"] as const)("the %s sidecar", (kind) => {
  it("starts, prints its port, serves the SPA and health on 127.0.0.1 only, and exits on stdin EOF", async () => {
    const sidecar = built.get(kind);
    if (!sidecar) throw new Error(`${kind} was not built`);
    const [file, args] = spawnArgs(sidecar);
    const child = spawn(file, args, {
      env: { ...process.env, SENSTO_DATA_DIR: join(tmp, `data-${kind}`) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    onTestFinished(() => {
      child.kill();
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));

    const line = await new Promise<string>((resolve) => {
      createInterface({ input: child.stdout }).once("line", resolve);
      child.once("exit", () => resolve(`exited: ${stderr}`));
    });
    expect(line).toMatch(/^SENSTO_PORT=\d+$/);
    const port = Number(line.slice("SENSTO_PORT=".length));
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/api/health`);
    // `job` is left out: the day's backup may be running.
    expect(await health.json()).toMatchObject({ version: await apiVersion(), schemaVersion: LATEST_VERSION });
    expect(await (await fetch(`${base}/`)).text()).toBe(INDEX);
    expect(await (await fetch(`${base}/po/1001`)).text()).toBe(INDEX);
    const js = await fetch(`${base}/assets/app.js`);
    expect([js.headers.get("content-type"), await js.text()]).toEqual(["text/javascript; charset=utf-8", APP_JS]);
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    // C10: bound to 127.0.0.1 itself, not to every loopback or every interface.
    expect(await refused("127.0.0.2", port)).toBe(true);
    expect(await refused("::1", port)).toBe(true);

    child.stdin.end();
    expect(await exited).toBe(0);
  }, 60_000);
});
