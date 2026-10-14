// SPEC-07 PR 2: `/api/health` reports the version, the schema version and the active job (INV-105).
import type { Instant } from "@senstosales/db";
import { job, LATEST_VERSION } from "@senstosales/db";
import { describe, expect, it, onTestFinished } from "vite-plus/test";

import { healthRoutes } from "../src/routes/health.ts";
import { migratedDb } from "./db.ts";
import { testApp } from "./helpers.ts";

const progress = { total: 0, done: 0, skipped: 0, failed: 0, current: null };

type JobRow = typeof job.$inferInsert;
const jobRow = (id: string, status: JobRow["status"], createdAt: string): JobRow => ({
  id,
  type: "po.scrape",
  status,
  createdAt: createdAt as Instant,
  progress,
});

async function health(jobs: JobRow[]) {
  const db = await migratedDb();
  onTestFinished(() => db.close());
  if (jobs.length > 0) await db.batch(jobs.map((row) => db.build.insert(job).values(row)));
  const { send } = testApp(healthRoutes({ version: "1.2.3", db }));
  const res = await send("/api/health");
  expect(res.status).toBe(200);
  return (await res.json()) as { job: unknown };
}

describe("GET /api/health", () => {
  it("reports the version, the schema version and no job when none is active", async () => {
    expect(LATEST_VERSION).toBeGreaterThan(0);
    expect(await health([jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B1", "done", "2025-04-01T05:00:00.000Z")])).toEqual({
      version: "1.2.3",
      schemaVersion: LATEST_VERSION,
      job: null,
    });
  });

  it("reports the running job ahead of queued ones", async () => {
    const body = await health([
      jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B1", "queued", "2025-04-01T05:00:00.000Z"),
      jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B2", "running", "2025-04-01T05:10:00.000Z"),
      jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B3", "failed", "2025-04-01T05:20:00.000Z"),
    ]);
    expect(body.job).toEqual({ id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2B2", type: "po.scrape", status: "running" });
  });

  it("reports the oldest queued job when none runs", async () => {
    const body = await health([
      jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B1", "queued", "2025-04-01T05:10:00.000Z"),
      jobRow("01J9Z8Q4S5T6V7W8X9Y0Z1A2B2", "queued", "2025-04-01T05:00:00.000Z"),
    ]);
    expect(body.job).toEqual({ id: "01J9Z8Q4S5T6V7W8X9Y0Z1A2B2", type: "po.scrape", status: "queued" });
  });
});
