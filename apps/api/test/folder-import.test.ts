// SPEC-08 PR 5: folder import (ARCHITECTURE §7.4). The web side stages a folder's files through
// `POST /api/jobs/staging`; a `po.import-folder` job ingests each through the PO ingest service, one batch per file.
// Older files are skipped and broken ones fail as job events (INV-44, INV-50) while the others commit; the summary
// stays in the job row and the staged files are deleted. Real node:sqlite and the in-process runner; synthetic pages.
import type { Instant } from "@senstosales/db";
import { po, reconciliationIssue, srv, srvItem } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Fy, IsoDate, Qty } from "@senstosales/domain";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { createJobRunner, type JobRunner } from "../src/platform/node/job-runner.ts";
import { apiRoutes } from "../src/routes/index.ts";
import { folderImportHandlers } from "../src/services/folder-import.ts";
import { createServices } from "../src/services/index.ts";
import { jobWorker } from "../src/services/job-worker.ts";
import { ID, json, memoryLogger, testApp } from "./helpers.ts";
import { poPage } from "./po-pages.ts";
import { fixedClock, memoryStorage, supplierDb, SUPPLIER } from "./service-deps.ts";

let db: NodeDb;
let storage: ReturnType<typeof memoryStorage>;
let runner: JobRunner;
let http: ReturnType<typeof testApp>;

beforeEach(async () => {
  db = await supplierDb();
  storage = memoryStorage();
  const deps = { db, clock: fixedClock, storage };
  runner = createJobRunner(jobWorker({ ...deps, logger: memoryLogger(), handlers: folderImportHandlers(deps) }));
  http = testApp(apiRoutes(createServices({ ...deps, jobs: runner })));
});
afterEach(() => db.close());

const file = (name: string, html: string) => ({ name, html });
const stage = (files: ReturnType<typeof file>[], stagingId?: string) =>
  http.client.request("jobs.stage", { body: { kind: "po", files, ...(stagingId && { stagingId }) } });

async function runImport(stagingId: string) {
  const { id } = await http.client.request("jobs.start", { body: { type: "po.import-folder", stagingId } });
  await runner.idle();
  return http.client.request("jobs.detail", { params: { id } });
}

const stagedKeys = () => [...storage.files.keys()].filter((key) => key.startsWith("staging/"));

describe("staging", () => {
  test("keeps each file under a server-made key in a new staging area, and adds later batches to it", async () => {
    const first = await stage([file("a.html", "<p>a</p>"), file("../../outside.html", "<p>b</p>")]);
    expect(first).toEqual({ stagingId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), count: 2 });

    const second = await stage([file("c.html", "<p>c</p>")], first.stagingId);

    expect(second).toEqual({ stagingId: first.stagingId, count: 3 });
    const keys = stagedKeys();
    expect(keys).toHaveLength(3);
    // C17: the request's file name never becomes part of a storage key.
    for (const key of keys) expect(key).toMatch(new RegExp(`^staging/${first.stagingId}/po/[0-9A-Z]{26}\\.json$`));
  });

  test("refuses a staging id that is not an id, and an unknown kind", async () => {
    const bad = await http.send(
      "/api/jobs/staging",
      json("POST", { kind: "po", stagingId: "../html", files: [file("a.html", "")] }),
    );
    expect(bad.status).toBe(400);
    const kind = await http.send("/api/jobs/staging", json("POST", { kind: "dc", files: [file("a.html", "")] }));
    expect(kind.status).toBe(400);
    expect(stagedKeys()).toEqual([]);
  });
});

describe("a PO folder of good, older and broken files", () => {
  async function seed() {
    // PO 4500002 is stored with a later date than the folder's copy.
    await http.client.request("po.upload", {
      body: { files: [file("stored.html", poPage({ number: "4500002", date: "05/04/2025", items: [{ no: 10 }] }))] },
    });
    // An SRV of PO 4500003 stored before its PO, citing 10.000 ordered where the PO orders 12.000 (INV-52).
    await db.batch([
      db.build.insert(srv).values({
        id: "V1",
        supplierId: SUPPLIER,
        poNumber: "4500003",
        poId: null,
        srvNumber: "9001",
        srvDate: "2025-05-01" as IsoDate,
        financialYear: "2025-26" as Fy,
        rawHeader: {},
      }),
      db.build.insert(srvItem).values({
        id: "VI1",
        supplierId: SUPPLIER,
        srvId: "V1",
        poItemId: null,
        materialCode: "SYN-10",
        poItemNo: 10,
        lotNo: 1,
        srvItemNo: 1,
        ordQty: 10000 as Qty,
        rcdQty: 3000 as Qty,
        acceptedQty: 3000 as Qty,
        rejQty: 0 as Qty,
      }),
    ]);
    const { stagingId } = await stage([
      file("new.html", poPage({ number: "4500001", date: "10/04/2025", items: [{ no: 10 }] })),
      file("older.html", poPage({ number: "4500002", date: "01/04/2025", items: [{ no: 10 }] })),
    ]);
    await stage(
      [
        file("broken.html", "<p>not a PO</p>"),
        file("mismatch.html", poPage({ number: "4500003", date: "10/04/2025", items: [{ no: 10, ord: "12.000" }] })),
      ],
      stagingId,
    );
    return stagingId;
  }

  test("ingests the good files, records the others as events and keeps the summary in the job", async () => {
    const { job, events } = await runImport(await seed());

    expect(job).toMatchObject({
      type: "po.import-folder",
      status: "done",
      error: null,
      progress: { total: 4, done: 2, skipped: 1, failed: 1, current: null },
    });
    const older = "Older than the stored PO 4500002 (dated 2025-04-05). Nothing was changed.";
    expect(events.map((e) => [e.level, e.documentKey, e.message])).toEqual([
      ["warn", "older.html", older],
      ["error", "broken.html", expect.stringMatching(/^Could not read this PO page \(missing-field\): .+/)],
    ]);
    expect(job.summary).toEqual({
      total: 4,
      done: 2,
      skipped: 1,
      failed: 1,
      skippedFiles: [{ file: "older.html", reason: older }],
      failedFiles: [{ file: "broken.html", reason: events[1]?.message }],
      flags: { QTY_MISMATCH: 1 },
    });
    const pos = await db.query(db.build.select({ number: po.poNumber, date: po.poDate }).from(po).orderBy(po.poNumber));
    expect(pos).toEqual([
      { number: "4500001", date: "2025-04-10" },
      { number: "4500002", date: "2025-04-05" },
      { number: "4500003", date: "2025-04-10" },
    ]);
  });

  test("deletes the staged files and keeps the stored pages", async () => {
    await runImport(await seed());

    expect(stagedKeys()).toEqual([]);
    expect([...storage.files.keys()].sort()).toEqual([
      "html/po/4500001.html",
      "html/po/4500002.html",
      "html/po/4500003.html",
    ]);
  });

  test("counts only the flags opened since the job started", async () => {
    const stagingId = await seed();
    await db.batch([
      db.build.insert(reconciliationIssue).values({
        id: "F0",
        supplierId: SUPPLIER,
        type: "OVER_DISPATCH",
        scopeType: "po_item",
        scopeId: "X1",
        poId: "X0",
        fingerprint: "earlier",
        details: { field: "dsp_qty", expected: "1", actual: "2", docIds: [] },
        status: "open",
        openedAt: "2025-05-31T00:00:00.000Z" as Instant,
      }),
    ]);

    const { job } = await runImport(stagingId);

    expect(job.summary?.["flags"]).toEqual({ QTY_MISMATCH: 1 });
  });
});

test("a job whose staging area holds no files fails plainly", async () => {
  const { job } = await runImport(ID);

  expect([job.status, job.error, job.progress.total]).toEqual([
    "failed",
    "No files were uploaded for this import. Choose the folder again.",
    0,
  ]);
  expect(job.summary).toEqual({
    total: 0,
    done: 0,
    skipped: 0,
    failed: 0,
    skippedFiles: [],
    failedFiles: [],
    flags: {},
  });
});

test("a cancelled import keeps the summary of what it did and deletes the staged files", async () => {
  const { stagingId } = await stage([
    file("one.html", poPage({ number: "4500001", date: "10/04/2025", items: [{ no: 10 }] })),
    file("two.html", poPage({ number: "4500002", date: "10/04/2025", items: [{ no: 10 }] })),
  ]);
  // Hold the job while it reads the staged files, and cancel it then: it stops before the first document.
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const { get } = storage;
  storage.get = async (key) => (await opened, get(key));
  const { id } = await http.client.request("jobs.start", { body: { type: "po.import-folder", stagingId } });
  await http.client.request("jobs.cancel", { params: { id } });
  open();
  await runner.idle();

  const { job } = await http.client.request("jobs.detail", { params: { id } });
  expect([job.status, job.progress]).toEqual([
    "cancelled",
    { total: 2, done: 0, skipped: 0, failed: 0, current: null },
  ]);
  expect(job.summary).toMatchObject({ total: 2, done: 0 });
  expect(stagedKeys()).toEqual([]);
});
