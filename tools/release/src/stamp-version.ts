// SPEC-20 §4.1, INV-105: the root `VERSION` file is the one version. This stamps it into every workspace
// package.json and tauri.conf.json, where the installer and the updater read it (Tauri ignores the Rust crate's
// version when the config has one). The SEA and `/api/health` read apps/api/package.json, so stamping that covers
// both. `--check` (in `check`) fails on drift.
//   node tools/release/src/stamp-version.ts [--check]
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

export const ROOT = join(import.meta.dirname, "../../..");
/** The pnpm-workspace.yaml globs, each `<dir>/*`. */
const WORKSPACE_DIRS = ["apps", "packages", "tools"];
const FIXED_TARGETS = ["package.json", "apps/desktop/src-tauri/tauri.conf.json"];

/** Tauri and the NSIS updater compare plain major.minor.patch; nothing else is accepted. */
export function parseVersion(text: string): string {
  const version = text.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION must be major.minor.patch, like 1.4.0; it is "${version}".`);
  }
  return version;
}

export const readVersion = async (root: string): Promise<string> =>
  parseVersion(await readFile(join(root, "VERSION"), "utf8"));

// Text edits, not JSON.stringify, so each file keeps its formatting. The first match is the top-level key: neither
// package.json nor tauri.conf.json has a nested "version" before it.
// Indents are spaces or tabs, never `\s`, so a match cannot run across lines.
const VERSION_FIELD = /^([ \t]*"version": *")[^"]*(")/m;
const NAME_FIELD = /^([ \t]*)("name": *"[^"]*")(,?)\n/m;

/** `text` with its version set to `version`; a package.json without one gets it after its name. */
export function stamp(text: string, version: string): string {
  if (VERSION_FIELD.test(text)) return text.replace(VERSION_FIELD, `$1${version}$2`);
  if (NAME_FIELD.test(text))
    return text.replace(
      NAME_FIELD,
      (_line, indent: string, name: string, comma: string) =>
        `${indent}${name},\n${indent}"version": "${version}"${comma}\n`,
    );
  throw new Error("no version or name field");
}

async function targets(root: string): Promise<string[]> {
  const listings = await Promise.all(
    WORKSPACE_DIRS.map(async (dir) =>
      (await readdir(join(root, dir), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${dir}/${entry.name}/package.json`),
    ),
  );
  return [...FIXED_TARGETS, ...listings.flat().filter((path) => existsSync(join(root, path)))];
}

/** `path` restamped, or null when it already carries `version`. */
async function restamp(root: string, path: string, version: string): Promise<string | null> {
  const text = await readFile(join(root, path), "utf8");
  try {
    const next = stamp(text, version);
    return next === text ? null : next;
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Stamps every target with `root/VERSION`, or with `check` only lists the ones that differ (sorted). */
export async function stampAll(
  root: string,
  { check }: { check: boolean },
): Promise<{ version: string; stale: string[] }> {
  const version = await readVersion(root);
  const results = await Promise.all(
    (await targets(root)).map(async (path) => ({ path, text: await restamp(root, path, version) })),
  );
  const changed = results.flatMap(({ path, text }) => (text === null ? [] : [{ path, text }]));
  if (!check) await Promise.all(changed.map(({ path, text }) => writeFile(join(root, path), text)));
  return { version, stale: changed.map(({ path }) => path).toSorted((a, b) => a.localeCompare(b)) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const { version, stale } = await stampAll(ROOT, { check: values.check });
  if (values.check && stale.length > 0) {
    console.error(`These files do not carry VERSION ${version}; run node tools/release/src/stamp-version.ts:`);
    for (const path of stale) console.error(`  ${path}`);
    process.exitCode = 1;
  } else if (!values.check) {
    console.log(`Stamped ${version} into ${stale.length} file(s).`);
  }
}

if (import.meta.main) await main();
