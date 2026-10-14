// Spike sidecar: a Hono app with node:sqlite on a random loopback port. Reports the port two ways (a stdout line
// and a port file) so both handoffs can be measured, and exits when its parent goes away (stdin EOF).
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const dataDir = process.env.SENSTO_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? ".", "SenstoSales-spike");
mkdirSync(dataDir, { recursive: true });
const event = (name: string) => appendFileSync(join(dataDir, "events.log"), `${Date.now()} ${process.pid} ${name}\n`);
event("start");

const db = new DatabaseSync(join(dataDir, "spike.db"));
db.exec("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS boot (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)");
db.prepare("INSERT INTO boot (at) VALUES (?)").run(Date.now());
const sqliteVersion = (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v;
const boots = (db.prepare("SELECT count(*) AS n FROM boot").get() as { n: number }).n;

const app = new Hono();
app.get("/api/health", (c) =>
  c.json({ ok: true, pid: process.pid, node: process.version, sqliteVersion, boots, execPath: process.execPath, dataDir }),
);
let served = false;
app.get("/", (c) => {
  if (!served) event("first-page");
  served = true;
  return c.html(`<!doctype html><meta charset="utf-8"><title>Spike</title><h1>Sidecar ${process.pid}</h1>`);
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => {
  writeFileSync(join(dataDir, "port"), String(info.port));
  process.stdout.write(`SENSTO_PORT=${info.port}\n`);
  event(`listening ${info.port}`);
});

// The parent holds our stdin pipe; EOF means it exited (cleanly or not).
process.stdin.on("end", () => {
  event("stdin-eof");
  process.exit(0);
});
process.stdin.resume();
