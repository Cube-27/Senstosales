import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { migrationSqlViolations, runMigrationSqlLint } from "../src/migration-sql-lint.ts";

const FILE = "packages/db/migrations/0002_test.sql";
const BREAK = "--> statement-breakpoint\n";
const lint = (...statements: string[]) => migrationSqlViolations(FILE, statements.join(`\n${BREAK}`));

// drizzle-kit's table-rebuild output for `po` (a column type change), with its PRAGMA lines removed.
const REBUILD = [
  "CREATE TABLE `__new_po` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`amend_no` integer NOT NULL\n);",
  'INSERT INTO `__new_po`("id", "amend_no") SELECT "id", "amend_no" FROM `po`;',
  "DROP TABLE `po`;",
  "ALTER TABLE `__new_po` RENAME TO `po`;",
];

describe("migrationSqlViolations", () => {
  it("allows CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN, comments and the table rebuild", () => {
    expect(
      lint(
        "-- a reviewed migration\nCREATE TABLE `t` (\n\t`id` text PRIMARY KEY NOT NULL\n);",
        "CREATE UNIQUE INDEX `t_id_uq` ON `t` (`id`);",
        "CREATE INDEX `t_id_idx` ON `t` (`id`) WHERE id <> '';",
        "ALTER TABLE `t` ADD `note` text;",
        "alter table t add column other integer default 0 not null",
        ...REBUILD,
      ),
    ).toEqual([]);
  });

  it.each([
    ["CREATE TRIGGER t AFTER INSERT ON po BEGIN SELECT 1; END;", "CREATE TRIGGER is not allowed (INV-84)"],
    [
      "create temp trigger if not exists t before delete on po begin select 1; end",
      "CREATE TRIGGER is not allowed (INV-84)",
    ],
    ["CREATE VIEW v AS SELECT 1;", "CREATE VIEW is not allowed (INV-84)"],
    ["CREATE TEMPORARY VIEW v AS SELECT 1;", "CREATE VIEW is not allowed (INV-84)"],
    ["PRAGMA foreign_keys=OFF;", "statement not allowed: PRAGMA foreign_keys=OFF; (INV-84)"],
    ["BEGIN TRANSACTION;", "statement not allowed: BEGIN TRANSACTION; (INV-84)"],
    ["UPDATE po SET amend_no = 0;", "statement not allowed: UPDATE po SET amend_no = 0; (INV-84)"],
    ["DELETE FROM audit_log;", "statement not allowed: DELETE FROM audit_log; (INV-84)"],
    ["INSERT INTO po (id) VALUES ('x');", "statement not allowed: INSERT INTO po (id) VALUES ('x'); (INV-84)"],
    ["ALTER TABLE po DROP COLUMN remarks;", "statement not allowed: ALTER TABLE po DROP COLUMN remarks; (INV-84)"],
    ["ALTER TABLE po RENAME TO po_old;", "statement not allowed: ALTER TABLE po RENAME TO po_old; (INV-84)"],
    ["DROP TABLE po;", "DROP TABLE po outside a table rebuild (INV-84)"],
    ["DROP INDEX po_supplier_po_number_uq;", "statement not allowed: DROP INDEX po_supplier_po_number_uq; (INV-84)"],
  ])("rejects %s", (statement, message) => {
    expect(lint("CREATE TABLE `t` (`id` text);", statement)).toEqual([`${FILE}:3 ${message}`]);
  });

  it("rejects a second statement hidden in one breakpoint chunk", () => {
    expect(migrationSqlViolations(FILE, "CREATE TABLE `t` (`id` text);\nCREATE VIEW v AS SELECT 1;")).toEqual([
      `${FILE}:1 CREATE VIEW is not allowed (INV-84)`,
    ]);
    expect(migrationSqlViolations(FILE, "CREATE TABLE a (id text); CREATE TABLE b (id text);")).toEqual([
      `${FILE}:1 more than one statement between breakpoints (INV-84)`,
    ]);
  });

  it("rejects a rebuild out of order or left half done", () => {
    const [create, copy, drop, rename] = REBUILD as [string, string, string, string];
    expect(lint(create, drop, rename)).toEqual([
      `${FILE}:6 DROP TABLE po outside a table rebuild (INV-84)`,
      `${FILE}:8 RENAME of __new_po before DROP TABLE po (INV-84)`,
    ]);
    expect(lint(create, copy, drop)).toEqual([`${FILE} table po dropped and never rebuilt (INV-84)`]);
    expect(lint(create, copy, drop, "ALTER TABLE `__new_po` RENAME TO `other`;")).toEqual([
      `${FILE}:10 statement not allowed: ALTER TABLE \`__new_po\` RENAME TO \`other\`; (INV-84)`,
      `${FILE} table po dropped and never rebuilt (INV-84)`,
    ]);
  });
});

describe("runMigrationSqlLint", () => {
  it("passes the committed migrations", () => {
    expect(runMigrationSqlLint()).toEqual([]);
  });

  it("fails a planted trigger and view", () => {
    const dir = mkdtempSync(join(tmpdir(), "senstosales-migrations-"));
    try {
      writeFileSync(join(dir, "0001_init.sql"), "CREATE TABLE `t` (`id` text);");
      writeFileSync(
        join(dir, "0002_planted.sql"),
        `CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN SELECT 1; END;${BREAK}CREATE VIEW v AS SELECT id FROM t;`,
      );
      expect(runMigrationSqlLint(dir)).toEqual([
        `${dir}/0002_planted.sql:1 CREATE TRIGGER is not allowed (INV-84)`,
        `${dir}/0002_planted.sql:2 CREATE VIEW is not allowed (INV-84)`,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
