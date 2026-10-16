// The shell page (SPEC-20 §4, ADR 0001, D-0008). It runs in the hidden `shell` window for the app's whole life: it
// starts the sidecar, waits for its port line and for health, then opens the app from loopback in the `main` window.
// Because it outlives the navigation, it can also report a sidecar that stops later. Closing the app window closes this
// one too; the app then exits and the shell plugin ends the sidecar.
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu } from "@tauri-apps/api/menu";
import { join, localDataDir } from "@tauri-apps/api/path";
import { TrayIcon } from "@tauri-apps/api/tray";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { error, info } from "@tauri-apps/plugin-log";
import { Command } from "@tauri-apps/plugin-shell";
import { check } from "@tauri-apps/plugin-updater";

import { waitForHealth } from "./health.ts";
import { watchSidecar } from "./sidecar.ts";
import { offerUpdate } from "./update.ts";

const COULD_NOT_START_TITLE = "SenstoSales could not start";
const STOPPED_TITLE = "SenstoSales stopped";
const UPDATE_FAILED_TITLE = "SenstoSales could not update";
const UPDATE_FAILED = "The update could not be installed. Start SenstoSales again; it will offer the update again.";
const NOT_ANSWERING = "SenstoSales started but did not answer. Close it and start it again.";
/** 10 s: the port line already means the server listens, so health normally answers on the first request. */
const HEALTH = { attempts: 200, intervalMs: 50 };

let quitting = false;

/** Closes the app window, if open, then this one; with no window left the app exits. Runs once: destroying `main`
 * calls it again. */
async function quit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  try {
    await (await WebviewWindow.getByLabel("main"))?.destroy();
  } finally {
    await getCurrentWindow().destroy();
  }
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
  const child = await sidecar.spawn();

  const startup = await watch.startup;
  if (startup.kind === "exited") return fail(COULD_NOT_START_TITLE, startup.message);
  const base = `http://127.0.0.1:${startup.port}`;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  // A sidecar that exits during the wait is reported in its own words, not as a timeout.
  const problem = await Promise.race([
    waitForHealth({ base, fetch: (url, init) => fetch(url, init), sleep, ...HEALTH }).then((ok) =>
      ok ? null : NOT_ANSWERING,
    ),
    watch.exit,
  ]);
  if (problem !== null) return fail(COULD_NOT_START_TITLE, problem);
  await info(`sidecar ready on port ${startup.port}`);
  void watch.exit.then((message) => (quitting ? undefined : fail(STOPPED_TITLE, message)));

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
  await addTray(app);

  // Quitting first, so the sidecar stopping for the installer is not reported as a crash.
  const stopSidecar = async () => {
    quitting = true;
    await child.kill();
  };
  const askInstall = (message: string) =>
    ask(message, { title: "SenstoSales update", okLabel: "Install now", cancelLabel: "Later" });
  void offerUpdate({ check, ask: askInstall, stopSidecar, log: info }).catch((err: unknown) => {
    quitting = false;
    void error(`update install failed: ${err instanceof Error ? err.message : String(err)}`);
    return fail(UPDATE_FAILED_TITLE, UPDATE_FAILED);
  });
}

/** The tray icon `main`: platform/tauri.ts sets its tooltip as the status (SPEC-14); its menu opens or quits the app. */
async function addTray(app: WebviewWindow): Promise<void> {
  const show = async () => {
    await app.unminimize();
    await app.show();
    await app.setFocus();
  };
  const menu = await Menu.new({
    items: [
      { id: "open", text: "Open SenstoSales", action: () => void show() },
      { id: "quit", text: "Quit", action: () => void app.close() },
    ],
  });
  const icon = await defaultWindowIcon();
  await TrayIcon.new({
    id: "main",
    ...(icon && { icon }),
    tooltip: "SenstoSales",
    menu,
    showMenuOnLeftClick: false,
    action: (event) => {
      if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") void show();
    },
  });
}

await start().catch((err: unknown) => fail(COULD_NOT_START_TITLE, err instanceof Error ? err.message : String(err)));
