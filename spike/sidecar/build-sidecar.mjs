// Bundle server/main.ts with esbuild (CJS: the SEA main is a CommonJS script) and build a single executable from a
// given node.exe. Node >= 25.5 builds it in one step (--build-sea); Node 24 needs a blob plus postject.
// Usage: node build-sidecar.mjs <node.exe>   (SIGNTOOL = Windows SDK signtool.exe, used on the Node 24 path)
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const node = process.argv[2];
if (!node) throw new Error("usage: node build-sidecar.mjs <node.exe>");
const major = Number(execFileSync(node, ["-p", "process.versions.node.split('.')[0]"], { encoding: "utf8" }).trim());
mkdirSync("dist", { recursive: true });
mkdirSync("shell/src-tauri/binaries", { recursive: true });
await build({
  entryPoints: ["server/main.ts"],
  bundle: true,
  platform: "node",
  target: `node${major}`,
  format: "cjs",
  outfile: "dist/sidecar.cjs",
  minify: true,
});

const exe = "dist/sensto-sidecar.exe";
const sea = { main: "dist/sidecar.cjs", disableExperimentalSEAWarning: true, useCodeCache: true };
if (major >= 26) {
  writeFileSync("dist/sea-config.json", JSON.stringify({ ...sea, executable: node, output: exe }));
  execFileSync(node, ["--build-sea", "dist/sea-config.json"], { stdio: "inherit" });
} else {
  writeFileSync("dist/sea-config.json", JSON.stringify({ ...sea, output: "dist/sea-prep.blob" }));
  execFileSync(node, ["--experimental-sea-config", "dist/sea-config.json"], { stdio: "inherit" });
  copyFileSync(node, exe);
  // Injection invalidates node.exe's signature; remove it first.
  if (process.env.SIGNTOOL) execFileSync(process.env.SIGNTOOL, ["remove", "/s", exe], { stdio: "inherit" });
  execFileSync(
    process.execPath,
    ["node_modules/postject/dist/cli.js", exe, "NODE_SEA_BLOB", "dist/sea-prep.blob",
      "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"],
    { stdio: "inherit" },
  );
}
// Tauri's externalBin wants the target triple in the file name.
copyFileSync(exe, "shell/src-tauri/binaries/sensto-sidecar-x86_64-pc-windows-msvc.exe");
console.log(`node ${major}:`, "bundle", statSync("dist/sidecar.cjs").size, "sea", statSync(exe).size);
