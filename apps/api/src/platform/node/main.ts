// The node entry (SPEC-07 §4.2, ADR 0001): data directory, database, one app for the API and the SPA, bound to
// 127.0.0.1 on a random free port (C10). The shell reads the one `SENSTO_PORT=<n>` line on stdout, printed only once
// the server listens; a failed start prints a plain message on stderr instead. The process exits when stdin closes,
// so it never outlives a shell that crashed.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { openNodeDb } from "@senstosales/db/node";
import { getRequestListener } from "@hono/node-server";
import type { Hono } from "hono";

import pkg from "../../../package.json" with { type: "json" };
import { createApp } from "../../app.ts";
import type { Logger, LogFields } from "../../ports/logger.ts";
import { healthRoutes } from "../../routes/health.ts";
import { prepareDataDir, resolveDataDir } from "./data-dir.ts";
import { spa } from "./static.ts";

const HOST = "127.0.0.1";

export interface ServerOptions {
  readonly dataDir: string;
  /** The built SPA (`apps/web/dist`). */
  readonly webRoot: string;
  readonly version: string;
}

export interface RunningServer {
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

/** JSON lines on stderr; stdout carries only the port line. SPEC-21 replaces this with the pino adapter. */
const stderrLogger: Logger = Object.fromEntries(
  (["debug", "info", "warn", "error"] as const).map((level) => [
    level,
    (fields: LogFields, message: string) => process.stderr.write(`${JSON.stringify({ level, message, ...fields })}\n`),
  ]),
) as unknown as Logger;

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve(server.address() as AddressInfo));
  });
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const dir = await prepareDataDir(options.dataDir);
  const db = openNodeDb(dir.dbFile);
  // SPEC-07 PR 3 puts the upgrade gate here, before anything listens.

  // The Host guard needs the port, which is known only after `listen`; nothing can call before then.
  let app: Hono | undefined;
  const server = createServer(
    getRequestListener((req) => (app ? app.fetch(req) : new Response(null, { status: 503 }))),
  );
  const address = await listen(server);
  app = createApp({ port: address.port, logger: stderrLogger }, healthRoutes({ version: options.version, db }));
  app.get("*", spa(options.webRoot));

  return {
    host: address.address,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

async function main(): Promise<void> {
  const server = await startServer({
    dataDir: resolveDataDir(process.env),
    webRoot: fileURLToPath(new URL("../../../../web/dist", import.meta.url)),
    version: pkg.version,
  });
  process.stdout.write(`SENSTO_PORT=${server.port}\n`);
  process.stdin.on("end", () => void server.close());
  process.stdin.resume();
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
