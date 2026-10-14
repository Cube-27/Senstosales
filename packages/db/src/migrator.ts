// Plans and applies schema migrations (SPEC-05 §4.1, ARCHITECTURE §8.3, §13.3). The version lives in
// `schema_migration`, not `PRAGMA user_version`, which local D1 refuses (ADR 0002). Pending migrations and their
// `schema_migration` rows go in one batch, so a failure leaves the DB as it was (C4).
import { sql } from "drizzle-orm";

import { MIGRATIONS } from "./migrations.generated.ts";
import type { Db, Statement } from "./port.ts";
import { schemaMigration } from "./schema/migration.ts";
import type { Instant } from "./types.ts";

export { MIGRATIONS };

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

/** The schema version this build expects. */
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/** The DB was migrated by a newer build; this one must not open it (§13.3). */
export class NewerDatabaseError extends Error {
  override name = "NewerDatabaseError";
  constructor() {
    super("This data was saved by a newer version of SenstoSales.");
  }
}

/** The highest applied version; 0 for an empty DB. */
export async function readSchemaVersion(db: Db): Promise<number> {
  const tables = await db.query(
    db.build.values(sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'`),
  );
  if (tables.length === 0) return 0;
  const [row] = await db.query(db.build.values<[number | null]>(sql`SELECT max(version) FROM schema_migration`));
  return row?.[0] ?? 0;
}

/** The migrations above `current`, in order; empty when up to date. Throws `NewerDatabaseError` past the last. */
export function planMigrations(current: number, migrations: readonly Migration[] = MIGRATIONS): Migration[] {
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (current > latest) throw new NewerDatabaseError();
  return migrations.filter((m) => m.version > current);
}

/** Applies `plan` and records each version, in one batch. An empty plan writes nothing. */
export async function applyMigrations(
  db: Db,
  plan: readonly Migration[],
  stamp: { appVersion: string; appliedAt: Instant },
): Promise<void> {
  const statements: Statement[] = plan.flatMap((m) => [
    ...m.statements.map((s) => db.build.run(sql.raw(s))),
    db.build.insert(schemaMigration).values({ version: m.version, name: m.name, ...stamp }),
  ]);
  await db.batch(statements);
}
