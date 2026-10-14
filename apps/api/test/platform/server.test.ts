// SPEC-07 PR 2: the node entry. It prepares the data directory, binds 127.0.0.1 on a random port and prints it, guards
// the Host on the real socket (C10), serves the SPA and the health route from one app, and exits when stdin closes.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { LATEST_VERSION } from "@senstosales/db";
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from "vite-plus/test";

import { DATA_FOLDERS, resolveDataDir } from "../../src/platform/node/data-dir.ts";
import { type RunningServer, startServer } from "../../src/platform/node/main.ts";
import { migratedDb } from "../db.ts";
import { json } from "../helpers.ts";
import { poPage } from "../po-pages.ts";
import { srvPage } from "../srv-pages.ts";
import { supplierDb } from "../service-deps.ts";

const MAIN = join(import.meta.dirname, "../../src/platform/node/main.ts");
const INDEX = "<!doctype html><title>app</title><div id=root></div>";

let tmp: string;
let servers: RunningServer[];
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-server-"));
  servers = [];
});
// Servers close first: Windows cannot delete an open database file.
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await rm(tmp, { recursive: true, force: true });
});

interface Reply {
  status: number;
  type: string | undefined;
  body: string;
}

/** A raw HTTP GET, so the test sets the `Host` header itself. */
function get(port: number, path: string, host = `127.0.0.1:${port}`): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"], body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function migrate(dataDir: string): Promise<void> {
  await mkdir(join(dataDir, "db"), { recursive: true });
  (await migratedDb(join(dataDir, "db", "senstosales.db"))).close();
}

async function webRoot(): Promise<string> {
  const root = join(tmp, "web");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), INDEX);
  await writeFile(join(root, "assets", "app.js"), "console.log(1);");
  return root;
}

async function start(web: string) {
  const dataDir = join(tmp, "data");
  await migrate(dataDir);
  const server = await startServer({ dataDir, webRoot: web, version: "1.2.3" });
  servers.push(server);
  return server;
}

describe("startServer", () => {
  it("listens on 127.0.0.1 on a random port and answers health", async () => {
    const server = await start(await webRoot());
    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);

    const res = await get(server.port, "/api/health");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ version: "1.2.3", schemaVersion: LATEST_VERSION, job: null });
  });

  it.each(["example.test", "127.0.0.1", "localhost:1", "0.0.0.0:PORT"])("answers 400 to Host %s", async (host) => {
    const server = await start(await webRoot());
    const res = await get(server.port, "/", host.replace("PORT", String(server.port)));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ code: "bad-host", message: "This address is not allowed." });
  });

  it("mounts the job API behind the onboarding gate on a new data dir (SPEC-08, INV-78)", async () => {
    const server = await start(await webRoot());
    const res = await get(server.port, "/api/jobs");
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toEqual({
      code: "onboarding-required",
      message: "Set up the supplier details first.",
    });
  });

  it("ingests uploaded PO and SRV pages and keeps them under the data folder", async () => {
    const server = await start(await webRoot());
    (await supplierDb(join(tmp, "data", "db", "senstosales.db"))).close();
    const html = poPage({ date: "10/04/2025", items: [{ no: 10 }] });
    const base = `http://127.0.0.1:${server.port}`;
    const login = await fetch(`${base}/api/auth/login`, json("POST", { password: "admin", rememberMe: false }));
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    const upload = json("POST", { files: [{ name: "a.html", html }] });
    const res = await fetch(`${base}/api/po/upload`, { ...upload, headers: { ...upload.headers, cookie } });

    expect(await res.json()).toEqual({ results: [{ name: "a.html", status: "accepted", reason: null }] });
    expect(await readFile(join(tmp, "data", "html", "po", "4500001.html"), "utf8")).toBe(html);

    const srvHtml = srvPage("4500001", [{ srv: "7000001", date: "01/05/2025", item: 10 }]);
    const srvUpload = json("POST", { files: [{ name: "s.html", html: srvHtml }] });
    const srvRes = await fetch(`${base}/api/srv/upload`, { ...srvUpload, headers: { ...srvUpload.headers, cookie } });

    expect(await srvRes.json()).toEqual({ results: [{ name: "s.html", status: "accepted", reason: null }] });
    expect(await readFile(join(tmp, "data", "html", "srv", "4500001.html"), "utf8")).toBe(srvHtml);
  });

  it("accepts localhost on its port", async () => {
    const server = await start(await webRoot());
    expect((await get(server.port, "/api/health", `localhost:${server.port}`)).status).toBe(200);
  });

  it("serves the SPA: files, index.html for app paths, and 404 for missing files and unknown API paths", async () => {
    const server = await start(await webRoot());

    expect(await get(server.port, "/")).toEqual({ status: 200, type: "text/html; charset=utf-8", body: INDEX });
    expect(await get(server.port, "/po/1001")).toEqual({ status: 200, type: "text/html; charset=utf-8", body: INDEX });
    expect(await get(server.port, "/assets/app.js")).toEqual({
      status: 200,
      type: "text/javascript; charset=utf-8",
      body: "console.log(1);",
    });
    expect((await get(server.port, "/assets/missing.js")).status).toBe(404);
    expect((await get(server.port, "/api/nothing-here")).status).toBe(404);
  });

  it.each(["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/..%5csecret.txt", "/assets/..%2f..%2fsecret.txt"])(
    "never serves a file outside the SPA folder: %s",
    async (path) => {
      await writeFile(join(tmp, "secret.txt"), "TOP SECRET");
      const server = await start(await webRoot());
      const res = await get(server.port, path);
      expect(res.status).toBe(404);
      expect(res.body).not.toContain("TOP SECRET");
    },
  );

  it("serves a placeholder page when no SPA is built", async () => {
    const server = await start(join(tmp, "no-web"));
    const res = await get(server.port, "/");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("<title>SenstoSales</title>");
  });

  it("creates the data folders and nothing else", async () => {
    await start(await webRoot());
    expect((await readdir(join(tmp, "data"))).toSorted()).toEqual([...DATA_FOLDERS].toSorted());
  });
});

describe("resolveDataDir", () => {
  it("is SenstoSales under LOCALAPPDATA", () => {
    expect(resolveDataDir({ LOCALAPPDATA: join("C:", "Users", "a", "AppData", "Local") })).toBe(
      join("C:", "Users", "a", "AppData", "Local", "SenstoSales"),
    );
  });

  it("takes SENSTO_DATA_DIR first", () => {
    expect(resolveDataDir({ LOCALAPPDATA: "x", SENSTO_DATA_DIR: join("d", "data") })).toBe(join("d", "data"));
  });

  it("refuses to guess without either", () => {
    expect(() => resolveDataDir({})).toThrow("SenstoSales could not find its data folder (LOCALAPPDATA is not set).");
  });
});

describe("main", () => {
  it("prints the port line once listening, and exits when stdin closes", async () => {
    const dataDir = join(tmp, "data");
    await migrate(dataDir);
    const child = spawn(process.execPath, [MAIN], {
      env: { ...process.env, SENSTO_DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    onTestFinished(() => {
      child.kill();
    });

    const first = await new Promise<string>((resolve) => {
      createInterface({ input: child.stdout }).once("line", resolve);
    });
    expect(first).toMatch(/^SENSTO_PORT=\d+$/);
    const port = Number(first.slice("SENSTO_PORT=".length));
    expect((await get(port, "/api/health")).status).toBe(200);

    child.stdin.end();
    expect(await exited).toBe(0);
  });
});
