// The node:sqlite executor for the Db port (ARCHITECTURE §4.1, §8.3; ADR 0002): Drizzle over sqlite-proxy, a batch
// is BEGIN IMMEDIATE … COMMIT on one connection. node:sqlite is synchronous, so no other statement interleaves.
import { backup, DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import { wrapDrizzle, type Db } from "../../port.ts";

const PRAGMAS = [
  "journal_mode = WAL",
  "synchronous = NORMAL",
  "foreign_keys = ON",
  "busy_timeout = 30000",
  "cache_size = -32000",
  "temp_store = MEMORY",
];

const STATEMENT_CACHE_SIZE = 500;

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

  // Drizzle maps rows by position, so statements return arrays. Most SQL texts repeat, but multi-row inserts and
  // `inArray` vary with their length, so the cache is emptied when full instead of growing for the process's life.
  const prepared = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let stmt = prepared.get(sql);
    if (stmt === undefined) {
      if (prepared.size >= STATEMENT_CACHE_SIZE) prepared.clear();
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
      // Some errors end the transaction inside SQLite; a second ROLLBACK would throw and hide `err`.
      if (conn.isTransaction) conn.exec("ROLLBACK");
      throw err;
    }
  };

  const drizzleDb = drizzle(
    // Drizzle calls these only from async methods with `await`, so a synchronous throw still becomes a rejection.
    (sql, params, method) => Promise.resolve(execute({ sql, params, method }) as { rows: unknown[] }),
    (queries) => Promise.resolve(inTransaction(queries) as { rows: unknown[] }[]),
  );

  return {
    ...wrapDrizzle(drizzleDb),
    async backupTo(path) {
      await backup(conn, path);
    },
    close() {
      conn.close();
    },
  };
}
