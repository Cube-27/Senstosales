// INV-104 (ARCHITECTURE §12.1): the web shell stays within 250 kB gzip. The shell is what the first page load fetches:
// every script and stylesheet the built `index.html` names (Vite lists the entry's static imports as modulepreload
// links). Route chunks load on navigation and are not counted.
// Usage: node tools/checks/src/bundle-budget.ts [dist] (after `pnpm check:build`; default apps/web/dist)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 250_000;

/** The `src`/`href` of each script and stylesheet in `html`, as paths under the dist root. */
export function shellAssets(html: string): string[] {
  const refs = html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="\/?([^"]+\.(?:js|css))"/g);
  return [...new Set(Array.from(refs, (m) => m[1] as string))];
}

/** Each shell asset with its gzip size, and their total. */
export function measureShell(dist: string): { files: Array<{ path: string; gzip: number }>; total: number } {
  const files = shellAssets(readFileSync(join(dist, "index.html"), "utf8")).map((path) => ({
    path,
    gzip: gzipSync(readFileSync(join(dist, path))).byteLength,
  }));
  return { files, total: files.reduce((sum, f) => sum + f.gzip, 0) };
}

/** 0 when the shell in `dist` fits the budget, 1 when it does not or `dist` has no build. */
export function main(dist: string): number {
  if (!existsSync(join(dist, "index.html"))) {
    console.error(`bundle-budget: ${dist}/index.html not found; run \`pnpm check:build\` first`);
    return 1;
  }
  const { files, total } = measureShell(dist);
  for (const f of files) console.log(`${f.path} ${(f.gzip / 1000).toFixed(2)} kB gzip`);
  const over = total > BUDGET_BYTES;
  (over ? console.error : console.log)(
    `bundle-budget: shell is ${(total / 1000).toFixed(2)} kB gzip of ${BUDGET_BYTES / 1000} kB`,
  );
  return over ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv[2] ?? "apps/web/dist"));
