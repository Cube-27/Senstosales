// SPEC-08 PR 1: the job API and the in-process worker (INV-98). One job at a time, a second start is a 409, progress
// is written per document and cancel is honoured between documents.
import type { Db, Instant } from "@senstosales/db";
import { job } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { IsoDate } from "@senstosales/domain";
import { zJob, zPaged } from "@senstosales/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { Clock } from "../src/ports/clock.ts";
import type { DocumentResult, JobDocument, JobHandlers } from "../src/ports/jobs.ts";
import { createJobRunner, type JobRunner } from "../src/platform/node/job-runner.ts";
import { jobsRoutes } from "../src/routes/jobs.ts";
import { jobWorker } from "../src/services/job-worker.ts";
import { jobsService } from "../src/services/jobs.ts";
import { migratedDb } from "./db.ts";
import { gate, ID, json, memoryLogger, testApp } from "./helpers.ts";

/** A clock that moves one second per call, so jobs created one after another sort by `createdAt`. */
function tickingClock(): Clock {
  let seconds = 0;
  return {
    today: () => "2025-04-01" as IsoDate,
    now: () => new Date(Date.UTC(2025, 3, 1, 5, 30, seconds++)).toISOString() as Instant,
  };
}

/** Documents whose key is their label. */
const docs = (...keys: string[]): JobDocument[] => keys.map((key) => ({ key, label: key }));

const START = json("POST", { type: "recompute-all" });
const RUNNING = { code: "job-running", message: "Another job is running. Wait for it to finish, or cancel it." };

let db: NodeDb;
let runner: JobRunner;
let processed: string[];
let results: Record<string, DocumentResult>;
let hold: Record<string, Promise<void>>;
let handlers: JobHandlers;

function setup(clock: Clock = tickingClock(), workerDb: Db = db) {
  const logger = memoryLogger();
  runner = createJobRunner(jobWorker({ db: workerDb, clock, logger, handlers }));
  const http = testApp(jobsRoutes(jobsService({ db, clock, jobs: runner })));
  return { ...http, logger };
}

beforeEach(async () => {
  db = await migratedDb();
  processed = [];
  results = {};
  hold = {};
  handlers = {
    "recompute-all": {
      documents: async () => docs("a", "b", "c"),
      process: async (doc) => {
        await hold[doc];
        processed.push(doc);
        return results[doc] ?? { outcome: "done" };
      },
    },
  };
});

afterEach(() => db.close());

describe("start and run", () => {
  it("queues the job, runs every document and finishes done", async () => {
    const { send } = setup();
    const res = await send("/api/jobs", START);
    expect(res.status).toBe(200);
    const queued = zJob.parse(await res.json());
    expect(queued).toEqual({
      id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      type: "recompute-all",
      status: "queued",
      createdAt: "2025-04-01T05:30:00.000Z",
      startedAt: null,
      finishedAt: null,
      cancelRequested: false,
      progress: { total: 0, done: 0, skipped: 0, failed: 0, current: null },
      error: null,
      summary: null,
    });
    await runner.idle();
    expect(processed).toEqual(["a", "b", "c"]);
    const detail = await (await send(`/api/jobs/${queued.id}`)).json();
    expect(detail).toEqual({
      job: {
        ...queued,
        status: "done",
        startedAt: "2025-04-01T05:30:01.000Z",
        finishedAt: "2025-04-01T05:30:02.000Z",
        progress: { total: 3, done: 3, skipped: 0, failed: 0, current: null },
        summary: { total: 3, done: 3, skipped: 0, failed: 0, skippedDocuments: [], failedDocuments: [] },
      },
      events: [],
    });
  });

  it("writes progress before each document, naming it as current", async () => {
    const { client } = setup();
    const seen: unknown[] = [];
    handlers["recompute-all"] = {
      documents: async () => docs("a", "b", "c"),
      process: async (_doc, _start, jobId) => {
        seen.push((await client.request("jobs.detail", { params: { id: jobId } })).job.progress);
        return { outcome: "done" };
      },
    };
    await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    expect(seen).toEqual([
      { total: 3, done: 0, skipped: 0, failed: 0, current: "a" },
      { total: 3, done: 1, skipped: 0, failed: 0, current: "b" },
      { total: 3, done: 2, skipped: 0, failed: 0, current: "c" },
    ]);
  });

  it("counts skipped and failed documents and records each as an event", async () => {
    const { client } = setup();
    results = {
      b: { outcome: "skipped", reason: "An older copy of this PO; the stored one is newer." },
      c: { outcome: "failed", reason: "The page has no items table." },
    };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const detail = await client.request("jobs.detail", { params: { id } });
    expect(detail.job.status).toBe("done");
    expect(detail.job.progress).toEqual({ total: 3, done: 1, skipped: 1, failed: 1, current: null });
    expect(
      detail.events.map(({ jobId, level, documentKey, message }) => ({ jobId, level, documentKey, message })),
    ).toEqual([
      { jobId: id, level: "warn", documentKey: "b", message: "An older copy of this PO; the stored one is newer." },
      { jobId: id, level: "error", documentKey: "c", message: "The page has no items table." },
    ]);
  });

  it("marks the job failed with its error when a handler throws, and logs it", async () => {
    const { client, logger } = setup();
    handlers["recompute-all"] = {
      documents: async () => docs("a", "b"),
      process: async (key) => {
        if (key === "b") throw new Error("Storage is not reachable.");
        return { outcome: "done" };
      },
    };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const { job: failed } = await client.request("jobs.detail", { params: { id } });
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Storage is not reachable.");
    expect(failed.progress).toEqual({ total: 2, done: 1, skipped: 0, failed: 0, current: null });
    expect(logger.lines.map((l) => [l.level, l.message, l.fields["jobId"]])).toEqual([["error", "job failed", id]]);
  });

  it("keeps a document's count out of the job when its batch fails", async () => {
    // The batch that records a skipped document is its progress plus its event; the database refuses it.
    const failing: Db = {
      ...db,
      batch: (statements) =>
        statements.length === 2 ? Promise.reject(new Error("disk I/O error")) : db.batch(statements),
    };
    const { client } = setup(tickingClock(), failing);
    results = { b: { outcome: "skipped", reason: "An older copy of this PO; the stored one is newer." } };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const detail = await client.request("jobs.detail", { params: { id } });
    expect([detail.job.status, detail.job.error]).toEqual(["failed", "disk I/O error"]);
    expect(detail.job.progress).toEqual({ total: 3, done: 1, skipped: 0, failed: 0, current: null });
    expect(detail.events).toEqual([]);
  });

  it("fails a job whose type has no handler yet", async () => {
    const { client } = setup();
    const { id } = await client.request("jobs.start", { body: { type: "backup" } });
    await runner.idle();
    const { job: failed } = await client.request("jobs.detail", { params: { id } });
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("This kind of job is not available yet.");
  });
});

describe("one job at a time (INV-98)", () => {
  it("answers a second start with 409 while a job runs, and accepts one after it finishes", async () => {
    const { send } = setup();
    const b = gate();
    hold["b"] = b.opened;
    expect((await send("/api/jobs", START)).status).toBe(200);
    const second = await send("/api/jobs", START);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual(RUNNING);
    b.open();
    await runner.idle();
    expect((await send("/api/jobs", START)).status).toBe(200);
    await runner.idle();
    expect(processed).toEqual(["a", "b", "c", "a", "b", "c"]);
  });

  it("answers 409 when two starts arrive together", async () => {
    const { send } = setup();
    const statuses = await Promise.all([send("/api/jobs", START), send("/api/jobs", START)]);
    expect(statuses.map((r) => r.status).sort()).toEqual([200, 409]);
    await runner.idle();
    expect(processed).toEqual(["a", "b", "c"]);
  });

  it("answers 409 when the table holds a running job this process did not start", async () => {
    await db.batch([
      db.build.insert(job).values({
        id: ID,
        type: "backup",
        status: "running",
        createdAt: "2025-04-01T00:00:00.000Z" as Instant,
        progress: { total: 0, done: 0, skipped: 0, failed: 0, current: null },
      }),
    ]);
    const { send } = setup();
    const res = await send("/api/jobs", START);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(RUNNING);
  });
});

describe("cancel", () => {
  it("is honoured between documents: the current document finishes, the rest do not start", async () => {
    const { client } = setup();
    const a = gate();
    hold["a"] = a.opened;
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    const requested = await client.request("jobs.cancel", { params: { id } });
    expect(requested.cancelRequested).toBe(true);
    a.open();
    await runner.idle();
    expect(processed).toEqual(["a"]);
    const { job: cancelled } = await client.request("jobs.detail", { params: { id } });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.progress).toEqual({ total: 3, done: 1, skipped: 0, failed: 0, current: null });
    expect(cancelled.finishedAt).not.toBeNull();
  });

  it("ends at once a job left running by an earlier run of the app, so a new job can start (EC-28)", async () => {
    await db.batch([
      db.build.insert(job).values({
        id: ID,
        type: "recompute-all",
        status: "running",
        createdAt: "2025-04-01T00:00:00.000Z" as Instant,
        startedAt: "2025-04-01T00:00:01.000Z" as Instant,
        progress: { total: 10, done: 2, skipped: 0, failed: 1, current: "d" },
      }),
    ]);
    const { client, send } = setup();
    expect((await send("/api/jobs", START)).status).toBe(409);
    const cancelled = await client.request("jobs.cancel", { params: { id: ID } });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelRequested: true,
      finishedAt: "2025-04-01T05:30:01.000Z",
      progress: { total: 10, done: 2, skipped: 0, failed: 1, current: null },
    });
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    expect((await client.request("jobs.detail", { params: { id } })).job.status).toBe("done");
    expect(processed).toEqual(["a", "b", "c"]);
  });

  it("leaves a finished job as it is", async () => {
    const { client } = setup();
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const after = await client.request("jobs.cancel", { params: { id } });
    expect([after.status, after.cancelRequested]).toEqual(["done", false]);
  });

  it("answers 404 for an unknown job", async () => {
    const { send } = setup();
    const res = await send(`/api/jobs/${ID}/cancel`, json("POST", {}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "job-not-found", message: "This job was not found." });
  });
});

describe("list and detail", () => {
  async function threeJobs() {
    const http = setup();
    const ids: string[] = [];
    for (const type of ["recompute-all", "backup", "recompute-all"] as const) {
      ids.push((await http.client.request("jobs.start", { body: { type } })).id);
      await runner.idle();
    }
    return { ...http, ids };
  }

  it("lists newest first by default, with the total", async () => {
    const { client, ids } = await threeJobs();
    const page = await client.request("jobs.list");
    expect(page.total).toBe(3);
    expect(page.items.map((j) => [j.id, j.type, j.status])).toEqual([
      [ids[2], "recompute-all", "done"],
      [ids[1], "backup", "failed"],
      [ids[0], "recompute-all", "done"],
    ]);
  });

  it("sorts by createdAt, filters by type and status, and pages", async () => {
    const { send, ids } = await threeJobs();
    const list = async (q: string) => zPaged(zJob).parse(await (await send(`/api/jobs?${q}`)).json());
    const asc = await list("sort=createdAt&dir=asc");
    expect(asc.items.map((j) => j.id)).toEqual(ids);
    const done = await list("status=done&type=recompute-all");
    expect([done.total, done.items.map((j) => j.id)]).toEqual([2, [ids[2], ids[0]]]);
    const failed = await list("status=failed");
    expect([failed.total, failed.items.map((j) => j.id)]).toEqual([1, [ids[1]]]);
    const second = await list("page=2&pageSize=10");
    expect(second).toEqual({ items: [], total: 3 });
  });

  it("answers 404 for an unknown job", async () => {
    const { send } = setup();
    const res = await send(`/api/jobs/${ID}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "job-not-found", message: "This job was not found." });
  });
});

describe("documents and summary", () => {
  it("processes each document by its key and shows its label as current, on events and in the summary", async () => {
    const { client } = setup();
    const seen: unknown[] = [];
    handlers["recompute-all"] = {
      documents: async () => [
        { key: "k1", label: "one.html" },
        { key: "k2", label: "two.html" },
      ],
      process: async (key, _start, jobId) => {
        seen.push([key, (await client.request("jobs.detail", { params: { id: jobId } })).job.progress.current]);
        return key === "k2" ? { outcome: "skipped", reason: "Older." } : { outcome: "done" };
      },
    };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const detail = await client.request("jobs.detail", { params: { id } });
    expect(seen).toEqual([
      ["k1", "one.html"],
      ["k2", "two.html"],
    ]);
    expect(detail.events.map((e) => [e.documentKey, e.message])).toEqual([["two.html", "Older."]]);
    expect(detail.job.summary).toEqual({
      total: 2,
      done: 1,
      skipped: 1,
      failed: 0,
      skippedDocuments: [{ document: "two.html", reason: "Older." }],
      failedDocuments: [],
    });
  });

  it("adds what the handler's finish returns, which runs after every event and count is written", async () => {
    const { client } = setup();
    results = { b: { outcome: "failed", reason: "The page has no items table." } };
    handlers["recompute-all"]!.finish = async (_start, jobId) => {
      const { job: seen, events } = await client.request("jobs.detail", { params: { id: jobId } });
      return { seenFailed: seen.progress.failed, seenEvents: events.length };
    };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const { job: done } = await client.request("jobs.detail", { params: { id } });
    expect([done.status, done.summary]).toEqual([
      "done",
      {
        total: 3,
        done: 2,
        skipped: 0,
        failed: 1,
        skippedDocuments: [],
        failedDocuments: [{ document: "b", reason: "The page has no items table." }],
        seenFailed: 1,
        seenEvents: 1,
      },
    ]);
  });

  it("runs finish when the job fails too, keeping the counts its batches reached", async () => {
    const { client } = setup();
    handlers["recompute-all"] = {
      documents: async () => docs("a", "b"),
      process: async (key) =>
        key === "b" ? Promise.reject(new Error("Storage is not reachable.")) : { outcome: "done" },
      finish: async () => ({ cleaned: true }),
    };
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const { job: failed } = await client.request("jobs.detail", { params: { id } });
    expect([failed.status, failed.error, failed.summary]).toEqual([
      "failed",
      "Storage is not reachable.",
      { total: 2, done: 1, skipped: 0, failed: 0, skippedDocuments: [], failedDocuments: [], cleaned: true },
    ]);
  });

  it("leaves finish's part out when it throws, keeps the job as it ended, and logs it", async () => {
    const { client, logger } = setup();
    handlers["recompute-all"]!.finish = async () => Promise.reject(new Error("Storage is not reachable."));
    const { id } = await client.request("jobs.start", { body: { type: "recompute-all" } });
    await runner.idle();
    const { job: done } = await client.request("jobs.detail", { params: { id } });
    expect([done.status, done.error, done.summary]).toEqual([
      "done",
      null,
      { total: 3, done: 3, skipped: 0, failed: 0, skippedDocuments: [], failedDocuments: [] },
    ]);
    expect(logger.lines.map((l) => [l.level, l.message, l.fields["error"]])).toEqual([
      ["error", "job summary failed", "Storage is not reachable."],
    ]);
  });

  it("keeps no summary for a job whose type has no handler", async () => {
    const { client } = setup();
    const { id } = await client.request("jobs.start", { body: { type: "backup" } });
    await runner.idle();
    expect((await client.request("jobs.detail", { params: { id } })).job.summary).toBeNull();
  });
});
