// INV-84 and the L2 exit (SPEC-05 PR 4): every migration applies on a local D1 through the D1 executor and the
// migrator, as one batch, and leaves the same schema objects and version as on node:sqlite. Local D1 is miniflare's
// in-memory D1: no Cloudflare account, nothing persisted.
// Usage: node tools/checks/src/d1-dialect.ts (from the repo root)
import { sql } from "drizzle-orm";
import { Miniflare } from "miniflare";

import {
  applyMigrations,
  type Db,
  type Instant,
  type Migration,
  MIGRATIONS,
  planMigrations,
  readSchemaVersion,
} from "@senstosales/db";
import { openD1Db } from "@senstosales/db/d1";
import { openNodeDb } from "@senstosales/db/node";

const STAMP = { appVersion: "d1-dialect-check", appliedAt: "2025-04-01T00:00:00.000Z" as Instant };

/** `type name: sql` for every schema object; D1 keeps its own tables under `_cf_`. */
const schemaObjects = async (db: Db): Promise<string[]> =>
  (
    await db.query(
      db.build.values<[string, string, string | null]>(
        sql`SELECT type, name, sql FROM sqlite_schema
            WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name`,
      ),
    )
  ).map(([type, name, text]) => `${type} ${name}: ${text ?? ""}`);

/** Migrates an empty DB; returns its version and schema, or the error the executor raised. */
async function migrate(
  db: Db,
  migrations: readonly Migration[],
): Promise<string | { version: number; objects: string[] }> {
  try {
    await applyMigrations(db, planMigrations(await readSchemaVersion(db), migrations), STAMP);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return { version: await readSchemaVersion(db), objects: await schemaObjects(db) };
}

/** Where D1 and node:sqlite disagree on `migrations`; empty when both apply them to the same schema. */
export async function d1DialectFindings(migrations: readonly Migration[] = MIGRATIONS): Promise<string[]> {
  const mf = new Miniflare({ modules: true, script: "export default {}", d1Databases: { DB: "dialect-check" } });
  const node = openNodeDb(":memory:");
  try {
    const d1 = await migrate(openD1Db(await mf.getD1Database("DB")), migrations);
    const expected = await migrate(node, migrations);
    if (typeof d1 === "string") return [`D1 refused the migrations: ${d1}`];
    if (typeof expected === "string") return [`node:sqlite refused the migrations: ${expected}`];
    const version =
      d1.version === expected.version ? [] : [`D1 version ${d1.version}, node:sqlite ${expected.version}`];
    const missing = expected.objects.filter((o) => !d1.objects.includes(o)).map((o) => `missing on D1: ${o}`);
    const extra = d1.objects.filter((o) => !expected.objects.includes(o)).map((o) => `only on D1: ${o}`);
    return [...version, ...missing, ...extra];
  } finally {
    node.close();
    await mf.dispose();
  }
}

if (import.meta.main) {
  const found = await d1DialectFindings();
  for (const finding of found) console.error(finding);
  process.exit(found.length === 0 ? 0 : 1);
}
