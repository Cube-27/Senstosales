// SPEC-10 PR 5: flags list, stats and acknowledge; the read-only audit list. Expected values worked by hand from the
// seeded rows below. Synthetic values only (C1).
import type { Db, Instant } from "@senstosales/db";
import * as tables from "@senstosales/db";
import { auditLog, po, reconciliationIssue, srv, srvItem, supplier } from "@senstosales/db";
import type { FlagType, Fy, IsoDate, Qty } from "@senstosales/domain";
import { is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { flagsRoutes } from "../src/routes/flags.ts";
import { apiRoutes } from "../src/routes/index.ts";
import { flagsService } from "../src/services/flags.ts";
import { closeApiApps, onboardedApp } from "./api-app.ts";
import { gate, ID, json, testApp } from "./helpers.ts";
import { fixedClock, NOW } from "./service-deps.ts";

afterEach(closeApiApps);

type App = Awaited<ReturnType<typeof onboardedApp>>;

const P1 = "01J9Z8Q4S5T6V7W8X9Y0P10000";
const P2 = "01J9Z8Q4S5T6V7W8X9Y0P20000";
const F1 = "01J9Z8Q4S5T6V7W8X9Y0F10000";
const F2 = "01J9Z8Q4S5T6V7W8X9Y0F20000";
const F3 = "01J9Z8Q4S5T6V7W8X9Y0F30000";
const A1 = "01J9Z8Q4S5T6V7W8X9Y0A10000";
const A2 = "01J9Z8Q4S5T6V7W8X9Y0A20000";
const A3 = "01J9Z8Q4S5T6V7W8X9Y0A30000";
const SCOPE = "01J9Z8Q4S5T6V7W8X9Y0M10000";

const details = { field: "dsp_qty", expected: "10", actual: "12", docIds: [] };

/**
 * PO 4500001 (P1) and 4500002 (P2).
 * - F1 OVER_DISPATCH on P1, open, opened 2025-05-01.
 * - F2 QTY_MISMATCH on P2, acknowledged with note "checked", opened 2025-05-03.
 * - F3 DOC_NUMBER_CONFLICT on P2, open, opened 2025-05-02.
 * Audit (the onboarding row removed): A1 po.create at 2025-05-01 23:30 IST, A2 srv.delete at 2025-05-02 00:00 IST,
 * A3 flag.acknowledge at 2025-05-03 09:30 IST.
 */
async function seeded(): Promise<App> {
  const app = await onboardedApp();
  const { db } = app;
  const b = db.build;
  const [row] = await db.query(b.select({ id: supplier.id }).from(supplier));
  if (row === undefined) throw new Error("not onboarded");
  const s = row.id;
  const zero = 0 as Qty;
  const poRow = (id: string, poNumber: string) => ({
    supplierId: s,
    id,
    poNumber,
    poDate: "2025-04-10" as IsoDate,
    amendNo: 0,
    isGemc: false,
    rawHeader: {},
    status: "Pending" as const,
    ordQty: zero,
    dspQty: zero,
    rcdQty: zero,
    rejQty: zero,
    balanceQty: zero,
  });
  const flag = (id: string, type: FlagType, poId: string, openedAt: string, acknowledged: boolean) => ({
    supplierId: s,
    id,
    type,
    scopeType: "po_item" as const,
    scopeId: SCOPE,
    poId,
    fingerprint: id,
    details,
    status: acknowledged ? ("acknowledged" as const) : ("open" as const),
    note: acknowledged ? "checked" : null,
    openedAt: openedAt as Instant,
    acknowledgedAt: acknowledged ? ("2025-05-04T00:00:00.000Z" as Instant) : null,
  });
  const entry = (id: string, at: string, action: string, entityType: string, entityId: string) => ({
    id,
    at: at as Instant,
    actor: "admin",
    action,
    entityType,
    entityId,
    before: null,
    after: { n: 1 },
  });
  await db.batch([
    b.delete(auditLog),
    b.insert(po).values([poRow(P1, "4500001"), poRow(P2, "4500002")]),
    b
      .insert(reconciliationIssue)
      .values([
        flag(F1, "OVER_DISPATCH", P1, "2025-05-01T00:00:00.000Z", false),
        flag(F2, "QTY_MISMATCH", P2, "2025-05-03T00:00:00.000Z", true),
        flag(F3, "DOC_NUMBER_CONFLICT", P2, "2025-05-02T00:00:00.000Z", false),
      ]),
    b
      .insert(auditLog)
      .values([
        entry(A1, "2025-05-01T18:00:00.000Z", "po.create", "po", P1),
        entry(A2, "2025-05-01T18:30:00.000Z", "srv.delete", "srv", SCOPE),
        entry(A3, "2025-05-03T04:00:00.000Z", "flag.acknowledge", "reconciliation_issue", F2),
      ]),
  ]);
  return app;
}

async function get(app: App, path: string) {
  const res = await app.send(path);
  return { status: res.status, body: (await res.json()) as unknown };
}

const ids = async (app: App, path: string) => {
  const { status, body } = await get(app, path);
  const { items, total } = body as { items: { id: string }[]; total: number };
  return { status, ids: items.map((i) => i.id), total };
};

const wire = (id: string, type: FlagType, poId: string, poNumber: string, openedAt: string, ack: boolean) => ({
  id,
  type,
  scopeType: "po_item",
  scopeId: SCOPE,
  poId,
  poNumber,
  srvId: null,
  srvNumber: null,
  details,
  status: ack ? "acknowledged" : "open",
  note: ack ? "checked" : null,
  openedAt,
  acknowledgedAt: ack ? "2025-05-04T00:00:00.000Z" : null,
});

const S1 = "01J9Z8Q4S5T6V7W8X9Y0S10000";
const SI1 = "01J9Z8Q4S5T6V7W8X9Y0S20000";
const F4 = "01J9Z8Q4S5T6V7W8X9Y0F40000";

/** F4: QTY_MISMATCH on line 1 of SRV 7000001 (S1) of P2, open, opened 2025-05-06, ord_qty 40 expected, 37 actual. */
async function addSrvFlag(app: App): Promise<void> {
  const { db } = app;
  const [row] = await db.query(db.build.select({ id: supplier.id }).from(supplier));
  const supplierId = row?.id ?? "";
  await db.batch([
    db.build.insert(srv).values({
      id: S1,
      supplierId,
      poNumber: "4500002",
      poId: P2,
      srvNumber: "7000001",
      srvDate: "2025-05-05" as IsoDate,
      financialYear: "2025-26" as Fy,
      rawHeader: {},
    }),
    db.build.insert(srvItem).values({
      id: SI1,
      supplierId,
      srvId: S1,
      poItemNo: 10,
      lotNo: 1,
      rowNo: 1,
      srvItemNo: 1,
      ordQty: 5000 as Qty,
    }),
    db.build.insert(reconciliationIssue).values({
      supplierId,
      id: F4,
      type: "QTY_MISMATCH",
      scopeType: "srv_item",
      scopeId: SI1,
      poId: P2,
      fingerprint: F4,
      details: { field: "ord_qty", expected: "40", actual: "37", docIds: [] },
      status: "open",
      note: null,
      openedAt: "2025-05-06T00:00:00.000Z" as Instant,
      acknowledgedAt: null,
    }),
  ]);
}

describe("GET /api/flags", () => {
  it("lists every flag with its PO number, newest first", async () => {
    const app = await seeded();
    expect(await get(app, "/api/flags")).toEqual({
      status: 200,
      body: {
        items: [
          wire(F2, "QTY_MISMATCH", P2, "4500002", "2025-05-03T00:00:00.000Z", true),
          wire(F3, "DOC_NUMBER_CONFLICT", P2, "4500002", "2025-05-02T00:00:00.000Z", false),
          wire(F1, "OVER_DISPATCH", P1, "4500001", "2025-05-01T00:00:00.000Z", false),
        ],
        total: 3,
      },
    });
  });

  it.each([
    ["?type=OVER_DISPATCH", [F1], 1],
    ["?status=open", [F3, F1], 2],
    ["?status=acknowledged", [F2], 1],
    [`?poId=${P2}`, [F2, F3], 2],
    ["?q=0002", [F2, F3], 2],
    ["?q=nothing", [], 0],
    ["?sort=openedAt", [F1, F3, F2], 3],
    ["?sort=type", [F3, F1, F2], 3],
    ["?sort=status&dir=desc", [F3, F1, F2], 3],
    ["?sort=poNumber", [F1, F2, F3], 3],
    ["?sort=poNumber&dir=desc", [F2, F3, F1], 3],
    ["?pageSize=10&page=2", [], 3],
  ])("%s -> %j", async (query, expected, total) => {
    const app = await seeded();
    expect(await ids(app, `/api/flags${query}`)).toEqual({ status: 200, ids: expected, total });
  });

  it.each([
    ["?q=7000001", [F4], 1],
    ["?q=DOC_NUMBER", [F3], 1],
    ["?q=srv_item", [F4], 1],
    ["?q=dsp_qty", [F2, F3, F1], 3],
    ["?q=37", [F4], 1],
    ["?q=0002", [F4, F2, F3], 3],
  ])("searches as legacy did: the SRV number, codes and details values: %s -> %j", async (query, expected, total) => {
    const app = await seeded();
    await addSrvFlag(app);
    expect(await ids(app, `/api/flags${query}`)).toEqual({ status: 200, ids: expected, total });
  });

  it("carries the SRV of a flag on an SRV line, for the deviations screen's link", async () => {
    const app = await seeded();
    await addSrvFlag(app);
    const { body } = await get(app, "/api/flags?pageSize=10");
    const { items } = body as { items: { id: string; srvId: string | null; srvNumber: string | null }[] };
    expect(items.map(({ id, srvId, srvNumber }) => ({ id, srvId, srvNumber }))).toEqual([
      { id: F4, srvId: S1, srvNumber: "7000001" },
      { id: F2, srvId: null, srvNumber: null },
      { id: F3, srvId: null, srvNumber: null },
      { id: F1, srvId: null, srvNumber: null },
    ]);
  });

  it.each(["?sort=note", "?type=STALE_DOCUMENT_SKIPPED", "?status=closed", "?pageSize=7"])(
    "%s -> 400",
    async (query) => {
      const app = await seeded();
      expect((await app.send(`/api/flags${query}`)).status).toBe(400);
    },
  );
});

describe("GET /api/flags/stats", () => {
  it("counts the open flags in total and by type (INV-60)", async () => {
    const app = await seeded();
    expect(await get(app, "/api/flags/stats")).toEqual({
      status: 200,
      body: {
        open: 2,
        openByType: {
          QTY_MISMATCH: 0,
          DOC_NUMBER_CONFLICT: 1,
          OVER_DISPATCH: 1,
          OVER_INVOICE: 0,
          DOC_ON_CANCELLED_ITEM: 0,
          MANUAL_ADJUSTMENT_OVERLAP: 0,
          SRV_PO_ITEM_ZERO: 0,
          SRV_DUPLICATE_ITEM: 0,
          SRV_UNKNOWN_PO_ITEM: 0,
        },
      },
    });
  });
});

/** Every row of every table except the flag and audit tables, to prove nothing else changed (INV-59). */
const otherTables = (app: App) =>
  Promise.all(
    Object.entries(tables)
      .filter(([, table]) => is(table, SQLiteTable) && table !== reconciliationIssue && table !== auditLog)
      .map(async ([name, table]) => [name, await app.db.query(app.db.build.select().from(table as SQLiteTable))]),
  );

const acknowledge = (app: App, id: string, note: string | null) =>
  app.send(`/api/flags/${id}/acknowledge`, json("POST", { note }));

const flagRows = (app: App) =>
  app.db.query(app.db.build.select().from(reconciliationIssue).orderBy(reconciliationIssue.id));

describe("POST /api/flags/:id/acknowledge", () => {
  it("acknowledges with the note and an audit row, and changes nothing else (INV-59)", async () => {
    const app = await seeded();
    const [others, flagsBefore] = await Promise.all([otherTables(app), flagRows(app)]);
    // The snapshot holds the seeded POs, so a comparison of empty lists cannot pass for it.
    expect(others).toContainEqual(["po", expect.arrayContaining([expect.objectContaining({ id: P1 })])]);

    const res = await acknowledge(app, F1, "seen on site");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...wire(F1, "OVER_DISPATCH", P1, "4500001", "2025-05-01T00:00:00.000Z", false),
      poNumber: undefined,
      srvId: undefined,
      srvNumber: undefined,
      status: "acknowledged",
      note: "seen on site",
      acknowledgedAt: NOW,
    });
    expect(await otherTables(app)).toEqual(others);
    const [f1, ...rest] = await flagRows(app);
    expect(f1).toEqual({ ...flagsBefore[0], status: "acknowledged", note: "seen on site", acknowledgedAt: NOW });
    expect(rest).toEqual(flagsBefore.slice(1));
    const audit = await app.audit();
    expect(audit.slice(3)).toEqual([
      {
        id: expect.any(String),
        at: NOW,
        actor: "admin",
        action: "flag.acknowledge",
        entityType: "reconciliation_issue",
        entityId: F1,
        before: { status: "open", note: null },
        after: { status: "acknowledged", note: "seen on site" },
        jobId: null,
      },
    ]);
  });

  it("acknowledges without a note", async () => {
    const app = await seeded();
    const res = await acknowledge(app, F3, null);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: F3, status: "acknowledged", note: null, acknowledgedAt: NOW });
  });

  it("lets one of two concurrent acknowledges win; the other answers 409 and writes nothing", async () => {
    const app = await seeded();
    // Both requests read the open flag and build their batch before either commits; then they commit in turn.
    const pending: (() => void)[] = [];
    const bothBuilt = gate();
    const held: Db = {
      build: app.db.build,
      query: (statement) => app.db.query(statement),
      batch: async (statements) => {
        await new Promise<void>((resolve) => {
          pending.push(resolve);
          if (pending.length === 2) bothBuilt.open();
        });
        return app.db.batch(statements);
      },
    };
    const { send } = testApp(flagsRoutes(flagsService({ db: held, clock: fixedClock })));
    const ack = (note: string) => send(`/api/flags/${F1}/acknowledge`, json("POST", { note }));

    const first = ack("first");
    const second = ack("second");
    await bothBuilt.opened;
    for (const resolve of pending) resolve();
    const [a, b] = await Promise.all([first, second]);

    expect([a.status, b.status]).toEqual([200, 409]);
    expect(await b.json()).toMatchObject({ code: "flag-acknowledged" });
    const [f1] = await flagRows(app);
    expect(f1).toMatchObject({ status: "acknowledged", note: "first", acknowledgedAt: NOW });
    const audit = await app.audit();
    expect(audit.slice(3)).toEqual([
      expect.objectContaining({
        action: "flag.acknowledge",
        entityId: F1,
        after: { status: "acknowledged", note: "first" },
      }),
    ]);
  });

  it("answers 409 for an acknowledged flag and keeps its note and time", async () => {
    const app = await seeded();
    const before = await flagRows(app);
    const res = await acknowledge(app, F2, "again");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "flag-acknowledged" });
    expect(await flagRows(app)).toEqual(before);
    expect(await app.audit()).toHaveLength(3);
  });

  it("answers 404 for an unknown flag", async () => {
    const app = await seeded();
    const res = await acknowledge(app, ID, null);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "flag-not-found" });
    expect(await app.audit()).toHaveLength(3);
  });

  it("answers 400 without a note field", async () => {
    const app = await seeded();
    expect((await app.send(`/api/flags/${F1}/acknowledge`, json("POST", {}))).status).toBe(400);
  });
});

describe("GET /api/audit", () => {
  const row = (id: string, at: string, action: string, entityType: string, entityId: string) => ({
    id,
    at,
    actor: "admin",
    action,
    entityType,
    entityId,
    before: null,
    after: { n: 1 },
    jobId: null,
  });

  it("lists the audit rows newest first", async () => {
    const app = await seeded();
    expect(await get(app, "/api/audit")).toEqual({
      status: 200,
      body: {
        items: [
          row(A3, "2025-05-03T04:00:00.000Z", "flag.acknowledge", "reconciliation_issue", F2),
          row(A2, "2025-05-01T18:30:00.000Z", "srv.delete", "srv", SCOPE),
          row(A1, "2025-05-01T18:00:00.000Z", "po.create", "po", P1),
        ],
        total: 3,
      },
    });
  });

  it.each([
    ["?entityType=po", [A1], 1],
    ["?action=srv.delete", [A2], 1],
    // The dates are IST calendar dates: A2 at 18:30 UTC is 2 May in IST, A1 at 18:00 UTC is still 1 May.
    ["?from=2025-05-02", [A3, A2], 2],
    ["?to=2025-05-01", [A1], 1],
    ["?from=2025-05-02&to=2025-05-02", [A2], 1],
    ["?q=srv", [A2], 1],
    [`?q=${F2.slice(-6)}`, [A3], 1],
    ["?q=nothing", [], 0],
    ["?sort=at", [A1, A2, A3], 3],
    ["?sort=entityType", [A1, A3, A2], 3],
    ["?sort=action&dir=desc", [A2, A1, A3], 3],
    ["?page=2", [], 3],
  ])("%s -> %j", async (query, expected, total) => {
    const app = await seeded();
    expect(await ids(app, `/api/audit${query}`)).toEqual({ status: 200, ids: expected, total });
  });

  it.each(["?sort=actor", "?from=2025-13-01", "?pageSize=3"])("%s -> 400", async (query) => {
    const app = await seeded();
    expect((await app.send(`/api/audit${query}`)).status).toBe(400);
  });

  it("has no route that deletes or changes the audit log (INV-83)", async () => {
    const app = await seeded();
    for (const method of ["DELETE", "POST", "PUT", "PATCH"]) {
      for (const path of ["/api/audit", `/api/audit/${A1}`]) {
        expect((await app.send(path, json(method, {}))).status).toBe(404);
      }
    }
    expect(await app.audit()).toHaveLength(3);
  });
});

describe("session", () => {
  it.each(["/api/flags", "/api/flags/stats", "/api/audit"])("GET %s needs a session (401)", async (path) => {
    const app = await seeded();
    const { send } = testApp(apiRoutes(app.services), () => Promise.resolve(false));
    expect((await send(path)).status).toBe(401);
  });

  it("acknowledge needs a session (401) and changes nothing", async () => {
    const app = await seeded();
    const before = await flagRows(app);
    const { send } = testApp(apiRoutes(app.services), () => Promise.resolve(false));
    expect((await send(`/api/flags/${F1}/acknowledge`, json("POST", { note: null }))).status).toBe(401);
    expect(await flagRows(app)).toEqual(before);
  });
});
