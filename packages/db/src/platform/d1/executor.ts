// The D1 executor for the Db port (ARCHITECTURE §4.1; ADR 0002): a batch is one D1 `batch()` call, all or nothing.
// Used now only by the D1 dialect check; hosted D1 is candidate K1. No PRAGMAs: D1 refuses most of them and keeps
// foreign keys on.
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";

import { wrapDrizzle, type Db } from "../../port.ts";

const dialect = new SQLiteAsyncDialect();

export function openD1Db(binding: AnyD1Database): Db {
  // Drizzle's own D1 batch fails on a raw `run(sql)` with parameters (it binds a statement it never prepared), so
  // the batch is built here from each statement's SQL. The port's batch returns no rows, so nothing is mapped back.
  return wrapDrizzle(drizzle(binding), (statements) =>
    binding.batch(
      statements.map((statement) => {
        const { sql, params } = dialect.sqlToQuery(statement.getSQL());
        return binding.prepare(sql).bind(...params);
      }),
    ),
  );
}
