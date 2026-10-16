// SPEC-20 PR 5, INV-93: writes latest.json beside the signed installer. The release workflow publishes both in the
// `v<VERSION>` release; the updater endpoint (tauri.conf.json) is the newest release's latest.json, and the app checks
// the signature against the committed public key before it installs anything.
//   node tools/release/src/updater-manifest.ts <bundle/nsis dir>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseVersion } from "./stamp-version.ts";

const RELEASES = "https://github.com/Cube-27/Senstosales/releases";
const ROOT = join(import.meta.dirname, "../../..");

/** Writes `dir/latest.json` for the `version` installer in `dir` and returns its path. */
export async function writeManifest({
  dir,
  version,
  pubDate,
}: {
  dir: string;
  version: string;
  pubDate: string;
}): Promise<string> {
  const suffix = `_${version}_x64-setup.exe`;
  const installer = (await readdir(dir)).find((name) => name.endsWith(suffix));
  if (installer === undefined) throw new Error(`No *${suffix} in ${dir}.`);
  const signature = await readFile(join(dir, `${installer}.sig`), "utf8").catch(() => {
    throw new Error(`${installer} has no .sig: was TAURI_SIGNING_PRIVATE_KEY set for the build?`);
  });
  const manifest = {
    version,
    notes: `SenstoSales ${version}`,
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": {
        signature: signature.trim(),
        url: `${RELEASES}/download/v${version}/${encodeURIComponent(installer)}`,
      },
    },
  };
  const path = join(dir, "latest.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (dir === undefined) throw new Error("Usage: updater-manifest.ts <bundle/nsis dir>");
  const version = parseVersion(await readFile(join(ROOT, "VERSION"), "utf8"));
  console.log(await writeManifest({ dir, version, pubDate: new Date().toISOString() }));
}

if (import.meta.main) await main();
