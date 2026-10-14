// INV-84 (SPEC-05 PR 4, ARCHITECTURE §8.3): migration SQL holds only CREATE TABLE, CREATE INDEX, ALTER TABLE ADD
// COLUMN and the table-rebuild pattern (CREATE TABLE `__new_x`, INSERT INTO `__new_x` … SELECT … FROM `x`, DROP TABLE
// `x`, ALTER TABLE `__new_x` RENAME TO `x`). No triggers or views: D1 accepts them (ADR 0002), so this lint is what
// keeps them out. No PRAGMA or transaction statements: the executor's batch supplies atomicity. One statement per
// drizzle-kit breakpoint, so nothing hides behind an allowed one (a `;` inside a string literal is refused too).
// Usage: node tools/checks/src/migration-sql-lint.ts (from the repo root)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "packages/db/migrations";
const BREAKPOINT = "--> statement-breakpoint";
const ID = String.raw`[\x60"]?(\w+)[\x60"]?`;
const re = (source: string): RegExp => new RegExp(`^${source}$`, "is");

const TRIGGER = /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\b/i;
const VIEW = /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?VIEW\b/i;
const ALLOWED = [
  re(String.raw`CREATE\s+TABLE\s+${ID}\s*\(.*\)`),
  re(String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s.*`),
  re(String.raw`ALTER\s+TABLE\s+${ID}\s+ADD\s.*`),
];
const COPY = re(String.raw`INSERT\s+INTO\s+${ID}\s*\(.*\)\s*SELECT\s.*\sFROM\s+${ID}`);
const DROP = re(String.raw`DROP\s+TABLE\s+${ID}`);
const RENAME = re(String.raw`ALTER\s+TABLE\s+${ID}\s+RENAME\s+TO\s+${ID}`);

interface Chunk {
  line: number;
  statement: string;
}

/** The statements between breakpoints, without comment lines or the trailing `;`, with their first line. */
function chunks(sql: string): Chunk[] {
  let offset = 0;
  return sql.split(BREAKPOINT).flatMap((text) => {
    const start = offset + text.search(/\S|$/);
    offset += text.length + BREAKPOINT.length;
    const statement = text
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "")
      .trim();
    if (statement === "") return [];
    return [{ line: sql.slice(0, start).split("\n").length, statement }];
  });
}

/** INV-84 findings for one migration file, as `path:line message (INV-84)`. */
export function migrationSqlViolations(path: string, sql: string): string[] {
  const copied = new Set<string>();
  const dropped = new Set<string>();
  const found = chunks(sql).flatMap(({ line, statement }) => {
    const finding = (message: string): string[] => [`${path}:${line} ${message} (INV-84)`];
    if (TRIGGER.test(statement)) return finding("CREATE TRIGGER is not allowed");
    if (VIEW.test(statement)) return finding("CREATE VIEW is not allowed");
    if (statement.includes(";")) return finding("more than one statement between breakpoints");
    const copy = COPY.exec(statement);
    if (copy && copy[1] === `__new_${copy[2]}`) {
      copied.add(copy[2] as string);
      return [];
    }
    const drop = DROP.exec(statement)?.[1];
    if (drop !== undefined) {
      if (!copied.has(drop)) return finding(`DROP TABLE ${drop} outside a table rebuild`);
      dropped.add(drop);
      return [];
    }
    const rename = RENAME.exec(statement);
    if (rename && rename[1] === `__new_${rename[2]}`) {
      if (!dropped.delete(rename[2] as string)) return finding(`RENAME of ${rename[1]} before DROP TABLE ${rename[2]}`);
      return [];
    }
    if (ALLOWED.some((allowed) => allowed.test(statement))) return [];
    return finding(`statement not allowed: ${statement.split("\n")[0]};`);
  });
  return [...found, ...[...dropped].map((table) => `${path} table ${table} dropped and never rebuilt (INV-84)`)];
}

/** Findings for every migration file in the repo. */
export function runMigrationSqlLint(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .flatMap((file) => migrationSqlViolations(`${dir}/${file}`, readFileSync(join(dir, file), "utf8")));
}

if (import.meta.main) {
  const found = runMigrationSqlLint();
  for (const finding of found) console.error(finding);
  process.exit(found.length === 0 ? 0 : 1);
}
