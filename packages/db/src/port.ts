// The Db port (ARCHITECTURE §4.1, C4): one read at a time, or one all-or-nothing batch of writes. It wraps Drizzle
// instead of exposing it, because Drizzle's own transaction() sends BEGIN and COMMIT as separate calls, which C4
// forbids and D1 refuses (ADR 0002).
import type { SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/** Drizzle's statement builders, without its transaction() or batch(). Build here; run through `Db`. */
export type QueryBuilder = Omit<BaseSQLiteDatabase<"async", unknown>, "transaction" | "batch">;

/** One statement of a batch: an insert, update, delete or raw `run` built with `Db.build`. Each one exposes its SQL,
 * which the D1 executor binds itself. */
export type Statement = BatchItem<"sqlite"> & SQLWrapper;

export interface Db {
  readonly build: QueryBuilder;
  /** Runs one read built with `build` and returns its result. Failures surface as `DbError`. */
  query<T>(statement: PromiseLike<T>): Promise<T>;
  /** Runs every statement in one call, all or nothing. Failures surface as `DbError`, and nothing is written. */
  batch(statements: readonly Statement[]): Promise<void>;
}

/** The statements of one write use case, committed once (C4). */
export class WriteBatch {
  readonly #db: Db;
  readonly #statements: Statement[] = [];
  #committed = false;

  constructor(db: Db) {
    this.#db = db;
  }

  add(statement: Statement): this {
    this.#assertOpen();
    this.#statements.push(statement);
    return this;
  }

  async commit(): Promise<void> {
    this.#assertOpen();
    this.#committed = true;
    await this.#db.batch(this.#statements);
  }

  #assertOpen(): void {
    if (this.#committed) throw new Error("WriteBatch already committed");
  }
}

/** A statement the database refused. `message` is the database's own message. */
export class DbError extends Error {
  override name = "DbError";
}

/** A unique index or primary key refused a row. `target` is what SQLite names: `table.column, …`. */
export class UniqueViolation extends DbError {
  override name = "UniqueViolation";
  readonly target: string;

  constructor(target: string, options?: ErrorOptions) {
    super(`UNIQUE constraint failed: ${target}`, options);
    this.target = target;
  }
}

const UNIQUE = /UNIQUE constraint failed: ([^:]+)/;

/** Maps an executor error to a `DbError`. Drizzle wraps a single query's error, so the database's is the deepest cause. */
function toDbError(err: unknown): DbError {
  let root = err;
  while (root instanceof Error && root.cause instanceof Error) root = root.cause;
  const message = root instanceof Error ? root.message : String(root);
  const unique = UNIQUE.exec(message)?.[1];
  return unique === undefined ? new DbError(message, { cause: err }) : new UniqueViolation(unique, { cause: err });
}

async function mapErrors<T>(run: PromiseLike<T>): Promise<T> {
  try {
    return await run;
  } catch (err) {
    throw toDbError(err);
  }
}

/** Runs a non-empty batch all or nothing: the executor's native batch (sqlite-proxy, D1). */
export type RunBatch = (statements: [Statement, ...Statement[]]) => Promise<unknown>;

/** The port over an executor's Drizzle database, so every executor has the same batch semantics and errors. */
export function wrapDrizzle(drizzleDb: BaseSQLiteDatabase<"async", unknown>, runBatch: RunBatch): Db {
  return {
    build: drizzleDb,
    query: mapErrors,
    async batch(statements) {
      if (statements.length === 0) return;
      // Drizzle types its batch as a non-empty tuple; the length check is that proof.
      await mapErrors(runBatch(statements as [Statement, ...Statement[]]));
    },
  };
}
