// SPEC-09 PR 2: the import report over anonymised parser fixtures copied to a temp folder (C1, INV-76): one PO and
// one SRV of it, plus a broken page, a page over the request cap, an older copy of the SRV and an SRV of a PO not in
// the corpus, so every list in the report has a row.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { importCorpus } from "../src/import.ts";
import { buildReport, type ImportReport, renderJson, renderMarkdown, writeReport } from "../src/report.ts";

const FIXTURES = fileURLToPath(new URL("../../../packages/parsers/fixtures", import.meta.url));

// The import in `beforeAll` migrates a database and reads an 11 MB page.
vi.setConfig({ hookTimeout: 60_000 });

let tmp: string;
let report: ImportReport;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-report-test-"));
  const po = join(tmp, "corpus", "po");
  const srv = join(tmp, "corpus", "srv");
  await Promise.all([mkdir(po, { recursive: true }), mkdir(srv, { recursive: true })]);
  await cp(join(FIXTURES, "po", "era1-single-item.html"), join(po, "a.html"));
  await writeFile(join(po, "b-broken.html"), "<html><body><p>Not a purchase order</p></body></html>");
  await writeFile(join(po, "c-huge.html"), `<html>${"x".repeat(11_000_000)}</html>`);
  const srvPage = await readFile(join(FIXTURES, "srv", "layout-a-single.html"), "utf8");
  await writeFile(join(srv, "a.html"), srvPage);
  await writeFile(join(srv, "b-older.html"), srvPage.replace("10/07/2023", "09/07/2023"));
  await writeFile(join(srv, "c-no-po.html"), srvPage.replace("4100000101", "4199999999"));
  report = buildReport(await importCorpus({ corpusDir: join(tmp, "corpus"), dataDir: join(tmp, "data") }));
});
afterAll(() => rm(tmp, { recursive: true, force: true }));

const MARKDOWN = `# Corpus import report

Result: passed

PO job: done
SRV job: done

## Pages

| Kind | Pages | Accepted | Skipped | Failed | Too large |
| ---- | ----- | -------- | ------- | ------ | --------- |
| PO | 3 | 1 | 0 | 1 | 1 |
| SRV | 3 | 2 | 1 | 0 | 0 |

## Skipped pages

- SRV: b-older.html: Older than the stored SRV 5000101 (dated 2023-07-10). Nothing was changed.

## Failed pages

- PO: b-broken.html: Could not read this PO page (missing-field): PURCHASE ORDER is missing

## Pages too large to send (over 10 MB)

- PO: c-huge.html

## Flags by type

| Type | Opened by the PO import | Opened by the SRV import | In the database |
| ---- | ----------------------- | ------------------------ | --------------- |
| QTY_MISMATCH | 0 | 0 | 0 |
| DOC_NUMBER_CONFLICT | 0 | 0 | 0 |
| OVER_DISPATCH | 0 | 0 | 0 |
| OVER_INVOICE | 0 | 0 | 0 |
| DOC_ON_CANCELLED_ITEM | 0 | 0 | 0 |
| MANUAL_ADJUSTMENT_OVERLAP | 0 | 0 | 0 |
| SRV_PO_ITEM_ZERO | 0 | 0 | 0 |
| SRV_DUPLICATE_ITEM | 0 | 0 | 0 |
| SRV_UNKNOWN_PO_ITEM | 0 | 0 | 0 |

## POs by status

| Status | POs |
| ------ | --- |
| Pending | 0 |
| Delivered | 0 |
| Closed | 1 |

## SRVs with "PO not found"

1

## Logged warnings and errors

None.
`;

const NO_FLAGS = {
  QTY_MISMATCH: 0,
  DOC_NUMBER_CONFLICT: 0,
  OVER_DISPATCH: 0,
  OVER_INVOICE: 0,
  DOC_ON_CANCELLED_ITEM: 0,
  MANUAL_ADJUSTMENT_OVERLAP: 0,
  SRV_PO_ITEM_ZERO: 0,
  SRV_DUPLICATE_ITEM: 0,
  SRV_UNKNOWN_PO_ITEM: 0,
};

const JSON_REPORT = {
  passed: true,
  po: {
    job: { status: "done", error: null },
    pages: 3,
    accepted: 1,
    skipped: [],
    failed: [
      { file: "b-broken.html", reason: "Could not read this PO page (missing-field): PURCHASE ORDER is missing" },
    ],
    tooLarge: ["c-huge.html"],
    flagsOpened: NO_FLAGS,
  },
  srv: {
    job: { status: "done", error: null },
    pages: 3,
    accepted: 2,
    skipped: [
      { file: "b-older.html", reason: "Older than the stored SRV 5000101 (dated 2023-07-10). Nothing was changed." },
    ],
    failed: [],
    tooLarge: [],
    // The SRV cites a challan and an invoice with no DC or invoice in the corpus: no flag (INV-53).
    flagsOpened: NO_FLAGS,
  },
  flagsByType: NO_FLAGS,
  posByStatus: { Pending: 0, Delivered: 0, Closed: 1 },
  srvsPoNotFound: 1,
  logged: [],
};

describe("import report", () => {
  test("lists accepted, skipped, failed and too-large pages, flags by type, POs by status and PO not found", () => {
    expect(renderMarkdown(report)).toBe(MARKDOWN);
  });

  test("the JSON holds the same report", () => {
    expect(renderJson(report)).toBe(`${JSON.stringify(JSON_REPORT, null, 2)}\n`);
  });

  test("writeReport writes both files into the folder and returns the markdown path", async () => {
    const dir = join(tmp, "reports");

    const path = await writeReport(report, dir);

    expect(path).toBe(join(dir, "import-report.md"));
    expect(await readFile(path, "utf8")).toBe(MARKDOWN);
    expect(JSON.parse(await readFile(join(dir, "import-report.json"), "utf8"))).toEqual(JSON_REPORT);
  });
});
