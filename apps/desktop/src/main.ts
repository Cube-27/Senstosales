// The shell page (SPEC-20 §4, ADR 0001, D-0008). It runs in the hidden `shell` window for the app's whole life: it
// starts the sidecar, waits for its port line and for health, then opens the app from loopback in the `main` window.
// Because it outlives the navigation, it can also report a sidecar that stops later. Closing the app window closes this
// one too; the app then exits and the shell plugin ends the sidecar.
import { join, localDataDir } from "@tauri-apps/api/path";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { error, info } from "@tauri-apps/plugin-log";
import { Command } from "@tauri-apps/plugin-shell";

import { waitForHealth } from "./health.ts";
import { watchSidecar } from "./sidecar.ts";

const COULD_NOT_START = "SenstoSales could not start";
const STOPPED = "SenstoSales stopped";
const NOT_ANSWERING = "SenstoSales started but did not answer. Close it and start it again.";
/** 10 s: the port line already means the server listens, so health normally answers on the first request. */
const HEALTH = { attempts: 200, intervalMs: 50 };

let quitting = false;

async function quit(): Promise<void> {
  quitting = true;
  await getCurrentWindow().destroy();
}

/** The sidecar's log folder (`%LOCALAPPDATA%\SenstoSales\logs`, INV-82); the shell log is written beside it. */
const logFolder = async (): Promise<string> => join(await localDataDir(), "SenstoSales", "logs");

/** Says what went wrong in the sidecar's own words, offers the log folder, then quits. */
async function fail(title: string, message: string): Promise<void> {
  await error(`${title}: ${message}`);
  const openLogs = await ask(`${message}\n\nThe log files may say more.`, {
    title,
    kind: "error",
    okLabel: "Open log folder",
    cancelLabel: "Close",
  });
  if (openLogs) await Command.create("explorer", [await logFolder()]).execute();
  await quit();
}

async function start(): Promise<void> {
  const sidecar = Command.sidecar("binaries/sensto-sidecar");
  sidecar.stderr.on("data", (line) => void error(`sidecar: ${line.trimEnd()}`));
  const watch = watchSidecar(sidecar);
  await sidecar.spawn();

  const startup = await watch.startup;
  if (startup.kind === "exited") return fail(COULD_NOT_START, startup.message);
  const base = `http://127.0.0.1:${startup.port}`;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  if (!(await waitForHealth({ base, fetch: (url, init) => fetch(url, init), sleep, ...HEALTH }))) {
    return fail(COULD_NOT_START, NOT_ANSWERING);
  }
  await info(`sidecar ready on port ${startup.port}`);
  void watch.exit.then((message) => (quitting ? undefined : fail(STOPPED, message)));

  const app = new WebviewWindow("main", {
    url: `${base}/`,
    title: "SenstoSales",
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    center: true,
  });
  await app.once("tauri://destroyed", () => void quit());
}

start().catch((err: unknown) => fail(COULD_NOT_START, err instanceof Error ? err.message : String(err)));
