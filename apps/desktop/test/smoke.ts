// The desktop smoke test (SPEC-20 PR 4, ARCHITECTURE §14.1), Windows only. With `--installer` it installs per user
// with no admin rights, checks the install folder, runs the app, and uninstalls at the end, checking that the data
// stays. The run: the app starts its sidecar, `/api/health` answers on 127.0.0.1 only (C10), a second launch exits
// and leaves one sidecar (single instance), and closing the window ends the shell and the sidecar.
// Usage: node apps/desktop/test/smoke.ts --installer <setup.exe>
//        node apps/desktop/test/smoke.ts --app <senstosales.exe>   (a built shell, sidecar beside it)
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const LOCALAPPDATA = process.env["LOCALAPPDATA"] ?? "";
/** ARCHITECTURE §13.2: the program folder and the data folder (INV-82). */
const INSTALL_DIR = join(LOCALAPPDATA, "Programs", "SenstoSales");
const DATA_DIR = join(LOCALAPPDATA, "SenstoSales");
const SIDECAR = "sensto-sidecar";

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`smoke: ${what}`);
  console.log(`ok - ${what}`);
}

const powershell = (script: string): string =>
  // `exit 0`: a query that matches nothing still sets a failure status.
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `${script}; exit 0`], {
    encoding: "utf8",
  }).trim();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `probe` every 250 ms until it returns a value, or fails after `seconds`. */
async function waitFor<T>(what: string, seconds: number, probe: () => T | null | Promise<T | null>): Promise<T> {
  for (const end = Date.now() + seconds * 1000; Date.now() < end; await sleep(250)) {
    const value = await probe();
    if (value !== null) return value;
  }
  throw new Error(`smoke: timed out after ${seconds} s waiting for ${what}`);
}

/** The ids of running processes named `name` (no `.exe`). */
const pids = (name: string): number[] =>
  powershell(`Get-Process -Name '${name}' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }`)
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);

/** The listening sockets of process `pid`, as `address:port`. */
const listening = (pid: number): string[] =>
  powershell(
    `Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }`,
  )
    .split(/\s+/)
    .filter(Boolean);

const hasWindow = (pid: number): boolean =>
  powershell(`(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowHandle`) !== "0";

/** Runs `exe` until it exits; resolves with its exit code. */
const run = (exe: string, args: string[] = []): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", resolve);
  });

async function smokeRun(app: string): Promise<void> {
  check(pids(SIDECAR).length === 0, "no sidecar is running before the start");
  const shell = spawn(app, [], { stdio: "ignore" });
  const shellExit = new Promise<number | null>((resolve) => shell.once("exit", resolve));
  const shellPid = shell.pid ?? 0;

  const sidecarPid = await waitFor("the sidecar", 60, () => pids(SIDECAR)[0] ?? null);
  const [socket, ...others] = await waitFor("the sidecar to listen", 30, () => {
    const sockets = listening(sidecarPid);
    return sockets.length > 0 ? sockets : null;
  });
  check(
    others.length === 0 && socket?.startsWith("127.0.0.1:") === true,
    `the sidecar listens on 127.0.0.1 only (${socket})`,
  );
  const health = await fetch(`http://${socket}/api/health`);
  const body = (await health.json()) as { version?: unknown };
  check(
    health.status === 200 && typeof body.version === "string",
    `/api/health answers (version ${String(body.version)})`,
  );
  await waitFor("the app window", 30, () => (hasWindow(shellPid) ? true : null));
  check(true, "the app window opened");

  const second = await run(app);
  check(second === 0, "a second launch exits with code 0");
  check(pids(SIDECAR).length === 1, "one sidecar still runs after the second launch");

  powershell(`(Get-Process -Id ${shellPid}).CloseMainWindow() | Out-Null`);
  await Promise.race([shellExit, sleep(20_000).then(() => Promise.reject(new Error("smoke: the shell did not exit")))]);
  check(true, "closing the window ends the shell");
  await waitFor("the sidecar to stop", 15, () => (pids(SIDECAR).length === 0 ? true : null));
  check(true, "closing the window ends the sidecar");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { installer: { type: "string" }, app: { type: "string" } } });
  if (values.app) return smokeRun(values.app);
  if (!values.installer) throw new Error("usage: smoke.ts --installer <setup.exe> | --app <senstosales.exe>");

  check((await run(values.installer, ["/S"])) === 0, "the installer runs silently without admin rights");
  const app = join(INSTALL_DIR, "senstosales.exe");
  check(existsSync(app), `the app is installed in ${INSTALL_DIR}`);
  await smokeRun(app);
  check(existsSync(join(DATA_DIR, "db", "senstosales.db")), `the data is in ${DATA_DIR}`);

  check((await run(join(INSTALL_DIR, "uninstall.exe"), ["/S"])) === 0, "the uninstaller runs silently");
  await waitFor("the uninstaller to remove the app", 60, () => (existsSync(app) ? null : true));
  check(existsSync(join(DATA_DIR, "db", "senstosales.db")), "uninstalling leaves the data");
}

await main();
