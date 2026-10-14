// Start the sidecar N times and time each step: spawn -> stdout port line, -> port file, -> /api/health 200,
// and stdin close -> process exit. Usage: node measure/sidecar.mjs <exe> [args...] -- <runs> <dataBaseDir>
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sep = process.argv.indexOf("--");
const [exe, ...args] = process.argv.slice(2, sep);
const runs = Number(process.argv[sep + 1]);
const base = process.argv[sep + 2];

async function health(port) {
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function once() {
  const dataDir = mkdtempSync(join(base, "run-"));
  const t0 = performance.now();
  const child = spawn(exe, args, { env: { ...process.env, SENSTO_DATA_DIR: dataDir }, stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise((r) => child.on("exit", (code) => r({ code, t: performance.now() })));
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d;
      const m = /SENSTO_PORT=(\d+)\r?\n/.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", () => reject(new Error(`exited before port: ${buf}`)));
  });
  const tPort = performance.now();
  const fileOk = existsSync(join(dataDir, "port")) && readFileSync(join(dataDir, "port"), "utf8") === String(port);
  const h = await health(port);
  const tHealth = performance.now();
  const tClose = performance.now();
  child.stdin.end();
  const ex = await exited;
  return { port: tPort - t0, health: tHealth - t0, exitAfterStdinClose: ex.t - tClose, code: ex.code, fileOk, h };
}

const results = [];
for (let i = 0; i < runs; i++) results.push(await once());
const stat = (k) => {
  const v = results.map((r) => r[k]).sort((a, b) => a - b);
  return `${k}: first ${results[0][k].toFixed(0)} ms, median ${v[Math.floor(v.length / 2)].toFixed(0)}, min ${v[0].toFixed(0)}, max ${v.at(-1).toFixed(0)} (n=${runs})`;
};
console.log(stat("port"));
console.log(stat("health"));
console.log(stat("exitAfterStdinClose"));
console.log("exit codes", [...new Set(results.map((r) => r.code))], "port file matched stdout in", results.filter((r) => r.fileOk).length, "of", runs);
console.log("last health", JSON.stringify(results.at(-1).h));
