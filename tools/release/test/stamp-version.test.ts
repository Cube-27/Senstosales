// SPEC-20 PR 5, INV-105: one VERSION stamped into every package.json and tauri.conf.json. `--check` lists the
// files that differ without writing them.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { parseVersion, stamp, stampAll } from "../src/stamp-version.ts";

describe("parseVersion", () => {
  it("takes major.minor.patch with a trailing newline", () => {
    expect(parseVersion("1.2.3\n")).toBe("1.2.3");
  });

  it("refuses anything else", () => {
    expect(() => parseVersion("1.2")).toThrow('VERSION must be major.minor.patch, like 1.4.0; it is "1.2".');
    expect(() => parseVersion("v1.2.3")).toThrow('it is "v1.2.3"');
    expect(() => parseVersion("1.2.3-beta")).toThrow('it is "1.2.3-beta"');
  });
});

describe("stamp", () => {
  it("replaces a package.json version", () => {
    const text = '{\n  "name": "@x/a",\n  "version": "0.1.0",\n  "private": true\n}\n';
    expect(stamp(text, "2.0.1")).toBe('{\n  "name": "@x/a",\n  "version": "2.0.1",\n  "private": true\n}\n');
  });

  it("adds a version after the name when a package.json has none", () => {
    const text = '{\n  "name": "@x/a",\n  "private": true\n}\n';
    expect(stamp(text, "2.0.1")).toBe('{\n  "name": "@x/a",\n  "version": "2.0.1",\n  "private": true\n}\n');
  });

  it("adds a version after a name that is the last field", () => {
    expect(stamp('{\n  "name": "@x/a"\n}\n', "2.0.1")).toBe('{\n  "name": "@x/a",\n  "version": "2.0.1"\n}\n');
  });

  it("changes only the top-level version in tauri.conf.json", () => {
    const text = '{\n  "productName": "S",\n  "version": "0.1.0",\n  "plugins": { "x": { "version": "9" } }\n}\n';
    expect(stamp(text, "1.0.0")).toBe(
      '{\n  "productName": "S",\n  "version": "1.0.0",\n  "plugins": { "x": { "version": "9" } }\n}\n',
    );
  });

  it("fails loudly when there is nothing to stamp", () => {
    expect(() => stamp("{}\n", "1.0.0")).toThrow("no version or name field");
  });
});

describe("stampAll", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  /** A repo with VERSION 1.0.0 whose only out-of-date files are apps/web/package.json and tauri.conf.json. */
  async function repo(): Promise<string> {
    root = await mkdtemp(join(tmpdir(), "senstosales-stamp-"));
    const files: Record<string, string> = {
      VERSION: "1.0.0\n",
      "package.json": '{\n  "name": "root",\n  "version": "1.0.0"\n}\n',
      "apps/web/package.json": '{\n  "name": "@x/web",\n  "version": "0.1.0"\n}\n',
      "packages/domain/package.json": '{\n  "name": "@x/domain",\n  "version": "1.0.0"\n}\n',
      "tools/release/package.json": '{\n  "name": "@x/release",\n  "version": "1.0.0"\n}\n',
      "apps/desktop/src-tauri/tauri.conf.json": '{\n  "version": "0.9.0"\n}\n',
    };
    for (const [path, text] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), text);
    }
    return root;
  }

  it("in check mode lists the files that differ and writes nothing", async () => {
    const dir = await repo();
    expect(await stampAll(dir, { check: true })).toEqual({
      version: "1.0.0",
      stale: ["apps/desktop/src-tauri/tauri.conf.json", "apps/web/package.json"],
    });
    expect(await readFile(join(dir, "apps/web/package.json"), "utf8")).toBe(
      '{\n  "name": "@x/web",\n  "version": "0.1.0"\n}\n',
    );
  });

  it("otherwise writes them, after which check mode finds nothing", async () => {
    const dir = await repo();
    await stampAll(dir, { check: false });
    expect(await readFile(join(dir, "apps/web/package.json"), "utf8")).toBe(
      '{\n  "name": "@x/web",\n  "version": "1.0.0"\n}\n',
    );
    expect(await stampAll(dir, { check: true })).toEqual({ version: "1.0.0", stale: [] });
  });
});
