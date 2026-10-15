// SPEC-08 PR 6: the `recompute-all` job (ARCHITECTURE §7.3) rebuilds every PO's derived columns and flags from its
// stored rows, one batch per PO with its audit row (C4), and adds no flag already stored (INV-59). Real node:sqlite
// and the in-process runner; synthetic pages. That it never runs at startup is tested in `platform/startup.test.ts`.
import { auditLog, DbError, po, poItem, reconciliationIssue } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import type { Qty } from "@senstosales/domain";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { createJobRunner, type JobRunner } from "../src/platform/node/job-runner.ts";
import { apiRoutes } from "../src/routes/index.ts";
import { createServices } from "../src/services/index.ts";
import { jobWorker } from "../src/services/job-worker.ts";
import { recomputeAllHandlers } from "../src/services/recompute.ts";
import { memoryLogger, testApp } from "./helpers.ts";
import { poPage } from "./po-pages.ts";
import { srvPage } from "./srv-pages.ts";
import { fixedClock, memoryStorage, supplierDb } from "./service-deps.ts";

let db: NodeDb;
let runner: JobRunner;
let http: ReturnType<typeof testApp>;
/** Makes the next batch that writes a PO's derived columns throw, as a refused statement would. */
let refuseNextPoWrite = false;

beforeEach(async () => {
  const real = await supplierDb();
  db = {
    ...real,
    async batch(statements) {
      if (refuseNextPoWrite && statements.length > 1) {
        refuseNextPoWrite = false;
        throw new DbError("database is locked");
      }
      await real.batch(statements);
    },
  };
  const deps = { db, clock: fixedClock, storage: memoryStorage() };
  runner = createJobRunner(jobWorker({ ...deps, logger: memoryLogger(), handlers: recomputeAllHandlers(deps) }));
  http = testApp(apiRoutes(createServices({ ...deps, jobs: runner })));
});
afterEach(() => db.close());

const file = (name: string, html: string) => ({ name, html });

/** PO 4500001 (items 10 and 20, ord 10 each) with an SRV that wins and cites 12 ordered on item 10 (one
 * QTY_MISMATCH); PO 4500002 with one item and nothing else. */
async function seed(): Promise<void> {
  await http.client.request("po.upload", {
    body: {
      files: [
        file("a.html", poPage({ number: "4500001", date: "10/04/2025", items: [{ no: 10 }, { no: 20 }] })),
        file("b.html", poPage({ number: "4500002", date: "10/04/2025", items: [{ no: 10 }] })),
      ],
    },
  });
  await http.client.request("srv.upload", {
    body: {
      files: [
        file(
          "s.html",
          srvPage("4500001", [
            { srv: "7000001", date: "01/05/2025", item: 10, ord: "12.000", rcd: "4.000", accepted: "4.000" },
          ]),
        ),
      ],
    },
  });
}

/** Every stored derived value: item columns, PO totals and status, and flags with their ids. */
async function derived() {
  const b = db.build;
  return {
    items: await db.query(
      b
        .select({
          id: poItem.id,
          dspQty: poItem.dspQty,
          rcdQty: poItem.rcdQty,
          rejQty: poItem.rejQty,
          balanceQty: poItem.balanceQty,
          uninvoicedQty: poItem.uninvoicedQty,
          status: poItem.status,
        })
        .from(poItem)
        .orderBy(poItem.id),
    ),
    pos: await db.query(
      b
        .select({
          poNumber: po.poNumber,
          status: po.status,
          ordQty: po.ordQty,
          dspQty: po.dspQty,
          rcdQty: po.rcdQty,
          rejQty: po.rejQty,
          balanceQty: po.balanceQty,
          version: po.version,
        })
        .from(po)
        .orderBy(po.poNumber),
    ),
    flags: await db.query(
      b
        .select({ id: reconciliationIssue.id, type: reconciliationIssue.type, status: reconciliationIssue.status })
        .from(reconciliationIssue)
        .orderBy(reconciliationIssue.id),
    ),
  };
}

const BAD = 99_000 as Qty;
async function corrupt(): Promise<void> {
  const b = db.build;
  await db.batch([
    b
      .update(poItem)
      .set({ dspQty: BAD, rcdQty: BAD, rejQty: BAD, balanceQty: BAD, uninvoicedQty: BAD, status: "Delivered" }),
    b.update(po).set({ status: "Closed", ordQty: BAD, dspQty: BAD, rcdQty: BAD, rejQty: BAD, balanceQty: BAD }),
  ]);
}

async function runRecomputeAll() {
  const { id } = await http.client.request("jobs.start", { body: { type: "recompute-all" } });
  await runner.idle();
  return http.client.request("jobs.detail", { params: { id } });
}

const recomputeAudits = () =>
  db.query(
    db.build
      .select({ entityId: auditLog.entityId, jobId: auditLog.jobId, before: auditLog.before, after: auditLog.after })
      .from(auditLog)
      .where(eq(auditLog.action, "po.recompute"))
      .orderBy(auditLog.id),
  );

describe("recompute-all", () => {
  test("restores corrupted derived columns and PO totals, and adds no duplicate flag (INV-59)", async () => {
    await seed();
    const good = await derived();
    // The seed's values, so the test fails if the ingest left them wrong too: item 10 SRV wins with rcd 4.
    expect(good.items.map((i) => [i.rcdQty, i.balanceQty, i.status])).toEqual([
      [4_000, 6_000, "Pending"],
      [0, 10_000, "Pending"],
      [0, 10_000, "Pending"],
    ]);
    expect(good.flags.map((f) => f.type)).toEqual(["QTY_MISMATCH"]);
    await corrupt();

    const { job, events } = await runRecomputeAll();

    expect(job).toMatchObject({
      type: "recompute-all",
      status: "done",
      error: null,
      progress: { total: 2, done: 2, skipped: 0, failed: 0, current: null },
    });
    expect(events).toEqual([]);
    expect(await derived()).toEqual(good);
  });

  test("works through the POs in PO-number order, one audit row per PO naming the job", async () => {
    await seed();
    const ids = Object.fromEntries(
      (await db.query(db.build.select({ id: po.id, n: po.poNumber }).from(po))).map((r) => [r.n, r.id]),
    );

    const { job } = await runRecomputeAll();

    expect(await recomputeAudits()).toEqual([
      { entityId: ids["4500001"], jobId: job.id, before: null, after: null },
      { entityId: ids["4500002"], jobId: job.id, before: null, after: null },
    ]);
  });

  test("a PO whose batch is refused fails alone, keeps its stored values, and the next PO is still rebuilt", async () => {
    await seed();
    const good = await derived();
    await corrupt();
    const corrupted = await derived();

    refuseNextPoWrite = true;
    const { job, events } = await runRecomputeAll();

    const reason = "Could not be recomputed. Its stored values were kept.";
    expect(job.progress).toEqual({ total: 2, done: 1, skipped: 0, failed: 1, current: null });
    expect(events.map((e) => [e.level, e.documentKey, e.message])).toEqual([["error", "4500001", reason]]);
    expect(job.summary).toMatchObject({ failedDocuments: [{ document: "4500001", reason }] });
    const after = await derived();
    expect(after.pos).toEqual([corrupted.pos[0], good.pos[1]]);
  });

  test("with no POs it ends done with nothing to do", async () => {
    const { job } = await runRecomputeAll();

    expect(job).toMatchObject({ status: "done", progress: { total: 0, done: 0, skipped: 0, failed: 0 } });
  });
});

describe("the recompute-all handler", () => {
  test("skips a PO deleted after the job listed it", async () => {
    const handler = recomputeAllHandlers({ db, clock: fixedClock })["recompute-all"];

    const result = await handler?.process("01J9Z8Q4S5T6V7W8X9Y0Z1A2B3", { type: "recompute-all" }, "J1");

    expect(result).toEqual({ outcome: "skipped", reason: "This PO was deleted after the job started." });
  });
});
