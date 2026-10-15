// The node entry (SPEC-07 §4.2, ADR 0001): data directory, database, one app for the API and the SPA, bound to
// 127.0.0.1 on a random free port (C10). The shell reads the one `SENSTO_PORT=<n>` line on stdout, printed only once
// the server listens; a failed start prints a plain message on stderr instead. The process exits when stdin closes,
// so it never outlives a shell that crashed.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getRequestListener } from "@hono/node-server";

import pkg from "../../../package.json" with { type: "json" };
import { createApp } from "../../app.ts";
import { allRoutes } from "../../routes/index.ts";
import { createClock } from "./clock.ts";
import { resolveDataDir } from "./data-dir.ts";
import { createFileLogger } from "./logger.ts";
import { openRuntime } from "./runtime.ts";
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
  /** Starts today's backup unless it exists; `main` calls it once the port is announced (SPEC-21, C9). */
  startDailyBackup(): Promise<void>;
  /** Stops serving, waits for the running job, then closes the database. */
  close(): Promise<void>;
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, () => resolve(server.address() as AddressInfo));
  });
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const logger = createFileLogger({ dir: join(options.dataDir, "logs"), clock: createClock() });
  const {
    db,
    services,
    jobs,
    close: closeRuntime,
    restore,
    startDailyBackup,
  } = await openRuntime({
    ...options,
    logger,
  }).catch((err: unknown) => {
    logger.close();
    throw err;
  });

  // The Host guard needs the port, known only once listening; the app answers from then on, and nobody knows the
  // port earlier.
  const server = createServer();
  const address = await listen(server);
  const app = createApp(
    { port: address.port, logger, signedIn: services.auth.signedIn, onboarded: services.onboarding.done },
    allRoutes(services, { health: { version: options.version, db }, restore }),
  );
  app.get("*", spa(options.webRoot));
  server.on("request", getRequestListener(app.fetch));

  return {
    host: address.address,
    port: address.port,
    startDailyBackup,
    async close() {
      server.closeAllConnections();
      const closed = new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      try {
        await closed;
      } finally {
        await jobs.idle();
        try {
          await closeRuntime();
        } finally {
          logger.close();
        }
      }
    },
  };
}

async function main(): Promise<void> {
  const server = await startServer({
    dataDir: resolveDataDir(process.env),
    webRoot: fileURLToPath(new URL("../../../../web/dist", import.meta.url)),
    version: pkg.version,
  });
  process.stdout.write(`SENSTO_PORT=${server.port}\n`);
  await server.startDailyBackup();
  process.stdin.on("end", () => void server.close());
  process.stdin.resume();
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
