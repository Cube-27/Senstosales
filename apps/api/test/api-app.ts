// An app with every SPEC-07 route over a freshly migrated in-memory DB with no supplier, as on first run. Every
// request is signed in; the onboarding gate is real. Every response body is kept, so a test can assert what never
// left the API (INV-81). Synthetic values only (C1).
import type { Db } from "@senstosales/db";
import { auditLog } from "@senstosales/db";
import type { NodeDb } from "@senstosales/db/node";
import { createClient } from "@senstosales/schemas";

import type { Clock } from "../src/ports/clock.ts";
import { apiRoutes } from "../src/routes/index.ts";
import { createServices } from "../src/services/index.ts";
import { migratedDb } from "./db.ts";
import { fixedClock, memoryStorage } from "./service-deps.ts";
import { json, testApp } from "./helpers.ts";

export const SUPPLIER_WIRE = {
  name: "Example Supplier",
  gstin: "TESTGSTIN0001",
  address: "1 Example Road",
  state: "Example State",
  stateCode: "99",
  contact: "Example Contact",
  email: "accounts@example.com",
  bhelSupplierCode: "TEST-001",
  bankDetails: { bank: "Example Bank" },
  invoiceDefaults: { terms: "Net 30" },
};

export const ONBOARDING_WIRE = { ...SUPPLIER_WIRE, cgstPct: "6", sgstPct: "6" };

const open: NodeDb[] = [];

/** What a test may swap: the clock, or the `Db` the services see (to hold batches); reads in the test stay direct. */
export interface AppOverrides {
  readonly clock?: Clock;
  readonly db?: (db: NodeDb) => Db;
}

/** A new app; `closeApiApps` closes every database opened since the last call. */
export async function apiApp(overrides: AppOverrides = {}) {
  const db = await migratedDb();
  open.push(db);
  return build(db, overrides);
}

export function closeApiApps(): void {
  for (const db of open.splice(0)) db.close();
}

/** An app that has completed onboarding. */
export async function onboardedApp(overrides: AppOverrides = {}) {
  const app = await apiApp(overrides);
  await app.send("/api/onboarding", json("POST", ONBOARDING_WIRE));
  return app;
}

function build(db: NodeDb, overrides: AppOverrides) {
  const storage = memoryStorage();
  const services = createServices({
    db: overrides.db?.(db) ?? db,
    clock: overrides.clock ?? fixedClock,
    jobs: { enqueue: () => {}, holds: () => false },
    storage,
  });
  const t = testApp(apiRoutes(services), () => Promise.resolve(true), services.onboarding.done);
  const bodies: string[] = [];
  const send = async (path: string, init?: RequestInit) => {
    const res = await t.send(path, init);
    bodies.push(await res.clone().text());
    return res;
  };
  const audit = () => db.query(db.build.select().from(auditLog).orderBy(auditLog.id));
  return { db, services, storage, send, client: createClient(send), bodies, logger: t.logger, audit };
}
