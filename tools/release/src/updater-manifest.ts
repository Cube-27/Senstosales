// SPEC-20 PR 5, INV-93: writes latest.json beside the signed installer. The release workflow publishes both in the
// `v<VERSION>` release; the updater endpoint (tauri.conf.json) is the newest release's latest.json, and the app checks
// the signature against the committed public key before it installs anything. A signature from another key (a wrong
// secret) would make every installed copy refuse the update, so it stops the release here.
//   node tools/release/src/updater-manifest.ts <bundle/nsis dir> <https://github.com/o/r/releases/download> <pubkey>
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readVersion, ROOT } from "./stamp-version.ts";

/** The key id of a Tauri pubkey or signature string (base64 of minisign text; its second line is base64 of a 2-byte
 * algorithm, the 8-byte key id and the key or signature), in the byte order minisign prints. */
function keyId(tauriKey: string): string {
  const line = Buffer.from(tauriKey, "base64").toString("utf8").split("\n")[1] ?? "";
  return Buffer.from(line, "base64").subarray(2, 10).reverse().toString("hex").toUpperCase();
}

/** Writes `dir/latest.json` for the `version` installer in `dir`, downloaded from the `v<version>` release under
 * `downloadBase`, and returns its path. The signature must come from the key `pubkey` names. */
export async function writeManifest({
  dir,
  downloadBase,
  version,
  pubkey,
  pubDate,
}: {
  dir: string;
  downloadBase: string;
  version: string;
  pubkey: string;
  pubDate: string;
}): Promise<string> {
  const suffix = `_${version}_x64-setup.exe`;
  const installer = (await readdir(dir)).find((name) => name.endsWith(suffix));
  if (installer === undefined) throw new Error(`No *${suffix} in ${dir}.`);
  const signature = await readFile(join(dir, `${installer}.sig`), "utf8").catch(() => {
    throw new Error(`${installer} has no .sig: was TAURI_SIGNING_PRIVATE_KEY set for the build?`);
  });
  const [signedBy, trusted] = [keyId(signature.trim()), keyId(pubkey)];
  if (signedBy !== trusted) {
    throw new Error(
      `${installer} is signed with key ${signedBy}, but the updater trusts key ${trusted}: ` +
        "the signing secret does not match the pubkey in tauri.conf.json.",
    );
  }
  const manifest = {
    version,
    notes: `SenstoSales ${version}`,
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": {
        signature: signature.trim(),
        url: `${downloadBase}/v${version}/${encodeURIComponent(installer)}`,
      },
    },
  };
  const path = join(dir, "latest.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return path;
}

async function main(): Promise<void> {
  const [dir, downloadBase, pubkey] = process.argv.slice(2);
  if (dir === undefined || downloadBase === undefined || pubkey === undefined) {
    throw new Error("Usage: updater-manifest.ts <bundle/nsis dir> <release download base> <pubkey>");
  }
  const version = await readVersion(ROOT);
  console.log(await writeManifest({ dir, downloadBase, version, pubkey, pubDate: new Date().toISOString() }));
}

if (import.meta.main) await main();
