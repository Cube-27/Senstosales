// The same migration SQL and the same Drizzle batches on a local D1 (miniflare via wrangler). SPEC-01 §4.3.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";

import { auditLog, po } from "../src/schema.ts";

const persist = mkdtempSync(join(tmpdir(), "spike-d1-"));
const wrangler = join(import.meta.dirname, "..", "node_modules", "wrangler", "bin", "wrangler.js");
const root = join(import.meta.dirname, "..");

type Proxy = Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let proxy: Proxy;

before(async () => {
  // Same file the node:sqlite test applies, through the CLI path SPEC-05's dialect step will use.
  execFileSync(
    process.execPath,
    [wrangler, "d1", "execute", "DB", "--local", "--persist-to", persist, "--file", "migrations/0000_init.sql", "--yes"],
    { cwd: root, stdio: "pipe" },
  );
  proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: { path: join(persist, "v3") }, configPath: join(root, "wrangler.jsonc") });
});
after(async () => {
  await proxy?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const sqliteError = (re: RegExp) => (err: unknown) => {
  const e = err as Error & { cause?: Error };
  return re.test(e.cause?.message ?? e.message);
};

describe("D1 local", () => {
  test("the migration produced the same tables and indexes as node:sqlite", async () => {
    const { results } = await proxy.env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();
    assert.deepEqual(
      results.map((r) => r.name),
      ["audit_log", "job", "job_single_running_uq", "po", "po_item", "po_item_po_idx", "po_item_po_no_uq", "po_supplier_number_uq"],
    );
  });

  test("db.batch commits together and a failing third statement rolls back", async () => {
    const db = drizzle(proxy.env.DB);
    await db.batch([
      db.insert(po).values({ id: "P0", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" }),
      db.insert(auditLog).values({ id: "A0", at: "t", action: "po.create", entityId: "P0" }),
    ]);
    await assert.rejects(
      db.batch([
        db.insert(po).values({ id: "P1", supplierId: "S1", poNumber: "2", poDate: "2026-04-01" }),
        db.insert(auditLog).values({ id: "A1", at: "t", action: "po.create", entityId: "P1" }),
        db.insert(po).values({ id: "P2", supplierId: "S1", poNumber: "1", poDate: "2026-04-01" }),
      ]),
      sqliteError(/UNIQUE constraint failed: po.supplier_id, po.po_number/),
    );
    assert.deepEqual(await db.select({ id: po.id }).from(po), [{ id: "P0" }]);
    assert.deepEqual(await db.select({ id: auditLog.id }).from(auditLog), [{ id: "A0" }]);
  });
});

describe("wrangler d1 execute --file atomicity", () => {
  test("a file whose last statement fails leaves no table from the earlier ones", async () => {
    const dir = mkdtempSync(join(tmpdir(), "spike-d1-file-"));
    const file = join(dir, "bad.sql");
    writeFileSync(file, ["CREATE TABLE t1 (id text);", "CREATE TABLE t2 (id text);", "CREATE TABLE t1 (id text);"].join("\n"));
    const run = () =>
      execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", "--local", "--persist-to", persist, "--file", file, "--yes"], {
        cwd: root,
        stdio: "pipe",
      });
    assert.throws(run, (e: Error & { stderr?: Buffer; stdout?: Buffer }) =>
      /table t1 already exists/.test(`${e.stdout}${e.stderr}`),
    );
    const { results } = await proxy.env.DB.prepare("SELECT name FROM sqlite_schema WHERE name IN ('t1','t2')").all();
    assert.deepEqual(results, []);
    rmSync(dir, { recursive: true, force: true });
  });
});

// Dialect probes: what differs from node:sqlite. Recorded in the ADR, not asserted as desired behaviour.
describe("D1 local dialect probes", () => {
  const probe = async (sql: string) => {
    try {
      const r = await proxy.env.DB.prepare(sql).all();
      return { ok: true, rows: r.results };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  test("record", async () => {
    const out: Record<string, unknown> = {};
    for (const sql of [
      "PRAGMA foreign_keys",
      "PRAGMA journal_mode",
      "PRAGMA user_version",
      "PRAGMA user_version = 7",
      "PRAGMA user_version",
      "BEGIN IMMEDIATE",
      "SAVEPOINT s1",
      "CREATE TRIGGER t AFTER INSERT ON po BEGIN SELECT 1; END",
      "CREATE VIEW v AS SELECT 1",
      "SELECT sqlite_version() AS v",
    ]) {
      out[sql] = await probe(sql);
    }
    console.log(JSON.stringify(out, null, 1));
  });
});
