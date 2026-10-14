// Lifecycle checks on the built shell. Usage: node measure/shell.mjs <appDir> <dataBaseDir> <runs>
// appDir holds sensto-spike.exe and sensto-sidecar.exe (copy it to a path with spaces / non-ASCII to test those).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [appDir, base, runsArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 5);
const shellExe = join(appDir, "sensto-spike.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alive = (pid) => execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(String(pid));
const count = (image) =>
  execFileSync("tasklist", ["/FI", `IMAGENAME eq ${image}`, "/NH"], { encoding: "utf8" }).split("\n").filter((l) => l.startsWith(image)).length;
const events = (dir) => (existsSync(join(dir, "events.log")) ? readFileSync(join(dir, "events.log"), "utf8") : "");
const foregroundPid = () =>
  execFileSync("powershell", ["-NoProfile", "-Command",
    `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);'; $p=0; [void][U.W]::GetWindowThreadProcessId([U.W]::GetForegroundWindow(), [ref]$p); $p`],
    { encoding: "utf8" }).trim();

async function until(pred, timeoutMs) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (pred()) return performance.now() - t0;
    await sleep(20);
  }
  return null;
}

async function launch() {
  const dataDir = mkdtempSync(join(base, "shell-"));
  const t0 = performance.now();
  const shell = spawn(shellExe, [], { env: { ...process.env, SENSTO_DATA_DIR: dataDir }, stdio: "ignore" });
  const firstPage = await until(() => events(dataDir).includes("first-page"), 30000);
  const port = readFileSync(join(dataDir, "port"), "utf8");
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  return { shell, dataDir, firstPage: firstPage ?? performance.now() - t0, health };
}

const startup = [];
const closes = [];
for (let i = 0; i < runs; i++) {
  const { shell, dataDir, firstPage, health } = await launch();
  startup.push(firstPage);
  // Window close: taskkill without /F posts WM_CLOSE, as clicking X does.
  execFileSync("taskkill", ["/PID", String(shell.pid)], { stdio: "ignore" });
  const gone = await until(() => !alive(health.pid), 10000);
  closes.push({ gone, viaEof: events(dataDir).includes("stdin-eof") });
}
console.log("start -> first page served (ms):", startup.map((t) => t.toFixed(0)).join(", "));
console.log("close -> sidecar PID gone (ms):", closes.map((c) => (c.gone === null ? "STILL ALIVE" : c.gone.toFixed(0))).join(", "));
console.log("sidecar exited via stdin EOF (vs killed):", closes.map((c) => c.viaEof).join(", "));

// Single instance: a second launch exits, no second sidecar, the first window gets focus.
{
  const first = await launch();
  const t0 = performance.now();
  const second = spawn(shellExe, [], { env: process.env, stdio: "ignore" });
  const secondExit = await new Promise((r) => second.on("exit", (code) => r({ code, ms: performance.now() - t0 })));
  await sleep(500);
  console.log("second launch exit:", JSON.stringify(secondExit), "shells:", count("sensto-spike.exe"), "sidecars:", count("sensto-sidecar.exe"),
    "foreground is first shell:", foregroundPid() === String(first.shell.pid));
  execFileSync("taskkill", ["/PID", String(first.shell.pid)], { stdio: "ignore" });
  await until(() => !alive(first.health.pid), 10000);
}

// Hard kill of the shell (Task Manager / crash): does the sidecar notice?
{
  const { shell, dataDir, health } = await launch();
  execFileSync("taskkill", ["/F", "/PID", String(shell.pid)], { stdio: "ignore" });
  const gone = await until(() => !alive(health.pid), 10000);
  console.log("hard kill -> sidecar gone (ms):", gone === null ? "STILL ALIVE" : gone.toFixed(0), "via stdin EOF:", events(dataDir).includes("stdin-eof"));
  if (gone === null) execFileSync("taskkill", ["/F", "/PID", String(health.pid)], { stdio: "ignore" });
}
console.log("last health:", JSON.stringify((await launchAndClose())));

async function launchAndClose() {
  const { shell, health } = await launch();
  execFileSync("taskkill", ["/PID", String(shell.pid)], { stdio: "ignore" });
  await until(() => !alive(health.pid), 10000);
  return { execPath: health.execPath, dataDir: health.dataDir, sqliteVersion: health.sqliteVersion, node: health.node };
}
