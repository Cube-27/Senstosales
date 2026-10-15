// `pnpm start`: runs the app locally from the repo (the root script builds the web UI first). It starts the node
// entry, turns its `SENSTO_PORT=<n>` line into an address for people, and stops it on Ctrl+C by closing its stdin,
// the entry's own shutdown path, so the running job finishes and the database closes. The entry runs detached (no
// console of its own on Windows, its own process group elsewhere) so Ctrl+C reaches only this script, never the
// entry mid-write. The data folder is the entry's default (`%LOCALAPPDATA%\SenstoSales`) unless SENSTO_DATA_DIR is set.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export const MAIN = fileURLToPath(new URL("../../../apps/api/src/platform/node/main.ts", import.meta.url));

export interface Started {
  /** The app's address, once it listens; rejects when the entry exits first (its message is on stderr). */
  readonly url: Promise<string>;
  /** Resolves with the entry's exit code. */
  readonly exited: Promise<number>;
  /** Asks the entry to shut down cleanly. */
  stop(): void;
}

export function start(env: NodeJS.ProcessEnv = process.env): Started {
  const child = spawn(process.execPath, [MAIN], { env, stdio: ["pipe", "pipe", "inherit"], detached: true });
  const exited = new Promise<number>((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
  const url = new Promise<string>((resolve, reject) => {
    createInterface({ input: child.stdout }).once("line", (line) => {
      const port = /^SENSTO_PORT=(\d+)$/.exec(line)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
      else reject(new Error(`Unexpected output from the server: ${line}`));
    });
    void exited.then(() => reject(new Error("The server stopped before it started.")));
  });
  return { url, exited, stop: () => child.stdin.end() };
}

if (import.meta.main) {
  const app = start();
  process.once("SIGINT", app.stop);
  process.once("SIGTERM", app.stop);
  app.url.then(
    (url) => process.stdout.write(`SenstoSales is running at ${url}  (Ctrl+C to stop)\n`),
    (err: unknown) => process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`),
  );
  void app.exited.then((code) => {
    process.exitCode = code;
  });
}
