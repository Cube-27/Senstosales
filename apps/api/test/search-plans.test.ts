// The SRV list's text filter and the global search took 5-8 s on a full BHEL corpus (E2E PERF-01): their EXISTS
// subqueries scanned srv_item and reconciliation_issue once per SRV. Every read they send must reach those tables
// through an index (migration 0004). Synthetic values only (C1).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { closeApiApps, onboardedApp } from "./api-app.ts";
import { line, PO } from "./dc-fixtures.ts";
import { json } from "./helpers.ts";
import { srvPage } from "./srv-pages.ts";

type App = Awaited<ReturnType<typeof onboardedApp>>;

let app: App;
let dir: string;
beforeEach(async () => {
  app = await onboardedApp();
  dir = mkdtempSync(join(tmpdir(), "sensto-plans-"));
  await app.send("/api/po", json("POST", { ...PO, items: [line(10, "10"), line(20, "5")] }));
  const rows = [
    { srv: "9000001", date: "10/04/2025", item: 10, rcd: "1.000", invoice: "INV-1" },
    { srv: "9000002", date: "11/04/2025", item: 30, rcd: "2.000" },
  ];
  await app.client.request("srv.upload", { body: { files: [{ name: "s.html", html: srvPage(PO.poNumber, rows) }] } });
});
afterEach(async () => {
  await closeApiApps();
  rmSync(dir, { recursive: true, force: true });
});

/** The SQL and parameters of every read `run` sends. */
async function readsOf(run: () => Promise<unknown>) {
  const reads: { sql: string; params: unknown[] }[] = [];
  const { query } = app.db;
  app.db.query = ((statement: Parameters<typeof query>[0]) => {
    reads.push((statement as unknown as { toSQL(): { sql: string; params: unknown[] } }).toSQL());
    return query.call(app.db, statement);
  }) as typeof query;
  try {
    await run();
  } finally {
    app.db.query = query;
  }
  return reads;
}

type PlanRow = { id: number; parent: number; detail: string };

/**
 * The full-table scans of SRV items, flags or PO items that SQLite plans inside a correlated subquery, which then
 * runs once per outer row; read on a copy of the database.
 */
async function nestedScans(reads: readonly { sql: string; params: unknown[] }[]) {
  const file = join(dir, "copy.db");
  await app.db.backupTo(file);
  const conn = new DatabaseSync(file, { readOnly: true });
  try {
    return reads.flatMap(({ sql, params }) => {
      const plan = conn.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as SQLInputValue[])) as PlanRow[];
      const byId = new Map(plan.map((row) => [row.id, row]));
      const correlated = (row: PlanRow): boolean => {
        const parent = byId.get(row.parent);
        return parent !== undefined && (parent.detail.includes("CORRELATED") || correlated(parent));
      };
      return plan
        .filter((row) => /^SCAN (srv_item|reconciliation_issue|po_item)( |$)/.test(row.detail) && correlated(row))
        .map((row) => `${row.detail} in ${sql}`);
    });
  } finally {
    conn.close();
  }
}

describe("PERF-01: SRV list and global search reach SRV items and flags by index", () => {
  test.each(["/api/srv?q=900", "/api/srv/by-po?q=INV", "/api/search?q=900", "/api/search?q=Item"])(
    "%s",
    async (path) => {
      const reads = await readsOf(async () => expect((await app.send(path)).status).toBe(200));
      expect(reads.length).toBeGreaterThan(0);
      expect(await nestedScans(reads)).toEqual([]);
    },
  );
});
