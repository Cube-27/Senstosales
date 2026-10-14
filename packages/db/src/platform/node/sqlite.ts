// The node:sqlite executor for the Db port (ARCHITECTURE §4.1, §8.3; ADR 0002): Drizzle over sqlite-proxy, a batch
// is BEGIN IMMEDIATE … COMMIT on one connection. node:sqlite is synchronous, so no other statement interleaves.
import { backup, DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import { toDbError, type Db } from "../../port.ts";

const PRAGMAS = [
  "journal_mode = WAL",
  "synchronous = NORMAL",
  "foreign_keys = ON",
  "busy_timeout = 30000",
  "cache_size = -32000",
  "temp_store = MEMORY",
];

type Method = "run" | "all" | "values" | "get";
type Query = { sql: string; params: unknown[]; method: Method };

export interface NodeDb extends Db {
  /** Copies the live database to `path` with SQLite's online backup API. */
  backupTo(path: string): Promise<void>;
  close(): void;
}

export function openNodeDb(path: string): NodeDb {
  const conn = new DatabaseSync(path);
  for (const pragma of PRAGMAS) conn.exec(`PRAGMA ${pragma}`);

  // Drizzle maps rows by position, so statements return arrays. Builders give a fixed set of SQL texts to cache.
  const prepared = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let stmt = prepared.get(sql);
    if (stmt === undefined) {
      stmt = conn.prepare(sql);
      stmt.setReturnArrays(true);
      prepared.set(sql, stmt);
    }
    return stmt;
  };

  // Drizzle's builders bind only SQLite values.
  const execute = ({ sql, params, method }: Query): { rows: unknown } => {
    const stmt = prepare(sql);
    const args = params as SQLInputValue[];
    if (method === "run") {
      stmt.run(...args);
      return { rows: [] };
    }
    return { rows: method === "get" ? stmt.get(...args) : stmt.all(...args) };
  };

  const inTransaction = (queries: Query[]): { rows: unknown }[] => {
    conn.exec("BEGIN IMMEDIATE");
    try {
      const results = queries.map(execute);
      conn.exec("COMMIT");
      return results;
    } catch (err) {
      conn.exec("ROLLBACK");
      throw err;
    }
  };

  const drizzleDb = drizzle(
    async (sql, params, method) => execute({ sql, params, method }) as { rows: unknown[] },
    async (queries) => inTransaction(queries) as { rows: unknown[] }[],
  );

  return {
    build: drizzleDb,
    async query(statement) {
      try {
        return await statement;
      } catch (err) {
        throw toDbError(err);
      }
    },
    async batch(statements) {
      const [first, ...rest] = statements;
      if (first === undefined) return;
      try {
        await drizzleDb.batch([first, ...rest]);
      } catch (err) {
        throw toDbError(err);
      }
    },
    async backupTo(path) {
      await backup(conn, path);
    },
    close() {
      conn.close();
    },
  };
}
