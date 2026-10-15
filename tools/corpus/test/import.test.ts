// SPEC-09 PR 1: the corpus import runner over the anonymised parser fixtures copied to a temp folder (C1, INV-76),
// imported through the folder-import jobs into a temp data folder. The owner's corpus is never read here.
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { importCorpus } from "../src/import.ts";

const FIXTURES = fileURLToPath(new URL("../../../packages/parsers/fixtures", import.meta.url));
const RUNNER = fileURLToPath(new URL("../src/import.ts", import.meta.url));

// A full import migrates a database and ingests about seventy pages.
vi.setConfig({ testTimeout: 60_000 });

let tmp: string;
let corpusDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-corpus-test-"));
  corpusDir = join(tmp, "corpus");
  // Pages only: the fixtures' `.expected.json` files sit beside them and are left behind by the runner's filter.
  await cp(FIXTURES, corpusDir, { recursive: true });
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

describe("importCorpus", () => {
  test("imports the fixture POs then SRVs through the jobs, with a broken page failing on its own, twice", async () => {
    await writeFile(join(corpusDir, "po", "zz-broken.html"), "<html><body><p>Not a purchase order</p></body></html>");
    const dataDir = join(tmp, "data");

    const result = await importCorpus({ corpusDir, dataDir });

    expect(result).toEqual({
      po: {
        job: {
          status: "done",
          error: null,
          summary: {
            total: 43,
            done: 42,
            skipped: 0,
            failed: 1,
            skippedDocuments: [],
            failedDocuments: [
              {
                document: "zz-broken.html",
                reason: "Could not read this PO page (missing-field): PURCHASE ORDER is missing",
              },
            ],
            flags: {},
          },
        },
        tooLarge: [],
      },
      srv: {
        job: {
          status: "done",
          error: null,
          summary: {
            total: 30,
            done: 30,
            skipped: 0,
            failed: 0,
            skippedDocuments: [],
            failedDocuments: [],
            flags: { DOC_NUMBER_CONFLICT: 102, QTY_MISMATCH: 1 },
          },
        },
        tooLarge: [],
      },
      logged: [],
      passed: true,
    });

    // Again into the same data folder: the database is reused, each page is accepted again with the same date, and
    // no flag is opened twice.
    const again = await importCorpus({ corpusDir, dataDir });
    expect(again.passed).toBe(true);
    expect(again.po.job.summary).toMatchObject({ total: 43, done: 42, failed: 1, flags: {} });
    expect(again.srv.job.summary).toMatchObject({ total: 30, done: 30, flags: {} });
  });

  test("refuses a corpus without SRV pages before it makes a database", async () => {
    await rm(join(corpusDir, "srv"), { recursive: true });
    await mkdir(join(corpusDir, "srv"));
    const dataDir = join(tmp, "data");

    await expect(importCorpus({ corpusDir, dataDir })).rejects.toThrow(
      "The corpus has no .html pages in its srv/ folder.",
    );
    await expect(readdir(dataDir)).rejects.toThrow("ENOENT");
  });
});

describe("pnpm import:corpus", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, [RUNNER], { env: { ...process.env, ...env, TMPDIR: tmp, TEMP: tmp, TMP: tmp } });

  test("imports SENSTO_CORPUS_DIR into a new data folder in the OS temp folder and exits 0", async () => {
    // One page of each kind keeps the run short; the import itself is covered above.
    await rm(corpusDir, { recursive: true });
    await cp(join(FIXTURES, "po", "era2-single-item.html"), join(corpusDir, "po", "a.html"));
    await cp(join(FIXTURES, "srv", "layout-a-single.html"), join(corpusDir, "srv", "a.html"));

    const child = run({ SENSTO_CORPUS_DIR: corpusDir });

    expect(child.stderr.toString()).toBe("");
    expect(child.status).toBe(0);
    const dataDirs = (await readdir(tmp)).filter((name) => name.startsWith("senstosales-corpus-"));
    expect(dataDirs).toHaveLength(1);
    expect(child.stdout.toString()).toBe(`Corpus import passed. Data folder: ${join(tmp, dataDirs[0] ?? "")}\n`);
  });

  test("exits 1 with a plain message when SENSTO_CORPUS_DIR is unset", () => {
    const child = run({ SENSTO_CORPUS_DIR: "" });

    expect(child.status).toBe(1);
    expect(child.stderr.toString()).toBe(
      "Set SENSTO_CORPUS_DIR to the folder holding the po/ and srv/ page folders.\n",
    );
  });
});
