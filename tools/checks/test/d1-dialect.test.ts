// Each run starts miniflare's local D1 (a workerd process), so the tests get more time than the default.
import { describe, expect, it } from "vite-plus/test";

import { MIGRATIONS } from "@senstosales/db";

import { d1DialectFindings } from "../src/d1-dialect.ts";

describe("d1DialectFindings", () => {
  it("passes the committed migrations", { timeout: 60_000 }, async () => {
    expect(await d1DialectFindings()).toEqual([]);
  });

  it("reports a migration that local D1 refuses and node:sqlite accepts", { timeout: 60_000 }, async () => {
    const pragma = { version: 2, name: "pragma", statements: ["PRAGMA user_version = 2"] };
    expect(await d1DialectFindings([...MIGRATIONS, pragma])).toEqual([
      "D1 refused the migrations: not authorized: SQLITE_AUTH",
    ]);
  });
});
