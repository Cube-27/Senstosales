// The sidecar build (SPEC-20 PR 1, ADR 0001): esbuild bundles the API's node entry into one CommonJS file with the
// built SPA embedded, then Node 26 turns it into a single executable (`--build-sea`). `--fallback` instead writes the
// `node` binary beside the bundle (ARCHITECTURE §13.1); the shell ships the SEA.
// Usage: node tools/release/src/build-sidecar.ts [--fallback]
//   reads the built SPA from apps/web/dist and writes to apps/desktop/src-tauri/binaries, where Tauri's `externalBin`
//   looks. The folders are fixed: no path comes from the command line.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import { build, type Plugin } from "esbuild";

const ROOT = resolve(import.meta.dirname, "../../..");
/** The API's node entry; it exports `run(web)`. */
const MAIN = join(ROOT, "apps/api/src/platform/node/main.ts");
/** A module that exists only in the bundle: the built SPA, embedded. */
const WEB_MODULE = "senstosales:web";
const ENTRY = `import { run } from "./main.ts";\nimport { web } from "${WEB_MODULE}";\nrun(web);\n`;

/** Tauri's `externalBin` names each binary with the Rust target triple of the platform it runs on. */
const TARGET_TRIPLES: Readonly<Record<string, string>> = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
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

/** Every file under `web` as base64, keyed like the Storage port (`assets/app.js`). */
async function readWeb(web: string): Promise<Record<string, string>> {
  const entries = await readdir(web, { recursive: true, withFileTypes: true });
  const paths = entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
  const files = Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [relative(web, path).split(sep).join("/"), (await readFile(path)).toString("base64")]),
    ),
  );
  if (!files["index.html"]) throw new Error(`No index.html in ${web}: build apps/web first.`);
  return files;
}

/** Serves `senstosales:web`: the SPA's files, decoded once when the sidecar starts. */
function embedWeb(web: string): Plugin {
  return {
    name: "embed-web",
    setup(b) {
      b.onResolve({ filter: /^senstosales:web$/ }, () => ({ path: "web", namespace: "senstosales" }));
      b.onLoad({ filter: /.*/, namespace: "senstosales" }, async () => ({
        loader: "js",
        contents: `const files = new Map(
  Object.entries(${JSON.stringify(await readWeb(web))}).map(([key, file]) => [key, Buffer.from(file, "base64")]),
);
export const web = { get: async (key) => files.get(key) ?? null };`,
      }));
    },
  };
}

async function bundle(web: string, outfile: string): Promise<void> {
  await build({
    stdin: { contents: ENTRY, resolveDir: dirname(MAIN), sourcefile: "sidecar.ts", loader: "ts" },
    outfile,
    bundle: true,
    platform: "node",
    target: "node26",
    // A SEA's main script is CommonJS. There `import.meta` is empty, so main.ts's own start (`import.meta.main`) stays
    // off and the entry above starts it with the embedded SPA.
    format: "cjs",
    logOverride: { "empty-import-meta": "silent" },
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
  const { values } = parseArgs({ options: { fallback: { type: "boolean" } } });
  const sidecar = await buildSidecar({
    kind: values.fallback ? "fallback" : "sea",
    web: join(ROOT, "apps/web/dist"),
    outDir: join(ROOT, "apps/desktop/src-tauri/binaries"),
  });
  console.log(spawnArgs(sidecar).flat().join(" "));
}

if (import.meta.main) await main();
