// INV-90 (SPEC-00 §4.5, D-0008): all production code is TypeScript. Fails when a tracked file under
// packages/*/src or apps/*/src is neither .ts/.tsx nor a named asset type (styles, data, images, fonts): an unlisted
// extension fails, so a new language can't pass as an asset. Tests, config, tools and the Tauri scaffold
// (apps/desktop/src-tauri) are not production sources.
// Usage: node tools/checks/src/language.ts (from the repo root)
import { extname } from "node:path";

import { selectFiles } from "./real-data-scan.ts";

export const PRODUCTION_SOURCE = /^(?:packages|apps)\/[^/]+\/src\//;
const ALLOWED = new Set(
  "ts tsx css json svg png jpg jpeg gif webp avif ico woff woff2 ttf otf".split(" ").map((ext) => `.${ext}`),
);

export const nonTypeScriptSources = (paths: string[]): string[] =>
  paths.filter((path) => PRODUCTION_SOURCE.test(path) && !ALLOWED.has(extname(path).toLowerCase()));

function main(): number {
  const found = nonTypeScriptSources(selectFiles(false).map((file) => file.path));
  for (const path of found) console.error(`${path}: production source must be TypeScript (INV-90)`);
  return found.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
