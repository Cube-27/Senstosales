// `pnpm start`: runs the app locally from the repo (the root script builds the web UI first). It starts the node
// entry and turns its `SENSTO_PORT=<n>` line into an address for people. Ctrl+C reaches both processes: the entry
// shuts itself down cleanly, and this script waits for it and exits with its code.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("../../../apps/api/src/platform/node/main.ts", import.meta.url));

export function start(env: NodeJS.ProcessEnv = process.env) {
  const child = spawn(process.execPath, [MAIN], { env, stdio: ["pipe", "pipe", "inherit"] });
  /** The entry's exit code. */
  const exited = new Promise<number>((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
  /** The app's address once it listens; rejects when the entry exits first (its message is on stderr). */
  const url = new Promise<string>((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    lines.once("line", (line) => {
      lines.close();
      const port = /^SENSTO_PORT=(\d+)$/.exec(line)?.[1];
      if (port) resolve(`http://127.0.0.1:${port}`);
      else reject(new Error(`Unexpected output from the server: ${line}`));
    });
    void exited.then(() => reject(new Error("The server stopped before it started.")));
  });
  /** Asks the entry to shut down cleanly (closing its stdin, as the desktop shell does). */
  const stop = (): void => void child.stdin.end();
  return { url, exited, stop };
}

if (import.meta.main) {
  const app = start();
  // Kept alive until the entry exits; a signal sent to this script alone still stops the entry.
  process.on("SIGINT", app.stop);
  process.on("SIGTERM", app.stop);
  try {
    process.stdout.write(`SenstoSales is running at ${await app.url}  (Ctrl+C to stop)\n`);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exitCode = await app.exited;
}
