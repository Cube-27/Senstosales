// The sidecar build (SPEC-20 PR 1, ADR 0001): esbuild bundles the API's node entry into one CommonJS file with the
// built SPA embedded, then Node 26 turns it into a single executable (`--build-sea`). `--fallback` instead writes the
// `node` binary beside the bundle (ARCHITECTURE §13.1); the shell ships the SEA.
// Usage: node tools/release/src/build-sidecar.ts [--fallback] [--web <dir>] [--out <dir>]
//   --web  the built SPA (default apps/web/dist)
//   --out  the output folder (default apps/desktop/src-tauri/binaries, where Tauri's `externalBin` looks)
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import { build, type Plugin } from "esbuild";

const ROOT = resolve(import.meta.dirname, "../../..");
const ENTRY = join(ROOT, "apps/api/src/platform/node/main.ts");
/** The module that reads the SPA from disk; the bundle gets an embedded copy instead. */
const WEB_FILES = /[\\/]platform[\\/]node[\\/]web-files\.ts$/;

/** Tauri's `externalBin` names each binary with the Rust target triple of the platform it runs on. */
const TARGET_TRIPLES: Readonly<Record<string, string>> = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "darwin-arm64": "aarch64-apple-darwin",
};

export type Sidecar =
  | { readonly kind: "sea"; readonly exe: string }
  | { readonly kind: "fallback"; readonly node: string; readonly bundle: string };

export interface BuildOptions {
  readonly kind: Sidecar["kind"];
  /** The built SPA folder. */
  readonly web: string;
  readonly outDir: string;
}

/** The program and arguments that start a built sidecar. */
export function spawnArgs(sidecar: Sidecar): [string, string[]] {
  return sidecar.kind === "sea" ? [sidecar.exe, []] : [sidecar.node, [sidecar.bundle]];
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** Replaces `web-files.ts` with a module serving every file of `web` from the bundle, keyed like the Storage port. */
function embedWeb(web: string): Plugin {
  return {
    name: "embed-web",
    setup(b) {
      b.onLoad({ filter: WEB_FILES }, async () => {
        const files: Record<string, string> = {};
        for (const path of await filesUnder(web)) {
          files[relative(web, path).split(sep).join("/")] = (await readFile(path)).toString("base64");
        }
        if (!files["index.html"]) throw new Error(`No index.html in ${web}: build apps/web first.`);
        return {
          loader: "js",
          contents: `const files = new Map(Object.entries(${JSON.stringify(files)}));
export const webFiles = () => ({
  async get(key) {
    const file = files.get(key);
    return file === undefined ? null : Buffer.from(file, "base64");
  },
});`,
        };
      });
    },
  };
}

async function bundle(web: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: "node",
    target: "node26",
    // A SEA's main script is CommonJS.
    format: "cjs",
    define: { "import.meta.main": "true" },
    // unzipper (under exceljs) requires the S3 SDK only inside `Open.s3_v3`, which nothing here calls.
    external: ["@aws-sdk/client-s3"],
    minifyWhitespace: true,
    minifySyntax: true,
    plugins: [embedWeb(web)],
    logLevel: "warning",
  });
}

export async function buildSidecar({ kind, web, outDir }: BuildOptions): Promise<Sidecar> {
  const exeSuffix = process.platform === "win32" ? ".exe" : "";
  await mkdir(outDir, { recursive: true });
  if (kind === "fallback") {
    const dir = join(outDir, "sensto-sidecar");
    const node = join(dir, `node${exeSuffix}`);
    const bundled = join(dir, "sidecar.cjs");
    await bundle(web, bundled);
    await copyFile(process.execPath, node);
    return { kind, node, bundle: bundled };
  }
  const triple = TARGET_TRIPLES[`${process.platform}-${process.arch}`];
  if (!triple) throw new Error(`No sidecar target for ${process.platform}-${process.arch}.`);
  const work = join(outDir, ".sidecar-build");
  const bundled = join(work, "sidecar.cjs");
  const exe = join(outDir, `sensto-sidecar-${triple}${exeSuffix}`);
  await bundle(web, bundled);
  const config = join(work, "sea-config.json");
  await writeFile(
    config,
    JSON.stringify({ main: bundled, output: exe, disableExperimentalSEAWarning: true, useCodeCache: true }),
  );
  execFileSync(process.execPath, ["--build-sea", config], { stdio: "inherit" });
  return { kind, exe };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { fallback: { type: "boolean" }, web: { type: "string" }, out: { type: "string" } },
  });
  const sidecar = await buildSidecar({
    kind: values.fallback ? "fallback" : "sea",
    web: resolve(values.web ?? join(ROOT, "apps/web/dist")),
    outDir: resolve(values.out ?? join(ROOT, "apps/desktop/src-tauri/binaries")),
  });
  console.log(spawnArgs(sidecar).flat().join(" "));
}

if (import.meta.main) await main();
