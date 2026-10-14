// SPEC-05 PR 4: the Db port over the D1 executor, on a local in-memory D1 (miniflare, no account). A failing
// statement rolls the whole batch back and surfaces as the same typed errors as on node:sqlite.
import { sql } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { DbError, UniqueViolation, type Db } from "../src/index.ts";
import { openD1Db } from "../src/platform/d1/executor.ts";

let mf: Miniflare;
let db: Db;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default {}", d1Databases: { DB: "test" } });
  db = openD1Db(await mf.getD1Database("DB"));
  await db.batch([
    db.build.run(sql`CREATE TABLE parent (id TEXT PRIMARY KEY, k INTEGER NOT NULL UNIQUE)`),
    db.build.run(sql`CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))`),
  ]);
}, 30_000);
afterAll(() => mf.dispose());

const insertParent = (id: string, k: number) => db.build.run(sql`INSERT INTO parent (id, k) VALUES (${id}, ${k})`);
const parentIds = () => db.query(db.build.values<[string]>(sql`SELECT id FROM parent ORDER BY id`));

describe("D1 executor", () => {
  test("a batch commits every statement", async () => {
    await db.batch([insertParent("p1", 1), insertParent("p2", 2)]);
    expect(await parentIds()).toEqual([["p1"], ["p2"]]);
  });

  test("a failing third statement leaves no row from the first two", async () => {
    const run = db.batch([insertParent("p3", 3), insertParent("p4", 4), insertParent("p5", 1)]);
    await expect(run).rejects.toThrow(new UniqueViolation("parent.k"));
    await expect(run).rejects.toBeInstanceOf(UniqueViolation);
    expect(await parentIds()).toEqual([["p1"], ["p2"]]);
  });

  test("a foreign-key violation rolls the batch back as a DbError", async () => {
    const run = db.batch([insertParent("p6", 6), db.build.run(sql`INSERT INTO child VALUES ('c1', 'missing')`)]);
    await expect(run).rejects.toBeInstanceOf(DbError);
    await expect(run).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(await parentIds()).toEqual([["p1"], ["p2"]]);
  });
});
