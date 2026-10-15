// SPEC-07 PR 6: the route table is the one list of endpoints (INV-101). The app the server builds mounts every entry
// once and nothing else; the audit log has no delete (INV-83); the dropped legacy endpoints have no route (INV-87).
import type { NodeDb } from "@senstosales/db/node";
import { createFakeScraper, createSessions } from "@senstosales/scraper";
import { routes } from "@senstosales/schemas";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import type { Handlers } from "../src/app.ts";
import { allRoutes } from "../src/routes/index.ts";
import { createServices } from "../src/services/index.ts";
import { restoreService } from "../src/services/restore.ts";
import { migratedDb } from "./db.ts";
import { json, memoryLogger, testApp } from "./helpers.ts";
import { fixedClock, memoryStorage } from "./service-deps.ts";

let db: NodeDb;
beforeEach(async () => {
  db = await migratedDb();
});
afterEach(() => db.close());

const scraper = createFakeScraper({ captchaPng: Uint8Array.of(1), captcha: "C", otp: "1", poPages: {}, srvPages: {} });

/** The server's handlers over the node runtime's services, with or without a BHEL scraper (D-0380). */
function handlers(withScraper: boolean): Handlers {
  const bhel = withScraper ? { bhel: { scraper, sessions: createSessions(fixedClock) } } : {};
  const services = createServices({
    db,
    clock: fixedClock,
    storage: memoryStorage(),
    jobs: { enqueue: () => {}, holds: () => false },
    ...bhel,
  });
  // No test here lists or restores a backup.
  const none = () => Promise.reject(new Error("no backups in this test"));
  const backups = { list: none, create: none, delete: none, restore: none };
  const restore = restoreService({ db, clock: fixedClock, backups, logger: memoryLogger() });
  return allRoutes(services, { health: { version: "1.2.3", db }, restore });
}

/** `METHOD /path` of every route the app mounted; the guards (`ALL /*`) are not routes. */
const mounted = (h: Handlers) =>
  testApp(h)
    .app.routes.filter((r) => r.method !== "ALL")
    .map((r) => `${r.method} ${r.path}`);

const table = Object.values(routes).map((r) => `${r.method} ${r.path}`);

describe("route conformance (INV-101)", () => {
  test("every route of the table is mounted once, and nothing else", () => {
    expect(mounted(handlers(true)).sort()).toEqual([...table].sort());
  });

  test("no two table entries share a method and path", () => {
    expect(new Set(table).size).toBe(table.length);
  });

  test("without a scraper, only the BHEL wizard is missing (D-0380)", () => {
    const missing = table.filter((r) => !mounted(handlers(false)).includes(r));
    expect(missing).toEqual([
      "POST /api/bhel/session",
      "POST /api/bhel/session/:sessionId/captcha",
      "POST /api/bhel/session/:sessionId/otp",
      "DELETE /api/bhel/session/:sessionId",
    ]);
  });
});

describe("removed endpoints", () => {
  test("the audit log is read-only (INV-83)", () => {
    expect(table.filter((r) => r.includes("/api/audit"))).toEqual(["GET /api/audit"]);
  });

  test("health has no aliases", () => {
    expect(table.filter((r) => r.includes("health"))).toEqual(["GET /api/health"]);
  });

  // Procurement analytics, dashboard insights and forecast, daily dispatch, HTTP "reconcile all" (now the
  // `recompute-all` job) and download-folder preferences (ARCHITECTURE §9, INV-87).
  test.each(["procurement", "analytics", "insight", "forecast", "daily-dispatch", "reconcile-all", "download"])(
    "no route names %s (INV-87)",
    (word) => {
      expect(table.filter((r) => r.toLowerCase().includes(word))).toEqual([]);
    },
  );

  test.each([
    ["DELETE", "/api/audit"],
    ["GET", "/api/dashboard/insights"],
    ["GET", "/api/dashboard/forecast"],
    ["GET", "/api/reports/daily-dispatch"],
    ["POST", "/api/reconcile-all"],
    ["GET", "/api/healthz"],
  ])("%s %s answers 404", async (method, path) => {
    // As JSON, so a mutation passes the JSON-only guard and reaches routing.
    const res = await testApp(handlers(true)).send(path, method === "GET" ? {} : json(method, {}));
    expect(res.status).toBe(404);
  });
});
