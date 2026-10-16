// SPEC-20 PR 5, INV-93: latest.json, the manifest the updater reads from the newest GitHub release. It carries the
// installer's minisign signature, so the app installs only what the release key signed.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { writeManifest } from "../src/updater-manifest.ts";

const PUB_DATE = "2026-10-16T09:30:00.000Z";
const BASE = "https://github.com/example/app/releases/download";

describe("writeManifest", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function bundle(files: Record<string, string>): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), "senstosales-manifest-"));
    for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
    return dir;
  }

  it("points the updater at this version's installer in the tagged release, with its signature", async () => {
    const out = await bundle({
      "SenstoSales_1.2.0_x64-setup.exe": "MZ",
      "SenstoSales_1.2.0_x64-setup.exe.sig": "c2lnbmF0dXJl\n",
      "SenstoSales_1.1.0_x64-setup.exe": "MZ",
    });
    const path = await writeManifest({ dir: out, downloadBase: BASE, version: "1.2.0", pubDate: PUB_DATE });
    expect(path).toBe(join(out, "latest.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      version: "1.2.0",
      notes: "SenstoSales 1.2.0",
      pub_date: PUB_DATE,
      platforms: {
        "windows-x86_64": {
          signature: "c2lnbmF0dXJl",
          url: "https://github.com/example/app/releases/download/v1.2.0/SenstoSales_1.2.0_x64-setup.exe",
        },
      },
    });
  });

  it("refuses a build with no installer for the version", async () => {
    const out = await bundle({ "SenstoSales_1.1.0_x64-setup.exe": "MZ" });
    await expect(writeManifest({ dir: out, downloadBase: BASE, version: "1.2.0", pubDate: PUB_DATE })).rejects.toThrow(
      `No *_1.2.0_x64-setup.exe in ${out}.`,
    );
  });

  it("refuses an unsigned installer", async () => {
    const out = await bundle({ "SenstoSales_1.2.0_x64-setup.exe": "MZ" });
    await expect(writeManifest({ dir: out, downloadBase: BASE, version: "1.2.0", pubDate: PUB_DATE })).rejects.toThrow(
      "SenstoSales_1.2.0_x64-setup.exe has no .sig: was TAURI_SIGNING_PRIVATE_KEY set for the build?",
    );
  });
});
