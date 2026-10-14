// Shell page: start the sidecar, read its port from stdout, wait for /api/health, then load the app from loopback.
import { Command } from "@tauri-apps/plugin-shell";

const status = document.getElementById("status")!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(base: string): Promise<boolean> {
  for (let i = 0; i < 400; i++) {
    try {
      // no-cors: the response is opaque, but it resolves only if the server answered. The API needs no CORS header.
      await fetch(`${base}/api/health`, { mode: "no-cors" });
      return true;
    } catch {
      // not listening yet
    }
    await sleep(25);
  }
  return false;
}

const cmd = Command.sidecar("binaries/sensto-sidecar");
let lastError = "";
cmd.stderr.on("data", (line) => (lastError = line));
cmd.on("close", (e) => (status.textContent = `The app stopped (code ${e.code}). ${lastError}`));
cmd.stdout.on("data", async (line) => {
  const m = /^SENSTO_PORT=(\d+)/.exec(line.trim());
  if (!m) return;
  const base = `http://127.0.0.1:${m[1]}`;
  if (await waitHealthy(base)) location.replace(`${base}/`);
  else status.textContent = "The app did not start in time.";
});
await cmd.spawn();
