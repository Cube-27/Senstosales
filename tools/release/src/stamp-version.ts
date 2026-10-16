// SPEC-20 §4.1, INV-105: the root `VERSION` file is the one version. This stamps it into every workspace
// package.json, tauri.conf.json (the installer and the updater compare it) and the Rust crate. The SEA and
// `/api/health` read apps/api/package.json, so stamping that covers both. `--check` (in `check`) fails on drift.
//   node tools/release/src/stamp-version.ts [--check]
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

export type Format = "json" | "cargo-toml" | "cargo-lock";

const ROOT = join(import.meta.dirname, "../../..");
/** The pnpm-workspace.yaml globs, each `<dir>/*`. */
const WORKSPACE_DIRS = ["apps", "packages", "tools"];
const TAURI = "apps/desktop/src-tauri";
const FIXED_TARGETS: ReadonlyArray<{ path: string; format: Format }> = [
  { path: "package.json", format: "json" },
  { path: `${TAURI}/tauri.conf.json`, format: "json" },
  { path: `${TAURI}/Cargo.toml`, format: "cargo-toml" },
  { path: `${TAURI}/Cargo.lock`, format: "cargo-lock" },
];

/** Tauri and the NSIS updater compare plain major.minor.patch; nothing else is accepted. */
export function parseVersion(text: string): string {
  const version = text.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION must be major.minor.patch, like 1.4.0; it is "${version}".`);
  }
  return version;
}

/** The first match of each pattern is the file's own version: the top-level key, [package], the app crate. */
const VERSION_FIELD: Record<Format, RegExp> = {
  json: /^(\s*"version":\s*")[^"]*(")/m,
  "cargo-toml": /^(version = ")[^"]*(")/m,
  "cargo-lock": /^(name = "senstosales"\nversion = ")[^"]*(")/m,
};
const JSON_NAME = /^(\s*)"name":\s*"[^"]*",\n/m;

/** `text` with its version set to `version`; a package.json without one gets it after its name. */
export function stamp(text: string, format: Format, version: string): string {
  const field = VERSION_FIELD[format];
  if (field.test(text)) return text.replace(field, `$1${version}$2`);
  if (format === "json" && JSON_NAME.test(text)) {
    return text.replace(JSON_NAME, (line, indent: string) => `${line}${indent}"version": "${version}",\n`);
  }
  throw new Error(format === "json" ? "no version or name field" : "no version field");
}

async function targets(root: string): Promise<Array<{ path: string; format: Format }>> {
  const packages: Array<{ path: string; format: Format }> = [];
  for (const dir of WORKSPACE_DIRS) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${dir}/${entry.name}/package.json`;
      const exists = await readFile(join(root, path)).then(
        () => true,
        () => false,
      );
      if (exists) packages.push({ path, format: "json" });
    }
  }
  return [...FIXED_TARGETS, ...packages];
}

/** Stamps every target with `root/VERSION`, or with `check` only lists the ones that differ (sorted). */
export async function stampAll(
  root: string,
  { check }: { check: boolean },
): Promise<{ version: string; stale: string[] }> {
  const version = parseVersion(await readFile(join(root, "VERSION"), "utf8"));
  const stale: string[] = [];
  for (const { path, format } of await targets(root)) {
    const text = await readFile(join(root, path), "utf8");
    let next: string;
    try {
      next = stamp(text, format, version);
    } catch (err) {
      throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (next === text) continue;
    stale.push(path);
    if (!check) await writeFile(join(root, path), next);
  }
  return { version, stale: stale.toSorted() };
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
