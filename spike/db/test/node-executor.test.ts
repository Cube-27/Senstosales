// Spike questions for the node:sqlite executor (SPEC-01 §4.3): PRAGMAs, Drizzle over sqlite-proxy, batch
// atomicity, the migration SQL as one batch, the online backup API, integer range.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";

import { eq } from "drizzle-orm";

import { backupTo, migrationStatements, openNodeDb } from "../src/node-executor.ts";
import { auditLog, job, po, poItem } from "../src/schema.ts";

const dir = mkdtempSync(join(tmpdir(), "spike-db-"));
const open: DatabaseSync[] = [];
// Windows refuses to delete a database file that a connection still holds.
after(() => {
  for (const raw of open) if (raw.isOpen) raw.close();
  rmSync(dir, { recursive: true, force: true });
});

function track(path: string) {
  const handle = openNodeDb(path);
  open.push(handle.raw);
  return handle;
}

function freshDb(name: string) {
  const handle = track(join(dir, `${name}.db`));
  handle.migrate(migrationStatements());
  return handle;
}

// Drizzle wraps a single query's error as "Failed query: …" with the SQLite error as `cause`; batch errors are not
// wrapped. Match the SQLite message either way.
const sqliteError = (re: RegExp) => (err: unknown) => {
  const e = err as Error & { cause?: Error };
  return re.test(e.cause?.message ?? e.message);
};

describe("PRAGMAs (§8.3)", () => {
  test("read back as set", () => {
    const { raw } = freshDb("pragmas");
    const read = (p: string) => Object.values(raw.prepare(`PRAGMA ${p}`).get()!)[0];
    assert.deepEqual(
      {
        journal_mode: read("journal_mode"),
        synchronous: read("synchronous"),
        foreign_keys: read("foreign_keys"),
        busy_timeout: read("busy_timeout"),
        cache_size: read("cache_size"),
        temp_store: read("temp_store"),
      },
      // synchronous NORMAL = 1, temp_store MEMORY = 2
      { journal_mode: "wal", synchronous: 1, foreign_keys: 1, busy_timeout: 30000, cache_size: -32000, temp_store: 2 },
    );
  });
});

describe("Drizzle over sqlite-proxy", () => {
  test("query builder round-trips typed rows", async () => {
    const { db } = freshDb("roundtrip");
    await db.insert(po).values({ id: "01PO", supplierId: "S1", poNumber: "9000001", poDate: "2026-04-01" });
    await db.insert(poItem).values({ id: "01IT", poId: "01PO", poItemNo: 10, ordQtyM: 12_500, rateU5: 150_000_00 });
    const rows = await db
      .select({ no: poItem.poItemNo, qty: poItem.ordQtyM, num: po.poNumber })
      .from(poItem)
      .innerJoin(po, eq(po.id, poItem.poId));
    assert.deepEqual(rows, [{ no: 10, qty: 12_500, num: "9000001" }]);
    assert.deepEqual(await db.select({ v: po.version }).from(po).get(), { v: 0 });
  });
});

describe("batch = BEGIN IMMEDIATE … COMMIT", () => {
  test("all statements commit together", async () => {
    const { db } = freshDb("batch-ok");
    await db.batch([
      db.insert(po).values({ id: "P1", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" }),
      db.insert(poItem).values({ id: "I1", poId: "P1", poItemNo: 10, ordQtyM: 1000, rateU5: 100 }),
      db.insert(auditLog).values({ id: "A1", at: "2026-04-01T00:00:00Z", action: "po.create", entityId: "P1" }),
    ]);
    assert.deepEqual(await db.select({ id: poItem.id }).from(poItem), [{ id: "I1" }]);
  });

  test("a failing third statement leaves no row from the first two", async () => {
    const { db } = freshDb("batch-rollback");
    await db.insert(po).values({ id: "P0", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" });
    await assert.rejects(
      db.batch([
        db.insert(po).values({ id: "P1", supplierId: "S1", poNumber: "2", poDate: "2026-04-01" }),
        db.insert(auditLog).values({ id: "A1", at: "2026-04-01T00:00:00Z", action: "po.create", entityId: "P1" }),
        // UNIQUE(supplier_id, po_number) violation
        db.insert(po).values({ id: "P2", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" }),
      ]),
      sqliteError(/^UNIQUE constraint failed: po.supplier_id, po.po_number$/),
    );
    assert.deepEqual(await db.select({ id: po.id }).from(po), [{ id: "P0" }]);
    assert.deepEqual(await db.select({ id: auditLog.id }).from(auditLog), []);
  });

  test("a foreign-key violation rolls the batch back (foreign_keys=ON)", async () => {
    const { db } = freshDb("batch-fk");
    await assert.rejects(
      db.batch([
        db.insert(auditLog).values({ id: "A1", at: "2026-04-01T00:00:00Z", action: "x", entityId: "X" }),
        db.insert(poItem).values({ id: "I1", poId: "NOPE", poItemNo: 10, ordQtyM: 1, rateU5: 1 }),
      ]),
      sqliteError(/^FOREIGN KEY constraint failed$/),
    );
    assert.deepEqual(await db.select({ id: auditLog.id }).from(auditLog), []);
  });

  test("the partial unique index allows one running job", async () => {
    const { db } = freshDb("job");
    await db.insert(job).values({ id: "J1", type: "scrape", status: "running", createdAt: "t" });
    await db.insert(job).values({ id: "J2", type: "scrape", status: "done", createdAt: "t" });
    await assert.rejects(
      db.insert(job).values({ id: "J3", type: "scrape", status: "running", createdAt: "t" }),
      sqliteError(/^UNIQUE constraint failed: job.status$/),
    );
  });

  test("the connection is usable after a rolled-back batch", async () => {
    const { db } = freshDb("after-rollback");
    const bad = db.insert(poItem).values({ id: "I1", poId: "NOPE", poItemNo: 1, ordQtyM: 1, rateU5: 1 });
    await assert.rejects(db.batch([bad]));
    await db.batch([db.insert(po).values({ id: "P1", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" })]);
    assert.deepEqual(await db.select({ id: po.id }).from(po), [{ id: "P1" }]);
  });
});

describe("migration SQL", () => {
  test("applies as one batch and lists the expected tables", () => {
    const { raw } = freshDb("migrate");
    const names = raw
      .prepare("SELECT name FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.deepEqual(names, [
      "audit_log",
      "job",
      "job_single_running_uq",
      "po",
      "po_item",
      "po_item_po_idx",
      "po_item_po_no_uq",
      "po_supplier_number_uq",
    ]);
  });

  test("a migration whose last statement fails leaves the schema empty", () => {
    const handle = track(join(dir, "migrate-fail.db"));
    assert.throws(() => handle.migrate([...migrationStatements(), "CREATE TABLE po (id text)"]), /already exists/);
    const count = handle.raw.prepare("SELECT count(*) AS n FROM sqlite_schema").get()!.n;
    assert.equal(count, 0);
  });
});

describe("online backup API", () => {
  let path = "";
  before(async () => {
    const { db } = freshDb("backup-src");
    await db.insert(po).values({ id: "P1", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" });
    path = join(dir, "backup-copy.db");
    const handle = track(join(dir, "backup-src.db"));
    // Rows still in the WAL (not checkpointed) must reach the copy.
    await handle.db.insert(po).values({ id: "P2", supplierId: "S1", poNumber: "2", poDate: "2026-04-01" });
    const pages = await backupTo(handle.raw, path);
    assert.equal(typeof pages, "number");
  });

  test("writes a readable, consistent copy", () => {
    const copy = new DatabaseSync(path, { readOnly: true });
    assert.deepEqual(
      copy.prepare("SELECT id FROM po ORDER BY id").all().map((r) => r.id),
      ["P1", "P2"],
    );
    assert.equal(copy.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
    copy.close();
  });
});

describe("integer range (C3)", () => {
  test("an integer beyond 2^53 throws instead of losing precision", () => {
    const { raw } = freshDb("range");
    raw.exec("INSERT INTO po (id, supplier_id, po_number, po_date, po_value_u5) VALUES ('P', 'S', '1', 'd', 9007199254740993)");
    assert.throws(() => raw.prepare("SELECT po_value_u5 FROM po").get(), { name: "RangeError", message: "Value is too large to be represented as a JavaScript number: 9007199254740993" });
  });
});
