// INV-90 (SPEC-00 §4.5, D-0008): all production code is TypeScript. Fails when a tracked file under
// packages/*/src or apps/*/src has a code extension other than .ts/.tsx. Assets (CSS, JSON, SVG) are not code;
// tests, config, tools and the Tauri scaffold (apps/desktop/src-tauri) are not production sources.
// Usage: node tools/checks/src/language.ts (from the repo root)
import { execFileSync } from "node:child_process";

const PRODUCTION_SOURCE = /^(?:packages|apps)\/[^/]+\/src\//;
const OTHER_CODE =
  /\.(?:js|mjs|cjs|jsx|mts|cts|vue|svelte|coffee|py|rs|go|java|kt|kts|rb|php|pl|lua|swift|cs|c|cc|cpp|h|hpp|sh|bash|ps1|bat|cmd|wasm)$/i;

export const nonTypeScriptSources = (paths: string[]): string[] =>
  paths.filter((path) => PRODUCTION_SOURCE.test(path) && OTHER_CODE.test(path));

function main(): number {
  const tracked = execFileSync("git", ["ls-files", "-z"], { maxBuffer: 1 << 30 })
    .toString("utf8")
    .split("\0");
  const found = nonTypeScriptSources(tracked);
  for (const path of found) console.error(`${path}: production source must be TypeScript (INV-90)`);
  return found.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(main());
