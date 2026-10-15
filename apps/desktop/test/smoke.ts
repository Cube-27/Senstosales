// The desktop smoke test (SPEC-20 PR 4, ARCHITECTURE §14.1), Windows only, run by the `desktop` CI job. It installs
// per user with no admin rights into the program folder, runs the app and uninstalls it:
// - the app starts its sidecar, and `/api/health` answers on 127.0.0.1 only (C10);
// - a second launch exits and leaves one sidecar (single instance);
// - closing the window ends the shell and the sidecar;
// - the data stays in the data folder after the uninstall (INV-82).
// Usage: node apps/desktop/test/smoke.ts   (after `pnpm build:desktop`; CI only: it installs and runs the app)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const LOCALAPPDATA = process.env["LOCALAPPDATA"] ?? "";
/** ARCHITECTURE §13.2: the program folder and the data folder (INV-82). */
const INSTALL_DIR = join(LOCALAPPDATA, "Programs", "SenstoSales");
const APP = join(INSTALL_DIR, "senstosales.exe");
const DATABASE = join(LOCALAPPDATA, "SenstoSales", "db", "senstosales.db");

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`smoke: ${what}`);
  console.log(`ok - ${what}`);
}

/** Windows PowerShell by its full path, not looked up on PATH. */
const POWERSHELL = join(
  process.env["SystemRoot"] ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

/** The output lines of a PowerShell query; a failing query fails the test. */
const powershell = (script: string): string[] =>
  execFileSync(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" })
    .split(/\s+/)
    .filter(Boolean);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `probe` every 250 ms until it returns a value, or fails after `seconds`. */
async function waitFor<T>(what: string, seconds: number, probe: () => T | null): Promise<T> {
  for (const end = Date.now() + seconds * 1000; Date.now() < end; await sleep(250)) {
    const value = probe();
    if (value !== null) {
      console.log(`ok - ${what}`);
      return value;
    }
  }
  throw new Error(`smoke: timed out after ${seconds} s: ${what}`);
}

// CIM queries return nothing, without an error, when nothing matches.
const sidecarPids = (): number[] =>
  powershell(`Get-CimInstance Win32_Process -Filter "Name='sensto-sidecar.exe'" | ForEach-Object { $_.ProcessId }`).map(
    Number,
  );

/** The listening sockets (state 2) of process `pid`, as `address:port`. */
const listening = (pid: number): string[] =>
  powershell(
    `Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetTCPConnection -Filter "OwningProcess=${pid} AND State=2" | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }`,
  );

const hasWindow = (pid: number): boolean => powershell(`(Get-Process -Id ${pid}).MainWindowHandle`)[0] !== "0";

/** Runs `exe` until it exits; resolves with its exit code. */
const run = (exe: string, args: string[] = []): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", resolve);
  });

async function smokeRun(): Promise<void> {
  check(sidecarPids().length === 0, "no sidecar is running before the start");
  const shell = spawn(APP, [], { stdio: "ignore" });
  const shellPid = shell.pid ?? 0;
  let shellExited = false;
  shell.once("exit", () => (shellExited = true));

  const sidecarPid = await waitFor("the sidecar starts", 60, () => sidecarPids()[0] ?? null);
  const sockets = await waitFor("the sidecar listens", 30, () => {
    const found = listening(sidecarPid);
    return found.length > 0 ? found : null;
  });
  check(sockets.length === 1 && sockets[0]?.startsWith("127.0.0.1:") === true, "the sidecar listens on 127.0.0.1 only");
  const health = await fetch(`http://${sockets[0]}/api/health`);
  const body = (await health.json()) as { version?: unknown };
  check(health.status === 200 && typeof body.version === "string", "/api/health answers with a version");
  await waitFor("the app window opens", 30, () => (hasWindow(shellPid) ? true : null));

  check((await run(APP)) === 0, "a second launch exits with code 0");
  check(sidecarPids().length === 1, "one sidecar still runs after the second launch");

  powershell(`(Get-Process -Id ${shellPid}).CloseMainWindow() | Out-Null`);
  await waitFor("closing the window ends the shell", 20, () => (shellExited ? true : null));
  await waitFor("closing the window ends the sidecar", 15, () => (sidecarPids().length === 0 ? true : null));
}

async function main(): Promise<void> {
  const bundle = join(import.meta.dirname, "../src-tauri/target/release/bundle/nsis");
  const [setup, ...others] = readdirSync(bundle).filter((name) => name.endsWith("-setup.exe"));
  if (!setup || others.length > 0) throw new Error(`smoke: expected one installer in ${bundle}`);
  const installer = join(bundle, setup);
  check((await run(installer, ["/S"])) === 0, "the installer runs silently without admin rights");
  check(existsSync(APP), "the app is installed in %LOCALAPPDATA%\\Programs\\SenstoSales");
  await smokeRun();
  check(existsSync(DATABASE), "the data is in the data folder");

  check((await run(join(INSTALL_DIR, "uninstall.exe"), ["/S"])) === 0, "the uninstaller runs silently");
  await waitFor("the uninstaller removes the app", 60, () => (existsSync(APP) ? null : true));
  check(existsSync(DATABASE), "uninstalling leaves the data");
}

await main();
