// The node entry (SPEC-07 §4.2, ADR 0001): data directory, database, one app for the API and the SPA, bound to
// 127.0.0.1 on a random free port (C10). The shell reads the one `SENSTO_PORT=<n>` line on stdout, printed only once
// the server listens; a failed start prints a plain message on stderr instead. The process exits when stdin closes,
// so it never outlives a shell that crashed, or on SIGINT/SIGTERM.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getRequestListener } from "@hono/node-server";
import type { Scraper } from "@senstosales/scraper";

import pkg from "../../../package.json" with { type: "json" };
import { createApp } from "../../app.ts";
import { allRoutes } from "../../routes/index.ts";
import { createClock } from "./clock.ts";
import { resolveDataDir } from "./data-dir.ts";
import { createFileLogger } from "./logger.ts";
import { openRuntime } from "./runtime.ts";
import { spa, type WebFiles } from "./static.ts";
import { createFsStorage } from "./storage-fs.ts";

const HOST = "127.0.0.1";

export interface ServerOptions {
  readonly dataDir: string;
  /** The built SPA (`apps/web/dist`, or embedded in the sidecar). */
  readonly web: WebFiles;
  readonly version: string;
  /** The BHEL portal adapter; without one, BHEL sync is not offered (D-0380). */
  readonly scraper?: Scraper;
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
  app.get("*", spa(options.web));
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

async function serve(web: WebFiles, scraper: Scraper | undefined): Promise<void> {
  const server = await startServer({
    dataDir: resolveDataDir(process.env),
    web,
    version: pkg.version,
    ...(scraper && { scraper }),
  });
  process.stdout.write(`SENSTO_PORT=${server.port}\n`);
  const backup = server.startDailyBackup();
  // Ctrl+C in a terminal (`pnpm start`) takes the same clean path as the shell closing stdin. Registered in the tick
  // that announces the port, and closing only once the backup job has started, so an early stop still waits for it.
  let closing: Promise<void> | undefined;
  const stop = (): void => {
    process.stdin.destroy();
    closing ??= backup.then(() => server.close());
  };
  process.stdin.on("end", stop);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.resume();
}

/** Runs the process: serves `web` until stdin closes, or reports a failed start on stderr. The sidecar's entry
 * (`tools/release`) calls it with the SPA embedded in the bundle; the e2e entry (`apps/api/test/e2e-server.ts`) adds
 * the fake scraper. No top-level await: a SEA runs CommonJS. */
export function run(web: WebFiles, scraper?: Scraper): void {
  serve(web, scraper).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

if (import.meta.main) run(createFsStorage(fileURLToPath(new URL("../../../../web/dist", import.meta.url))));
