import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Planted-violation probe: runs the real `vp lint` with the repo's vite.config.ts over files written to a temp
// workspace, and returns the `<path> <rule>` pairs it reports.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VP = join(REPO, "node_modules", "vite-plus", "bin", "vp");

function lint(files: Record<string, string>): string[] {
  const dir = mkdtempSync(join(tmpdir(), "lint-probe-"));
  writeFileSync(join(dir, "package.json"), '{ "name": "lint-probe", "private": true, "type": "module" }');
  const config = join(REPO, "vite.config.ts").replaceAll("\\", "/");
  writeFileSync(join(dir, "vite.config.ts"), `export { default } from "${config}";\n`);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), source);
  }
  let output: string;
  try {
    output = execFileSync(process.execPath, [VP, "lint", "--format", "json"], { cwd: dir, encoding: "utf8" });
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const { diagnostics } = JSON.parse(output) as { diagnostics: Array<{ filename: string; code: string }> };
  return diagnostics
    .map((d) => `${d.filename.replaceAll("\\", "/")} ${d.code.replace(/^eslint\((.*)\)$/, "$1")}`)
    .sort();
}

describe("lint boundaries (C12, C3)", () => {
  it("rejects runtime modules in core packages, bare builtins included, and allows them in platform adapters", () => {
    const fs =
      'import { readFileSync } from "fs";\nimport { join } from "node:path";\nexport const a = [join, readFileSync];\n';
    const playwright = 'import { chromium } from "playwright-core";\nexport const b = chromium;\n';
    expect(
      lint({
        "packages/domain/src/a.ts": fs,
        "packages/scraper/src/b.ts": playwright,
        "packages/db/src/platform/sqlite.ts": fs,
        "packages/scraper/src/platform/edge.ts": playwright,
        "packages/domain/src/platform/io.ts": fs,
      }),
    ).toEqual([
      "packages/domain/src/a.ts no-restricted-imports",
      "packages/domain/src/a.ts no-restricted-imports",
      "packages/domain/src/platform/io.ts no-restricted-imports",
      "packages/domain/src/platform/io.ts no-restricted-imports",
      "packages/scraper/src/b.ts no-restricted-imports",
    ]);
  }, 60_000);

  it("allows workspace packages whose name ends in a builtin's name, and still rejects runtime subpaths", () => {
    // `domain` is a Node builtin; a path pattern for it also matched `@senstosales/domain`.
    const domain = 'import { parseQty } from "@senstosales/domain";\nexport const q = parseQty;\n';
    const subpath = 'import { test } from "playwright/test";\nexport const t = test;\n';
    expect(lint({ "packages/schemas/src/q.ts": domain, "packages/schemas/src/t.ts": subpath })).toEqual([
      "packages/schemas/src/t.ts no-restricted-imports",
    ]);
  }, 60_000);

  it("rejects Tauri and node modules in the web app outside its platform adapter", () => {
    const tauri = 'import { TrayIcon } from "@tauri-apps/api/tray";\nexport const t = TrayIcon;\n';
    const fs = 'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n';
    expect(
      lint({
        "apps/web/src/components/common/a.tsx": tauri,
        "apps/web/src/lib/b.ts": fs,
        "apps/web/src/platform/tauri.ts": tauri,
      }),
    ).toEqual([
      "apps/web/src/components/common/a.tsx no-restricted-imports",
      "apps/web/src/lib/b.ts no-restricted-imports",
    ]);
  }, 60_000);

  it("rejects runtime subpaths more than one level deep", () => {
    const deep = [
      "node:fs/promises",
      "playwright-core/lib/server",
      "@playwright/test/reporter",
      "@tauri-apps/api/core",
    ];
    const source = deep.map((m) => `import "${m}";\n`).join("");
    expect(lint({ "packages/schemas/src/a.ts": source })).toEqual(
      deep.map(() => "packages/schemas/src/a.ts no-restricted-imports"),
    );
  }, 60_000);

  it("rejects Date and parseFloat in the domain only", () => {
    const source = "export const t = (): number => Date.now() + parseFloat('1');\n";
    expect(lint({ "packages/domain/src/t.ts": source, "packages/schemas/src/t.ts": source })).toEqual([
      "packages/domain/src/t.ts no-restricted-globals",
      "packages/domain/src/t.ts no-restricted-globals",
    ]);
  }, 60_000);
});
