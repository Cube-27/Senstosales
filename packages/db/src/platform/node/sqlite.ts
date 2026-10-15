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

/** Pages per backup step: all of them, so a restore is one step and no statement sees a half-copied database. */
const ONE_STEP = 2 ** 31 - 1;

/**
 * Awaits a node:sqlite backup with a short timer running. Seen with Node 26 on Windows: a backup's completion does
 * not wake an event loop that is otherwise only waiting (a test worker, a server between requests), so the promise
 * settled seconds later, at the next unrelated event. The timer keeps the loop turning while the copy runs.
 */
async function awake(copy: Promise<unknown>): Promise<void> {
  const timer = setInterval(() => {}, 10);
  try {
    await copy;
  } finally {
    clearInterval(timer);
  }
}

type Method = "run" | "all" | "values" | "get";
type Query = { sql: string; params: unknown[]; method: Method };

export interface NodeDb extends Db {
  /** Copies the live database to `path` with SQLite's online backup API. */
  backupTo(path: string): Promise<void>;
  /** Replaces the live database's content with the database at `path`, through the online backup API in the other
   * direction. This connection stays open and sees the restored rows. */
  restoreFrom(path: string): Promise<void>;
  close(): void;
}

export function openNodeDb(path: string): NodeDb {
  const conn = new DatabaseSync(path);
  try {
    for (const pragma of PRAGMAS) conn.exec(`PRAGMA ${pragma}`);
  } catch (err) {
    // A file that is not a database fails here; closing lets the caller delete or replace it (Windows locks it).
    conn.close();
    throw err;
  }

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
    ...wrapDrizzle(drizzleDb, (statements) => drizzleDb.batch(statements)),
    async backupTo(path) {
      await awake(backup(conn, path));
    },
    async restoreFrom(source) {
      const from = new DatabaseSync(source, { readOnly: true });
      try {
        await awake(backup(from, path, { rate: ONE_STEP }));
      } finally {
        from.close();
      }
    },
    close() {
      conn.close();
    },
  };
}
