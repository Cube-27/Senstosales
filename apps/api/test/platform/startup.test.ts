// SPEC-07 PR 3: the startup upgrade gate (C9, INV-82). An up-to-date database is not written; an older one is backed
// up before its one migration batch; a failed migration leaves it as it was; a newer one is refused.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Instant, LATEST_VERSION, readSchemaVersion, schemaMigration, type Statement } from "@senstosales/db";
import { openNodeDb, type NodeDb } from "@senstosales/db/node";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { startServer } from "../../src/platform/node/main.ts";
import { upgradeGate } from "../../src/platform/node/startup.ts";
import { migratedDb } from "../db.ts";

const MAIN = join(import.meta.dirname, "../../src/platform/node/main.ts");
const NOW = "2025-04-01T05:30:00.000Z" as Instant;
const BACKUP = `pre-upgrade-0-20250401T053000Z.db`;

let tmp: string;
let dbPath: string;
let backupsDir: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "senstosales-startup-"));
  dbPath = join(tmp, "db", "senstosales.db");
  backupsDir = join(tmp, "backups");
  await mkdir(join(tmp, "db"));
  await mkdir(backupsDir);
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

const hash = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

const tables = async (db: NodeDb) =>
  (
    await db.query(db.build.values<[string]>(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`))
  ).map(([name]) => name);

/** Opens the database with every batch recorded, and whether the backup file existed when it ran. */
function openRecorded(path: string) {
  const db = openNodeDb(path);
  const batches: { size: number; backupExisted: boolean }[] = [];
  const recorded: NodeDb = {
    ...db,
    async batch(statements: readonly Statement[]) {
      batches.push({ size: statements.length, backupExisted: existsSync(join(backupsDir, BACKUP)) });
      await db.batch(statements);
    },
  };
  return { db: recorded, batches };
}

async function closedDb(make: (db: NodeDb) => Promise<void>): Promise<string> {
  const db = openNodeDb(dbPath);
  await make(db);
  db.close();
  return hash(dbPath);
}

const gate = (db: NodeDb) => upgradeGate(db, { backupsDir, appVersion: "1.2.3", now: NOW });

describe("upgradeGate", () => {
  it("writes nothing to an up-to-date database", async () => {
    (await migratedDb(dbPath)).close();
    const before = await hash(dbPath);

    const { db, batches } = openRecorded(dbPath);
    await gate(db);
    expect(await readSchemaVersion(db)).toBe(LATEST_VERSION);
    db.close();

    expect(batches).toEqual([]);
    expect(await hash(dbPath)).toBe(before);
    expect(await readdir(backupsDir)).toEqual([]);
  });

  it("backs up an older database, then migrates it in one batch", async () => {
    await closedDb(async () => {});

    const { db, batches } = openRecorded(dbPath);
    await gate(db);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.backupExisted).toBe(true);
    expect(await readSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(await db.query(db.build.select().from(schemaMigration))).toEqual([
      { version: 1, name: "init", appliedAt: NOW, appVersion: "1.2.3" },
    ]);
    db.close();

    expect(await readdir(backupsDir)).toEqual([BACKUP]);
    const backup = openNodeDb(join(backupsDir, BACKUP));
    expect(await readSchemaVersion(backup)).toBe(0);
    backup.close();
  });

  it("leaves the database as it was when a migration fails", async () => {
    // A stray table makes the first CREATE TABLE of migration 0001 fail.
    const before = await closedDb((db) => db.batch([db.build.run(sql`CREATE TABLE app_user (x)`)]));

    const db = openNodeDb(dbPath);
    const err = await gate(db).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(
      `SenstoSales could not upgrade its data. Nothing was changed. A copy is in ${join(backupsDir, BACKUP)}.`,
    );
    expect(await readSchemaVersion(db)).toBe(0);
    expect(await tables(db)).toEqual(["app_user"]);
    db.close();

    expect(await hash(dbPath)).toBe(before);
  });

  it("does not migrate when the backup fails", async () => {
    const before = await closedDb(async () => {});
    await rm(backupsDir, { recursive: true });

    const { db, batches } = openRecorded(dbPath);
    await expect(gate(db)).rejects.toThrow(
      "SenstoSales could not back up its data, so it did not upgrade it. Nothing was changed.",
    );
    db.close();

    expect(batches).toEqual([]);
    expect(await hash(dbPath)).toBe(before);
  });

  it("refuses a database from a newer version without writing", async () => {
    (await migratedDb(dbPath)).close();
    const before = await closedDb((db) =>
      db.batch([
        db.build
          .insert(schemaMigration)
          .values({ version: LATEST_VERSION + 1, name: "future", appliedAt: NOW, appVersion: "9.0.0" }),
      ]),
    );

    const { db, batches } = openRecorded(dbPath);
    await expect(gate(db)).rejects.toThrow("This data was saved by a newer version of SenstoSales.");
    db.close();

    expect(batches).toEqual([]);
    expect(await hash(dbPath)).toBe(before);
    expect(await readdir(backupsDir)).toEqual([]);
  });
});

describe("startServer", () => {
  it("migrates a new data folder before serving", async () => {
    const dataDir = join(tmp, "fresh");
    const server = await startServer({ dataDir, webRoot: join(tmp, "web"), version: "1.2.3" });
    await server.close();

    const [backup, ...rest] = await readdir(join(dataDir, "backups"));
    expect(rest).toEqual([]);
    expect(backup).toMatch(/^pre-upgrade-0-\d{8}T\d{6}Z\.db$/);
    const db = openNodeDb(join(dataDir, "db", "senstosales.db"));
    expect(await readSchemaVersion(db)).toBe(LATEST_VERSION);
    db.close();
  });
});

describe("main", () => {
  it("exits with the plain message and no port line on a newer database", async () => {
    const dataDir = join(tmp, "newer");
    await mkdir(join(dataDir, "db"), { recursive: true });
    const db = await migratedDb(join(dataDir, "db", "senstosales.db"));
    await db.batch([
      db.build
        .insert(schemaMigration)
        .values({ version: LATEST_VERSION + 1, name: "future", appliedAt: NOW, appVersion: "9.0.0" }),
    ]);
    db.close();

    const child = spawn(process.execPath, [MAIN], {
      env: { ...process.env, SENSTO_DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));

    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe("This data was saved by a newer version of SenstoSales.\n");
  });
});
