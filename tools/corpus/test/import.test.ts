// SPEC-09 PR 1: the corpus import runner over the anonymised parser fixtures copied to a temp folder (C1, INV-76),
// imported through the folder-import jobs into a temp data folder. The owner's corpus is never read here.
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { importCorpus } from "../src/import.ts";

const FIXTURES = fileURLToPath(new URL("../../../packages/parsers/fixtures", import.meta.url));
const RUNNER = fileURLToPath(new URL("../src/import.ts", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

// A full import migrates a database and ingests about seventy pages.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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
            total: 44,
            done: 43,
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
            total: 31,
            done: 31,
            skipped: 0,
            failed: 0,
            skippedDocuments: [],
            failedDocuments: [],
            flags: { DOC_NUMBER_CONFLICT: 110, QTY_MISMATCH: 1 },
          },
        },
        tooLarge: [],
      },
      logged: [],
      totals: {
        flagsByType: {
          QTY_MISMATCH: 1,
          DOC_NUMBER_CONFLICT: 110,
          OVER_DISPATCH: 0,
          OVER_INVOICE: 0,
          DOC_ON_CANCELLED_ITEM: 0,
          MANUAL_ADJUSTMENT_OVERLAP: 0,
        },
        posByStatus: { Pending: 26, Delivered: 0, Closed: 17 },
        srvsPoNotFound: 0,
      },
      passed: true,
    });

    // Again into the same data folder: the database is reused, each page is accepted again with the same date, and
    // no flag is opened twice.
    const again = await importCorpus({ corpusDir, dataDir });
    expect(again.passed).toBe(true);
    expect(again.po.job.summary).toMatchObject({ total: 44, done: 43, failed: 1, flags: {} });
    expect(again.srv.job.summary).toMatchObject({ total: 31, done: 31, flags: {} });
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

  test("imports SENSTO_CORPUS_DIR into a new data folder and writes the report, both in the OS temp folder", async () => {
    // One page of each kind keeps the run short; the import itself is covered above.
    await rm(corpusDir, { recursive: true });
    await cp(join(FIXTURES, "po", "era2-single-item.html"), join(corpusDir, "po", "a.html"));
    await cp(join(FIXTURES, "srv", "layout-a-single.html"), join(corpusDir, "srv", "a.html"));

    const child = run({ SENSTO_CORPUS_DIR: corpusDir });

    expect(child.stderr.toString()).toBe("");
    expect(child.status).toBe(0);
    const dataDirs = (await readdir(tmp)).filter((name) => name.startsWith("senstosales-corpus-"));
    expect(dataDirs).toHaveLength(1);
    const report = join(tmp, "import-report.md");
    expect(child.stdout.toString()).toBe(
      `Corpus import passed. Data folder: ${join(tmp, dataDirs[0] ?? "")}\nReport: ${report}\n`,
    );
    expect(await readFile(report, "utf8")).toContain("| PO | 1 | 1 | 0 | 0 | 0 |\n| SRV | 1 | 1 | 0 | 0 | 0 |\n");
    expect(JSON.parse(await readFile(join(tmp, "import-report.json"), "utf8"))).toMatchObject({ passed: true });
  });

  test("refuses a SENSTO_REPORT_DIR inside the repository before it imports anything", async () => {
    const child = run({ SENSTO_CORPUS_DIR: corpusDir, SENSTO_REPORT_DIR: join(REPO, "tools", "corpus", "out") });

    expect(child.status).toBe(1);
    expect(child.stderr.toString()).toBe(
      "Corpus import failed: SENSTO_REPORT_DIR is inside the repository. Choose a folder outside it.\n",
    );
    await expect(readdir(join(REPO, "tools", "corpus", "out"))).rejects.toThrow("ENOENT");
    expect((await readdir(tmp)).filter((name) => name.startsWith("senstosales-corpus-"))).toEqual([]);
  });

  // CodeAnt on #56: the check compared paths as text, so a link outside the repo led into it.
  test("refuses a SENSTO_REPORT_DIR that leads into the repository through a link", async () => {
    const link = join(tmp, "linked");
    await symlink(join(REPO, "tools", "corpus"), link, "junction");
    const child = run({ SENSTO_CORPUS_DIR: corpusDir, SENSTO_REPORT_DIR: join(link, "out") });

    expect(child.status).toBe(1);
    expect(child.stderr.toString()).toBe(
      "Corpus import failed: SENSTO_REPORT_DIR is inside the repository. Choose a folder outside it.\n",
    );
    await expect(readdir(join(REPO, "tools", "corpus", "out"))).rejects.toThrow("ENOENT");
  });

  test("exits 1 with a plain message when SENSTO_CORPUS_DIR is unset", () => {
    const child = run({ SENSTO_CORPUS_DIR: "" });

    expect(child.status).toBe(1);
    expect(child.stderr.toString()).toBe(
      "Set SENSTO_CORPUS_DIR to the folder holding the po/ and srv/ page folders.\n",
    );
  });
});
