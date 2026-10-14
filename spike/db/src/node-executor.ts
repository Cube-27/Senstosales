// node:sqlite executor behind drizzle-orm/sqlite-proxy (ARCHITECTURE §4.1). The Db port exposes query + batch only:
// drizzle's own transaction() on this driver issues BEGIN/COMMIT as separate calls, which D1 cannot run (C4).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync, type SQLInputValue } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";

type Method = "run" | "all" | "values" | "get";
type Query = { sql: string; params: unknown[]; method: Method };

const PRAGMAS = [
  "journal_mode = WAL",
  "synchronous = NORMAL",
  "foreign_keys = ON",
  "busy_timeout = 30000",
  "cache_size = -32000",
  "temp_store = MEMORY",
];

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

export function migrationStatements(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8").split("--> statement-breakpoint"))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function openNodeDb(path: string) {
  const raw = new DatabaseSync(path);
  for (const p of PRAGMAS) raw.exec(`PRAGMA ${p}`);

  const cache = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
  const prepare = (sql: string) => {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = raw.prepare(sql);
      stmt.setReturnArrays(true);
      cache.set(sql, stmt);
    }
    return stmt;
  };

  const exec = ({ sql, params, method }: Query): { rows: unknown[] } => {
    const stmt = prepare(sql);
    const args = params as SQLInputValue[];
    if (method === "run") {
      stmt.run(...args);
      return { rows: [] };
    }
    if (method === "get") return { rows: (stmt.get(...args) ?? undefined) as unknown[] };
    return { rows: stmt.all(...args) };
  };

  // All-or-nothing in one call. Synchronous, so no other statement on this connection can interleave.
  const runBatch = <T>(fn: () => T): T => {
    raw.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      raw.exec("COMMIT");
      return out;
    } catch (err) {
      raw.exec("ROLLBACK");
      throw err;
    }
  };

  const db = drizzle(
    async (sql, params, method) => exec({ sql, params, method }),
    async (queries) => runBatch(() => queries.map(exec)),
  );

  const migrate = (statements: string[]) => runBatch(() => statements.forEach((s) => raw.exec(s)));

  return { raw, db, migrate, batchRaw: (queries: Query[]) => runBatch(() => queries.map(exec)) };
}

/** Online backup (SQLite backup API) of a live connection; returns the page count copied. */
export function backupTo(raw: DatabaseSync, path: string): Promise<number> {
  return backup(raw, path);
}
