import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { nonTypeScriptSources } from "../src/language.ts";

describe("nonTypeScriptSources", () => {
  it.each([
    "packages/domain/src/qty.js",
    "packages/domain/src/deep/nested/x.mjs",
    "packages/db/src/x.cjs",
    "apps/web/src/App.jsx",
    "apps/api/src/tool.py",
    "apps/desktop/src/run.sh",
    "packages/parsers/src/x.mts",
    "packages/domain/src/QTY.JS",
    "packages/db/src/query.sql",
  ])("flags %s", (path) => {
    expect(nonTypeScriptSources([path])).toEqual([path]);
  });

  it.each([
    "packages/domain/src/qty.ts",
    "apps/web/src/App.tsx",
    "packages/domain/src/types.d.ts",
    "apps/web/src/globals.css",
    "packages/schemas/src/data.json",
    "apps/web/src/logo.svg",
    // Outside production sources: tools, tests, config and the Tauri scaffold (D-0008).
    "tools/checks/src/x.py",
    "packages/domain/test/helper.js",
    "packages/domain/vite.config.js",
    "apps/desktop/src-tauri/src/main.rs",
    "packages/domain/srcx/a.js",
    "packages/db/migrations/0001_init.sql",
  ])("accepts %s", (path) => {
    expect(nonTypeScriptSources([path])).toEqual([]);
  });
});

describe("language CLI", () => {
  const git = (cwd: string, ...args: string[]): void => {
    execFileSync("git", args, { cwd, stdio: "pipe" });
  };
  const repo = (files: string[]): string => {
    const dir = mkdtempSync(join(tmpdir(), "lang-"));
    git(dir, "init", "-q");
    for (const path of files) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), "");
    }
    git(dir, "add", "-A");
    return dir;
  };
  const run = (cwd: string): { status: number | null; stderr: string } => {
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "../src/language.ts")], { cwd });
    rmSync(cwd, { recursive: true, force: true });
    return { status: result.status, stderr: result.stderr.toString() };
  };

  it("fails on a tracked .js file in packages/domain/src and names it", () => {
    expect(run(repo(["packages/domain/src/index.ts", "packages/domain/src/qty.js"]))).toEqual({
      status: 1,
      stderr: "packages/domain/src/qty.js: production source must be TypeScript (INV-90)\n",
    });
  });

  it("passes when every production source is TypeScript", () => {
    expect(run(repo(["packages/domain/src/index.ts", "tools/x.js"]))).toEqual({ status: 0, stderr: "" });
  });
});
